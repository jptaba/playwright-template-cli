import { test, type APIRequestContext } from '@playwright/test';
import { ContractDriftError, type ContractRegistry } from '../../support/contracts/validator';
import { redactDeep } from '../../support/redact';

/**
 * The shared API client — §05.
 *
 * Built on Playwright's `request` fixture, which gives cookies, proxy handling
 * and the CA bundle for free, and shares the trace viewer: an API call from a
 * UI test appears in the same trace as the clicks around it, which is worth a
 * great deal during triage.
 *
 * Two things live in here rather than in a spec:
 *
 *  - **Response-schema validation**, so every call in every test — including
 *    the setup calls inside UI tests — is a contract check for free.
 *  - **Cleanup tracking.** API setup is fast enough to be used everywhere,
 *    which means it generates data at a rate UI tests never did. Records are
 *    tagged with the run id and deleted in fixture teardown; a test
 *    environment that fills with orphaned records becomes slow and then
 *    untrustworthy.
 */

export interface EndpointDescriptor {
  /** Business name, used in step titles and error messages. */
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** OpenAPI-style template: `/orders/{id}`. Never a concrete URL (§04). */
  path: string;
  /** Statuses that are a normal outcome for this endpoint. */
  expect: number[];
}

export interface CallOptions<TBody> {
  /** Values for `{placeholders}` in the endpoint path. */
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  headers?: Record<string, string>;
  /** Statuses to accept for this call only — a deliberate negative test. */
  expect?: number[];
}

export interface ApiResponse<T> {
  status: number;
  /**
   * Response headers, lower-cased. Kept because a great many real contracts
   * live here and nowhere else: content type, cache directives, `Location` on
   * a redirect, rate-limit budgets, correlation ids. A client that drops them
   * cannot express those assertions at all.
   */
  headers: Record<string, string>;
  body: T;
  /** Populated when the response did not match the published schema. */
  drift: ContractDriftError | null;
}

/**
 * Supplies the headers that carry the caller's identity — typically
 * `{ Authorization: 'Bearer …' }`.
 *
 * A function rather than a fixed map, and awaited on every call, because
 * access tokens expire. A client that captured a bearer token once starts
 * failing with 401s part-way through any suite whose run outlives the token,
 * and the failure reads as an application defect rather than as an expiry.
 * Resolving per call lets a target's own auth vocabulary refresh silently.
 */
export type AuthHeaderProvider = () => Record<string, string> | Promise<Record<string, string>>;

export interface ApiClientOptions {
  baseURL: string;
  runId: string;
  registry?: ContractRegistry | null;
  /**
   * Contract drift throws by default in the `api` and `contract` projects and
   * is recorded-but-tolerated inside UI tests, where failing the journey on a
   * provider's schema change hides the thing the test was actually about.
   */
  throwOnDrift?: boolean;
  defaultHeaders?: Record<string, string>;
  /** Initial credential. Usually set later with `setAuth` (§05). */
  auth?: AuthHeaderProvider;
}

export interface CreatedResource {
  endpoint: EndpointDescriptor;
  id: string;
  /**
   * How to delete this record. Optional, and when absent cleanup falls back to
   * `DELETE <collection>/<id>` derived from the creating endpoint.
   *
   * The fallback is a guess about REST conventions, and it is wrong for any
   * nested or non-obvious resource. Naming the endpoint is the target saying
   * how its own records are removed, rather than the framework assuming.
   */
  remove?: EndpointDescriptor;
}

export class ApiError extends Error {
  constructor(
    readonly endpoint: EndpointDescriptor,
    readonly status: number,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(
      `${endpoint.name}: ${endpoint.method} ${url} returned ${status}, expected ` +
        `${endpoint.expect.join(' or ')}.\n${JSON.stringify(redactDeep(body)).slice(0, 800)}`,
    );
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private readonly created: CreatedResource[] = [];
  /** Endpoints this run has actually exercised, for the coverage view. */
  readonly exercised = new Set<string>();
  readonly driftFound: ContractDriftError[] = [];
  private auth: AuthHeaderProvider | null;

  constructor(
    private readonly request: APIRequestContext,
    private readonly options: ApiClientOptions,
  ) {
    this.auth = options.auth ?? null;
  }

  /** Tag every record with the run id so cleanup can find its own leftovers. */
  get runTag(): string {
    return this.options.runId;
  }

  /**
   * Attach the credential every subsequent call carries, or clear it with
   * `null`. The target's own auth vocabulary owns *how* a token is obtained;
   * the client only owns that every call gets one, including the deletes that
   * run during cleanup.
   */
  setAuth(provider: AuthHeaderProvider | null): void {
    this.auth = provider;
  }

  async call<TResponse, TBody = unknown>(
    endpoint: EndpointDescriptor,
    options: CallOptions<TBody> = {},
  ): Promise<ApiResponse<TResponse>> {
    const url = fillPath(endpoint.path, options.params);
    const accepted = options.expect ?? endpoint.expect;

    return test.step(`${endpoint.name}`, async () => {
      // Resolved per call so a short-lived token can refresh itself between
      // one request and the next.
      const credential = this.auth ? await this.auth() : {};
      const response = await this.request.fetch(joinUrl(this.options.baseURL, url), {
        method: endpoint.method,
        ...(options.query ? { params: compact(options.query) } : {}),
        ...(options.body === undefined ? {} : { data: options.body }),
        headers: {
          'Content-Type': 'application/json',
          ...this.options.defaultHeaders,
          ...credential,
          ...options.headers,
        },
      });

      const status = response.status();
      const headers = response.headers(); // already lower-cased by Playwright
      const text = await response.text();
      const body = parse<TResponse>(text);

      if (!accepted.includes(status)) throw new ApiError(endpoint, status, url, body);

      // The contract check every call gets for free.
      this.exercised.add(`${endpoint.method} ${endpoint.path}`);
      let drift: ContractDriftError | null = null;
      const failures = this.options.registry?.validate(endpoint.method, endpoint.path, status, body) ?? [];
      if (failures.length > 0) {
        drift = new ContractDriftError(`${endpoint.method} ${endpoint.path}`, failures);
        this.driftFound.push(drift);
        if (this.options.throwOnDrift) throw drift;
      }

      return { status, headers, body, drift };
    });
  }

  /**
   * Remember a record so teardown can remove it.
   *
   * Pass `remove` when the delete is not `DELETE <collection>/<id>` — a nested
   * resource, a different verb, a soft-delete endpoint. The fallback exists so
   * the common case stays one argument, not so that the framework can guess on
   * behalf of an API it knows nothing about.
   */
  track(endpoint: EndpointDescriptor, id: string, remove?: EndpointDescriptor): void {
    this.created.push({ endpoint, id, ...(remove ? { remove } : {}) });
  }

  /**
   * Delete one tracked record, through this client — so the delete carries the
   * same credential, the same base URL and the same trace as the call that
   * created it.
   *
   * This used to live in the `api` fixture as a bare `request.fetch` against a
   * URL built by string surgery, which meant cleanup was unauthenticated: on
   * any API that requires a token to delete, every delete answered 401, every
   * failure was swallowed by the logger, and the environment filled with
   * orphans while the suite stayed green.
   */
  async remove(resource: CreatedResource): Promise<void> {
    const endpoint = resource.remove ?? derivedDelete(resource.endpoint);
    /*
       The placeholder is read from the endpoint rather than assumed to be
       `{id}`. Real documents name it after the resource — `{brandId}`,
       `{invoiceId}`, `{productId}` — and `fillPath` throws on a placeholder it
       was given no value for, so assuming `{id}` turned every cleanup into an
       exception that the cleanup logger then swallowed.
    */
    const placeholder = /\{(\w+)\}/.exec(endpoint.path)?.[1] ?? 'id';
    await this.call(endpoint, { params: { [placeholder]: resource.id } });
  }

  /**
   * Delete what this client created, newest first. Failures are logged, never
   * thrown: a cleanup error must not turn a passing test red, but it must not
   * be silent either — orphaned records are how an environment rots.
   *
   * `remove` defaults to this client's own authenticated delete; it is
   * injectable so the behaviour can be tested without a server.
   */
  async cleanup(
    remove: (resource: CreatedResource) => Promise<void> = (resource) => this.remove(resource),
    log: (message: string) => void = () => undefined,
  ): Promise<void> {
    for (const resource of [...this.created].reverse()) {
      try {
        await remove(resource);
      } catch (error) {
        log(
          `cleanup failed for ${resource.endpoint.name} ${resource.id}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.created.length = 0;
  }
}

/**
 * `POST /products` → `DELETE /products/{id}`. The convention most REST APIs
 * follow, used only when a target has not said otherwise.
 *
 * A 404 here is accepted: cleanup runs after tests that may already have
 * deleted the record themselves, and re-deleting something that is gone is a
 * success for cleanup's purposes.
 */
function derivedDelete(created: EndpointDescriptor): EndpointDescriptor {
  const collection = created.path.replace(/\{[^}]+\}/g, '').replace(/\/+$/, '');
  return {
    name: `Clean up ${created.name}`,
    method: 'DELETE',
    path: `${collection}/{id}`,
    expect: [200, 202, 204, 404],
  };
}

function fillPath(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Endpoint path '${template}' needs a value for {${key}}.`);
    }
    return encodeURIComponent(String(value));
  });
}

function joinUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function compact(
  query: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined,
    ),
  );
}

function parse<T>(text: string): T {
  if (!text.trim()) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
