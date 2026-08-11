import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { backoffDelay } from '../../support/poll';
import type { RateLimiter } from '../../support/rate-limiter';
import { redact } from '../../support/redact';

/**
 * One JSON-over-HTTP client for every integration — Vault, PractiTest, Jira.
 *
 * Built on Playwright's `APIRequestContext` rather than `fetch` for a specific
 * reason from §17: it handles the proxy and the internal CA bundle, which is
 * the difference between working and `SELF_SIGNED_CERT_IN_CHAIN` inside a
 * corporate network. `NODE_TLS_REJECT_UNAUTHORIZED=0` is never the answer — it
 * disables validation process-wide, including for the Vault calls carrying
 * credentials.
 *
 * Everything it reports is redacted on the way out, because an error body is
 * the most common accidental credential sink there is.
 */

export interface RetryPolicy {
  attempts: number;
  /** Statuses worth retrying. 429 and 5xx by default; never 4xx otherwise. */
  retryStatuses: number[];
  baseDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  attempts: 3,
  retryStatuses: [408, 425, 429, 500, 502, 503, 504],
  baseDelayMs: 250,
};

export interface JsonClientOptions {
  /** Named in every error, so a failure says which system was unreachable. */
  name: string;
  baseURL: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
}

export interface JsonResponse<T> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export class HttpError extends Error {
  constructor(
    readonly system: string,
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly bodyText: string,
  ) {
    super(`${system}: ${method} ${url} → ${status}. ${redact(bodyText).slice(0, 500)}`);
    this.name = 'HttpError';
  }

  /** 401 is its own condition: a token that silently expired, not a bad request. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export class TransportError extends Error {
  constructor(system: string, method: string, url: string, cause: unknown) {
    super(
      `${system}: ${method} ${url} did not complete — ${describe(cause)}. ` +
        'Inside a restricted network this is usually the proxy, the internal CA bundle ' +
        '(NODE_EXTRA_CA_CERTS) or a missing egress rule (§17).',
    );
    this.name = 'TransportError';
    this.cause = cause;
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Return the response instead of throwing on these statuses. */
  expectStatuses?: number[];
  timeoutMs?: number;
}

export class JsonClient {
  private constructor(
    private readonly context: APIRequestContext,
    private readonly options: JsonClientOptions,
    private readonly retry: RetryPolicy,
  ) {}

  static async create(options: JsonClientOptions): Promise<JsonClient> {
    const proxyServer = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    const context = await playwrightRequest.newContext({
      baseURL: options.baseURL,
      extraHTTPHeaders: { Accept: 'application/json', ...options.headers },
      timeout: options.timeoutMs ?? 30_000,
      ...(proxyServer
        ? { proxy: { server: proxyServer, bypass: process.env.NO_PROXY ?? undefined } }
        : {}),
    });
    return new JsonClient(context, options, { ...DEFAULT_RETRY, ...options.retry });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  async request<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    options: RequestOptions = {},
  ): Promise<JsonResponse<T>> {
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retry.attempts; attempt++) {
      if (this.options.limiter) await this.options.limiter.take();

      let status: number;
      let text: string;
      let headers: Record<string, string>;

      try {
        const response = await this.context.fetch(path, {
          method,
          ...(options.query ? { params: cleanQuery(options.query) } : {}),
          ...(options.body === undefined ? {} : { data: options.body }),
          headers: { 'Content-Type': 'application/json', ...options.headers },
          ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
        });
        status = response.status();
        headers = response.headers();
        text = await response.text();
      } catch (cause) {
        lastError = new TransportError(this.options.name, method.toUpperCase(), path, cause);
        if (attempt === this.retry.attempts) throw lastError;
        await sleep(backoffDelay(attempt, this.retry.baseDelayMs));
        continue;
      }

      const acceptable = options.expectStatuses ?? [];
      if (status < 400 || acceptable.includes(status)) {
        return { status, headers, body: parseJson<T>(text) };
      }

      const retryable = this.retry.retryStatuses.includes(status);
      if (!retryable || attempt === this.retry.attempts) {
        throw new HttpError(this.options.name, status, method.toUpperCase(), path, text);
      }

      // Honour Retry-After when the server states one; it knows better than
      // our backoff curve does.
      const retryAfter = Number(headers['retry-after']);
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : backoffDelay(attempt, this.retry.baseDelayMs);
      await sleep(delay);
    }

    throw lastError ?? new Error(`${this.options.name}: exhausted retries for ${method} ${path}`);
  }

  get = <T>(path: string, options?: RequestOptions) => this.request<T>('get', path, options);
  post = <T>(path: string, options?: RequestOptions) => this.request<T>('post', path, options);
  put = <T>(path: string, options?: RequestOptions) => this.request<T>('put', path, options);
  patch = <T>(path: string, options?: RequestOptions) => this.request<T>('patch', path, options);
  delete = <T>(path: string, options?: RequestOptions) => this.request<T>('delete', path, options);
}

function cleanQuery(
  query: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined,
    ),
  );
}

function parseJson<T>(text: string): T {
  if (text.trim() === '') return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return redact(cause.message);
  return redact(String(cause));
}
