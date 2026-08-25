import { expect, test } from '@playwright/test';
import {
  DURATION_SPREAD_WARNING,
  STABILITY_POLICY,
  STABILITY_TOTAL,
  assessStability,
  nextArm,
  shouldKeepMeasuring,
  summariseDurations,
  type StabilityRun,
} from '../../src/support/cases/stability';
import { FLAKE_MINIMUM_RUNS } from '../../src/support/quarantine';

/**
 * Phase 4 — is this spec hardened, or did it just pass once?
 *
 * The property that matters most here is that a *clean measurement in one
 * condition is not the answer*. Item 67 recorded three applications measuring
 * 5/5 green and two of them failing the moment the condition changed, so a gate
 * built on repetition alone would repeat that mistake with a generated spec.
 */

const run = (over: Partial<StabilityRun> = {}): StabilityRun => ({
  attempt: 1,
  passed: true,
  durationMs: 1000,
  underLoad: false,
  error: null,
  ...over,
});

/** A full green schedule: the policy's alone arm, then its under-load arm. */
function greenSchedule(): StabilityRun[] {
  return [
    ...Array.from({ length: STABILITY_POLICY.alone }, (_, index) =>
      run({ attempt: index + 1 }),
    ),
    ...Array.from({ length: STABILITY_POLICY.underLoad }, (_, index) =>
      run({ attempt: STABILITY_POLICY.alone + index + 1, underLoad: true }),
    ),
  ];
}

test.describe('the policy', () => {
  test('totals the threshold this repository already uses for a rate', () => {
    expect(STABILITY_TOTAL).toBe(FLAKE_MINIMUM_RUNS);
  });

  test('measures in both conditions, not five times in one', () => {
    expect(STABILITY_POLICY.alone).toBeGreaterThan(0);
    expect(STABILITY_POLICY.underLoad).toBeGreaterThan(0);
  });
});

test.describe('assessing stability', () => {
  test('a full green schedule is hardened', () => {
    const report = assessStability(greenSchedule());
    expect(report.stable).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === 'blocker')).toEqual([]);
  });

  /*
     "Not enough runs" and "not stable" are different claims — the distinction
     `quarantine.ts` names its minimum for. Reporting an unfinished measurement
     as a failure teaches people to ignore the gate.
   */
  test('an unfinished measurement is a warning, not a verdict', () => {
    const report = assessStability([run(), run({ attempt: 2 })]);
    expect(report.stable).toBe(false);
    expect(report.findings.map((finding) => finding.check)).toContain('stability-unmeasured');
    expect(
      report.findings.find((finding) => finding.check === 'stability-unmeasured')!.severity,
    ).toBe('warning');
  });

  test('a failure with nothing else running is not contention', () => {
    const runs = greenSchedule();
    runs[1] = run({ attempt: 2, passed: false, error: 'boom' });
    const report = assessStability(runs);

    expect(report.stable).toBe(false);
    expect(report.findings.map((finding) => finding.check)).toContain('unstable-alone');
    expect(report.contentionSensitive).toBe(false);
  });

  /*
     The finding this second arm exists for. Green alone and red in its own
     suite is a spec asserting on state its neighbours change — §"State the
     suite does not own" — and the fix is to scope the assertion, not to wait
     longer.
  */
  test('green alone and red in its suite is diagnosed as contention, not flakiness', () => {
    const runs = greenSchedule();
    runs[STABILITY_POLICY.alone] = run({
      attempt: STABILITY_POLICY.alone + 1,
      underLoad: true,
      passed: false,
      error: 'expected 1 received 2',
    });
    const report = assessStability(runs);

    expect(report.stable).toBe(false);
    expect(report.contentionSensitive).toBe(true);
    const finding = report.findings.find((entry) => entry.check === 'contention-sensitive')!;
    expect(finding.severity).toBe('blocker');
    expect(finding.remedy).toContain('scope the assertion');
    // And it must not also be reported as the generic under-load failure.
    expect(report.findings.map((entry) => entry.check)).not.toContain('unstable-under-load');
  });

  test('red in both arms is not called contention-sensitive', () => {
    const runs = greenSchedule();
    runs[0] = run({ passed: false });
    runs[STABILITY_POLICY.alone] = run({
      attempt: STABILITY_POLICY.alone + 1,
      underLoad: true,
      passed: false,
    });
    const report = assessStability(runs);

    expect(report.contentionSensitive).toBe(false);
    expect(report.findings.map((entry) => entry.check)).toContain('unstable-under-load');
  });

  /*
     Observed for real in phase 1: the same spec ran 16.7s and then 35.4s
     against a slow public demo. It passed both times and was one bad day from
     not passing, which is worth saying out loud without failing the gate.
  */
  test('a wide duration spread is reported without failing the spec', () => {
    const runs = greenSchedule();
    runs[0] = run({ durationMs: 1000 });
    runs[1] = run({ attempt: 2, durationMs: 1000 });
    runs[2] = run({ attempt: 3, durationMs: 9000 });
    const report = assessStability(runs);

    expect(report.stable).toBe(true);
    const finding = report.findings.find((entry) => entry.check === 'duration-spread')!;
    expect(finding.severity).toBe('warning');
    expect(report.durations.spread).toBeGreaterThanOrEqual(DURATION_SPREAD_WARNING);
  });

  test('a steady spec reports no spread warning', () => {
    const report = assessStability(greenSchedule());
    expect(report.findings.map((entry) => entry.check)).not.toContain('duration-spread');
  });
});

test.describe('duration summary', () => {
  test('reports min, median and max across every pass', () => {
    const summary = summariseDurations([
      run({ durationMs: 100 }),
      run({ durationMs: 300 }),
      run({ durationMs: 200 }),
    ]);
    expect(summary).toMatchObject({ minMs: 100, medianMs: 200, maxMs: 300 });
  });

  test('averages the middle pair when there is an even number', () => {
    const summary = summariseDurations([
      run({ durationMs: 100 }),
      run({ durationMs: 200 }),
      run({ durationMs: 300 }),
      run({ durationMs: 500 }),
    ]);
    expect(summary.medianMs).toBe(250);
  });

  test('says nothing rather than dividing by zero on no runs', () => {
    expect(summariseDurations([])).toMatchObject({ minMs: 0, medianMs: 0, maxMs: 0, spread: 1 });
  });
});

test.describe('scheduling the passes', () => {
  test('runs the cheap arm first, then the expensive one', () => {
    expect(nextArm([])).toBe('alone');
    const afterAlone = Array.from({ length: STABILITY_POLICY.alone }, () => run());
    expect(nextArm(afterAlone)).toBe('under-load');
  });

  test('stops once the schedule is complete', () => {
    expect(nextArm(greenSchedule())).toBeNull();
    expect(shouldKeepMeasuring(greenSchedule())).toBe(false);
  });

  /*
     Stopping early is the point: once it has failed, the remaining passes cost
     minutes and cannot change the verdict.
  */
  test('stops at the first failure rather than finishing the schedule', () => {
    expect(shouldKeepMeasuring([run({ passed: false })])).toBe(false);
    expect(nextArm([run({ passed: false })])).toBeNull();
  });
});
