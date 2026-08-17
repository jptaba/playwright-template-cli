import { VaultSecretStore, type VaultConnection } from '../../integrations/vault/vault-store';

/**
 * Finding the mount somebody meant, when the one they gave came up empty.
 *
 * A wrong KV mount is invisible. Every path under it 404s, and the message is
 * the same one a wrong credential root or a wrong account type produces — so
 * "nothing is at that path" sends people to check the two things that were
 * fine. It is also the likeliest thing to be wrong on a first connection:
 * confirmed against a real `vault server -dev`, **Vault mounts KV v2 at
 * `secret/`** while this framework defaults to `kv`, so the commonest first
 * setup misses on a configuration that looks entirely correct.
 *
 * Changing the default was the other option and was rejected: a Vault really
 * mounted at `kv` is perfectly normal, and flipping the default would move the
 * same silent miss onto those people instead. Saying where the secret actually
 * is costs one extra read and is right for both.
 *
 * Lives here rather than in `tools/` because it is a rule rather than plumbing,
 * and this is the layer the dashboard's rules are testable in without opening
 * a socket.
 */

/** Mounts worth trying, in the order most likely to be the answer. */
export const COMMON_KV_MOUNTS = ['secret', 'kv'] as const;

/**
 * @returns the mount the path resolves under, or null when none of them do —
 * in which case the mount is not the problem, and saying so would send someone
 * to change a setting that was already right.
 */
export async function findMount(
  connection: VaultConnection,
  path: string,
  open: (connection: VaultConnection) => VaultSecretStore = VaultSecretStore.fromConnection,
): Promise<string | null> {
  const stated = connection.kvMount?.trim() || 'kv';

  for (const candidate of COMMON_KV_MOUNTS) {
    if (candidate === stated) continue;
    const store = open({ ...connection, kvMount: candidate });
    try {
      if ((await store.describe(path)).exists) return candidate;
    } catch {
      /*
         A mount that is not enabled answers much like one that is empty, and
         either way it is not the answer. A probe must never fail the check it
         was trying to explain — the operator would then be told their Vault is
         unreachable when it plainly is not.
      */
    } finally {
      await store.close().catch(() => undefined);
    }
  }
  return null;
}
