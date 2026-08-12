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

export const storageStatePath = (role: string, target: string): string =>
  path.join(AUTH_DIR, `${target}.${role}.json`);

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
