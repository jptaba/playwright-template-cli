import crypto from 'node:crypto';
import { HttpError, JsonClient } from '../http/json-client';
import { requireCredentialFromEnv } from '../../support/env-credentials';
import { redact } from '../../support/redact';

/**
 * Jira Data Center — §15.
 *
 * "Data Center is not Cloud with a different URL." Four differences bite an
 * integration written against Cloud documentation, and all four are encoded
 * here rather than discovered at 2am:
 *
 *  - `/rest/api/2/`, not `/rest/api/3/`
 *  - `Authorization: Bearer <PAT>` — a DC PAT sent as Basic auth returns 401,
 *    not a helpful error
 *  - **wiki markup**, not Atlassian Document Format; reusing a Cloud ADF
 *    payload produces tickets displaying raw JSON
 *  - no official MCP, so this is a scripted integration, not a conversational
 *    one
 */

export interface JiraConfig {
  /** Includes `/rest/api/2` — never assembled by string concatenation elsewhere. */
  baseURL: string;
  token: string;
  /** Which field holds acceptance criteria. Per-project configuration (§09). */
  acceptanceCriteriaField?: string;
  timeoutMs?: number;
}

export interface JiraIssue {
  key: string;
  summary: string;
  /** Wiki markup, normalised to plain text before a model ever sees it. */
  description: string;
  status: string;
  issueType: string;
  labels: string[];
  acceptanceCriteria: string[];
  linkedIssues: string[];
}

export class JiraAuthError extends Error {
  constructor(cause: unknown) {
    super(
      'Jira rejected the credential: expired, revoked, or sent in the wrong scheme. ' +
        'Data Center wants `Authorization: Bearer <PAT>` — a PAT sent as Basic auth returns 401 ' +
        'with no helpful error. PATs need Jira DC 8.14 or later (§15).',
    );
    this.name = 'JiraAuthError';
    this.cause = cause;
  }
}

interface RawIssue {
  key: string;
  fields: Record<string, unknown> & {
    summary?: string;
    description?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    labels?: string[];
    issuelinks?: Array<{ inwardIssue?: { key: string }; outwardIssue?: { key: string } }>;
  };
}

export class JiraClient {
  private http: JsonClient | null = null;

  constructor(private readonly config: JiraConfig) {}

  static fromEnvironment(overrides: Partial<JiraConfig> = {}): JiraClient {
    const baseURL = process.env.JIRA_BASE_URL;
    if (!baseURL) {
      throw new Error(
        'JIRA_BASE_URL is not set. It must include the API version — ' +
          'https://jira.<org>.<internal>/rest/api/2 — because Data Center is v2, not v3 (§15).',
      );
    }
    return new JiraClient({
      baseURL,
      // From Vault, never CI plaintext, and from a dedicated service account:
      // personal tokens inherit that person's permissions and die when they
      // change role (§15).
      token: requireCredentialFromEnv('JIRA_PAT', 'Jira reporting'),
      ...(process.env.JIRA_AC_FIELD ? { acceptanceCriteriaField: process.env.JIRA_AC_FIELD } : {}),
      ...overrides,
    });
  }

  private async client(): Promise<JsonClient> {
    if (this.http) return this.http;
    this.http = await JsonClient.create({
      name: 'Jira',
      baseURL: this.config.baseURL.replace(/\/+$/, '') + '/',
      headers: { Authorization: `Bearer ${this.config.token}` },
      timeoutMs: this.config.timeoutMs ?? 20_000,
    });
    return this.http;
  }

  async dispose(): Promise<void> {
    await this.http?.dispose();
    this.http = null;
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpError && error.isUnauthorized) throw new JiraAuthError(error);
      throw error;
    }
  }

  /**
   * Read a single issue. Deliberately not a JQL sweep: keeping it narrow keeps
   * the data-governance conversation narrow too (§15).
   */
  async getIssue(key: string): Promise<JiraIssue> {
    return this.guard(async () => {
      const http = await this.client();
      const response = await http.get<RawIssue>(`issue/${encodeURIComponent(key)}`);
      return this.normalise(response.body);
    });
  }

  private normalise(raw: RawIssue): JiraIssue {
    const fields = raw.fields ?? {};
    const acField = this.config.acceptanceCriteriaField;
    const acRaw = acField ? fields[acField] : undefined;

    return {
      key: raw.key,
      summary: fields.summary ?? '',
      description: wikiToPlainText(fields.description ?? ''),
      status: fields.status?.name ?? 'unknown',
      issueType: fields.issuetype?.name ?? 'unknown',
      labels: fields.labels ?? [],
      acceptanceCriteria: extractCriteria(acRaw, fields.description ?? ''),
      linkedIssues: (fields.issuelinks ?? [])
        .map((link) => link.inwardIssue?.key ?? link.outwardIssue?.key)
        .filter((key): key is string => Boolean(key)),
    };
  }

  /**
   * Find an existing defect by fingerprint, so a flaky test produces one
   * ticket with a failure count rather than forty tickets (§15).
   */
  async findDefectByFingerprint(projectKey: string, fingerprint: string): Promise<{
    key: string;
    status: string;
    resolved: boolean;
  } | null> {
    return this.guard(async () => {
      const http = await this.client();
      const jql = `project = "${projectKey}" AND labels = "${fingerprintLabel(fingerprint)}" ORDER BY created DESC`;
      const response = await http.get<{ issues?: RawIssue[] }>('search', {
        query: { jql, maxResults: 1, fields: 'status,summary' },
      });
      const found = response.body.issues?.[0];
      if (!found) return null;
      const status = found.fields.status?.name ?? 'unknown';
      return { key: found.key, status, resolved: isClosed(status) };
    });
  }

  async createDefect(input: {
    projectKey: string;
    summary: string;
    /** Wiki markup. Reusing a Cloud ADF payload here shows raw JSON (§15). */
    description: string;
    fingerprint: string;
    issueType?: string;
    labels?: string[];
  }): Promise<string> {
    return this.guard(async () => {
      const http = await this.client();
      const response = await http.post<{ key?: string }>('issue', {
        body: {
          fields: {
            project: { key: input.projectKey },
            summary: input.summary.slice(0, 255),
            description: redact(input.description),
            issuetype: { name: input.issueType ?? 'Bug' },
            labels: [...(input.labels ?? []), fingerprintLabel(input.fingerprint), 'automated-test'],
          },
        },
      });
      if (!response.body.key) throw new Error('Jira accepted the defect but returned no key.');
      return response.body.key;
    });
  }

  async comment(issueKey: string, body: string): Promise<void> {
    await this.guard(async () => {
      const http = await this.client();
      await http.post(`issue/${encodeURIComponent(issueKey)}/comment`, {
        body: { body: redact(body) },
      });
    });
  }

  /**
   * Transitions are workflow-specific: the adapter looks them up by name
   * rather than hard-coding ids, which differ per project (§15).
   */
  async transitionByName(issueKey: string, wanted: string[]): Promise<string | null> {
    return this.guard(async () => {
      const http = await this.client();
      const available = await http.get<{ transitions?: Array<{ id: string; name: string }> }>(
        `issue/${encodeURIComponent(issueKey)}/transitions`,
      );
      const options = available.body.transitions ?? [];
      const match = options.find((transition) =>
        wanted.some((name) => transition.name.toLowerCase() === name.toLowerCase()),
      );
      if (!match) return null;
      await http.post(`issue/${encodeURIComponent(issueKey)}/transitions`, {
        body: { transition: { id: match.id } },
      });
      return match.name;
    });
  }
}

/**
 * A fingerprint of test id plus normalised error, so the same failure maps to
 * the same ticket run after run. Numbers, ids, timestamps and quoted values
 * are stripped: they differ every run and would defeat deduplication (§15).
 */
export function defectFingerprint(testId: string, errorMessage: string): string {
  const normalised = errorMessage
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<timestamp>')
    .replace(/0x[0-9a-f]+/gi, '<addr>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  return crypto.createHash('sha256').update(`${testId}::${normalised}`).digest('hex').slice(0, 12);
}

export function fingerprintLabel(fingerprint: string): string {
  return `qa-fp-${fingerprint}`;
}

function isClosed(status: string): boolean {
  return /^(done|closed|resolved|cancelled|canceled)$/i.test(status.trim());
}

/** Wiki markup → plain text, before a model ever sees it (§15). */
export function wikiToPlainText(markup: string): string {
  return markup
    .replace(/\{code(:[^}]*)?\}([\s\S]*?)\{code\}/g, (_match, _lang, code: string) => code.trim())
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, (_match, text: string) => text.trim())
    .replace(/\{quote\}([\s\S]*?)\{quote\}/g, (_match, text: string) => text.trim())
    .replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1')
    .replace(/^h[1-6]\.\s*/gm, '')
    .replace(/[*_+^~-]{1,2}(?=\S)(.+?)(?<=\S)[*_+^~-]{1,2}/g, '$1')
    .replace(/^\s*[*#]+\s+/gm, '- ')
    .replace(/\|\|/g, '|')
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * Acceptance criteria from a custom field when configured, else from a
 * heading in the description. "A story with no identifiable AC is rejected at
 * step A2 with that as the stated reason" — generating cases from a title and
 * a paragraph of context is exactly how invention happens (§09).
 */
export function extractCriteria(fieldValue: unknown, description: string): string[] {
  const fromField = typeof fieldValue === 'string' ? fieldValue : '';
  const source = fromField.trim() ? fromField : criteriaSectionOf(description);
  if (!source.trim()) return [];

  return wikiToPlainText(source)
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*#]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 3);
}

function criteriaSectionOf(description: string): string {
  const match =
    /(?:^|\n)\s*(?:h[1-6]\.\s*)?(?:acceptance criteria|ac)\s*:?\s*\n([\s\S]*?)(?=\n\s*h[1-6]\.|\n\s*\n\s*[A-Z][a-z]+:|$)/i.exec(
      description,
    );
  return match?.[1] ?? '';
}
