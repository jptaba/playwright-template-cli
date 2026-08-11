import fs from 'node:fs';
import { repoPath } from '../../support/paths';
import {
  SecretNotFoundError,
  type SecretDescription,
  type SecretPayload,
  type SecretStore,
  type TotpCode,
} from './types';

const DEFAULT_STORE_FILE = repoPath('config', 'secrets.local.json');

/**
 * A file-backed store using the same path shape as Vault — §04.
 *
 * This exists for exactly one reason: a reference target whose credentials are
 * public (the demo logins printed on its own login page) lets phases 0 to 2 be
 * proven end-to-end before a Vault administrator has enabled anything. Those
 * credentials still go through the `secrets` fixture, because the moment one
 * target is allowed to bypass the fixture the lint rule stops being
 * enforceable.
 *
 * It serves only the roots it was constructed with — the selecting profile's
 * own credential root — so it can never quietly become the way another
 * target's real credentials are stored.
 */
export class LocalSecretStore implements SecretStore {
  private cache: Record<string, SecretPayload> | null = null;

  constructor(
    private readonly allowedRoots: readonly string[],
    private readonly file: string = process.env.LOCAL_SECRETS_FILE ?? DEFAULT_STORE_FILE,
  ) {
    if (allowedRoots.length === 0) {
      throw new Error('LocalSecretStore requires at least one allowed root path.');
    }
  }

  private load(): Record<string, SecretPayload> {
    if (this.cache) return this.cache;
    if (!fs.existsSync(this.file)) {
      throw new SecretNotFoundError(
        `${this.file} (local secret store is missing; set SECRET_SOURCE=vault or restore the file)`,
      );
    }
    const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, unknown>;
    // `_`-prefixed keys are documentation, not secrets.
    this.cache = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !key.startsWith('_')),
    ) as Record<string, SecretPayload>;
    return this.cache;
  }

  private assertAllowed(path: string): void {
    if (!this.allowedRoots.some((root) => path.startsWith(root))) {
      throw new Error(
        `Refusing to read '${path}' from the local secret store. It serves the reference ` +
          `target only (${this.allowedRoots.join(', ')}). Real credentials come from Vault (§11).`,
      );
    }
  }

  async read(path: string): Promise<SecretPayload> {
    this.assertAllowed(path);
    const payload = this.load()[path];
    if (!payload) throw new SecretNotFoundError(path);
    return { ...payload };
  }

  async describe(path: string): Promise<SecretDescription> {
    this.assertAllowed(path);
    const payload = this.load()[path];
    return { path, exists: Boolean(payload), fields: payload ? Object.keys(payload) : [] };
  }

  async totpCode(name: string): Promise<TotpCode> {
    throw new Error(
      `The local secret store cannot issue TOTP codes (requested '${name}'). ` +
        `MFA needs Vault's TOTP secrets engine — see §12.`,
    );
  }

  async close(): Promise<void> {
    this.cache = null;
  }
}
