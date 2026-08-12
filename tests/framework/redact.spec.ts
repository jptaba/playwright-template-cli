import { expect, test } from '@playwright/test';
import {
  containsSecret,
  redact,
  redactBuffer,
  redactDeep,
  registerSecret,
  registerSecretPayload,
  resetSecretRegistry,
} from '../../src/support/redact';
import { RateLimiter } from '../../src/support/rate-limiter';
import { parseMoney, round2, sumOf } from '../../src/support/money';

/**
 * §22 ranks this High: "Doing Vault properly and then base64-ing an unscrubbed
 * trace of a login flow into PractiTest defeats the entire exercise."
 *
 * Treat scrubbing as a feature with its own test. The canary case below is the
 * one the plan asks for: a known value planted in an artifact must not survive.
 */
test.describe('redaction', () => {
  test.beforeEach(() => resetSecretRegistry());

  test('scrubs a registered value from text', () => {
    registerSecret('hunter2-real-password', 'vault:qa/app.password');

    expect(redact('logging in with hunter2-real-password now')).toBe(
      'logging in with «redacted:vault:qa/app.password» now',
    );
  });

  test('scrubs the serialisations a value takes on its way into an artifact', () => {
    const password = 'p@ss/word with spaces';
    registerSecret(password, 'creds.password');

    const encoded = encodeURIComponent(password);
    const base64 = Buffer.from(password, 'utf8').toString('base64');

    expect(redact(`form=${encoded}`)).not.toContain(encoded);
    expect(redact(`Authorization: Basic ${base64}`)).not.toContain(base64);
  });

  test('scrubs a value escaped inside a JSON network payload', () => {
    const password = 'quote"and\\slash';
    registerSecret(password, 'creds.password');

    const payload = JSON.stringify({ password });

    expect(redact(payload)).not.toContain('quote\\"and');
  });

  test('registers every field of a secret payload under its own label', () => {
    registerSecretPayload(
      { username: 'approver-01', password: 'a-real-password' },
      'qa/staging/pools/workforce/approver/1',
    );

    const scrubbed = redact('approver-01 / a-real-password');

    expect(scrubbed).toContain('.username»');
    expect(scrubbed).toContain('.password»');
  });

  test('scrubs nested structures without changing their shape', () => {
    registerSecret('a-real-password', 'creds.password');

    const scrubbed = redactDeep({
      request: { headers: { authorization: 'Bearer a-real-password' } },
      attempts: [1, 2],
      ok: false,
    });

    expect(scrubbed.request.headers.authorization).toBe('Bearer «redacted:creds.password»');
    expect(scrubbed.attempts).toEqual([1, 2]);
    expect(scrubbed.ok).toBe(false);
  });

  test('the canary test: a planted value must not survive into an artifact', () => {
    const canary = 'CANARY-9d3f-do-not-leak';
    registerSecret(canary, 'canary');

    const traceLike = Buffer.from(
      JSON.stringify({
        type: 'action',
        params: { selector: '#password', value: canary },
        snapshot: `<input value="${canary}">`,
      }),
      'utf8',
    );

    const scrubbed = redactBuffer(traceLike);

    expect(containsSecret(scrubbed.toString('utf8'))).toBe(false);
    expect(scrubbed.toString('utf8')).not.toContain(canary);
  });

  test('does not redact values too short to be distinguishable from ordinary text', () => {
    registerSecret('ab', 'too-short');
    expect(redact('a table of absolutes')).toBe('a table of absolutes');
  });

  test('the placeholder names the reference, never a fragment of the value', () => {
    registerSecret('super-secret-value', 'vault:qa/app.password');
    const scrubbed = redact('super-secret-value');
    expect(scrubbed).toBe('«redacted:vault:qa/app.password»');
    expect(scrubbed).not.toContain('super');
    expect(scrubbed).not.toContain('value');
  });
});

test.describe('rate limiter', () => {
  test('spends the burst, then paces to the refill rate', async () => {
    let clock = 0;
    const limiter = new RateLimiter({
      capacity: 3,
      refillTokens: 3,
      refillIntervalMs: 1_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    for (let i = 0; i < 3; i++) await limiter.take();
    expect(clock).toBe(0); // the burst costs nothing

    await limiter.take(); // must wait for the next interval
    expect(clock).toBeGreaterThanOrEqual(1_000);
  });

  test('serialises waiters so two callers cannot spend the same token', async () => {
    let clock = 0;
    const limiter = new RateLimiter({
      capacity: 1,
      refillTokens: 1,
      refillIntervalMs: 1_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    await Promise.all([limiter.take(), limiter.take(), limiter.take()]);

    // Three calls, one token per second: the last one cannot be free.
    expect(clock).toBeGreaterThanOrEqual(2_000);
  });
});

test.describe('money', () => {
  test('parses the shapes the UI actually renders', () => {
    expect(parseMoney('Item total: $29.99')).toBe(29.99);
    expect(parseMoney('Tax: $2.40')).toBe(2.4);
    expect(parseMoney('Total: $1,032.39')).toBe(1032.39);
  });

  test('refuses a string with no amount rather than returning NaN', () => {
    // A silent NaN in a totals assertion is a passing test that checks nothing.
    expect(() => parseMoney('Total: pending')).toThrow(/No currency amount/);
    expect(() => parseMoney(null)).toThrow(/Expected a currency amount/);
  });

  test('rounds the way a till does', () => {
    expect(round2(29.99 * 0.08)).toBe(2.4);
    expect(sumOf([0.1, 0.2])).toBe(0.3);
  });
});
