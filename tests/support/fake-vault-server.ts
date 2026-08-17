import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * An in-process Vault, speaking the subset of the HTTP API this framework uses.
 *
 * §22: "Keep progress independent of the answer by writing the adapter against
 * its own interface and unit-testing it with an in-process fake — no local
 * Vault instance to stand up, and the fake doubles as the test that the
 * adapter's error handling is correct."
 *
 * A fake *server* rather than a fake object, deliberately: it exercises the
 * KV v2 envelope, the CAS semantics, the namespace header, the retry path and
 * the 404-versus-error distinction, all of which are where the real bugs are.
 */

export interface FakeVaultOptions {
  /** Tokens the fake will accept. Anything else gets a 403, like Vault. */
  validToken?: string;
  namespace?: string;
  /**
   * Where the KV v2 engine is mounted. Defaults to `kv`, which is what this
   * framework defaults to — but a real Vault dev server mounts it at `secret`,
   * and a platform team can mount it anywhere.
   *
   * Configurable because the onboarding dashboard now lets somebody state the
   * mount, and a wrong one is precisely what its connection check exists to
   * catch. A fake that only ever answered on `kv` could not tell a correct
   * mount from a hardcoded one.
   */
  kvMount?: string;
}

interface Entry {
  data: Record<string, unknown>;
  version: number;
  destroyed?: boolean;
}

export class FakeVaultServer {
  private server?: http.Server;
  private readonly entries = new Map<string, Entry>();
  private readonly totpSeeds = new Set<string>();

  /** Queued responses that pre-empt normal handling, for failure injection. */
  private failures: Array<{ status: number; body?: unknown; headers?: Record<string, string> }> = [];

  readonly requests: Array<{ method: string; url: string; namespace?: string; token?: string }> = [];

  constructor(private readonly options: FakeVaultOptions = {}) {}

  get token(): string {
    return this.options.validToken ?? 'fake-root-token';
  }

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = undefined;
  }

  /** Seed a KV v2 path. */
  put(path: string, data: Record<string, unknown>): void {
    const existing = this.entries.get(path);
    this.entries.set(path, { data, version: (existing?.version ?? 0) + 1 });
  }

  read(path: string): Record<string, unknown> | undefined {
    return this.entries.get(path)?.data;
  }

  version(path: string): number {
    return this.entries.get(path)?.version ?? 0;
  }

  addTotpKey(name: string): void {
    this.totpSeeds.add(name);
  }

  /** The next request gets this response instead of the normal one. */
  failNext(status: number, body?: unknown, headers?: Record<string, string>): void {
    this.failures.push({ status, body, headers });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const token = req.headers['x-vault-token'] as string | undefined;
    const namespace = req.headers['x-vault-namespace'] as string | undefined;
    this.requests.push({ method: req.method ?? 'GET', url, namespace, token });

    const injected = this.failures.shift();
    if (injected) {
      return this.send(res, injected.status, injected.body ?? { errors: ['injected'] }, injected.headers);
    }

    const body = await readBody(req);
    const path = url.replace(/^\/v1\//, '').split('?')[0] ?? '';

    // ---- auth ---------------------------------------------------------------
    if (path === 'auth/jwt/login' || path === 'auth/approle/login') {
      const parsed = body as Record<string, unknown>;
      const ok =
        path === 'auth/jwt/login'
          ? typeof parsed.jwt === 'string' && parsed.jwt.length > 0 && parsed.role === 'playwright-e2e'
          : parsed.role_id === 'role-id' && parsed.secret_id === 'secret-id';
      if (!ok) {
        return this.send(res, 400, {
          errors: ['invalid role or JWT claims did not match bound_claims'],
        });
      }
      return this.send(res, 200, {
        auth: { client_token: this.token, lease_duration: 3600, renewable: true },
      });
    }

    if (path === 'auth/token/revoke-self') return this.send(res, 204, '');

    // Everything below needs a token, exactly like Vault.
    if (token !== this.token) {
      return this.send(res, 403, { errors: ['permission denied'] });
    }
    if (this.options.namespace && namespace !== this.options.namespace) {
      return this.send(res, 404, { errors: ['namespace not found'] });
    }

    // ---- kv v2 --------------------------------------------------------------
    // Answers on its own mount only, exactly like Vault: a read against the
    // wrong mount is a 404, not a silently-served secret.
    const mount = this.options.kvMount ?? 'kv';
    const kvMatch = new RegExp(`^${mount}/data/(.+)$`).exec(path);
    if (kvMatch) {
      const key = kvMatch[1]!;
      if (req.method === 'GET') {
        const entry = this.entries.get(key);
        if (!entry) return this.send(res, 404, { errors: [] });
        return this.send(res, 200, {
          data: { data: entry.data, metadata: { version: entry.version, destroyed: false } },
        });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const parsed = body as { data?: Record<string, unknown>; options?: { cas?: number } };
        const entry = this.entries.get(key);
        const currentVersion = entry?.version ?? 0;
        const cas = parsed.options?.cas;
        if (cas !== undefined && cas !== currentVersion) {
          // Vault's own shape for a failed compare-and-swap.
          return this.send(res, 400, {
            errors: [`check-and-set parameter did not match the current version: ${currentVersion}`],
          });
        }
        const version = currentVersion + 1;
        this.entries.set(key, { data: parsed.data ?? {}, version });
        return this.send(res, 200, { data: { version, created_time: new Date().toISOString() } });
      }
    }

    // ---- totp ---------------------------------------------------------------
    const totpMatch = /^totp\/code\/(.+)$/.exec(path);
    if (totpMatch) {
      const name = decodeURIComponent(totpMatch[1]!);
      if (!this.totpSeeds.has(name)) return this.send(res, 404, { errors: [] });
      // Deterministic per 30s window, like a real authenticator.
      const window = Math.floor(Date.now() / 30_000);
      const code = String((window * 7919 + name.length * 13) % 1_000_000).padStart(6, '0');
      return this.send(res, 200, { data: { code } });
    }

    // ---- database credentials ----------------------------------------------
    const dbMatch = /^database\/creds\/(.+)$/.exec(path);
    if (dbMatch) {
      const role = decodeURIComponent(dbMatch[1]!);
      if (role !== 'qa-readonly') return this.send(res, 404, { errors: [] });
      return this.send(res, 200, {
        lease_id: 'database/creds/qa-readonly/abc123',
        lease_duration: 3600,
        data: { username: 'v-token-qa-readonly-xyz', password: 'A1-dynamic-password-xyz' },
      });
    }

    return this.send(res, 404, { errors: [] });
  }

  private send(
    res: http.ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ): void {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(payload);
  }
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
