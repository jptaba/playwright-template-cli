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
}

export interface CreatedResource {
  endpoint: EndpointDescriptor;
  id: string;
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

  constructor(
    private readonly request: APIRequestContext,
    private readonly options: ApiClientOptions,
  ) {}

  /** Tag every record with the run id so cleanup can find its own leftovers. */
  get runTag(): string {
    return this.options.runId;
  }

  async call<TResponse, TBody = unknown>(
    endpoint: EndpointDescriptor,
    options: CallOptions<TBody> = {},
  ): Promise<ApiResponse<TResponse>> {
    const url = fillPath(endpoint.path, options.params);
    const accepted = options.expect ?? endpoint.expect;

    return test.step(`${endpoint.name}`, async () => {
      const response = await this.request.fetch(joinUrl(this.options.baseURL, url), {
        method: endpoint.method,
        ...(options.query ? { params: compact(options.query) } : {}),
        ...(options.body === undefined ? {} : { data: options.body }),
        headers: { 'Content-Type': 'application/json', ...this.options.defaultHeaders, ...options.headers },
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

  /** Remember a record so teardown can remove it. */
  track(endpoint: EndpointDescriptor, id: string): void {
    this.created.push({ endpoint, id });
  }

  /**
   * Delete what this client created, newest first. Failures are logged, never
   * thrown: a cleanup error must not turn a passing test red, but it must not
   * be silent either — orphaned records are how an environment rots.
   */
  async cleanup(
    remove: (resource: CreatedResource) => Promise<void>,
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
