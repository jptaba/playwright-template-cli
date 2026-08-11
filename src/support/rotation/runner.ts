import { registerSecret } from '../redact';
import { generatePassword, validatePassword, type PasswordPolicy } from './policy';
import { isInBlackout, type RotationConfig } from './schedule';

/**
 * Scheduled password rotation — §13, and the highest-severity item in §22.
 *
 * "Everything else fails safe. Rotation writes to a live system, and its
 * failure modes lock accounts out."
 *
 * The order of operations is the whole design:
 *
 *   lease exclusively → change in the app → **verify by logging in** →
 *   write a new KV v2 version → invalidate storage state → release
 *
 * Vault-first would leave an account nobody can use and a credential store
 * that lies about it. On any failure: quarantine, alert, do not retry blindly.
 */

/**
 * Supplied by the target pack, because changing a password is an application
 * flow — an API call for one app, a settings page for another. The framework
 * never knows how; it only knows the order.
 */
export interface PasswordChanger {
  /** Change the password in the application itself. */
  change(account: { username: string; currentPassword: string }, newPassword: string): Promise<void>;
  /** Authenticate with the new value. Returns false rather than throwing. */
  verify(account: { username: string }, password: string): Promise<boolean>;
  /**
   * Some applications force a change-password screen on first login after a
   * reset. If that interstitial is not handled, every subsequent storage state
   * capture silently lands on the wrong page (§13).
   */
  clearFirstLoginInterstitial?(
    account: { username: string },
    password: string,
  ): Promise<void>;
}

export interface RotationTarget {
  role: string;
  index: number;
  username: string;
  currentPassword: string;
  /** KV v2 path holding this account's credentials. */
  secretPath: string;
}

export type RotationOutcome =
  | { status: 'rotated'; role: string; index: number; version: number }
  | { status: 'skipped'; role: string; index: number; reason: string }
  | { status: 'quarantined'; role: string; index: number; failedAt: RotationStep; reason: string };

export type RotationStep =
  | 'lease'
  | 'generate'
  | 'change-in-application'
  | 'verify'
  | 'persist-to-vault'
  | 'invalidate-sessions';

export interface RotationDeps {
  pool: {
    lease(role: string): Promise<{ index: number; release(): Promise<void> }>;
    quarantine(role: string, index: number, reason: string): Promise<void>;
  };
  vault: {
    /** A *new version* of the KV v2 path. Version history is the rollback. */
    write(path: string, data: Record<string, string>): Promise<number>;
  };
  changer: PasswordChanger;
  /** Drop any cached storage state for the role: its session is now stale. */
  invalidateSessions(role: string): Promise<void>;
  policy: PasswordPolicy;
  config: RotationConfig;
  now?: () => Date;
  log?: (message: string) => void;
}

export class RotationRunner {
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(private readonly deps: RotationDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
  }

  async rotate(target: RotationTarget): Promise<RotationOutcome> {
    const { role, index } = target;

    if (!this.deps.config.enabled) {
      return { status: 'skipped', role, index, reason: 'rotation is disabled for this target' };
    }
    if (isInBlackout(this.now(), this.deps.config.blackout)) {
      // Enforced here rather than in the pipeline schedule, so a manual run
      // cannot bypass it.
      return {
        status: 'skipped',
        role,
        index,
        reason:
          `inside the blackout window ${this.deps.config.blackout.start}–` +
          `${this.deps.config.blackout.end}; a rotation mid-run looks like an application defect`,
      };
    }

    let step: RotationStep = 'lease';
    let lease: { index: number; release(): Promise<void> } | null = null;

    try {
      // 1. Exclusive lease, so no run can pick the account up mid-rotation.
      lease = await this.deps.pool.lease(role);

      // 2. A value the application will actually accept.
      step = 'generate';
      const newPassword = generatePassword(this.deps.policy);
      const violations = validatePassword(newPassword, this.deps.policy);
      if (violations.length > 0) {
        throw new Error(
          `Generated password violates the configured policy: ${violations
            .map((violation) => `${violation.rule} (${violation.detail})`)
            .join(', ')}`,
        );
      }
      registerSecret(newPassword, `${target.secretPath}.password`);

      // 3. Change it in the application FIRST.
      step = 'change-in-application';
      await this.deps.changer.change(
        { username: target.username, currentPassword: target.currentPassword },
        newPassword,
      );
      await this.deps.changer.clearFirstLoginInterstitial?.({ username: target.username }, newPassword);

      // 4. Verify before persisting. Persisting an unverified value is how a
      //    credential store comes to lie about a live system.
      step = 'verify';
      const works = await this.deps.changer.verify({ username: target.username }, newPassword);
      if (!works) throw new Error('the new password did not authenticate against the application');

      // 5. Only now write it, as a new KV v2 version.
      step = 'persist-to-vault';
      const version = await this.deps.vault.write(target.secretPath, {
        username: target.username,
        password: newPassword,
        rotatedAt: String(this.now().getTime()),
      });

      // 6. A cached session for the old password is both a confusing mid-run
      //    failure and a security exposure.
      step = 'invalidate-sessions';
      await this.deps.invalidateSessions(role);

      this.log(`rotated ${role}/${index} → version ${version}`);
      return { status: 'rotated', role, index, version };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Never leave it in a state where the next run finds it broken.
      await this.deps.pool.quarantine(role, index, `rotation failed at ${step}: ${reason}`);
      this.log(`QUARANTINED ${role}/${index} — failed at ${step}: ${reason}`);
      return { status: 'quarantined', role, index, failedAt: step, reason };
    } finally {
      // 7. Release last, whatever happened.
      await lease?.release().catch(() => undefined);
    }
  }
}
