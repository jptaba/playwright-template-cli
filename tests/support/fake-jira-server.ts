import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * An in-process Jira Data Center — deliberately strict about the difference
 * that wastes an afternoon: it accepts `Authorization: Bearer <PAT>` and
 * returns a bare 401 for Basic auth, exactly as DC does (§15).
 */
export interface FakeIssue {
  key: string;
  fields: Record<string, unknown>;
}

export class FakeJiraServer {
  private server?: http.Server;
  private nextNumber = 100;

  readonly issues = new Map<string, FakeIssue>();
  readonly comments: Array<{ key: string; body: string }> = [];
  readonly transitionsApplied: Array<{ key: string; id: string }> = [];
  readonly calls: string[] = [];

  /** Transitions the workflow offers, keyed by issue. Ids differ per project. */
  transitions: Array<{ id: string; name: string }> = [
    { id: '11', name: 'Reopen Issue' },
    { id: '21', name: 'Start Progress' },
  ];

  constructor(private readonly pat = 'jira-service-pat') {}

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/rest/api/2`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  seedIssue(key: string, fields: Record<string, unknown>): void {
    this.issues.set(key, { key, fields });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/^\/rest\/api\/2\/?/, '');
    this.calls.push(`${req.method} ${path}`);

    const authorization = req.headers.authorization ?? '';
    // The difference that wastes an afternoon: DC returns 401 for Basic, with
    // no hint that the scheme is the problem.
    if (authorization !== `Bearer ${this.pat}`) {
      return send(res, 401, { errorMessages: ['You do not have permission'], errors: {} });
    }

    const body = await readJson(req);

    if (path === 'search') {
      const jql = url.searchParams.get('jql') ?? '';
      const label = /labels = "([^"]+)"/.exec(jql)?.[1];
      const matches = [...this.issues.values()].filter((issue) =>
        ((issue.fields.labels as string[] | undefined) ?? []).includes(label ?? ''),
      );
      return send(res, 200, { issues: matches });
    }

    if (path === 'issue' && req.method === 'POST') {
      const fields = (body as { fields?: Record<string, unknown> }).fields ?? {};
      const projectKey = (fields.project as { key?: string } | undefined)?.key ?? 'QA';
      const key = `${projectKey}-${++this.nextNumber}`;
      this.issues.set(key, {
        key,
        fields: { ...fields, status: { name: 'Open' } },
      });
      return send(res, 201, { key, id: String(this.nextNumber) });
    }

    const issueMatch = /^issue\/([^/]+)(?:\/(comment|transitions))?$/.exec(path);
    if (issueMatch) {
      const key = decodeURIComponent(issueMatch[1]!);
      const sub = issueMatch[2];
      const issue = this.issues.get(key);
      if (!issue) return send(res, 404, { errorMessages: [`Issue does not exist: ${key}`] });

      if (!sub && req.method === 'GET') return send(res, 200, issue);

      if (sub === 'comment' && req.method === 'POST') {
        this.comments.push({ key, body: String((body as { body?: string }).body ?? '') });
        return send(res, 201, { id: '1' });
      }

      if (sub === 'transitions') {
        if (req.method === 'GET') return send(res, 200, { transitions: this.transitions });
        const id = (body as { transition?: { id?: string } }).transition?.id ?? '';
        this.transitionsApplied.push({ key, id });
        const name = this.transitions.find((transition) => transition.id === id)?.name ?? '';
        if (/reopen/i.test(name)) issue.fields.status = { name: 'Open' };
        return send(res, 204, '');
      }
    }

    return send(res, 404, { errorMessages: ['Not found'] });
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
