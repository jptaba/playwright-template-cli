/**
 * One interface, two providers — §12.
 *
 * A spec says `await otp.get(mark)` and does not care whether the code came
 * from Vault's TOTP engine or from an inbox.
 *
 * `arm()` exists because of one race condition that otherwise costs a week of
 * intermittent failures: trigger the send, poll the inbox, read the newest
 * message — and get the *previous* test's code. Recording a high-water mark
 * before triggering is the only reliable defence.
 */
export interface Watermark {
  /** Epoch milliseconds at which the mark was taken. */
  at: number;
  /** Provider-specific cursor: a message id, a sequence number, a mailbox. */
  cursor?: string;
  /** The address codes are expected at, for per-worker isolation. */
  recipient?: string;
}

export interface OtpProvider {
  readonly kind: 'totp' | 'email' | 'none';
  /** Watermark before the code is triggered. */
  arm(): Promise<Watermark>;
  /** Resolve a code produced after the watermark. */
  get(mark: Watermark): Promise<string>;
}

/**
 * The provider for a target that declares `mfa: 'none'`.
 *
 * Capabilities are consulted, not assumed: a fixture for a disabled capability
 * skips the test with a stated reason rather than hanging until timeout (§04).
 */
export class UnsupportedOtpProvider implements OtpProvider {
  readonly kind = 'none';

  constructor(private readonly targetName: string) {}

  async arm(): Promise<Watermark> {
    return { at: Date.now() };
  }

  async get(): Promise<string> {
    throw new OtpNotSupportedError(this.targetName);
  }
}

export class OtpNotSupportedError extends Error {
  constructor(targetName: string) {
    super(
      `The target '${targetName}' declares capabilities.mfa = 'none', so there is no OTP to ` +
        'fetch. A spec that needs a code should be skipped for this target, not failed — ' +
        'check the capability before calling otp.get() (§04).',
    );
    this.name = 'OtpNotSupportedError';
  }
}
