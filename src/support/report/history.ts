import fs from 'node:fs';
import path from 'node:path';
import { repoPath } from '../paths';
import { firstRunPassRate, flakeRate, passRate, type RunResult } from '../reporters/run-result';

/**
 * Where run history lives — §22.
 *
 * "Flake rate, pass-rate trends and 'new since last run' all require history,
 * but the plan describes per-run artifacts only. CI artifact retention is
 * typically days to weeks, and it is not a queryable store."
 *
 * The decision, made rather than deferred: **append a summary line per run to
 * a committed JSON-lines file**, keyed by branch and environment. A database is
 * not needed for hundreds of runs a year, and choosing one is how this stalls.
 */
export const HISTORY_PATH = repoPath('docs', 'generated', 'run-history.jsonl');

export interface HistoryEntry {
  runId: string;
  finishedAt: string;
  target: string;
  environment: string;
  branch: string | null;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  passRate: number;
  flakeRate: number;
  /** Pass rate counting first attempts only — the honest number (§18). */
  firstRunPassRate: number;
  durationMs: number;
  /** Case ids that failed, so "new since last run" is computable. */
  failedCaseIds: string[];
}

export function summarise(run: RunResult): HistoryEntry {
  return {
    runId: run.run.id,
    finishedAt: run.run.finishedAt,
    target: run.run.target,
    environment: run.run.environment,
    branch: run.run.branch,
    status: run.run.status,
    total: run.totals.total,
    passed: run.totals.passed,
    failed: run.totals.failed,
    flaky: run.totals.flaky,
    skipped: run.totals.skipped,
    passRate: round4(passRate(run.totals)),
    flakeRate: round4(flakeRate(run.totals)),
    firstRunPassRate: round4(firstRunPassRate(run.tests)),
    durationMs: run.run.durationMs,
    failedCaseIds: run.tests
      .filter((test) => test.outcome === 'unexpected')
      .map((test) => test.caseId ?? test.title),
  };
}

export function readHistory(file = HISTORY_PATH): HistoryEntry[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as HistoryEntry);
}

export function appendHistory(entry: HistoryEntry, file = HISTORY_PATH): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** The lane a run belongs to. Trends across environments are meaningless. */
export function laneOf(entry: HistoryEntry): string {
  return `${entry.target}/${entry.environment}/${entry.branch ?? 'local'}`;
}

export interface TrendView {
  recent: HistoryEntry[];
  /** Failing now, passing in the previous run. The list people act on. */
  newlyFailing: string[];
  newlyFixed: string[];
  /** Flake rate over the retained window, as a rate rather than a count (§18). */
  windowFlakeRate: number;
}

export function buildTrend(
  current: HistoryEntry,
  history: HistoryEntry[],
  window = 20,
): TrendView {
  const lane = laneOf(current);
  const sameLane = history.filter((entry) => laneOf(entry) === lane && entry.runId !== current.runId);
  const recent = [...sameLane].slice(-window);
  const previous = recent[recent.length - 1];

  const previousFailures = new Set(previous?.failedCaseIds ?? []);
  const currentFailures = new Set(current.failedCaseIds);

  const executed = recent.reduce((sum, entry) => sum + (entry.total - entry.skipped), 0);
  const flakes = recent.reduce((sum, entry) => sum + entry.flaky, 0);

  return {
    recent: [...recent, current],
    newlyFailing: [...currentFailures].filter((id) => !previousFailures.has(id)),
    newlyFixed: [...previousFailures].filter((id) => !currentFailures.has(id)),
    windowFlakeRate: executed === 0 ? 0 : round4(flakes / executed),
  };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
