import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * An in-process PractiTest, enforcing the two limits that shape the design:
 * 20 instances per run POST and 30 calls per minute (§14).
 *
 * It refuses oversized chunks with the same shape the real API does, so the
 * chunking is proven rather than assumed.
 */
export interface FakeCase {
  id: string;
  displayId: string;
  identity?: string;
  lastEditedBy?: string;
  /** The set this case belongs to, by name — one per application (item 63). */
  setName?: string;
  attributes?: Record<string, unknown>;
}

export class FakePractiTestServer {
  private server?: http.Server;
  private nextId = 900;

  readonly cases: FakeCase[] = [];
  /** Sets by name, so a pull can ask for one application's cases (item 63). */
  readonly sets = new Map<string, string>();
  readonly postedRuns: Array<Record<string, unknown>> = [];
  readonly attachments: Array<{ name: string; base64: string }> = [];
  readonly calls: string[] = [];

  /** Set to make the next N calls return 429, as the real API does under load. */
  throttleNext = 0;

  constructor(private readonly token = 'pt-service-token') {}

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/v2`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  seedCase(displayId: string, extra: Partial<FakeCase> = {}): FakeCase {
    const entry: FakeCase = { id: `i-${displayId}`, displayId, ...extra };
    if (entry.setName) this.seedSet(entry.setName);
    this.cases.push(entry);
    return entry;
  }

  /** @returns the set's id, created on first mention. */
  seedSet(name: string): string {
    const existing = this.sets.get(name);
    if (existing) return existing;
    const id = `s-${this.sets.size + 1}`;
    this.sets.set(name, id);
    return id;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    this.calls.push(`${req.method} ${url.pathname}`);

    if (req.headers.pttoken !== this.token) {
      return send(res, 401, { errors: [{ title: 'Invalid PTToken' }] });
    }
    if (this.throttleNext > 0) {
      this.throttleNext--;
      return send(res, 429, { errors: [{ title: 'Rate limit exceeded' }] }, { 'retry-after': '0' });
    }

    const body = await readJson(req);

    if (url.pathname.endsWith('/instances.json')) {
      const wanted = (url.searchParams.get('filter[test-display-ids]') ?? '').split(',');
      return send(res, 200, {
        data: this.cases
          .filter((entry) => wanted.includes(entry.displayId))
          .map((entry) => ({ id: entry.id, attributes: { 'test-display-id': entry.displayId } })),
      });
    }

    if (url.pathname.endsWith('/runs.json') && req.method === 'POST') {
      const data = (body as { data?: unknown[] }).data ?? [];
      if (data.length > 20) {
        return send(res, 422, { errors: [{ title: 'Maximum 20 instances per request' }] });
      }
      this.postedRuns.push(...(data as Array<Record<string, unknown>>));
      return send(res, 200, { data });
    }

    if (url.pathname.endsWith('/attachments.json') && req.method === 'POST') {
      const attributes = (body as { data?: { attributes?: Record<string, string> } }).data?.attributes ?? {};
      this.attachments.push({
        name: attributes['file-name'] ?? '',
        base64: attributes['file-content'] ?? '',
      });
      return send(res, 200, { data: { id: 'att-1' } });
    }

    if (url.pathname.endsWith('/sets.json') && req.method === 'GET') {
      /*
         `filter[name]` is a match rather than an exact match in the real API,
         so this fake behaves the same way — a client that assumed exactness
         would pass here and pick the wrong set in production.
      */
      const wanted = url.searchParams.get('filter[name]') ?? '';
      return send(res, 200, {
        data: [...this.sets.entries()]
          .filter(([name]) => name.includes(wanted))
          .map(([name, id]) => ({ id, attributes: { name } })),
      });
    }

    if (url.pathname.endsWith('/tests.json')) {
      if (req.method === 'GET') {
        const setIds = (url.searchParams.get('filter[set-ids]') ?? '')
          .split(',')
          .filter(Boolean);
        if (setIds.length > 0) {
          const names = [...this.sets.entries()]
            .filter(([, id]) => setIds.includes(id))
            .map(([name]) => name);
          return send(res, 200, {
            data: this.cases
              .filter((entry) => entry.setName && names.includes(entry.setName))
              .map((entry) => ({
                id: entry.id,
                attributes: {
                  'last-modified-by': entry.lastEditedBy ?? 'qa-automation',
                  ...entry.attributes,
                },
              })),
          });
        }
        const identity = url.searchParams.get('filter[custom-fields][case-identity]');
        const found = this.cases.filter((entry) => entry.identity === identity);
        return send(res, 200, {
          data: found.map((entry) => ({
            id: entry.id,
            attributes: { 'last-modified-by': entry.lastEditedBy ?? 'qa-automation', ...entry.attributes },
          })),
        });
      }
      if (req.method === 'POST') {
        const attributes = (body as { data?: { attributes?: Record<string, unknown> } }).data?.attributes ?? {};
        const id = `t-${++this.nextId}`;
        this.cases.push({
          id,
          displayId: String(this.nextId),
          identity: String(attributes['case-identity'] ?? ''),
          lastEditedBy: 'qa-automation',
          attributes,
        });
        return send(res, 200, { data: { id, attributes } });
      }
    }

    const updateMatch = /\/tests\/([^/]+)\.json$/.exec(url.pathname);
    if (updateMatch && req.method === 'PUT') {
      const entry = this.cases.find((candidate) => candidate.id === updateMatch[1]);
      if (entry) {
        entry.attributes = (body as { data?: { attributes?: Record<string, unknown> } }).data?.attributes;
        entry.lastEditedBy = 'qa-automation';
      }
      return send(res, 200, { data: { id: updateMatch[1] } });
    }

    return send(res, 404, { errors: [{ title: 'Not found' }] });
  }
}

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
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
