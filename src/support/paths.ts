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

/** Where the canonical, versioned run model is written (§18). */
export const RUN_RESULT_PATH = repoPath('run-result.json');
export const TRIAGE_RESULT_PATH = repoPath('triage-result.json');
export const CASES_DIR = repoPath('cases');
export const STORIES_DIR = repoPath('stories');
export const REPORT_OUT_DIR = repoPath('report-out');
export const RESULTS_DIR = repoPath('results');
