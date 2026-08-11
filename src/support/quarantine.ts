import fs from 'node:fs';
import { repoPath } from './paths';

/**
 * Flake quarantine — §18, §21.
 *
 * A quarantined test is one the suite has stopped trusting. Two things make
 * quarantine safe rather than a way to hide failures: every entry states a
 * reason and a date, and **the report shows the list with its age**, so an
 * entry that has been "temporarily" quarantined for four months is visible
 * rather than forgotten.
 *
 * The file is committed. Quarantining is a reviewed decision, not something a
 * pipeline does to itself at 3am.
 */
export const QUARANTINE_PATH = repoPath('config', 'quarantine.json');

export interface QuarantineEntry {
  /** PractiTest case id, which is stable across a spec being renamed. */
  caseId: string;
  reason: string;
  /** ISO date the entry was added. Age is reported from it. */
  since: string;
  /** Who owns getting it back in. "the team" is not an owner. */
  owner: string;
  /** Optional review-by date; past it, the entry is reported as overdue. */
  reviewBy?: string;
}

export function loadQuarantine(file = QUARANTINE_PATH): QuarantineEntry[] {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: QuarantineEntry[] };
  return parsed.entries ?? [];
}

export function saveQuarantine(entries: QuarantineEntry[], file = QUARANTINE_PATH): void {
  const body = {
    _comment:
      'Quarantined tests. Every entry needs a reason, a date and a named owner. The run ' +
      'report shows this list with its age, so a forgotten entry is visible (§18).',
    entries: [...entries].sort((a, b) => a.caseId.localeCompare(b.caseId)),
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

export function isQuarantined(caseId: string | null, entries: QuarantineEntry[]): QuarantineEntry | null {
  if (!caseId) return null;
  return entries.find((entry) => entry.caseId === caseId) ?? null;
}

export function ageInDays(entry: QuarantineEntry, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(entry.since)) / 86_400_000));
}

export function isOverdue(entry: QuarantineEntry, now = Date.now()): boolean {
  return Boolean(entry.reviewBy) && Date.parse(entry.reviewBy!) < now;
}

/**
 * Candidates for quarantine, from history. Ranked by **rate, not count** — a
 * test that fails 1 in 3 runs matters far more than one that failed twice
 * ever (§18).
 */
export interface FlakeCandidate {
  caseId: string;
  runs: number;
  flakyRuns: number;
  rate: number;
}

export function flakeCandidates(
  history: Array<{ failedCaseIds: string[]; total: number }>,
  flakyCaseIdsPerRun: string[][],
  minimumRuns = 5,
  threshold = 0.2,
): FlakeCandidate[] {
  const counts = new Map<string, number>();
  for (const flaky of flakyCaseIdsPerRun) {
    for (const caseId of flaky) counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }
  const runs = flakyCaseIdsPerRun.length;
  if (runs < minimumRuns) return [];

  return [...counts.entries()]
    .map(([caseId, flakyRuns]) => ({ caseId, runs, flakyRuns, rate: flakyRuns / runs }))
    .filter((candidate) => candidate.rate >= threshold)
    .sort((a, b) => b.rate - a.rate);
}
