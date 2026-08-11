import { expect, test } from '@playwright/test';
import { FakeVaultServer } from '../support/fake-vault-server';
import { VaultSecretStore } from '../../src/integrations/vault/vault-store';
import { PoolExhaustedError, VaultAccountPool } from '../../src/integrations/vault/account-pool';

/**
 * The account pool is a shared mutable resource, and those always leak (§22).
 *
 * Each test here corresponds to a failure mode whose symptom looks like
 * something else: leases that collide look like flaky tests, leases that never
 * expire look like a suite gradually getting slower, and exhaustion without a
 * named error looks like a timeout.
 */
test.describe('VaultAccountPool', () => {
  let vault: FakeVaultServer;
  let store: VaultSecretStore;
  let clock = 1_700_000_000_000;

  const now = () => clock;

  const poolFor = (holder: string, size = 3) =>
    new VaultAccountPool(store, {
      poolRoot: 'qa/staging/pools/workforce',
      size,
      leaseTtlMs: 60_000,
      holder,
      now,
    });

  test.beforeEach(async () => {
    clock = 1_700_000_000_000;
    vault = new FakeVaultServer();
    const address = await vault.start();
    store = new VaultSecretStore({
      address,
      kvMount: 'kv',
      totpMount: 'totp',
      databaseMount: 'database',
      totpPeriodSeconds: 30,
      auth: { method: 'jwt', path: 'jwt', role: 'playwright-e2e', jwt: 'a.b.c' },
    });
    for (let index = 1; index <= 3; index++) {
      vault.put(`qa/staging/pools/workforce/approver/${index}`, {
        username: `approver-0${index}`,
        password: `password-0${index}`,
      });
    }
  });

  test.afterEach(async () => {
    await store.close();
    await vault.stop();
  });

  test('leases the first free account and returns its credentials', async () => {
    const lease = await poolFor('run-1/w0').lease('approver');

    expect(lease.index).toBe(1);
    expect(lease.credentials.username).toBe('approver-01');
    expect(lease.expiresAt).toBe(clock + 60_000);
  });

  test('two workers starting simultaneously never take the same account', async () => {
    const [first, second] = await Promise.all([
      poolFor('run-1/w0').lease('approver'),
      poolFor('run-1/w1').lease('approver'),
    ]);

    expect(first.index).not.toBe(second.index);
    expect(new Set([first.index, second.index]).size).toBe(2);
  });

  test('an expired lease is reclaimed, so a crashed runner does not shrink the pool', async () => {
    const pool = poolFor('crashed-runner', 1);
    await pool.lease('approver'); // never released — the runner died

    await expect(pool.lease('approver')).rejects.toThrow(PoolExhaustedError);

    clock += 61_000; // the TTL passes
    const reclaimed = await pool.lease('approver');
    expect(reclaimed.index).toBe(1);
  });

  test('exhaustion is a named error with the role and the counts, never a timeout', async () => {
    const pool = poolFor('run-1/w0', 2);
    await pool.lease('approver');
    await pool.lease('approver');

    await expect(pool.lease('approver')).rejects.toThrow(
      /No available account for role 'approver': pool size 2, 2 leased/,
    );
  });

  test('releasing returns the account to the pool', async () => {
    const pool = poolFor('run-1/w0', 1);
    const lease = await pool.lease('approver');

    await lease.release();

    const again = await pool.lease('approver');
    expect(again.index).toBe(1);
  });

  test('a quarantined account is skipped and never implicitly un-quarantined', async () => {
    const pool = poolFor('run-1/w0', 2);
    await pool.quarantine('approver', 1, 'password rotation failed mid-flight');

    const lease = await pool.lease('approver');
    expect(lease.index).toBe(2);

    // Releasing must not resurrect it: a human decides when it is safe again.
    await pool.release('approver', 1);
    const utilisation = await pool.utilisation('approver');
    expect(utilisation.quarantined).toBe(1);
  });

  test('reports utilisation so shrinkage is visible before it is critical', async () => {
    const pool = poolFor('run-1/w0', 3);
    await pool.lease('approver');
    await pool.quarantine('approver', 3, 'locked out');

    expect(await pool.utilisation('approver')).toEqual({
      size: 3,
      available: 1,
      leased: 1,
      expired: 0,
      quarantined: 1,
    });
  });
});
