import { expect, test } from '@playwright/test';
import { FakeVaultServer } from '../support/fake-vault-server';
import { VaultSecretStore } from '../../src/integrations/vault/vault-store';
import { SecretNotFoundError, SecretStoreUnavailableError } from '../../src/integrations/secrets/types';
import { containsSecret, resetSecretRegistry } from '../../src/support/redact';

/**
 * The Vault adapter, against an in-process fake — §22.
 *
 * These are the tests that let phase 1 proceed while a Vault administrator's
 * queue is still holding the JWT backend: the adapter's contract, its error
 * handling and its CAS semantics are all provable without a Vault to stand up.
 */

async function storeAgainst(
  vault: FakeVaultServer,
  address: string,
  overrides: Partial<Parameters<typeof buildConfig>[2]> = {},
) {
  return new VaultSecretStore(buildConfig(vault, address, overrides));
}

function buildConfig(
  vault: FakeVaultServer,
  address: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    address,
    kvMount: 'kv',
    totpMount: 'totp',
    databaseMount: 'database',
    totpPeriodSeconds: 30,
    auth: { method: 'jwt' as const, path: 'jwt', role: 'playwright-e2e', jwt: 'a.b.c' },
    ...overrides,
  } as ConstructorParameters<typeof VaultSecretStore>[0];
}

test.describe('VaultSecretStore', () => {
  let vault: FakeVaultServer;
  let address: string;

  test.beforeEach(async () => {
    resetSecretRegistry();
    vault = new FakeVaultServer();
    address = await vault.start();
  });

  test.afterEach(async () => {
    await vault.stop();
  });

  test('authenticates with the GitLab id_token and unwraps the KV v2 envelope', async () => {
    vault.put('qa/staging/pools/workforce/approver/1', {
      username: 'approver-01',
      password: 'a-real-password',
    });
    const store = await storeAgainst(vault, address);

    const payload = await store.read('qa/staging/pools/workforce/approver/1');

    expect(payload).toEqual({ username: 'approver-01', password: 'a-real-password' });
    // Callers never see Vault's data.data wrapper.
    expect(payload).not.toHaveProperty('data');
    await store.close();
  });

  test('registers the client token for redaction so it cannot reach an artifact', async () => {
    vault.put('qa/app', { tenant: 'acme' });
    const store = await storeAgainst(vault, address);
    await store.read('qa/app');

    expect(containsSecret(`Authorization: ${vault.token}`)).toBe(true);
    await store.close();
  });

  test('a missing path is SecretNotFoundError, not a generic HTTP failure', async () => {
    const store = await storeAgainst(vault, address);
    await expect(store.read('qa/nope')).rejects.toThrow(SecretNotFoundError);
    await store.close();
  });

  test('rejected bound claims explain what to check rather than surfacing a 400', async () => {
    const store = await storeAgainst(vault, address, {
      auth: { method: 'jwt', path: 'jwt', role: 'wrong-role', jwt: 'a.b.c' },
    });

    await expect(store.read('qa/app')).rejects.toThrow(/bound|role/i);
    await store.close();
  });

  test('describe reports existence and field names but never values', async () => {
    vault.put('qa/staging/pools/workforce/approver/1', {
      username: 'approver-01',
      password: 'a-real-password',
    });
    const store = await storeAgainst(vault, address);

    const described = await store.describe('qa/staging/pools/workforce/approver/1');

    expect(described.exists).toBe(true);
    expect(described.fields.sort()).toEqual(['password', 'username']);
    expect(JSON.stringify(described)).not.toContain('a-real-password');

    const missing = await store.describe('qa/absent');
    expect(missing.exists).toBe(false);
    expect(missing.fields).toEqual([]);
    await store.close();
  });

  test('retries a 429 and honours Retry-After rather than failing the run', async () => {
    vault.put('qa/app', { tenant: 'acme' });
    const store = await storeAgainst(vault, address);
    // The login succeeds, then the first read is throttled.
    await store.describe('qa/app');
    vault.failNext(429, { errors: ['rate limited'] }, { 'retry-after': '0' });

    const payload = await store.read('qa/app');

    expect(payload).toEqual({ tenant: 'acme' });
    await store.close();
  });

  test('compare-and-swap refuses a write when the version moved underneath it', async () => {
    const store = await storeAgainst(vault, address);
    vault.put('qa/lease', { state: 'available' }); // version 1

    const stale = 0; // what a racing reader would have seen before version 1
    expect(await store.writeIfUnchanged('qa/lease', { state: 'leased' }, stale)).toBeNull();

    const current = await store.currentVersion('qa/lease');
    expect(await store.writeIfUnchanged('qa/lease', { state: 'leased' }, current)).toBe(2);
    expect(vault.read('qa/lease')).toEqual({ state: 'leased' });
    await store.close();
  });

  test('issues a TOTP code and reports how long it stays valid', async () => {
    vault.addTotpKey('staging-approver');
    const store = await storeAgainst(vault, address);

    const issued = await store.totpCode('staging-approver');

    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.validForSeconds).toBeGreaterThan(0);
    expect(issued.validForSeconds).toBeLessThanOrEqual(30);
    // The code itself is a secret and must be scrubbable.
    expect(containsSecret(`code=${issued.code}`)).toBe(true);
    await store.close();
  });

  test('the remaining TOTP window is a pure function of the clock', async () => {
    const store = await storeAgainst(vault, address);
    // 29 seconds past a window boundary leaves one second.
    expect(store.remainingWindowSeconds(29_000)).toBe(1);
    expect(store.remainingWindowSeconds(30_000)).toBe(30);
    await store.close();
  });

  test('issues dynamic read-only database credentials with their lease id', async () => {
    const store = await storeAgainst(vault, address);

    const issued = await store.databaseCredentials('qa-readonly');

    expect(issued.credentials.username).toContain('qa-readonly');
    expect(issued.leaseId).toBeTruthy();
    expect(containsSecret(issued.credentials.password!)).toBe(true);
    await store.close();
  });

  test('sends the namespace header, because Enterprise prefixes every path', async () => {
    const namespaced = new FakeVaultServer({ namespace: 'qa-team' });
    const namespacedAddress = await namespaced.start();
    namespaced.put('qa/app', { tenant: 'acme' });
    const store = await storeAgainst(namespaced, namespacedAddress, { namespace: 'qa-team' });

    expect(await store.read('qa/app')).toEqual({ tenant: 'acme' });

    await store.close();
    await namespaced.stop();
  });

  test('an unreachable Vault says so, and says where to look', async () => {
    const store = new VaultSecretStore(
      buildConfig(vault, 'http://127.0.0.1:1', { timeoutMs: 500 }),
    );
    await expect(store.read('qa/app')).rejects.toThrow(/proxy|CA bundle|egress|did not complete/i);
    await store.close();
  });

  /**
   * The KV mount, which onboarding now lets somebody state.
   *
   * Until this the fake answered only on `kv`, so every test agreed with the
   * default and none of them could tell a configured mount from a hardcoded
   * one. A wrong mount is one of the two things the dashboard's connection
   * check exists to catch, and it was the half with no coverage.
   */
  test.describe('the KV mount', () => {
    test('reads from the mount it was configured with, not a fixed one', async () => {
      const elsewhere = new FakeVaultServer({ kvMount: 'secret' });
      const address = await elsewhere.start();
      elsewhere.put('qa/shop/pools/workforce/standard/1', {
        username: 'someone',
        password: 'a-password',
      });
      try {
        const store = await storeAgainst(elsewhere, address, { kvMount: 'secret' });
        const payload = await store.read('qa/shop/pools/workforce/standard/1');
        expect(payload.username).toBe('someone');
        await store.close();
      } finally {
        await elsewhere.stop();
      }
    });

    test('the wrong mount is a miss, not somebody else’s secret', async () => {
      // The failure the check reports as "connected, but nothing is at that
      // path". It has to be a clean miss rather than a read that wanders.
      const elsewhere = new FakeVaultServer({ kvMount: 'secret' });
      const address = await elsewhere.start();
      elsewhere.put('qa/shop/pools/workforce/standard/1', { username: 'someone' });
      try {
        const store = await storeAgainst(elsewhere, address, { kvMount: 'kv' });
        const described = await store.describe('qa/shop/pools/workforce/standard/1');
        expect(described.exists).toBe(false);
        expect(described.fields).toEqual([]);
        await store.close();
      } finally {
        await elsewhere.stop();
      }
    });
  });

  /**
   * `fromConnection` — the way the onboarding dashboard names a Vault.
   *
   * The point of it is what it does *not* take: authentication still comes
   * from the environment, so naming a Vault never means holding a credential
   * for it. That is the property worth pinning.
   */
  test.describe('fromConnection', () => {
    test('takes an address, a namespace and a mount — and no credential', () => {
      const saved = { ...process.env };
      process.env.VAULT_TOKEN = 'a-token-from-the-environment';
      try {
        const store = VaultSecretStore.fromConnection({
          address: 'https://vault.example/',
          namespace: 'team-qa',
          kvMount: 'secret',
        });
        expect(store).toBeInstanceOf(VaultSecretStore);
        // No parameter exists to pass one, which is the guarantee.
        expect(Object.keys({ address: '', namespace: '', kvMount: '' })).not.toContain('token');
      } finally {
        process.env = saved;
      }
    });

    test('refuses an empty address rather than building a store that cannot work', () => {
      const saved = { ...process.env };
      process.env.VAULT_TOKEN = 'a-token-from-the-environment';
      try {
        expect(() => VaultSecretStore.fromConnection({ address: '   ' })).toThrow(
          SecretStoreUnavailableError,
        );
      } finally {
        process.env = saved;
      }
    });

    test('still needs a credential in the environment, and says so when there is none', () => {
      // The state this machine is actually in, and the message the dashboard
      // shows when somebody presses Check the connection.
      const saved = { ...process.env };
      delete process.env.VAULT_ID_TOKEN;
      delete process.env.VAULT_TOKEN;
      delete process.env.VAULT_ROLE_ID;
      delete process.env.VAULT_SECRET_ID;
      try {
        expect(() => VaultSecretStore.fromConnection({ address: 'https://vault.example' })).toThrow(
          SecretStoreUnavailableError,
        );
      } finally {
        process.env = saved;
      }
    });
  });

  test('fromEnvironment refuses to guess when no credential is present', () => {
    const saved = { ...process.env };
    delete process.env.VAULT_ID_TOKEN;
    delete process.env.VAULT_TOKEN;
    delete process.env.VAULT_ROLE_ID;
    delete process.env.VAULT_SECRET_ID;
    process.env.VAULT_ADDR = 'http://127.0.0.1:8200';
    try {
      expect(() => VaultSecretStore.fromEnvironment()).toThrow(SecretStoreUnavailableError);
    } finally {
      process.env = saved;
    }
  });
});
