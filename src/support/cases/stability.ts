import { FLAKE_MINIMUM_RUNS } from '../quarantine';
import type { SpecFinding } from './spec-author';

/**
 * Phase 4: a spec that passed once is not hardened.
 *
 * The loop's terminal condition — the owner's *"circle back again until the
 * playwright test script is robust enough"*. Without it `spec:harden` declares
 * success on one green run, which this repository already has two separate
 * pieces of evidence against.
 *
 * **Repetition alone is the wrong instrument, and that is the whole design.**
 * Item 67 is the record: three applications measured **5/5 green**, the worker
 * cap was lifted on the strength of it, and two of them then failed on the
 * specs that assert what a shared list contains. A clean measurement in
 * isolation did not prove the thing it was read as proving. Repeating that
 * mistake one layer down — running a generated spec five times alone and
 * calling it hardened — would be the same error with the same shape.
 *
 * So stability is measured in **two arms**, exactly as `pool:measure` does:
 *
 *  - **Alone.** Does the spec work at all, repeatably? Cheap, and it catches an
 *    outright non-deterministic spec.
 *  - **In its suite.** Does it work under the contention it will actually meet
 *    — the other specs of its own application, running at that target's worker
 *    width? This is the arm that catches a spec racing its neighbours over
 *    shared data, and it is the one a naive gate omits.
 *
 * A spec green alone and red in its suite is not "flaky". It is a spec that
 * does not own what it asserts about, which is a §"State the suite does not
 * own" finding and needs a different fix from a wait.
 */

export interface StabilityRun {
  attempt: number;
  passed: boolean;
  durationMs: number;
  /** True when the rest of the application's suite ran alongside it. */
  underLoad: boolean;
  error: string | null;
}

export interface StabilityPolicy {
  /** Green runs required with nothing else running. */
  alone: number;
  /** Green runs required with the application's own suite running alongside. */
  underLoad: number;
}

/**
 * Five runs in total, split across the two arms.
 *
 * Five because `FLAKE_MINIMUM_RUNS` is already this repository's answer to "how
 * many runs before a rate means anything", and a gate that used a different
 * number would be making a second, unstated claim about the same question. The
 * *split* is item 67's lesson: five in one condition is the measurement that
 * was already trusted once and was wrong.
 *
 * Weighted toward the suite arm being smaller only because it is an order of
 * magnitude more expensive — not because it matters less. If anything the
 * evidence says the opposite.
 */
export const STABILITY_POLICY: StabilityPolicy = { alone: 3, underLoad: 2 };

export const STABILITY_TOTAL = STABILITY_POLICY.alone + STABILITY_POLICY.underLoad;

/** Ratio of slowest to median above which a spec is one bad day from a timeout. */
export const DURATION_SPREAD_WARNING = 2;

export interface DurationSummary {
  minMs: number;
  medianMs: number;
  maxMs: number;
  /** max ÷ median, or 1 when there is nothing to compare. */
  spread: number;
}

export interface StabilityReport {
  runs: StabilityRun[];
  policy: StabilityPolicy;
  aloneGreen: number;
  aloneRun: number;
  loadGreen: number;
  loadRun: number;
  stable: boolean;
  /** Green alone, red in its suite — a distinct diagnosis, not a flake. */
  contentionSensitive: boolean;
  durations: DurationSummary;
  findings: SpecFinding[];
}

export function summariseDurations(runs: StabilityRun[]): DurationSummary {
  const durations = runs.map((run) => run.durationMs).sort((a, b) => a - b);
  if (durations.length === 0) return { minMs: 0, medianMs: 0, maxMs: 0, spread: 1 };

  const middle = Math.floor(durations.length / 2);
  const medianMs =
    durations.length % 2 === 0
      ? Math.round((durations[middle - 1]! + durations[middle]!) / 2)
      : durations[middle]!;

  return {
    minMs: durations[0]!,
    medianMs,
    maxMs: durations.at(-1)!,
    spread: medianMs > 0 ? Number((durations.at(-1)! / medianMs).toFixed(2)) : 1,
  };
}

export function assessStability(
  runs: StabilityRun[],
  policy: StabilityPolicy = STABILITY_POLICY,
): StabilityReport {
  const alone = runs.filter((run) => !run.underLoad);
  const load = runs.filter((run) => run.underLoad);
  const aloneGreen = alone.filter((run) => run.passed).length;
  const loadGreen = load.filter((run) => run.passed).length;

  const findings: SpecFinding[] = [];
  const add = (
    check: string,
    severity: SpecFinding['severity'],
    detail: string,
    remedy: string,
  ): void => {
    findings.push({ check, severity, detail, remedy });
  };

  /*
     "Not enough runs" and "not stable" are different claims, and `quarantine.ts`
     names its minimum for exactly this reason. A gate that reported an
     unfinished measurement as a failure would teach people to ignore it.
  */
  if (alone.length < policy.alone || load.length < policy.underLoad) {
    add(
      'stability-unmeasured',
      'warning',
      `measured ${alone.length}/${policy.alone} alone and ${load.length}/${policy.underLoad} ` +
        'in its suite — not enough to say either way',
      'run the remaining passes before deciding whether this spec is ready',
    );
  }

  if (alone.length > 0 && aloneGreen < alone.length) {
    add(
      'unstable-alone',
      'blocker',
      `failed ${alone.length - aloneGreen} of ${alone.length} run(s) with nothing else running`,
      'the spec is not deterministic on its own — this is not contention, and a wait is ' +
        'unlikely to be the whole answer',
    );
  }

  /*
     The interesting failure, and the one this arm exists for. Green alone and
     red in its suite is not flakiness — it is a spec asserting on state its own
     neighbours are changing. §"State the suite does not own": place the data
     you assert about, or scope the assertion to what this spec created.
  */
  const contentionSensitive = load.length > 0 && loadGreen < load.length && aloneGreen === alone.length;
  if (contentionSensitive) {
    add(
      'contention-sensitive',
      'blocker',
      `green ${aloneGreen}/${alone.length} alone but failed ${load.length - loadGreen} of ` +
        `${load.length} run(s) inside its own suite`,
      'it is asserting on something another spec is changing — scope the assertion to what ' +
        'this spec created, rather than adding a wait',
    );
  } else if (load.length > 0 && loadGreen < load.length) {
    add(
      'unstable-under-load',
      'blocker',
      `failed ${load.length - loadGreen} of ${load.length} run(s) inside its own suite`,
      'stabilise it alone first, then re-measure under contention',
    );
  }

  const durations = summariseDurations(runs);
  if (durations.spread >= DURATION_SPREAD_WARNING && runs.length > 1) {
    add(
      'duration-spread',
      'warning',
      `slowest run was ${durations.spread}× the median (${durations.maxMs}ms vs ` +
        `${durations.medianMs}ms)`,
      'it passes, but it is close enough to its timeouts that a slower day could fail it — ' +
        'worth knowing before it lands in a suite somebody trusts',
    );
  }

  const stable =
    alone.length >= policy.alone &&
    load.length >= policy.underLoad &&
    aloneGreen === alone.length &&
    loadGreen === load.length;

  return {
    runs,
    policy,
    aloneGreen,
    aloneRun: alone.length,
    loadGreen,
    loadRun: load.length,
    stable,
    contentionSensitive,
    durations,
    findings,
  };
}

/**
 * Whether another stability pass is worth running.
 *
 * Stops early on a failure rather than completing the schedule: once a spec has
 * failed once, the remaining passes cost minutes and cannot change the verdict.
 * The report still says how far it got, which is why `stability-unmeasured` is
 * a warning and not silence.
 */
export function shouldKeepMeasuring(
  runs: StabilityRun[],
  policy: StabilityPolicy = STABILITY_POLICY,
): boolean {
  if (runs.some((run) => !run.passed)) return false;
  return runs.length < policy.alone + policy.underLoad;
}

/** Which arm the next pass belongs to. Alone first — it is cheap and decisive. */
export function nextArm(
  runs: StabilityRun[],
  policy: StabilityPolicy = STABILITY_POLICY,
): 'alone' | 'under-load' | null {
  if (!shouldKeepMeasuring(runs, policy)) return null;
  return runs.filter((run) => !run.underLoad).length < policy.alone ? 'alone' : 'under-load';
}

/** Named so a caller can say which threshold it is holding a spec to. */
export const STABILITY_BASIS = `${STABILITY_TOTAL} runs, the same threshold FLAKE_MINIMUM_RUNS (${FLAKE_MINIMUM_RUNS}) sets for a rate to mean anything`;
