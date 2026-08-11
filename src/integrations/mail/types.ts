/**
 * The mail inbox capability contract — §12.
 *
 * The mock SMTP server here is an in-house tool, so the design cannot assume a
 * known API. The adapter is written against *capabilities* rather than an
 * endpoint list, and each missing capability has a stated cost:
 *
 * | Capability            | Needed for            | If absent                                  |
 * |-----------------------|-----------------------|--------------------------------------------|
 * | read programmatically | everything            | email OTP cannot be automated at all       |
 * | filter by recipient   | worker isolation      | email-OTP specs must run serially          |
 * | ordering / timestamps | the `arm()` watermark | no defence against reading a stale code    |
 * | delete or mark read   | inbox hygiene         | workable — watermark, plus a purge between runs |
 */
export interface InboxCapabilities {
  filterByRecipient: boolean;
  /** How messages can be ordered, which decides what a watermark can be. */
  ordering: 'id' | 'timestamp' | 'none';
  deleteOrMarkRead: boolean;
}

export interface MailMessage {
  id: string;
  to: string[];
  from: string;
  subject: string;
  /** Plain-text body. Adapters convert HTML-only mail before returning it. */
  text: string;
  receivedAt: number;
}

export interface MailInbox {
  readonly name: string;
  readonly capabilities: InboxCapabilities;

  /** A cursor describing "everything up to now", before a send is triggered. */
  watermark(recipient?: string): Promise<{ at: number; cursor?: string }>;

  /** Messages that arrived strictly after the mark. */
  since(
    mark: { at: number; cursor?: string },
    options?: { recipient?: string; limit?: number },
  ): Promise<MailMessage[]>;

  /** Consume a message once read, where the tool supports it. */
  consume(id: string): Promise<void>;

  /**
   * Per-worker plus-addressing, so parallel workers cannot read each other's
   * mail: `qa+<runId>-<worker>@example`.
   */
  addressFor(base: string, tag: string): string;

  close?(): Promise<void>;
}

export class InboxUnreadableError extends Error {
  constructor(toolName: string, missing: string) {
    super(
      `The mail tool '${toolName}' cannot ${missing}, which the email-OTP flow requires. ` +
        'If the internal tool exposes only SMTP with no read path, ask whoever operates the ' +
        'test environments to add a readable sink such as Mailpit alongside it — that is a ' +
        'request to the environment\'s owners, not something the test run stands up (§12).',
    );
    this.name = 'InboxUnreadableError';
  }
}

/** Plus-addressing, shared by every adapter that supports it. */
export function plusAddress(base: string, tag: string): string {
  const [local, domain] = base.split('@');
  if (!local || !domain) throw new Error(`Not an email address: ${base}`);
  const safeTag = tag.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `${local}+${safeTag}@${domain}`;
}
