import { HttpError, JsonClient } from '../http/json-client';
import { credentialFromEnv } from '../../support/env-credentials';
import { registerSecret } from '../../support/redact';
import { readStoredVaultConnection, resolveVaultConnection } from '../../support/secrets/vault-config';
import {
  SecretNotFoundError,
  SecretStoreUnavailableError,
  type SecretDescription,
  type SecretPayload,
  type SecretStore,
  type TotpCode,
} from '../secrets/types';

/**
 * Vault over HTTP — §11, §16, §17.
 *
 * Speaks HTTP directly rather than shelling out to the `vault` CLI: one less
 * binary to install on a locked-down host, and the better dependency choice
 * regardless.
 *
 * Authentication is behind `VaultAuth` so switching from AppRole to OIDC — or
 * to static public keys on the Vault side — is a configuration change rather
 * than a rewrite. That matters because enabling the JWT backend belongs to a
 * different team's queue (§22).
 */

export interface VaultConfig {
  address: string;
  /** Enterprise namespaces prefix every API path (§17). */
  namespace?: string;
  /** KV v2 mount. Set by a platform team, not chosen here. */
  kvMount: string;
  totpMount: string;
  databaseMount: string;
  auth: VaultAuthConfig;
  timeoutMs?: number;
  /** TOTP window in seconds. RFC 6238 default is 30. */
  totpPeriodSeconds: number;
}

/**
 * Which Vault, and where in it — the part an operator can state without ever
 * holding a secret. Authentication is not here on purpose; see
 * `VaultSecretStore.fromConnection`.
 */
export interface VaultConnection {
  address: string;
  /** Enterprise namespaces prefix every API path (§17). */
  namespace?: string;
  /** KV v2 mount. Defaults to `kv`, which is Vault's own default. */
  kvMount?: string;
}

export type VaultAuthConfig =
  | { method: 'jwt'; path: string; role: string; jwt: string }
  | { method: 'approle'; path: string; roleId: string; secretId: string }
  | { method: 'token'; token: string };

interface VaultAuthResponse {
  auth?: { client_token: string; lease_duration: number; renewable: boolean };
}

interface KvV2ReadResponse {
  data?: { data?: Record<string, unknown>; metadata?: { version?: number; destroyed?: boolean } };
}

interface KvV2WriteResponse {
  data?: { version?: number };
}

export class VaultSecretStore implements SecretStore {
  private client: JsonClient | null = null;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: VaultConfig) {}

  /**
   * In CI the JWT arrives from GitLab's `id_tokens` keyword. There is no
   * `secret_id` to deliver, wrap or rotate — the bootstrap credential problem
   * disappears, and bound claims mean a job on a feature branch of a fork
   * cannot read staging credentials even holding a valid token (§16).
   */
  static fromEnvironment(): VaultSecretStore {
    /*
       The environment first, then the Vault connected on this machine.

       The precedence is the interesting half and it is not negotiable: CI
       exports `VAULT_ADDR`, and a file somebody's laptop wrote must never
       override it. Below that, a connection the dashboard proved is a better
       answer than a refusal telling somebody to export what they have already
       told the tool — which is what this used to do, on the one path where the
       tool already knew.
    */
    const resolved = resolveVaultConnection({
      fromEnvironment: {
        address: process.env.VAULT_ADDR ?? process.env.VAULT_SERVER_URL,
        namespace: process.env.VAULT_NAMESPACE,
        kvMount: process.env.VAULT_KV_MOUNT,
      },
      stored: readStoredVaultConnection(),
    });

    if (!resolved.connection) {
      throw new SecretStoreUnavailableError(
        'No Vault is configured. In CI the address comes from the .vault-auth job template; ' +
          'locally, connect one on the dashboard (npm run onboard, step 3) or export VAULT_ADDR ' +
          'yourself, or set SECRET_SOURCE=local to run against a target whose credentials are ' +
          'public.',
      );
    }

    return VaultSecretStore.fromConnection(resolved.connection);
  }

  /**
   * A Vault somebody named, rather than whichever one the environment happens
   * to hold.
   *
   * Onboarding needs this: "which Vault, and how are secrets laid out in it"
   * are the operator's to state, and until there was a way to say so the only
   * answer was an environment variable set before the process started — which
   * a page cannot ask for.
   *
   * **The token is deliberately not a parameter.** Authentication still
   * resolves from the environment, so naming a Vault never means holding a
   * credential for it: an address, a namespace and a mount are configuration,
   * and the thing that would make them dangerous stays where it was.
   */
  static fromConnection(connection: VaultConnection): VaultSecretStore {
    const address = connection.address.trim();
    if (!address) {
      throw new SecretStoreUnavailableError(
        'A Vault address is needed. Point it at the Vault your team operates, or use a ' +
          'local secret source for a target whose credentials are genuinely public.',
      );
    }

    return new VaultSecretStore({
      address: address.replace(/\/+$/, ''),
      namespace: connection.namespace?.trim() || undefined,
      kvMount: connection.kvMount?.trim() || 'kv',
      totpMount: process.env.VAULT_TOTP_MOUNT ?? 'totp',
      databaseMount: process.env.VAULT_DB_MOUNT ?? 'database',
      totpPeriodSeconds: Number(process.env.VAULT_TOTP_PERIOD ?? 30),
      auth: resolveAuthFromEnvironment(),
    });
  }

  private async http(): Promise<JsonClient> {
    if (this.client) return this.client;
    this.client = await JsonClient.create({
      name: 'Vault',
      baseURL: `${this.config.address}/v1/`,
      timeoutMs: this.config.timeoutMs ?? 15_000,
      headers: this.config.namespace ? { 'X-Vault-Namespace': this.config.namespace } : {},
    });
    return this.client;
  }

  /** Log in, or reuse a token that is still comfortably inside its lease. */
  private async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const http = await this.http();
    const auth = this.config.auth;

    if (auth.method === 'token') {
      this.token = auth.token;
      this.tokenExpiresAt = Number.MAX_SAFE_INTEGER;
      registerSecret(this.token, 'vault:token');
      return this.token;
    }

    const path =
      auth.method === 'jwt' ? `auth/${auth.path}/login` : `auth/${auth.path}/login`;
    const body =
      auth.method === 'jwt'
        ? { role: auth.role, jwt: auth.jwt }
        : { role_id: auth.roleId, secret_id: auth.secretId };

    let response;
    try {
      response = await http.post<VaultAuthResponse>(path, { body });
    } catch (cause) {
      if (cause instanceof HttpError && cause.isUnauthorized) {
        throw new SecretStoreUnavailableError(
          `Vault rejected ${auth.method} authentication. Check that the backend is enabled and ` +
            'that the role\'s bound claims match this job — project_path and ref are the two ' +
            'that usually differ (§16).',
          cause,
        );
      }
      throw cause;
    }

    const token = response.body.auth?.client_token;
    if (!token) {
      throw new SecretStoreUnavailableError(
        'Vault returned no client token. The auth backend responded but issued nothing usable.',
      );
    }
    this.token = token;
    registerSecret(token, 'vault:token');
    const lease = response.body.auth?.lease_duration ?? 3600;
    // Renew well before expiry: a long shard must not lose its token mid-run.
    this.tokenExpiresAt = Date.now() + Math.max(30, lease * 0.8) * 1000;
    return token;
  }

  private async authedHeaders(): Promise<Record<string, string>> {
    return { 'X-Vault-Token': await this.authenticate() };
  }

  private kvDataPath(path: string): string {
    return `${this.config.kvMount}/data/${path}`;
  }

  async read(path: string): Promise<SecretPayload> {
    const http = await this.http();
    const response = await http.get<KvV2ReadResponse>(this.kvDataPath(path), {
      headers: await this.authedHeaders(),
      expectStatuses: [404],
    });
    if (response.status === 404 || !response.body?.data?.data) {
      throw new SecretNotFoundError(path);
    }
    // KV v2 nests payloads under data.data; the adapter normalises this so
    // callers never see the envelope (§11).
    return stringify(response.body.data.data);
  }

  async describe(path: string): Promise<SecretDescription> {
    const http = await this.http();
    const response = await http.get<KvV2ReadResponse>(this.kvDataPath(path), {
      headers: await this.authedHeaders(),
      expectStatuses: [403, 404],
    });
    if (response.status >= 400 || !response.body?.data?.data) {
      return { path, exists: false, fields: [] };
    }
    return {
      path,
      exists: true,
      // Field names only. Most credential debugging needs the existence check,
      // not the secret (§22).
      fields: Object.keys(response.body.data.data),
      version: response.body.data.metadata?.version,
    };
  }

  /**
   * Compare-and-swap write, used by the account pool. Two runners starting
   * simultaneously will otherwise both take account 1 (§13).
   *
   * @returns the new version, or null when another writer won the race.
   */
  async writeIfUnchanged<T extends object>(
    path: string,
    data: T,
    expectedVersion: number,
  ): Promise<number | null> {
    const http = await this.http();
    const response = await http.post<KvV2WriteResponse>(this.kvDataPath(path), {
      headers: await this.authedHeaders(),
      body: { data, options: { cas: expectedVersion } },
      expectStatuses: [400],
    });
    if (response.status === 400) return null; // CAS mismatch: someone else won
    return response.body?.data?.version ?? expectedVersion + 1;
  }

  /**
   * Write a *new version* of a KV v2 path. The version history is the rollback
   * for a rotation that turns out to have gone wrong (§13).
   */
  async write(path: string, data: Record<string, string>): Promise<number> {
    const http = await this.http();
    const response = await http.post<KvV2WriteResponse>(this.kvDataPath(path), {
      headers: await this.authedHeaders(),
      body: { data },
    });
    return response.body?.data?.version ?? 0;
  }

  /** Current version of a path, or 0 when it does not exist yet. */
  async currentVersion(path: string): Promise<number> {
    const description = await this.describe(path);
    return description.version ?? 0;
  }

  /**
   * The TOTP secrets engine acts as the authenticator app: seeds are stored
   * write-only and the code is computed by Vault, so the seed never reaches
   * this process (§12).
   */
  async totpCode(name: string): Promise<TotpCode> {
    const http = await this.http();
    const response = await http.get<{ data?: { code?: string } }>(
      `${this.config.totpMount}/code/${encodeURIComponent(name)}`,
      { headers: await this.authedHeaders(), expectStatuses: [404] },
    );
    if (response.status === 404 || !response.body?.data?.code) {
      throw new SecretNotFoundError(`${this.config.totpMount}/code/${name}`);
    }
    const code = response.body.data.code;
    registerSecret(code, `totp:${name}`);
    return { code, validForSeconds: this.remainingWindowSeconds() };
  }

  /**
   * Seconds left in the current TOTP window. Vault does not report it, but it
   * is a pure function of the clock and the period — and it is the whole
   * defence against submitting a code that expires between fetch and submit.
   */
  remainingWindowSeconds(nowMs = Date.now()): number {
    const period = this.config.totpPeriodSeconds;
    return period - (Math.floor(nowMs / 1000) % period);
  }

  /**
   * Short-lived read-only database credentials — better than a static test
   * database password in a KV path: nothing to rotate, nothing to leak, and
   * the lease expires by itself (§05).
   */
  async databaseCredentials(
    role: string,
  ): Promise<{ credentials: SecretPayload; leaseId?: string }> {
    const http = await this.http();
    const response = await http.get<{
      data?: { username?: string; password?: string };
      lease_id?: string;
    }>(`${this.config.databaseMount}/creds/${encodeURIComponent(role)}`, {
      headers: await this.authedHeaders(),
      expectStatuses: [404],
    });
    if (response.status === 404 || !response.body?.data?.username) {
      throw new SecretNotFoundError(`${this.config.databaseMount}/creds/${role}`);
    }
    const credentials = stringify(response.body.data);
    registerSecret(credentials.password, `db:${role}.password`);
    return { credentials, ...(response.body.lease_id ? { leaseId: response.body.lease_id } : {}) };
  }

  async close(): Promise<void> {
    if (this.client && this.token && this.config.auth.method !== 'token') {
      try {
        // Revoke rather than leaving a live token to expire on its own.
        await this.client.post('auth/token/revoke-self', {
          headers: { 'X-Vault-Token': this.token },
          expectStatuses: [204, 400, 403, 404],
        });
      } catch {
        // Teardown must not fail a run. The token expires on its own lease.
      }
    }
    await this.client?.dispose();
    this.client = null;
    this.token = null;
  }
}

function resolveAuthFromEnvironment(): VaultAuthConfig {
  const idToken = credentialFromEnv('VAULT_ID_TOKEN', 'vault:id-token');
  if (idToken) {
    return {
      method: 'jwt',
      path: process.env.VAULT_AUTH_PATH ?? 'jwt',
      role: process.env.VAULT_AUTH_ROLE ?? 'playwright-e2e',
      jwt: idToken,
    };
  }

  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = credentialFromEnv('VAULT_SECRET_ID', 'vault:secret-id');
  if (roleId && secretId) {
    return {
      method: 'approle',
      path: process.env.VAULT_AUTH_PATH ?? 'approle',
      roleId,
      secretId,
    };
  }

  const token = credentialFromEnv('VAULT_TOKEN', 'vault:token');
  if (token) return { method: 'token', token };

  throw new SecretStoreUnavailableError(
    'No Vault credential available. In CI, VAULT_ID_TOKEN comes from the id_tokens keyword. ' +
      'Locally, log in with OIDC against the corporate IdP and export VAULT_TOKEN — developers ' +
      'never hold a long-lived credential (§11).',
  );
}

/** Vault values are JSON; the framework only ever passes strings around. */
function stringify(data: Record<string, unknown>): SecretPayload {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}
