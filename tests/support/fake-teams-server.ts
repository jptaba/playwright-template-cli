import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A Microsoft Teams incoming webhook, faked, so the notification can be
 * exercised without a channel.
 *
 * A real incoming webhook is one URL that accepts a JSON POST and answers
 * `200` with the body `1` — there is no authentication beyond the secret in
 * the URL itself, which is why the URL is treated as a credential everywhere
 * it appears here.
 *
 * Kept deliberately strict about the two things that actually break a Teams
 * post in practice: a card larger than the 28 KB Teams silently truncates, and
 * a payload that is not an Adaptive Card or MessageCard at all. Both answer
 * `400` here rather than being accepted, because a fake that accepts anything
 * teaches nothing.
 */
export interface CapturedPost {
  /** The card as sent. */
  body: Record<string, unknown>;
  /** Every line of text the card would show, flattened, for assertions. */
  text: string;
  bytes: number;
}

/** Teams truncates past this; it does not error, which is worse. */
export const TEAMS_CARD_LIMIT = 28 * 1024;

export class FakeTeamsServer {
  private server?: http.Server;

  readonly posts: CapturedPost[] = [];
  readonly rejected: Array<{ reason: string; bytes: number }> = [];

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    // Shaped like the real thing, secret and all, so anything that logs the
    // URL is visibly logging a credential.
    return `http://127.0.0.1:${port}/webhookb2/fake-channel@fake-tenant/IncomingWebhook/fake-secret`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    const raw = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
    });

    const bytes = Buffer.byteLength(raw, 'utf8');
    if (bytes > TEAMS_CARD_LIMIT) {
      this.rejected.push({ reason: 'card exceeds the 28 KB Teams limit', bytes });
      res.writeHead(400).end('Card exceeds size limit');
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.rejected.push({ reason: 'not JSON', bytes });
      res.writeHead(400).end('Bad payload');
      return;
    }

    const looksLikeCard =
      body.type === 'message' || body['@type'] === 'MessageCard' || 'attachments' in body;
    if (!looksLikeCard) {
      this.rejected.push({ reason: 'not a Teams card', bytes });
      res.writeHead(400).end('Bad payload');
      return;
    }

    this.posts.push({ body, bytes, text: flatten(body) });
    // What a real incoming webhook answers.
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('1');
  }
}

/** Every string in the card, joined — enough to assert what it would show. */
function flatten(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return '';
}
