import { pollUntil } from '../../support/poll';
import { registerSecret } from '../../support/redact';
import type { MailInbox } from '../mail/types';
import type { VaultSecretStore } from '../vault/vault-store';
import type { OtpProvider, Watermark } from './types';

/**
 * TOTP via Vault's secrets engine — §12.
 *
 * The seed never reaches this process: Vault stores it write-only and computes
 * the code. A real security improvement over the usual pattern of pasting
 * seeds into CI variables.
 */
export class TotpOtpProvider implements OtpProvider {
  readonly kind = 'totp';

  constructor(
    private readonly vault: VaultSecretStore,
    private readonly keyName: string,
    private readonly options: {
      /** Refuse a code with less than this left; wait for the next window. */
      minValiditySeconds?: number;
      periodSeconds?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {}

  async arm(): Promise<Watermark> {
    return { at: Date.now() };
  }

  /**
   * The sharp edge this exists for: a code fetched with two seconds left in
   * its window expires between fetch and submit, and the failure looks like a
   * broken MFA implementation rather than a timing bug.
   */
  async get(_mark?: Watermark): Promise<string> {
    const minValidity = this.options.minValiditySeconds ?? 5;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    let issued = await this.vault.totpCode(this.keyName);
    if (issued.validForSeconds < minValidity) {
      // Wait out the dying window rather than submitting a code that will have
      // expired by the time the form posts.
      await sleep((issued.validForSeconds + 1) * 1000);
      issued = await this.vault.totpCode(this.keyName);
    }
    registerSecret(issued.code, `totp:${this.keyName}`);
    return issued.code;
  }
}

const OTP_PATTERNS = [
  /\b(\d{6,8})\b/, // the overwhelmingly common shape
  /\b([A-Z0-9]{6,8})\b/, // alphanumeric codes
];

/**
 * Email OTP via the mock inbox — §12.
 *
 * `arm()` records the inbox high-water mark before the send is triggered, and
 * only messages newer than it are accepted. Combined with per-worker
 * plus-addressing, two parallel workers cannot read each other's codes.
 */
export class EmailOtpProvider implements OtpProvider {
  readonly kind = 'email';

  constructor(
    private readonly inbox: MailInbox,
    private readonly recipient: string,
    private readonly options: {
      timeoutMs?: number;
      intervalMs?: number;
      /** Narrow the match when several kinds of mail land in one inbox. */
      subjectPattern?: RegExp;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    } = {},
  ) {}

  async arm(): Promise<Watermark> {
    const mark = await this.inbox.watermark(this.recipient);
    return { at: mark.at, cursor: mark.cursor, recipient: this.recipient };
  }

  async get(mark: Watermark): Promise<string> {
    if (!mark || typeof mark.at !== 'number') {
      throw new Error(
        'EmailOtpProvider.get() needs the watermark from arm(), taken *before* the code was ' +
          'triggered. Without it the newest message may be the previous test\'s code — the ' +
          'exact failure arm() exists to prevent (§12).',
      );
    }

    const messages = await pollUntil(
      () =>
        this.inbox.since(
          { at: mark.at, cursor: mark.cursor },
          { recipient: mark.recipient ?? this.recipient, limit: 10 },
        ),
      {
        description: `an OTP email for ${mark.recipient ?? this.recipient}`,
        timeoutMs: this.options.timeoutMs ?? 30_000,
        intervalMs: this.options.intervalMs ?? 500,
        until: (found) => found.some((message) => this.matches(message.subject, message.text)),
        ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
        ...(this.options.now ? { now: this.options.now } : {}),
      },
    );

    const match = messages
      .slice()
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .find((message) => this.matches(message.subject, message.text));
    if (!match) throw new Error('Polling returned no matching OTP email.');

    const code = extractCode(match.text) ?? extractCode(match.subject);
    if (!code) {
      throw new Error(
        `Found the OTP email (subject: "${match.subject}") but no code in it. The pattern the ` +
          'provider looks for is 6–8 digits, or 6–8 uppercase alphanumerics.',
      );
    }

    registerSecret(code, `otp:${mark.recipient ?? this.recipient}`);
    // Consume it, so a retry of this test cannot read the same code twice.
    if (this.inbox.capabilities.deleteOrMarkRead) await this.inbox.consume(match.id);
    return code;
  }

  private matches(subject: string, text: string): boolean {
    if (this.options.subjectPattern && !this.options.subjectPattern.test(subject)) return false;
    return Boolean(extractCode(text) ?? extractCode(subject));
  }
}

function extractCode(text: string): string | null {
  for (const pattern of OTP_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}
