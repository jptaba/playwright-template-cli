import { expect, test } from '@playwright/test';
import { FakePractiTestServer } from '../support/fake-practitest-server';
import {
  PractiTestAuthError,
  PractiTestClient,
  type RunInstanceResult,
} from '../../src/integrations/practitest/client';
import { RateLimiter } from '../../src/support/rate-limiter';
import { registerSecret, resetSecretRegistry } from '../../src/support/redact';

/**
 * §22: "PractiTest rate limits are tighter than they look... Naive
 * implementation hits 429s on the first full nightly run."
 *
 * These tests are written against the envelope rather than the happy path.
 */
test.describe('PractiTestClient', () => {
  let server: FakePractiTestServer;
  let baseURL: string;

  const clientFor = (limiter?: RateLimiter) =>
    new PractiTestClient({
      baseURL,
      projectId: '42',
      token: 'pt-service-token',
      ...(limiter ? { limiter } : {}),
    });

  const result = (caseDisplayId: string, overrides: Partial<RunInstanceResult> = {}): RunInstanceResult => ({
    caseDisplayId,
    status: 'PASSED',
    durationSeconds: 12,
    ...overrides,
  });

  test.beforeEach(async () => {
    resetSecretRegistry();
    server = new FakePractiTestServer();
    baseURL = await server.start();
  });

  test.afterEach(async () => {
    await server.stop();
  });

  test('chunks results into the documented maximum of 20 per POST', async () => {
    for (let index = 1; index <= 45; index++) server.seedCase(String(index));
    const client = clientFor();

    const outcome = await client.postRunResults(
      Array.from({ length: 45 }, (_, index) => result(String(index + 1))),
    );

    expect(outcome.posted).toBe(45);
    expect(server.postedRuns).toHaveLength(45);
    // 45 results is three POSTs, never one oversized request.
    expect(server.calls.filter((call) => call.endsWith('/runs.json'))).toHaveLength(3);
    await client.dispose();
  });

  test('a case that cannot be resolved is reported loudly and does not fail the suite', async () => {
    server.seedCase('5104');
    const client = clientFor();
    const messages: string[] = [];

    const outcome = await client.postRunResults(
      [result('5104'), result('9999')],
      (message) => messages.push(message),
    );

    expect(outcome.posted).toBe(1);
    expect(outcome.unresolved).toEqual(['9999']);
    expect(messages.join(' ')).toContain('9999');
    await client.dispose();
  });

  test('backs off and recovers from a 429 rather than losing the results', async () => {
    server.seedCase('5104');
    const client = clientFor();
    server.throttleNext = 1;

    const outcome = await client.postRunResults([result('5104')]);

    expect(outcome.posted).toBe(1);
    expect(outcome.failed).toEqual([]);
    await client.dispose();
  });

  test('shares one rate limiter across reads, writes and attachments', async () => {
    let clock = 0;
    const limiter = new RateLimiter({
      capacity: 2,
      refillTokens: 2,
      refillIntervalMs: 60_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    server.seedCase('5104');
    const client = clientFor(limiter);

    // Resolution plus one POST spends the burst; the next call must wait.
    await client.postRunResults([result('5104')]);
    await client.postRunResults([result('5104')]);

    expect(clock).toBeGreaterThanOrEqual(60_000);
    await client.dispose();
  });

  test('scrubs the failure message before it reaches a test management system', async () => {
    // "Doing Vault properly and then base64-ing an unscrubbed trace of a login
    // flow into PractiTest defeats the entire exercise." (§22)
    registerSecret('secret_sauce_live', 'vault:qa/app.password');
    server.seedCase('5104');
    const client = clientFor();

    await client.postRunResults([
      result('5104', {
        status: 'FAILED',
        actualResult: 'login failed using secret_sauce_live at step 2',
      }),
    ]);

    const posted = JSON.stringify(server.postedRuns);
    expect(posted).not.toContain('secret_sauce_live');
    expect(posted).toContain('«redacted:');
    await client.dispose();
  });

  test('refuses an attachment over the cap rather than uploading a whole trace', async () => {
    const client = new PractiTestClient({
      baseURL,
      projectId: '42',
      token: 'pt-service-token',
      maxAttachmentBytes: 100,
    });

    const rejected = await client.attach('run-1', {
      name: 'trace.zip',
      contentType: 'application/zip',
      body: Buffer.alloc(5_000),
    });
    const accepted = await client.attach('run-1', {
      name: 'error.txt',
      contentType: 'text/plain',
      body: Buffer.from('short'),
    });

    expect(rejected).toBe(false);
    expect(accepted).toBe(true);
    expect(server.attachments.map((attachment) => attachment.name)).toEqual(['error.txt']);
    await client.dispose();
  });

  test('an expired token is its own named condition, not a generic request failure', async () => {
    // A token that silently expires turns every nightly reporting step into a
    // 401. The publisher absorbs it so the suite stays green; the message has
    // to say what happened, or nobody notices for a fortnight (§15).
    const client = new PractiTestClient({ baseURL, projectId: '42', token: 'wrong' });

    await expect(client.postRunResults([result('5104')])).rejects.toThrow(PractiTestAuthError);
    await expect(client.postRunResults([result('5104')])).rejects.toThrow(/service account/);

    await client.dispose();
  });

  test('has no delete capability in either direction', () => {
    expect(clientFor().canDelete).toBe(false);
  });

  test('finds a case by its publication identity so a re-run updates it', async () => {
    server.seedCase('5104', { identity: 'demo:FIN-2210:checkout-totals', lastEditedBy: 'qa-automation' });
    const client = clientFor();

    const found = await client.findCaseByIdentity('demo:FIN-2210:checkout-totals');

    expect(found?.id).toBe('i-5104');
    expect(found?.lastEditedBy).toBe('qa-automation');
    expect(await client.findCaseByIdentity('nope')).toBeNull();
    await client.dispose();
  });
});
