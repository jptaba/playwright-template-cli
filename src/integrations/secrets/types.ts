/**
 * The secret store interface — §11, §22.
 *
 * The adapter is written against its own interface precisely so progress does
 * not depend on a Vault administrator's queue: the in-process fake in
 * `fake-store.ts` doubles as the test that the adapter's error handling is
 * correct, and swapping AppRole for OIDC (or for static public keys) is a
 * configuration change rather than a rewrite.
 */

/** A KV v2 payload, already unwrapped from its `data.data` envelope. */
export type SecretPayload = Record<string, string>;

export interface SecretStore {
  /** Read a secret path. Throws `SecretNotFoundError` when it does not exist. */
  read(path: string): Promise<SecretPayload>;

  /**
   * Existence and shape only — never values. This is what makes the safe path
   * easier than the unsafe one when someone is debugging a credential problem
   * and reaches for a tool that can print the secret (§22).
   */
  describe(path: string): Promise<SecretDescription>;

  /** A current TOTP code for a named seed. The seed never reaches this process. */
  totpCode?(name: string): Promise<TotpCode>;

  /** Release tokens, leases and sockets. Called in worker teardown. */
  close(): Promise<void>;
}

export interface SecretDescription {
  path: string;
  exists: boolean;
  /** Field names present at the path. Values are never included. */
  fields: string[];
  version?: number;
}

export interface TotpCode {
  code: string;
  /** Seconds remaining in the code's window when it was issued. */
  validForSeconds: number;
}

export class SecretNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(
      `No secret at '${path}'. Check the target profile's credential root and, on Vault, ` +
        `the namespace and KV mount — an Enterprise namespace prefixes every API path (§17).`,
    );
    this.name = 'SecretNotFoundError';
  }
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}
