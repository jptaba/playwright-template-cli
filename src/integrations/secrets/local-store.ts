import fs from 'node:fs';
import { repoPath } from '../../support/paths';
import {
  SecretNotFoundError,
  type SecretDescription,
  type SecretPayload,
  type SecretStore,
  type TotpCode,
} from './types';

/**
 * The shared file, which is **tracked in git**. Correct for a vendor demo that
 * publishes its own logins, and wrong for everything else.
 */
export const SHARED_STORE_FILE = repoPath('config', 'secrets.local.json');

/**
 * The private file, which is gitignored and takes precedence.
 *
 * There was no such thing before, and its absence was the whole problem:
 * somebody onboarding a real application had nowhere to put a real password
 * except a tracked file or a Vault they might not have yet. Precedence rather
 * than replacement, so a placeholder can be committed for shape and the real
 * value put here without editing the committed one.
 */
export const PRIVATE_STORE_FILE = repoPath('config', 'secrets.private.json');

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
  /** Which file each path came from, for `describe` to report honestly. */
  private origins: Record<string, string> = {};
  private readonly files: readonly string[];

  constructor(
    private readonly allowedRoots: readonly string[],
    file?: string,
  ) {
    if (allowedRoots.length === 0) {
      throw new Error('LocalSecretStore requires at least one allowed root path.');
    }
    /*
       Private first, then shared: the last write wins in `load`, so the order
       here is lowest-precedence-first. `LOCAL_SECRETS_FILE` still overrides
       everything, because a test pointing at a fixture must not accidentally
       read a developer's real one.
    */
    const explicit = file ?? process.env.LOCAL_SECRETS_FILE;
    this.files = explicit ? [explicit] : [SHARED_STORE_FILE, PRIVATE_STORE_FILE];
  }

  private load(): Record<string, SecretPayload> {
    if (this.cache) return this.cache;

    const merged: Record<string, SecretPayload> = {};
    const origins: Record<string, string> = {};
    let found = 0;

    for (const file of this.files) {
      if (!fs.existsSync(file)) continue;
      found += 1;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        // `_`-prefixed keys are documentation, not secrets.
        if (key.startsWith('_')) continue;
        merged[key] = value as SecretPayload;
        origins[key] = file;
      }
    }

    if (found === 0) {
      throw new SecretNotFoundError(
        `${this.files.join(' or ')} (no local secret store found; set SECRET_SOURCE=vault, or ` +
          'add the credential on the Test users page of the dashboard)',
      );
    }

    this.origins = origins;
    this.cache = merged;
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
    return {
      path,
      exists: Boolean(payload),
      fields: payload ? Object.keys(payload) : [],
      // Which file answered. With two files and precedence between them, "it
      // exists" is not enough to debug with — the next question is always
      // "which one am I actually reading?".
      ...(payload ? { origin: this.origins[path] } : {}),
    };
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
