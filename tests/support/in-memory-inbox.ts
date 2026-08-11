import { plusAddress, type MailInbox, type MailMessage } from '../../src/integrations/mail/types';

/**
 * An inbox that behaves like a real one, including the ways real ones are
 * awkward: messages arrive out of order, a previous test's code is still
 * sitting there, and the same address receives unrelated mail.
 *
 * Used to prove the `arm()` watermark actually defends against reading a stale
 * code — the failure §12 says otherwise costs a week of intermittent failures.
 */
export class InMemoryInbox implements MailInbox {
  readonly name = 'in-memory';
  private messages: MailMessage[] = [];
  private sequence = 0;

  constructor(
    readonly capabilities = {
      filterByRecipient: true,
      ordering: 'timestamp' as const,
      deleteOrMarkRead: true,
    },
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Deliver a message, as the application under test would. */
  deliver(message: Partial<MailMessage> & { to: string[]; text: string }): MailMessage {
    const delivered: MailMessage = {
      id: `msg-${++this.sequence}`,
      from: 'no-reply@example.test',
      subject: 'Your verification code',
      receivedAt: this.now(),
      ...message,
    };
    this.messages.push(delivered);
    return delivered;
  }

  async watermark(recipient?: string): Promise<{ at: number; cursor?: string }> {
    const visible = this.visible(recipient);
    const newest = visible[visible.length - 1];
    return { at: this.now(), ...(newest ? { cursor: newest.id } : {}) };
  }

  async since(
    mark: { at: number; cursor?: string },
    options: { recipient?: string; limit?: number } = {},
  ): Promise<MailMessage[]> {
    const visible = this.visible(options.recipient);
    const cursorIndex = mark.cursor ? visible.findIndex((m) => m.id === mark.cursor) : -1;
    const after = cursorIndex >= 0 ? visible.slice(cursorIndex + 1) : visible;
    return after.filter((message) => message.receivedAt >= mark.at).slice(0, options.limit ?? 50);
  }

  async consume(id: string): Promise<void> {
    this.messages = this.messages.filter((message) => message.id !== id);
  }

  addressFor(base: string, tag: string): string {
    return plusAddress(base, tag);
  }

  private visible(recipient?: string): MailMessage[] {
    const ordered = [...this.messages].sort((a, b) => a.receivedAt - b.receivedAt);
    if (!recipient || !this.capabilities.filterByRecipient) return ordered;
    return ordered.filter((message) => message.to.includes(recipient));
  }
}
