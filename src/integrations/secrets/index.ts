import type { TargetProfile } from '../../../config/targets/types';
import { LocalSecretStore } from './local-store';
import { VaultSecretStore } from '../vault/vault-store';
import type { SecretStore } from './types';

/**
 * Overridden by unit tests and by the `--fake-vault` tool flag so adapter
 * behaviour can be exercised without a Vault instance to stand up (§22).
 */
let override: SecretStore | null = null;

export function setSecretStoreOverride(store: SecretStore | null): void {
  override = store;
}

export * from './types';
export { LocalSecretStore } from './local-store';

/**
 * Choose a store from the target profile. The rest of the framework only ever
 * sees `SecretStore`, which is what keeps the Vault-side prerequisites off the
 * critical path (§22).
 */
export function createSecretStore(profile: TargetProfile): SecretStore {
  if (override) return override;
  switch (profile.credentials.source) {
    case 'local':
      // Scoped to this profile's own credential root, so a local store can
      // never serve another target's paths.
      return new LocalSecretStore([`${profile.credentials.root}/`]);
    case 'vault':
      return VaultSecretStore.fromEnvironment();
    default: {
      const exhaustive: never = profile.credentials.source;
      throw new Error(`Unknown secret source: ${String(exhaustive)}`);
    }
  }
}
