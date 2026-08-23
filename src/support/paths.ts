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
 * The accounts a worker may be given, in order.
 *
 * Everything in the pool except one optionally reserved for the signed-out
 * `auth-flows` project — see `CredentialRefs.authFlowAccount`. Reserving is
 * refused when it would leave nothing behind, because a pool of one has no
 * spare identity to give and silently handing every worker no account at all
 * is worse than the collision it was meant to fix.
 */
export const usableAccounts = (poolSize = 1, reserved?: number): number[] => {
  const all = Array.from({ length: Math.max(1, poolSize) }, (_, index) => index + 1);
  if (!reserved || all.length < 2) return all;
  const remaining = all.filter((account) => account !== reserved);
  return remaining.length > 0 ? remaining : all;
};

/**
 * Which account in the pool this worker uses.
 *
 * Deterministic and coordination-free: the same worker always gets the same
 * account, so a session established once can be reused, and two workers only
 * collide when there are more workers than accounts.
 *
 * Takes the worker's **slot** (`parallelIndex`), never `workerIndex` — only
 * the former is bounded by the worker count. See `RunContext.parallelIndex`.
 */
export const accountForWorker = (workerIndex: number, poolSize = 1, reserved?: number): number => {
  const usable = usableAccounts(poolSize, reserved);
  return usable[workerIndex % usable.length] ?? 1;
};

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
 * The most workers that may run in parallel without two of them colliding on
 * the same account — `null` when nothing needs capping.
 *
 * Binds on `roles[0]`, not on the smallest pool across every role. Toolshop
 * has three customer accounts and one administrator nothing writes as; the
 * minimum across roles would cap it at 1 for a collision that can never
 * happen, where `roles[0]` — the identity `playwright.config.ts` gives
 * `authedPage` for the `e2e` project — caps it at the pool the specs that
 * actually run share.
 *
 * `null` when there is no server-side state to collide on: two workers
 * reusing the same account then share nothing an assertion can see. Measured
 * live rather than assumed (backlog item 30) — toolshop's live suite passed
 * 3 of 3 runs at 3 workers (its customer pool) and 1 of 4 at the local
 * default of 7, with a different spec failing each time.
 */
export const workerCeiling = (
  roles: string[],
  poolSize: number | Record<string, number> | undefined,
  serverState: boolean,
  reserved?: number,
  /*
     The profile saying two workers may hold its identity at once — item 66.

     `serverState` was deciding both "does this need cleanup" and "may workers
     share an account", and the two came apart the moment anybody measured.
     An application that creates data it must tidy up can still tolerate three
     workers on one identity; orangehrm does, and it was running at one.

     Read here rather than folded into `serverState` so the older claim keeps
     meaning what it meant. Undefined leaves the cap exactly where it was.
  */
  sharedIdentitySafe?: boolean,
): number | null => {
  const role = roles[0];
  if (!serverState || !role) return null;
  // Nothing to collide on that this profile has not said is safe to share.
  if (sharedIdentitySafe) return null;
  // An account reserved for auth-flows is not one a worker can be given, so
  // the ceiling is what is left rather than what the pool holds.
  return usableAccounts(poolSizeFor(poolSize, role), reserved).length;
};

/**
 * How many workers a run may use, given the target's ceiling and whether this
 * is CI.
 *
 * No ceiling leaves both defaults exactly as they were before this existed —
 * `undefined` locally (Playwright decides) and 4 in CI. A ceiling narrower
 * than CI's own 4 lowers it; a target that needs no ceiling never slows down
 * CI for every target the way a blanket cap would have.
 */
export const resolveWorkers = (ceiling: number | null, isCI: boolean): number | undefined => {
  if (ceiling === null) return isCI ? 4 : undefined;
  return isCI ? Math.min(4, ceiling) : ceiling;
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

/**
 * Which Vault this machine is connected to, written by the dashboard.
 *
 * Beside the draft and the stored selection, and gitignored for the same
 * reason: an address is configuration, and *whose* Vault is a property of the
 * machine rather than of the application under test. `config/targets/` stays
 * free of anything machine-specific, which is the rule that decided this.
 */
export const VAULT_CONNECTION_PATH = repoPath('.vault-connection.json');
