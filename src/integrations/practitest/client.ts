import { HttpError, JsonClient } from '../http/json-client';
import { practitestLimiter, type RateLimiter } from '../../support/rate-limiter';
import { redact } from '../../support/redact';
import { requireCredentialFromEnv } from '../../support/env-credentials';

/**
 * PractiTest, in both directions — §14.
 *
 * The API envelope is the design constraint, not a detail:
 *
 *  - **≤ 20 instances per run POST** — results are buffered and chunked.
 *  - **≤ 30 calls per minute**, shared across reads, writes and attachments —
 *    one token-bucket limiter for the whole process, with backoff on 429.
 *  - **Sharded CI** — shards write result JSON as artifacts and a single
 *    post-job merges and posts once. N shards × M calls blows the limit on the
 *    first real night.
 *
 * Everything here is best-effort: a reporting failure degrades to a warning
 * plus an artifact. It never turns a green suite red (§01).
 */

export interface PractiTestConfig {
  baseURL: string;
  projectId: string;
  token: string;
  /** Shared with every other PractiTest caller in the process. */
  limiter?: RateLimiter;
  /** Attachments are capped before encoding: traces are large (§14). */
  maxAttachmentBytes?: number;
}

export interface RunInstanceResult {
  /** PractiTest display id carried by the spec's annotation. */
  caseDisplayId: string;
  status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'NO RUN' | 'N/A';
  durationSeconds: number;
  /** Failure message, already scrubbed. */
  actualResult?: string;
  attachments?: Array<{ name: string; contentType: string; body: Buffer }>;
}

interface PractiTestEntity {
  id: string;
  attributes?: Record<string, unknown>;
}

export class PractiTestClient {
  private http: JsonClient | null = null;
  private readonly limiter: RateLimiter;
  /** Display id → instance id. Resolution is not repeated every run (§14). */
  private readonly instanceCache = new Map<string, string>();

  constructor(private readonly config: PractiTestConfig) {
    this.limiter = config.limiter ?? practitestLimiter();
  }

  static fromEnvironment(overrides: Partial<PractiTestConfig> = {}): PractiTestClient {
    const baseURL = process.env.PRACTITEST_URL;
    if (!baseURL) {
      // Not defaulted deliberately: an integration whose host is guessed is
      // one that can silently point at the wrong instance, and the same rule
      // that keeps the application under test in configuration applies here.
      throw new Error(
        'PRACTITEST_URL is not set. Point it at your PractiTest API root, including the ' +
          'API version path.',
      );
    }
    return new PractiTestClient({
      baseURL,
      projectId: process.env.PRACTITEST_PROJECT_ID ?? '',
      // Attributed to a dedicated service account, not a person's token: a
      // personal PAT breaks human-edit detection and dies when that person
      // changes role (§14).
      token: requireCredentialFromEnv('PRACTITEST_TOKEN', 'PractiTest reporting'),
      ...overrides,
    });
  }

  private async client(): Promise<JsonClient> {
    if (this.http) return this.http;
    this.http = await JsonClient.create({
      name: 'PractiTest',
      baseURL: this.config.baseURL.replace(/\/+$/, '') + '/',
      limiter: this.limiter,
      // Authentication uses the PTToken header with a Personal API Token, so
      // actions are attributed to a real user and inherit their permissions.
      headers: { PTToken: this.config.token },
      timeoutMs: 30_000,
    });
    return this.http;
  }

  async dispose(): Promise<void> {
    await this.http?.dispose();
    this.http = null;
  }

  /** Resolve display ids to instance ids via set-ids + name_exact (§14). */
  async resolveInstances(displayIds: string[]): Promise<Map<string, string>> {
    const unresolved = displayIds.filter((id) => !this.instanceCache.has(id));
    if (unresolved.length > 0) {
      const http = await this.client();
      let response;
      try {
        response = await http.get<{ data?: PractiTestEntity[] }>(
          `projects/${this.config.projectId}/instances.json`,
          { query: { 'filter[test-display-ids]': unresolved.join(','), page_size: 100 } },
        );
      } catch (error) {
        // A token that silently expires turns every nightly run's reporting
        // step into a 401. Treat it as its own loudly-reported condition
        // rather than folding it into generic request failure (§15).
        if (isUnauthorized(error)) throw new PractiTestAuthError(error);
        throw error;
      }
      for (const entity of response.body.data ?? []) {
        const display = String(
          (entity.attributes?.['test-display-id'] ?? entity.attributes?.['display-id']) ?? '',
        );
        if (display) this.instanceCache.set(display, entity.id);
      }
    }
    return new Map(displayIds.filter((id) => this.instanceCache.has(id)).map((id) => [id, this.instanceCache.get(id)!]));
  }

  /**
   * Post results, chunked to the documented maximum. Returns what could not be
   * posted rather than throwing: a spec whose case cannot be resolved is
   * reported loudly but does not fail the suite (§14).
   */
  async postRunResults(
    results: RunInstanceResult[],
    log: (message: string) => void = () => undefined,
  ): Promise<{ posted: number; unresolved: string[]; failed: string[] }> {
    const instances = await this.resolveInstances(results.map((result) => result.caseDisplayId));
    const unresolved = results
      .filter((result) => !instances.has(result.caseDisplayId))
      .map((result) => result.caseDisplayId);
    if (unresolved.length > 0) {
      log(
        `${unresolved.length} case id(s) could not be resolved in PractiTest: ${unresolved.join(', ')}. ` +
          'Reported loudly, but the suite is not failed for it.',
      );
    }

    const postable = results.filter((result) => instances.has(result.caseDisplayId));
    const failed: string[] = [];
    let posted = 0;

    for (const chunk of chunksOf(postable, 20)) {
      try {
        const http = await this.client();
        await http.post(`projects/${this.config.projectId}/runs.json`, {
          body: {
            data: chunk.map((result) => ({
              attributes: {
                'instance-id': instances.get(result.caseDisplayId),
                'exit-code': result.status === 'PASSED' ? 0 : 1,
                run_duration: formatDuration(result.durationSeconds),
                'automated-execution-output': redact(result.actualResult ?? ''),
              },
            })),
          },
        });
        posted += chunk.length;
      } catch (error) {
        failed.push(...chunk.map((result) => result.caseDisplayId));
        log(
          `Failed to post a chunk of ${chunk.length} result(s): ` +
            `${error instanceof Error ? redact(error.message) : String(error)}`,
        );
      }
    }

    return { posted, unresolved, failed };
  }

  /**
   * Attachments: failures only, size-capped, scrubbed. Traces are large — cap
   * before encoding, not after (§14).
   */
  async attach(
    runId: string,
    attachment: { name: string; contentType: string; body: Buffer },
  ): Promise<boolean> {
    const cap = this.config.maxAttachmentBytes ?? 2 * 1024 * 1024;
    if (attachment.body.byteLength > cap) return false;

    try {
      const http = await this.client();
      await http.post(`projects/${this.config.projectId}/attachments.json`, {
        body: {
          data: {
            attributes: {
              'entity-id': runId,
              'entity-type': 'run',
              'file-name': attachment.name,
              'file-content-type': attachment.contentType,
              'file-content': attachment.body.toString('base64'),
            },
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find a case by the identity Track A publishes under — the case slug plus
   * story key, stored in a custom field. Re-publishing updates that case; it
   * does not create a second one (§09).
   */
  async findCaseByIdentity(identity: string): Promise<{
    id: string;
    lastEditedBy: string | null;
  } | null> {
    const http = await this.client();
    const response = await http.get<{ data?: PractiTestEntity[] }>(
      `projects/${this.config.projectId}/tests.json`,
      { query: { 'filter[custom-fields][case-identity]': identity, page_size: 2 } },
    );
    const found = response.body.data?.[0];
    if (!found) return null;
    return {
      id: found.id,
      lastEditedBy: (found.attributes?.['last-modified-by'] as string | undefined) ?? null,
    };
  }

  /** Cases in the project, optionally scoped to a set (§09, Track B). */
  /**
   * The id of a set, by its name — item 63.
   *
   * **Looked up rather than written down.** One project holds every
   * application's cases, so "the cases for this application" is only a real
   * question once there is a set per application; and the set's *id* is an
   * internal identifier of somebody else's system. The conventions already
   * refuse transcribed internal ids for the application under test, and the
   * reasoning carries: a number in a profile is unverifiable, and it points
   * silently at the wrong set the day the project is rebuilt. The name is the
   * thing a person chose and can check.
   *
   * @returns the id, or null when no set carries that name — which is a real
   * answer and the caller says what to do about it, rather than falling back
   * to every case in the project.
   */
  async findSetByName(name: string): Promise<string | null> {
    const http = await this.client();
    try {
      const response = await http.get<{ data?: PractiTestEntity[] }>(
        `projects/${this.config.projectId}/sets.json`,
        { query: { 'filter[name]': name, page_size: 100 } },
      );
      /*
         Filtered again here rather than trusting the query. `filter[name]` is
         documented as a match rather than an exact match, so a project with
         `shop` and `shop-staging` would hand back both and the first one wins
         by accident — which is the quietest possible way to trace a suite to
         the wrong application's cases.
      */
      const exact = (response.body.data ?? []).find(
        (entity) => String(entity.attributes?.name ?? '') === name,
      );
      return exact?.id ?? null;
    } catch (error) {
      if (isUnauthorized(error)) throw new PractiTestAuthError(error);
      throw error;
    }
  }

  async listCases(options: { setId?: string; pageSize?: number } = {}): Promise<
    Array<{ id: string; attributes?: Record<string, unknown>; steps?: Array<Record<string, unknown>> }>
  > {
    const http = await this.client();
    const response = await http.get<{
      data?: Array<{
        id: string;
        attributes?: Record<string, unknown>;
        steps?: Array<Record<string, unknown>>;
      }>;
    }>(`projects/${this.config.projectId}/tests.json`, {
      query: {
        page_size: options.pageSize ?? 100,
        ...(options.setId ? { 'filter[set-ids]': options.setId } : {}),
      },
    });
    return response.body.data ?? [];
  }

  async createCase(payload: Record<string, unknown>): Promise<string> {
    const http = await this.client();
    const response = await http.post<{ data?: PractiTestEntity }>(
      `projects/${this.config.projectId}/tests.json`,
      { body: { data: { type: 'tests', attributes: payload } } },
    );
    const id = response.body.data?.id;
    if (!id) throw new Error('PractiTest accepted the case but returned no id.');
    return id;
  }

  async updateCase(id: string, payload: Record<string, unknown>): Promise<void> {
    const http = await this.client();
    await http.put(`projects/${this.config.projectId}/tests/${id}.json`, {
      body: { data: { type: 'tests', attributes: payload } },
    });
  }

  /**
   * Deletion is not in scope in either direction. If a published case turns
   * out to be wrong, a human retires it in PractiTest — an automation that can
   * create cases *and* delete them is a considerably larger conversation with
   * whoever owns that system (§14).
   */
  readonly canDelete = false;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpError && error.isUnauthorized;
}

/**
 * Its own condition, deliberately. Reporting is best-effort — the *publisher*
 * catches this, warns and exits zero so a green suite stays green — but the
 * message has to name the cause, or a nightly run quietly stops reporting and
 * nobody notices for a fortnight (§15).
 */
export class PractiTestAuthError extends Error {
  constructor(cause: unknown) {
    super(
      'PractiTest rejected the API token: expired, revoked, or lacking permission on this ' +
        'project. Rotate it in Vault rather than in CI variables, and use a dedicated service ' +
        'account — a personal token dies when that person changes role (§14).',
    );
    this.name = 'PractiTestAuthError';
    this.cause = cause;
  }
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  return `${hours}:${minutes}:${String(total % 60).padStart(2, '0')}`;
}
