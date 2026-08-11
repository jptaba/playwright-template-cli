import { JsonClient } from '../http/json-client';
import { plusAddress, type MailInbox, type MailMessage } from './types';

/**
 * A reference adapter, against Mailpit's API v1 — §12.
 *
 * The internal mail tool is the largest remaining unknown in the plan, so this
 * exists for two reasons: it is the documented fallback sink if the in-house
 * tool has no read path, and it is a worked example of what an adapter for
 * that tool has to provide. Point the internal adapter at the same interface
 * and everything above it — the OTP provider, the fixtures, the specs — is
 * unchanged.
 */
interface MailpitMessageSummary {
  ID: string;
  From: { Address: string };
  To: Array<{ Address: string }>;
  Subject: string;
  Snippet: string;
  Created: string;
}

export class MailpitInbox implements MailInbox {
  readonly name = 'mailpit';
  readonly capabilities = {
    filterByRecipient: true,
    ordering: 'timestamp' as const,
    deleteOrMarkRead: true,
  };

  private constructor(private readonly http: JsonClient) {}

  static async create(baseURL: string): Promise<MailpitInbox> {
    return new MailpitInbox(
      await JsonClient.create({ name: 'Mailpit', baseURL, timeoutMs: 10_000 }),
    );
  }

  async watermark(): Promise<{ at: number; cursor?: string }> {
    const response = await this.http.get<{ messages?: MailpitMessageSummary[] }>(
      'api/v1/messages',
      { query: { limit: 1 } },
    );
    const newest = response.body.messages?.[0];
    return {
      at: Date.now(),
      ...(newest ? { cursor: newest.ID } : {}),
    };
  }

  async since(
    mark: { at: number; cursor?: string },
    options: { recipient?: string; limit?: number } = {},
  ): Promise<MailMessage[]> {
    const response = await this.http.get<{ messages?: MailpitMessageSummary[] }>(
      'api/v1/messages',
      { query: { limit: options.limit ?? 50 } },
    );
    const summaries = response.body.messages ?? [];

    const fresh: MailMessage[] = [];
    for (const summary of summaries) {
      // Stop at the watermark: everything from here down predates the trigger.
      if (mark.cursor && summary.ID === mark.cursor) break;
      const receivedAt = Date.parse(summary.Created);
      if (Number.isFinite(receivedAt) && receivedAt < mark.at - 1000) continue;
      const to = summary.To.map((addressee) => addressee.Address);
      if (options.recipient && !to.includes(options.recipient)) continue;
      fresh.push({
        id: summary.ID,
        to,
        from: summary.From.Address,
        subject: summary.Subject,
        text: await this.bodyOf(summary.ID, summary.Snippet),
        receivedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
      });
    }
    return fresh;
  }

  private async bodyOf(id: string, fallback: string): Promise<string> {
    try {
      const response = await this.http.get<{ Text?: string; HTML?: string }>(
        `api/v1/message/${encodeURIComponent(id)}`,
      );
      return response.body.Text ?? stripHtml(response.body.HTML ?? '') ?? fallback;
    } catch {
      return fallback;
    }
  }

  async consume(id: string): Promise<void> {
    await this.http.delete('api/v1/messages', { body: { IDs: [id] } });
  }

  addressFor(base: string, tag: string): string {
    return plusAddress(base, tag);
  }

  async close(): Promise<void> {
    await this.http.dispose();
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
