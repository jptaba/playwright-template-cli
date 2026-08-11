import { expect, test } from '@playwright/test';
import { FakeVaultServer } from '../support/fake-vault-server';
import { InMemoryInbox } from '../support/in-memory-inbox';
import { VaultSecretStore } from '../../src/integrations/vault/vault-store';
import { EmailOtpProvider, TotpOtpProvider } from '../../src/integrations/otp/providers';
import { UnsupportedOtpProvider } from '../../src/integrations/otp/types';
import { PollTimeoutError } from '../../src/support/poll';
import { plusAddress } from '../../src/integrations/mail/types';

test.describe('EmailOtpProvider', () => {
  const RECIPIENT = 'qa+run7-w0@example.test';
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const sleep = async (ms: number) => {
    clock += ms;
  };

  test.beforeEach(() => {
    clock = 1_700_000_000_000;
  });

  test('the watermark defeats the failure everyone hits: reading the previous code', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    // The previous test's code is still sitting in the inbox.
    inbox.deliver({ to: [RECIPIENT], text: 'Your code is 111111' });

    const provider = new EmailOtpProvider(inbox, RECIPIENT, { sleep, now, timeoutMs: 5_000 });
    const mark = await provider.arm();

    clock += 1_000;
    inbox.deliver({ to: [RECIPIENT], text: 'Your code is 222222' });

    expect(await provider.get(mark)).toBe('222222');
  });

  test('parallel workers cannot read each other\'s mail', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    const otherWorker = plusAddress('qa@example.test', 'run7-w1');

    const provider = new EmailOtpProvider(inbox, RECIPIENT, { sleep, now, timeoutMs: 2_000 });
    const mark = await provider.arm();

    clock += 1_000;
    inbox.deliver({ to: [otherWorker], text: 'Your code is 999999' });
    inbox.deliver({ to: [RECIPIENT], text: 'Your code is 424242' });

    expect(await provider.get(mark)).toBe('424242');
  });

  test('the code is consumed, so a retry cannot read it twice', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    const provider = new EmailOtpProvider(inbox, RECIPIENT, { sleep, now, timeoutMs: 2_000 });
    const mark = await provider.arm();
    clock += 1_000;
    inbox.deliver({ to: [RECIPIENT], text: 'Your code is 313131' });

    await provider.get(mark);

    expect(await inbox.since(mark, { recipient: RECIPIENT })).toEqual([]);
  });

  test('a missing email fails as a bounded assertion, not a hung test', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    const provider = new EmailOtpProvider(inbox, RECIPIENT, {
      sleep,
      now,
      timeoutMs: 3_000,
      intervalMs: 500,
    });
    const mark = await provider.arm();

    await expect(provider.get(mark)).rejects.toThrow(PollTimeoutError);
  });

  test('calling get() without arm() is refused rather than silently racy', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    const provider = new EmailOtpProvider(inbox, RECIPIENT, { sleep, now });

    await expect(provider.get(undefined as never)).rejects.toThrow(/watermark from arm\(\)/);
  });

  test('mail that is not an OTP is ignored', async () => {
    const inbox = new InMemoryInbox(undefined, now);
    const provider = new EmailOtpProvider(inbox, RECIPIENT, { sleep, now, timeoutMs: 5_000 });
    const mark = await provider.arm();

    clock += 500;
    inbox.deliver({ to: [RECIPIENT], subject: 'Welcome', text: 'Thanks for signing up.' });
    clock += 500;
    inbox.deliver({ to: [RECIPIENT], text: 'Your code is 555555' });

    expect(await provider.get(mark)).toBe('555555');
  });
});

test.describe('TotpOtpProvider', () => {
  let vault: FakeVaultServer;
  let store: VaultSecretStore;

  test.beforeEach(async () => {
    vault = new FakeVaultServer();
    const address = await vault.start();
    vault.addTotpKey('staging-approver');
    store = new VaultSecretStore({
      address,
      kvMount: 'kv',
      totpMount: 'totp',
      databaseMount: 'database',
      totpPeriodSeconds: 30,
      auth: { method: 'jwt', path: 'jwt', role: 'playwright-e2e', jwt: 'a.b.c' },
    });
  });

  test.afterEach(async () => {
    await store.close();
    await vault.stop();
  });

  test('returns a code from Vault, with the seed never entering this process', async () => {
    const provider = new TotpOtpProvider(store, 'staging-approver');
    expect(await provider.get({ at: Date.now() })).toMatch(/^\d{6}$/);
  });

  test('waits out a dying window instead of returning a code about to expire', async () => {
    let slept = 0;
    const provider = new TotpOtpProvider(store, 'staging-approver', {
      minValiditySeconds: 5,
      sleep: async (ms) => {
        slept += ms;
      },
    });
    // Force the "two seconds left" case the plan calls out.
    const originalRemaining = store.remainingWindowSeconds.bind(store);
    let call = 0;
    store.remainingWindowSeconds = () => (call++ === 0 ? 2 : originalRemaining());

    const code = await provider.get({ at: Date.now() });

    expect(code).toMatch(/^\d{6}$/);
    expect(slept).toBe(3_000); // (2 + 1) seconds: the rest of the window
  });
});

test.describe('UnsupportedOtpProvider', () => {
  test('a target with mfa: none states the reason instead of hanging', async () => {
    const provider = new UnsupportedOtpProvider('reference-app');
    await expect(provider.get()).rejects.toThrow(/mfa = 'none'/);
  });
});
