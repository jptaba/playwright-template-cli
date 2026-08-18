import crypto from 'node:crypto';
import type { RunResult, TestRecord } from '../reporters/run-result';
import type { FailureCluster } from './types';

/**
 * Pass 1 — cluster, before any AI runs (§20).
 *
 * "Group failures by signature: normalised error, failing step, and time
 * window. If forty tests fail with the same connection error in the same two
 * minutes, that is one environment incident, not forty defects."
 *
 * This single decision does three things at once: it stops forty Jira tickets
 * being filed on a bad night, it cuts triage cost by roughly the clustering
 * factor, and it makes the answer *more* accurate — because breadth is itself
 * the evidence for an infrastructure cause, and a per-test view cannot see it.
 */

/** How many lines of the error the signature is built from. */
const SIGNATURE_LINES = 3;

/** The same claim, whether or not it arrived wearing Playwright's prefix. */
const sameClaim = (a: string, b: string): boolean =>
  a.replace(/^Error:\s*/, '') === b.replace(/^Error:\s*/, '');

/**
 * The lines worth signing, taken in order until there are `limit` of them.
 *
 * Blanks and an immediately repeated line are dropped *before* the count,
 * because Playwright spends both of them on the primitive these conventions
 * mandate for eventual consistency. `expect.poll(fn, { message })` renders as
 * `Error: message`, a blank, `message`, a blank, and only then the matcher —
 * so counting raw lines gave the same sentence twice and never reached what
 * was actually asserted. (`expect(value, message)` prints it once; the
 * duplication is the poll form's, which is the one a queue or a batch has to
 * use.)
 */
function claimLines(message: string, limit: number): string[] {
  const lines: string[] = [];
  for (const raw of message.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const previous = lines[lines.length - 1];
    if (previous !== undefined && sameClaim(previous, line)) continue;
    lines.push(line);
    if (lines.length === limit) break;
  }
  return lines;
}

/** Everything that differs run to run but does not change what broke. */
export function normaliseError(message: string): string {
  return claimLines(message.replace(/\r/g, ''), SIGNATURE_LINES)
    .join(' ')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<timestamp>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/0x[0-9a-f]+/gi, '<addr>')
    .replace(/:\d+:\d+/g, ':<line>:<col>')
    .replace(/\b\d+(\.\d+)?(ms|s)\b/g, '<duration>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export interface ClusterOptions {
  /** Failures further apart than this are separate incidents. */
  windowMs?: number;
}

export function clusterFailures(run: RunResult, options: ClusterOptions = {}): FailureCluster[] {
  const windowMs = options.windowMs ?? 5 * 60_000;
  const failures = run.tests.filter((test) => test.outcome === 'unexpected');
  if (failures.length === 0) return [];

  // The run model does not carry per-test timestamps, so the run's own window
  // is the time dimension. Sharded runs land inside one window by design.
  const runStart = Date.parse(run.run.startedAt);
  const runEnd = Date.parse(run.run.finishedAt);
  const windowIndex = (test: TestRecord): number =>
    Math.floor(((runEnd - runStart) / Math.max(1, failures.length) * failures.indexOf(test)) / windowMs);

  const groups = new Map<string, TestRecord[]>();
  for (const failure of failures) {
    const signature = signatureOf(failure, windowIndex(failure));
    groups.set(signature, [...(groups.get(signature) ?? []), failure]);
  }

  return [...groups.entries()]
    .map(([signature, tests]) => ({
      id: crypto.createHash('sha256').update(signature).digest('hex').slice(0, 8),
      signature,
      summary: summarise(tests),
      category: 'unclassified' as const,
      testIds: tests.map((test) => test.id),
      caseIds: tests.map((test) => test.caseId).filter((id): id is string => Boolean(id)),
      firstSeenAt: run.run.startedAt,
      lastSeenAt: run.run.finishedAt,
      size: tests.length,
    }))
    .sort((a, b) => b.size - a.size);
}

function signatureOf(test: TestRecord, window: number): string {
  const failingStep = test.steps.find((step) => step.failed)?.title ?? '(no named step)';
  return [normaliseError(test.error?.message ?? 'no error message'), failingStep, `w${window}`].join(
    ' :: ',
  );
}

function summarise(tests: TestRecord[]): string {
  const first = tests[0]!;
  const line = (first.error?.message ?? first.title).split('\n')[0]!.trim();
  return tests.length === 1 ? line.slice(0, 160) : `${line.slice(0, 140)} (×${tests.length})`;
}
