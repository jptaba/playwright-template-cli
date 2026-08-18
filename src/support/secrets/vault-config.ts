import fs from 'node:fs';
import { VAULT_CONNECTION_PATH } from '../paths';
import type { VaultConnection } from '../../integrations/vault/vault-store';

/**
 * Which Vault, when the environment does not say — §11, §16.
 *
 * The dashboard has been able to name a Vault since the connection check
 * shipped, and could then prove a credential was where the profile would say
 * it is. What it could not do was **keep** the answer: the check used what was
 * typed, nothing stored it, so a reload lost it and the suite still needed
 * `VAULT_ADDR` and `VAULT_KV_MOUNT` exported by hand before a single test
 * could resolve a secret. The check printed the exact exports, which is honest
 * and is not the same as being configured.
 *
 * The decision is pure and is the half worth testing; the two functions at the
 * bottom are the file, which both the dashboard and the suite now read. The
 * precedence is the one `src/support/ui/selection.ts` already describes — it
 * says in as many words that this is where the Vault settings were heading.
 *
 * **An address is configuration, not a credential**, which is the whole reason
 * this may be written down at all. Authentication stays exactly where it was:
 * `resolveAuthFromEnvironment` reads a CI JWT, an AppRole pair or a token a
 * developer got by logging in with OIDC. Nothing here holds any of them, and
 * `sanitiseVaultConnection` refuses a stored file that tries to.
 */

/** Where the answer came from. Worth saying, because they are not equal. */
export type VaultConnectionSource =
  /** `VAULT_ADDR` / `VAULT_SERVER_URL`. CI sets these and they win. */
  | 'environment'
  /** Connected on this machine, and kept beside the draft. */
  | 'stored'
  /** Neither, and the caller should say so rather than guess a host. */
  | 'none';

export interface ResolvedVaultConnection {
  connection: VaultConnection | null;
  source: VaultConnectionSource;
}

export interface VaultConnectionInputs {
  /** What the environment holds, in the order the store already reads it. */
  fromEnvironment?: {
    address?: string | undefined;
    namespace?: string | undefined;
    kvMount?: string | undefined;
  };
  /** What was last connected on this machine, or null. */
  stored?: VaultConnection | null;
}

/**
 * Decide which Vault, and say why.
 *
 * **The environment wins, whole.** Not field by field: a CI job exporting
 * `VAULT_ADDR` for one Vault and a laptop file naming another would otherwise
 * produce a third connection that is neither, and the mount belonging to the
 * wrong address is the exact failure the connection check exists to catch.
 * Either the environment describes the Vault or the file does.
 */
export function resolveVaultConnection(inputs: VaultConnectionInputs): ResolvedVaultConnection {
  const address = inputs.fromEnvironment?.address?.trim();
  if (address) {
    return {
      connection: {
        address,
        ...(inputs.fromEnvironment?.namespace ? { namespace: inputs.fromEnvironment.namespace } : {}),
        ...(inputs.fromEnvironment?.kvMount ? { kvMount: inputs.fromEnvironment.kvMount } : {}),
      },
      source: 'environment',
    };
  }

  if (inputs.stored?.address) return { connection: inputs.stored, source: 'stored' };
  return { connection: null, source: 'none' };
}

/**
 * Take an untrusted stored connection and return one this process will use.
 *
 * The same guard the onboarding draft and the stored selection use, for the
 * same reason: a file on disk is not a source of truth about what this process
 * accepts. It refuses a credential for the reason the route that writes this
 * file refuses one — the door has to be shut on both sides, because a file
 * somebody hand-edited is exactly where a token would end up if it were
 * tolerated anywhere.
 */
export function sanitiseVaultConnection(candidate: unknown): VaultConnection | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const raw = candidate as Record<string, unknown>;

  for (const field of ['token', 'secretId', 'secret_id', 'password', 'jwt']) {
    if (raw[field]) return null;
  }

  const address = typeof raw.address === 'string' ? raw.address.trim() : '';
  if (!address) return null;
  try {
    const url = new URL(address);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  const text = (value: unknown): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || undefined;
  };

  return {
    address,
    ...(text(raw.namespace) ? { namespace: text(raw.namespace)! } : {}),
    ...(text(raw.kvMount) ? { kvMount: text(raw.kvMount)! } : {}),
  };
}

/**
 * The connection this machine last proved, or null.
 *
 * Never throws. A file that is missing, unparseable or hand-edited into
 * something this will not accept is the same answer as no file — the caller's
 * next step is to say no Vault is configured, which is a better outcome than a
 * suite failing to start because of a stray comma in scratch state.
 */
export function readStoredVaultConnection(): VaultConnection | null {
  try {
    if (!fs.existsSync(VAULT_CONNECTION_PATH)) return null;
    return sanitiseVaultConnection(JSON.parse(fs.readFileSync(VAULT_CONNECTION_PATH, 'utf8')));
  } catch {
    return null;
  }
}

/** Keep a connection, or forget it when there is none to keep. */
export function writeStoredVaultConnection(connection: VaultConnection | null): void {
  if (!connection) {
    fs.rmSync(VAULT_CONNECTION_PATH, { force: true });
    return;
  }
  const safe = sanitiseVaultConnection(connection);
  fs.writeFileSync(VAULT_CONNECTION_PATH, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
}
