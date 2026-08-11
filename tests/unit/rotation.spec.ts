import { expect, test } from '@playwright/test';
import {
  DEFAULT_PASSWORD_POLICY,
  generatePassword,
  validatePassword,
} from '../../src/support/rotation/policy';
import {
  DEFAULT_ROTATION,
  dueForRotation,
  isInBlackout,
  jitterDaysFor,
} from '../../src/support/rotation/schedule';
import { RotationRunner, type RotationDeps } from '../../src/support/rotation/runner';
import { resetSecretRegistry, containsSecret } from '../../src/support/redact';

const DAY = 86_400_000;

/**
 * §22 ranks rotation the most dangerous automation in the plan. These tests
 * are written against its specific failure modes rather than its happy path:
 * a password persisted before it was verified, a rotation firing mid-run, and
 * an account left in a state the next run cannot use.
 */

function deps(overrides: Partial<RotationDeps> = {}): RotationDeps & {
  events: string[];
  written: Array<Record<string, string>>;
  quarantines: string[];
} {
  const events: string[] = [];
  const written: Array<Record<string, string>> = [];
  const quarantines: string[] = [];

  const base: RotationDeps = {
    pool: {
      lease: async () => {
        events.push('lease');
        return {
          index: 1,
          release: async () => {
            events.push('release');
          },
        };
      },
      quarantine: async (role, index, reason) => {
        events.push('quarantine');
        quarantines.push(`${role}/${index}: ${reason}`);
      },
    },
    vault: {
      write: async (_path, data) => {
        events.push('vault-write');
        written.push(data);
        return 7;
      },
    },
    changer: {
      change: async () => {
        events.push('app-change');
      },
      verify: async () => {
        events.push('verify');
        return true;
      },
    },
    invalidateSessions: async () => {
      events.push('invalidate');
    },
    policy: DEFAULT_PASSWORD_POLICY,
    config: { ...DEFAULT_ROTATION, enabled: true, blackout: { start: '18:00', end: '18:01' } },
    now: () => new Date('2026-03-01T09:00:00'),
    log: () => undefined,
  };

  return Object.assign(base, overrides, { events, written, quarantines });
}

const target = {
  role: 'approver',
  index: 1,
  username: 'approver-01',
  currentPassword: 'old-password',
  secretPath: 'qa/staging/pools/workforce/approver/1',
};

test.describe('rotation ordering', () => {
  test.beforeEach(() => resetSecretRegistry());

  test('changes the application first and only persists after verifying', async () => {
    const d = deps();

    const outcome = await new RotationRunner(d).rotate(target);

    expect(outcome.status).toBe('rotated');
    expect(d.events).toEqual([
      'lease',
      'app-change',
      'verify',
      'vault-write',
      'invalidate',
      'release',
    ]);
  });

  test('a failed application change never reaches Vault', async () => {
    const d = deps({
      changer: {
        change: async () => {
          throw new Error('application rejected the new password (history rule)');
        },
        verify: async () => true,
      },
    });

    const outcome = await new RotationRunner(d).rotate(target);

    expect(outcome).toMatchObject({ status: 'quarantined', failedAt: 'change-in-application' });
    expect(d.written).toEqual([]);
    expect(d.quarantines[0]).toContain('history rule');
  });

  test('a password that does not authenticate is never persisted', async () => {
    const d = deps({
      changer: {
        change: async () => undefined,
        verify: async () => false,
      },
    });

    const outcome = await new RotationRunner(d).rotate(target);

    expect(outcome).toMatchObject({ status: 'quarantined', failedAt: 'verify' });
    // Writing Vault first and failing the application change leaves an account
    // nobody can use and a credential store that lies about it.
    expect(d.written).toEqual([]);
  });

  test('the account is quarantined rather than retried blindly, and still released', async () => {
    const d = deps({
      vault: {
        write: async () => {
          throw new Error('Vault unavailable');
        },
      },
    });

    await new RotationRunner(d).rotate(target);

    expect(d.events).toContain('quarantine');
    expect(d.events[d.events.length - 1]).toBe('release');
  });

  test('the new password is registered for redaction before it is used anywhere', async () => {
    const d = deps();
    await new RotationRunner(d).rotate(target);

    const persisted = d.written[0]!.password!;
    expect(containsSecret(persisted)).toBe(true);
  });

  test('refuses to run inside the blackout window, even when triggered by hand', async () => {
    const d = deps({
      config: { ...DEFAULT_ROTATION, enabled: true, blackout: { start: '18:00', end: '06:00' } },
      now: () => new Date('2026-03-01T23:30:00'),
    });

    const outcome = await new RotationRunner(d).rotate(target);

    expect(outcome).toMatchObject({ status: 'skipped' });
    expect(d.events).toEqual([]);
  });
});

test.describe('blackout windows', () => {
  test('handles a window that crosses midnight', () => {
    const window = { start: '18:00', end: '06:00' };
    expect(isInBlackout(new Date('2026-03-01T23:00:00'), window)).toBe(true);
    expect(isInBlackout(new Date('2026-03-01T02:00:00'), window)).toBe(true);
    expect(isInBlackout(new Date('2026-03-01T12:00:00'), window)).toBe(false);
    expect(isInBlackout(new Date('2026-03-01T06:00:00'), window)).toBe(false);
  });
});

test.describe('rotation scheduling', () => {
  const now = Date.parse('2026-03-01T09:00:00Z');

  test('jitter is deterministic per account, so a re-run picks the same day', () => {
    expect(jitterDaysFor('approver', 1, 5)).toBe(jitterDaysFor('approver', 1, 5));
    expect(jitterDaysFor('approver', 1, 5)).toBeLessThanOrEqual(5);
    expect(jitterDaysFor('approver', 0, 0)).toBe(0);
  });

  test('spreads a pool instead of expiring every account on the same night', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      role: 'approver',
      index: i + 1,
      rotatedAt: now - 61 * DAY,
    }));

    const due = dueForRotation(candidates, { ...DEFAULT_ROTATION, jitterDays: 5 }, now, 1);

    expect(due.length).toBeGreaterThan(0);
    expect(due.length).toBeLessThan(candidates.length);
  });

  test("respects the application's minimum-age rule", () => {
    const candidates = [{ role: 'approver', index: 1, rotatedAt: now - 0.5 * DAY }];

    // Ancient by max-age standards, but the app refuses a change this soon.
    const due = dueForRotation(candidates, { ...DEFAULT_ROTATION, maxAgeDays: 0 }, now, 1);

    expect(due).toEqual([]);
  });

  test('returns the oldest accounts first', () => {
    const candidates = [
      { role: 'approver', index: 1, rotatedAt: now - 70 * DAY },
      { role: 'approver', index: 2, rotatedAt: now - 90 * DAY },
    ];

    const due = dueForRotation(candidates, { ...DEFAULT_ROTATION, jitterDays: 0 }, now, 1);

    expect(due.map((candidate) => candidate.index)).toEqual([2, 1]);
  });
});

test.describe('password policy', () => {
  test('generates a value that satisfies every required class', () => {
    for (let i = 0; i < 50; i++) {
      const generated = generatePassword(DEFAULT_PASSWORD_POLICY);
      expect(validatePassword(generated, DEFAULT_PASSWORD_POLICY)).toEqual([]);
    }
  });

  test('honours a policy that forbids symbols, as many enterprise apps do', () => {
    const policy = { ...DEFAULT_PASSWORD_POLICY, requireSymbol: false, symbolSet: '', minLength: 12 };
    const generated = generatePassword(policy);
    expect(generated.length).toBeGreaterThanOrEqual(12);
    expect(validatePassword(generated, policy)).toEqual([]);
  });

  test('names every rule a candidate password breaks', () => {
    const violations = validatePassword('short', DEFAULT_PASSWORD_POLICY);
    expect(violations.map((violation) => violation.rule).sort()).toEqual([
      'minLength',
      'requireDigit',
      'requireSymbol',
      'requireUpper',
    ]);
  });
});
