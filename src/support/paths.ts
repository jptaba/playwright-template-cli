import path from 'node:path';

/** Repository root, resolved from this file rather than from `process.cwd()`. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const repoPath = (...segments: string[]): string => path.join(REPO_ROOT, ...segments);

/**
 * Storage state lives in a gitignored `.auth/` directory and is never uploaded
 * as a CI artifact. A storage state file contains live session tokens: anyone
 * holding one is signed in as that account, no password or MFA required (§13).
 */
export const AUTH_DIR = repoPath('.auth');

/**
 * Where a role's session is kept.
 *
 * One file per role and *per account*, because a pool of accounts partitioned
 * across workers needs a session each — one file would mean every worker
 * carrying the first account's cookies whatever account it was given.
 *
 * Index 1 keeps the original filename, so a target with a single account per
 * role is untouched and no existing `.auth/` file is orphaned by this.
 */
export const storageStatePath = (role: string, target: string, index = 1): string =>
  path.join(AUTH_DIR, index > 1 ? `${target}.${role}.${index}.json` : `${target}.${role}.json`);

/**
 * Which account in the pool this worker uses.
 *
 * Deterministic and coordination-free: the same worker always gets the same
 * account, so a session established once can be reused, and two workers only
 * collide when there are more workers than accounts.
 */
export const accountForWorker = (workerIndex: number, poolSize = 1): number =>
  poolSize <= 1 ? 1 : (workerIndex % poolSize) + 1;

/**
 * How many accounts a given role has.
 *
 * A number in the profile means "this many for every role"; a map states each
 * one. Anything unstated is one, which is what every target had before pools
 * existed — so adding a pool for one role cannot silently invent accounts for
 * another. That mistake is not hypothetical: written as a single number, the
 * first real pool sent `setup:auth` looking for a second administrator.
 */
export const poolSizeFor = (
  poolSize: number | Record<string, number> | undefined,
  role: string,
): number => {
  if (typeof poolSize === 'number') return Math.max(1, poolSize);
  if (poolSize && typeof poolSize === 'object') return Math.max(1, poolSize[role] ?? 1);
  return 1;
};

/**
 * Where the canonical, versioned run model is written (§18).
 *
 * Overridable, because two runs at once otherwise write the same file and the
 * second one wins — measured, not assumed: two concurrent runs each finished
 * 315 tests and left a single result behind. The dashboard gives every run its
 * own directory and points this at it; on the command line it stays where it
 * has always been.
 */
export const RUN_RESULT_PATH = process.env.RUN_RESULT_PATH ?? repoPath('run-result.json');

/**
 * Where a live run streams its events, one JSON object per line.
 *
 * Unset for a normal run, and the reporter that writes it does nothing at all
 * when it is — a command-line run pays nothing for a feature only the dashboard
 * uses.
 */
export const LIVE_EVENTS_PATH = process.env.LIVE_EVENTS_PATH ?? null;
export const TRIAGE_RESULT_PATH = repoPath('triage-result.json');
export const CASES_DIR = repoPath('cases');
export const STORIES_DIR = repoPath('stories');
export const REPORT_OUT_DIR = repoPath('report-out');
export const RESULTS_DIR = repoPath('results');
