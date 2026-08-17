import { expect, test } from '@playwright/test';
import { FakeVaultServer } from '../support/fake-vault-server';
import { findMount } from '../../src/support/onboarding/vault-connection';
import { VaultSecretStore } from '../../src/integrations/vault/vault-store';

/**
 * Finding the mount somebody meant — the recovery behind the dashboard's
 * "nothing is at that path" message.
 *
 * A wrong KV mount is invisible: every path under it 404s, and the message
 * reads the same as a wrong credential root or a wrong account type, so it
 * sends people to check the two things that were fine. Confirmed against a
 * real `vault server -dev`: Vault mounts KV v2 at `secret/` while this
 * framework defaults to `kv`, so the commonest first connection misses on a
 * configuration that looks entirely correct.
 */

const PATH = 'qa/shop/pools/workforce/standard/1';

/** Auth comes from the environment, exactly as it does in production. */
function openAgainst(address: string) {
  return (connection: Parameters<typeof VaultSecretStore.fromConnection>[0]) =>
    new VaultSecretStore({
      address,
      kvMount: connection.kvMount ?? 'kv',
      totpMount: 'totp',
      databaseMount: 'database',
      totpPeriodSeconds: 30,
      auth: { method: 'jwt' as const, path: 'jwt', role: 'playwright-e2e', jwt: 'a.b.c' },
    });
}

test('names the mount the secret is actually under', async () => {
  // The real case, reproduced: asked for kv, the secret is at secret.
  const vault = new FakeVaultServer({ kvMount: 'secret' });
  const address = await vault.start();
  vault.put(PATH, { username: 'someone', password: 'a-password' });
  try {
    expect(await findMount({ address, kvMount: 'kv' }, PATH, openAgainst(address))).toBe('secret');
  } finally {
    await vault.stop();
  }
});

test('the other direction too, so the answer is not a hardcoded guess', async () => {
  const vault = new FakeVaultServer({ kvMount: 'kv' });
  const address = await vault.start();
  vault.put(PATH, { username: 'someone' });
  try {
    expect(await findMount({ address, kvMount: 'secret' }, PATH, openAgainst(address))).toBe('kv');
  } finally {
    await vault.stop();
  }
});

test('says nothing when the mount is not the problem', async () => {
  /*
     The path is genuinely absent everywhere, so the root or the account type
     is wrong. Naming a mount here would send somebody to change a setting that
     was already right — worse than the generic message.
  */
  const vault = new FakeVaultServer({ kvMount: 'secret' });
  const address = await vault.start();
  try {
    expect(await findMount({ address, kvMount: 'kv' }, PATH, openAgainst(address))).toBeNull();
  } finally {
    await vault.stop();
  }
});

test('an unreachable candidate mount does not fail the check it was explaining', async () => {
  /*
     The probe is a courtesy. If it throws, the operator is told their Vault is
     unreachable when it plainly is not — they had just connected to it.
  */
  const vault = new FakeVaultServer({ kvMount: 'secret' });
  const address = await vault.start();
  await vault.stop();
  expect(await findMount({ address, kvMount: 'kv' }, PATH, openAgainst(address))).toBeNull();
});
