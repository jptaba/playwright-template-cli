import { expect, test } from '@playwright/test';
import {
  resolveVaultConnection,
  sanitiseVaultConnection,
} from '../../src/support/secrets/vault-config';

/**
 * Which Vault, when the environment does not say.
 *
 * The connection check could prove a Vault since it shipped and nothing kept
 * the answer, so a reload lost it and the suite still needed `VAULT_ADDR`
 * exported by hand — on the one path where the tool already knew. These are
 * the two rules that make writing it down safe: the environment still decides
 * where it is set, and nothing that could be a credential survives the trip
 * through a file.
 */

const A_VAULT = { address: 'https://vault.example.test', kvMount: 'secret' };

test.describe('which Vault the suite resolves', () => {
  test('the environment wins, because CI is the one that sets it', () => {
    const resolved = resolveVaultConnection({
      fromEnvironment: { address: 'https://ci.vault.test' },
      stored: A_VAULT,
    });

    expect(resolved.source).toBe('environment');
    expect(resolved.connection?.address).toBe('https://ci.vault.test');
  });

  test('and it wins whole, not field by field', () => {
    /*
       The failure this prevents. A job exporting an address for one Vault and
       a laptop file naming a mount in another would otherwise compose a third
       connection that is neither — and a mount belonging to the wrong address
       is exactly the silent miss the connection check exists to catch.
    */
    const resolved = resolveVaultConnection({
      fromEnvironment: { address: 'https://ci.vault.test' },
      stored: A_VAULT,
    });

    expect(resolved.connection?.kvMount).toBeUndefined();
  });

  test('falls to what this machine connected, rather than to a refusal', () => {
    const resolved = resolveVaultConnection({ fromEnvironment: {}, stored: A_VAULT });

    expect(resolved.source).toBe('stored');
    expect(resolved.connection).toEqual(A_VAULT);
  });

  test('says nothing is configured rather than guessing a host', () => {
    expect(resolveVaultConnection({ fromEnvironment: {}, stored: null })).toEqual({
      connection: null,
      source: 'none',
    });
    expect(resolveVaultConnection({}).source).toBe('none');
  });
});

test.describe('what a stored connection is allowed to be', () => {
  test('an address, a namespace and a mount — and the blanks are dropped', () => {
    expect(sanitiseVaultConnection({ address: ' https://vault.example.test ', kvMount: ' kv ' }))
      .toEqual({ address: 'https://vault.example.test', kvMount: 'kv' });
    expect(sanitiseVaultConnection({ address: 'https://vault.example.test', namespace: '   ' }))
      .toEqual({ address: 'https://vault.example.test' });
  });

  test('never a credential, however the file got one', () => {
    /*
       The door has to be shut on both sides. The route that writes this file
       refuses a body carrying any of these; a file somebody hand-edited is
       exactly where one would end up if it were tolerated on the way back in.
    */
    for (const field of ['token', 'secretId', 'secret_id', 'password', 'jwt']) {
      expect(
        sanitiseVaultConnection({ address: 'https://vault.example.test', [field]: 'shh' }),
        `${field} was accepted from a file`,
      ).toBeNull();
    }
  });

  test('never something that is not a reachable address', () => {
    expect(sanitiseVaultConnection({ address: 'vault.example.test' })).toBeNull();
    expect(sanitiseVaultConnection({ address: 'file:///etc/passwd' })).toBeNull();
    expect(sanitiseVaultConnection({ address: '' })).toBeNull();
    expect(sanitiseVaultConnection({})).toBeNull();
    expect(sanitiseVaultConnection(null)).toBeNull();
    expect(sanitiseVaultConnection('https://vault.example.test')).toBeNull();
  });
});
