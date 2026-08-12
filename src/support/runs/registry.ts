/**
 * Which runs are going, and whether another may start — §08, phase 2.
 *
 * Two slots, both watched. One cap rather than two: a run you cannot see is a
 * run you have to go and look for, and the point of the page is that everything
 * happening is in front of you. It also removes a whole category of design —
 * no rule for which run earns the live view, no queue, and no run that behaves
 * differently from its neighbour.
 *
 * A third request is refused rather than queued. A queued run starts unattended
 * some minutes later, against an application whose state has moved, and nobody
 * is watching when it does — which is the kind of result nobody trusts.
 *
 * Pure: slots, identifiers and refusals, with no processes and no filesystem.
 * `tools/dashboard.ts` spawns and kills; this decides whether it may.
 */

export const MAX_CONCURRENT_RUNS = 2;

export interface RunRequest {
  target: string;
  /** Playwright projects to run. Empty means whatever the config selects. */
  projects: string[];
  /** `--grep`, for tags such as `@smoke`. */
  grep?: string;
  /** Real browser windows on this machine, rather than headless. */
  headed?: boolean;
  /** Attach a live view to this run. */
  liveView?: boolean;
}

export type RunState = 'starting' | 'running' | 'finished' | 'cancelled' | 'failed';

export interface RunRecord {
  id: string;
  request: RunRequest;
  state: RunState;
  startedAt: number;
  finishedAt: number | null;
  /** Directory holding this run's artefacts, model and event stream. */
  directory: string;
  /** Process id, once spawned. Null before, and after it exits. */
  pid: number | null;
}

export interface StartRefusal {
  error: string;
}

/** Runs still occupying a slot. */
export function activeRuns(runs: readonly RunRecord[]): RunRecord[] {
  return runs.filter((run) => run.state === 'starting' || run.state === 'running');
}

/**
 * Whether another run may start, and why not when it may not.
 *
 * The refusal names the runs in the way, because "too many runs" leaves the
 * reader to go and find out which — and the answer is almost always "the one I
 * forgot about".
 */
export function canStart(
  runs: readonly RunRecord[],
  max = MAX_CONCURRENT_RUNS,
): true | StartRefusal {
  const active = activeRuns(runs);
  if (active.length < max) return true;
  const names = active.map((run) => `${run.request.target} (${run.id})`).join(' and ');
  return {
    error:
      `Two runs are already going: ${names}. Stop one to start another — this refuses rather ` +
      'than queues, because a queued run starts unattended later against state that has moved, ' +
      'and nobody is watching when it does.',
  };
}

/**
 * Whether both active runs point at the same application.
 *
 * Warned, never refused. With `accountPool: 'static'` and `serverState: true` —
 * the scaffolder's own default — every worker in both runs signs in as the same
 * user and mutates the same cart, favourites and orders. That is not
 * theoretical: it produced 409s, wrong cart contents, and eventually a locked
 * account on a real target. It is perfectly safe across different targets, and
 * for read-only projects against the same one, so the call belongs to whoever
 * pressed the button.
 */
export function contentionWarning(runs: readonly RunRecord[]): string | null {
  const targets = activeRuns(runs).map((run) => run.request.target);
  if (targets.length < 2) return null;
  if (new Set(targets).size > 1) return null;
  return (
    `Both runs are against '${targets[0]}'. If its account pool is static, every worker in both ` +
    'runs is the same user mutating the same server-side state — which shows up as a 409, a ' +
    'cart with one item too many, or an account locked out, on whichever run lost the race.'
  );
}

/**
 * A run identifier that is also a directory name and a log prefix.
 *
 * Time-ordered so a listing sorts itself, and suffixed so two runs started in
 * the same millisecond cannot collide.
 */
export function newRunId(now: number, suffix: string): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  return `${stamp}-${suffix}`;
}

/** Only a run that is still going can be cancelled, and only once. */
export function canCancel(run: RunRecord | undefined): true | StartRefusal {
  if (!run) return { error: 'No run by that id.' };
  if (run.state === 'finished' || run.state === 'cancelled' || run.state === 'failed') {
    return { error: `That run already ${run.state}.` };
  }
  return true;
}

/**
 * The command line for a run.
 *
 * Built here so it is testable, and so the flags that matter are visible in one
 * place rather than assembled inside a spawn call. Every path is per-run, which
 * is what stops two runs overwriting each other's results.
 */
export function runCommand(run: RunRecord): { args: string[]; env: Record<string, string> } {
  const args = ['playwright', 'test', `--output=${run.directory}/artifacts`];

  for (const project of run.request.projects) args.push(`--project=${project}`);
  if (run.request.grep) args.push(`--grep=${run.request.grep}`);
  if (run.request.headed) args.push('--headed');

  /*
     Traces and video on failure, not on everything. A trace is 2.9 MB for a
     short journey against 244 KB of video, and a passing run that keeps one per
     test is how a laptop fills up. You want the trace when something broke.
  */
  args.push('--trace=retain-on-failure', '--video=retain-on-failure');

  return {
    args,
    env: {
      TARGET: run.request.target,
      RUN_ID: run.id,
      RUN_RESULT_PATH: `${run.directory}/run-result.json`,
      JUNIT_PATH: `${run.directory}/junit.xml`,
      LIVE_EVENTS_PATH: `${run.directory}/events.ndjson`,
      ...(run.request.liveView ? { LIVE_VIEW: '1' } : {}),
    },
  };
}
