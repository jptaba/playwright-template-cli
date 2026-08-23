import { poolSizeFor, usableAccounts } from './paths';
import type { TargetProfile } from '../../config/targets/types';

/**
 * Is the account pool earning what it costs? — open-items.md item 56.
 *
 * **`serverState` is human-declared and nothing checks it.** Every profile in
 * this repository declares `serverState: true`, and four of the five still
 * carry the scaffolder's comment verbatim — `// does state need cross-test
 * cleanup?` — which is the question, not an answer. It is a scaffold default
 * nobody revisits, and where a `poolSize` accompanies it the claim is spending
 * workers on every run for a collision that may not exist.
 *
 * It cost exactly that on toolshop. The profile explains a three-customer pool
 * with *"the cart lives on the server against the signed-in account… so two
 * workers signing in as `customer` share one cart"*, and the cart turns out to
 * live in `sessionStorage`, which is per-tab. `e2e` has been running at two
 * workers instead of three to avoid a collision the application cannot have.
 *
 * So the framework provides the measurement rather than another guess: collapse
 * the pool to one account, run the suite with every worker on that one
 * identity, and see whether anything actually breaks.
 *
 * **It reports and declines to conclude, deliberately.** A failure under a
 * collapsed pool is evidence for the pool only if the failing spec shares the
 * pooled identity, and nothing here can know that — toolshop's own failures
 * under load land on catalogue search, which touches no account at all.
 * Inventing a verdict is the defect `triage:measure` was built to catch, one
 * subject over.
 */

/** What the profile is spending, and on what. */
export interface PoolCost {
  role: string;
  poolSize: number;
  /** Accounts a worker may actually be given, after any auth-flow reservation. */
  usable: number;
  reserved: number | null;
  serverState: boolean;
}

export function poolCost(profile: TargetProfile): PoolCost {
  const role = profile.roles[0] ?? '';
  const poolSize = poolSizeFor(profile.credentials.poolSize, role);
  const reserved = profile.credentials.authFlowAccount ?? null;
  return {
    role,
    poolSize,
    usable: usableAccounts(poolSize, reserved ?? undefined).length,
    reserved,
    serverState: profile.capabilities.serverState,
  };
}

/**
 * Whether there is anything to measure.
 *
 * A pool of one costs nothing, and `serverState: false` caps no workers — in
 * both cases the claim is free, so the command says so and stops rather than
 * running a suite to prove a foregone conclusion.
 */
export function whatThereIsToMeasure(cost: PoolCost): string | null {
  /*
     `serverState: false` is the only free claim. It caps no workers, so there
     is no cost to weigh and the suite already runs at whatever width the
     machine allows.
  */
  if (!cost.serverState) return null;

  /*
     **A pool of one was reported as costing nothing, and it is the most
     expensive shape there is** — item 66.

     The reasoning was that a pool of one buys no partitioning, which is true
     and is not the question. `workerCeiling` caps at the *usable accounts*,
     so one account with `serverState: true` caps the suite at **one worker**:
     the whole thing runs serially. Declaring a pool of three is what buys the
     parallelism back, which is exactly backwards from how it reads.

     Measured across this repository the day the blind spot was found: four of
     five applications declare `serverState: true` with no pool and therefore
     run at one worker, and all four still carry the scaffolder's
     `// does state need cross-test cleanup?` verbatim. So the command that
     exists to ask whether the claim is earned was declining to ask it of
     every application paying the most for it.
  */
  if (cost.poolSize <= 1) {
    return (
      `serverState: true with a single account for '${cost.role}' caps this target at ` +
      '1 worker — the whole suite runs serially, and nothing has ever checked that the ' +
      'claim underneath it is true.'
    );
  }

  return (
    `serverState: true with a pool of ${cost.poolSize} for '${cost.role}' caps this ` +
    `target at ${cost.usable} worker(s)` +
    (cost.reserved !== null ? `, one of them reserved for auth-flows` : '') +
    '.'
  );
}

export interface PoolRun {
  /** Titles of the specs that failed, empty when the run was green. */
  failures: string[];
  passed: number;
  /** Set when the run could not be executed at all — not the same as failing. */
  error: string | null;
}

export interface PoolMeasurement {
  target: string;
  cost: PoolCost;
  /**
   * The same suite at the pool the profile declares — the control.
   *
   * **Without it the collapsed arm measures nothing**, and the first version
   * of this command shipped without one. Toolshop failed 1 of 2 collapsed
   * runs on a cart spec, which looks like proof the pool is needed until you
   * notice the same suite had failed at its *declared* pool on two of the
   * previous two days, on a different spec each time. A background failure
   * rate is indistinguishable from contention unless you measure both.
   */
  baseline: PoolRun[];
  /** Every worker on one account. */
  collapsed: PoolRun[];
}

/** One arm's runs, rendered, plus how many of them were green. */
function arm(title: string, runs: PoolRun[], lines: string[]): { executed: number; green: number } {
  lines.push(`  ${title}`);
  runs.forEach((run, index) => {
    if (run.error !== null) {
      lines.push(`    run ${index + 1}: could not run — ${run.error}`);
      return;
    }
    lines.push(
      run.failures.length === 0
        ? `    run ${index + 1}: ✓ ${run.passed} passed`
        : `    run ${index + 1}: ✗ ${run.failures.length} failed`,
    );
    for (const failure of run.failures) lines.push(`        ${failure}`);
  });
  lines.push('');
  const executed = runs.filter((run) => run.error === null);
  return {
    executed: executed.length,
    green: executed.filter((run) => run.failures.length === 0).length,
  };
}

/**
 * The report, as lines. Written to be pasted into an improvement-log entry,
 * the same as `formatLiveReport`.
 */
export function formatPoolMeasurement(measurement: PoolMeasurement): string[] {
  const { cost } = measurement;
  const lines: string[] = [];

  lines.push(
    `  ${measurement.target} — pool of ${cost.poolSize} for '${cost.role}', ` +
      `${cost.usable} usable worker(s)`,
  );
  lines.push('');

  const control = arm(
    `at the ceiling this profile imposes: ${cost.usable} worker(s) (control)`,
    measurement.baseline,
    lines,
  );
  const collapsed = arm('above it, every worker on one account', measurement.collapsed, lines);

  if (control.executed === 0 || collapsed.executed === 0) {
    lines.push('  One arm did not run, so there is nothing to compare.');
    return lines;
  }

  lines.push(
    `  ${control.green}/${control.executed} green at the ceiling · ` +
      `${collapsed.green}/${collapsed.executed} green on one account.`,
  );
  lines.push('');

  const controlClean = control.green === control.executed;
  const collapsedClean = collapsed.green === collapsed.executed;

  /*
     Four answers, and the fourth is the one this command shipped without.
     A suite with a background failure rate produces a red collapsed arm that
     looks exactly like contention, which is why there is a control at all.
  */
  const verdict =
    collapsedClean && controlClean
      ? [
          'Nothing collided, and the control was clean too. On this evidence the worker',
          'cap is buying no protection — but the decision is a person’s: it also guards',
          'collisions no spec currently exercises, and a suite proves only what it runs.',
        ]
      : collapsedClean
        ? [
            'The collapsed arm was cleaner than the control. Whatever is failing here is',
            'not the pool, and the pool is not preventing it either.',
          ]
        : controlClean
          ? [
              'Only the collapsed arm failed. That is the shape contention makes — check',
              'that the failing specs above share the pooled identity, and if they do, the',
              'pool is earning its cost.',
            ]
          : [
              'Both arms failed, so this run measures nothing about the pool. The suite has',
              'a background failure rate; settle that first, or the arms cannot be compared.',
            ];

  for (const line of verdict) lines.push(`  ${line}`);
  return lines;
}

/**
 * Exit code. **A failure under a collapsed pool is not this command failing.**
 *
 * The command's job is to produce a measurement, and both answers are results.
 * Only being unable to run one is an error — the same distinction
 * `suites:live` draws between `failed` and `not-run`.
 */
export function poolMeasureExitCode(measurement: PoolMeasurement): 0 | 2 {
  const ran = (runs: PoolRun[]): boolean => runs.some((run) => run.error === null);
  return ran(measurement.baseline) && ran(measurement.collapsed) ? 0 : 2;
}
