/**
 * The canonical run model — §18.
 *
 * "The mistake to avoid is generating HTML directly from the reporter.
 * Everything downstream — the report, the email, the PractiTest push, the
 * triage agent — needs the same facts, and each one re-deriving them from
 * Playwright's raw output guarantees they eventually disagree."
 *
 * So: one normalised, versioned `run-result.json`, and every consumer reads
 * that. A useful side effect is that the report becomes testable — feed a
 * fixture with a known mix of pass, fail, flaky and skipped and assert the
 * rendering.
 */

export const RUN_RESULT_SCHEMA_VERSION = 1;

/** Playwright's own vocabulary, which already encodes "passed, but not first time". */
export type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';
export type Status = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/**
 * Pass rate and duration are read per kind. "A suite that is 95% green overall
 * but 60% green on mixed tests is telling you something a single number
 * hides." (§05)
 */
export type TestKind = 'ui' | 'mixed' | 'api' | 'contract' | 'unit';

export interface StepRecord {
  /** The business-language title that becomes the report's narrative (§18). */
  title: string;
  durationMs: number;
  failed: boolean;
  error?: string;
}

export interface AttachmentRecord {
  name: string;
  contentType: string;
  path?: string;
  /** Set when the body was inlined; already scrubbed (§11). */
  body?: string;
  bytes?: number;
}

export interface TestRecord {
  id: string;
  title: string;
  /** PractiTest display id from the spec's annotation (§14). */
  caseId: string | null;
  jiraKey: string | null;
  /** Hash of the case this spec was written against, for drift detection. */
  caseHash: string | null;
  file: string;
  project: string;
  kind: TestKind;
  tags: string[];
  outcome: Outcome;
  status: Status;
  /**
   * Recorded separately from the final status, because a suite that is green
   * only after retries is not green — and the distinction disappears if you
   * record only the final state (§18).
   */
  firstRunStatus: Status;
  retries: number;
  durationMs: number;
  workerIndex: number;
  error: { message: string; stack: string | null; snippet: string | null } | null;
  steps: StepRecord[];
  attachments: AttachmentRecord[];
  /** Annotations carried through verbatim, for anything not modelled above. */
  annotations: Array<{ type: string; description?: string }>;
}

export interface KindTotals {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

export interface CapabilityNote {
  capability: string;
  enabled: boolean;
  /** "api: not applicable for <target>" rather than a silent zero (§05). */
  note: string;
}

export interface RunResult {
  schemaVersion: number;
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    target: string;
    environment: string;
    branch: string | null;
    commit: string | null;
    buildId: string | null;
    trigger: string | null;
    /** Overall verdict, read from across a desk (§18). */
    status: 'passed' | 'failed';
  };
  totals: KindTotals & { byKind: Record<TestKind, KindTotals> };
  capabilities: CapabilityNote[];
  tests: TestRecord[];
}

export function emptyTotals(): KindTotals {
  return { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 };
}

export function tally(records: TestRecord[]): KindTotals & { byKind: Record<TestKind, KindTotals> } {
  const byKind: Record<TestKind, KindTotals> = {
    ui: emptyTotals(),
    mixed: emptyTotals(),
    api: emptyTotals(),
    contract: emptyTotals(),
    unit: emptyTotals(),
  };
  const overall = emptyTotals();

  for (const record of records) {
    for (const bucket of [overall, byKind[record.kind]]) {
      bucket.total++;
      if (record.outcome === 'expected') bucket.passed++;
      else if (record.outcome === 'unexpected') bucket.failed++;
      else if (record.outcome === 'flaky') bucket.flaky++;
      else bucket.skipped++;
    }
  }
  return { ...overall, byKind };
}

/**
 * Flake rate as a *rate*, not a count: "a test that fails 1 in 3 runs matters
 * far more than one that failed twice ever" (§18).
 */
export function flakeRate(totals: KindTotals): number {
  const executed = totals.total - totals.skipped;
  return executed === 0 ? 0 : totals.flaky / executed;
}

export function passRate(totals: KindTotals): number {
  const executed = totals.total - totals.skipped;
  return executed === 0 ? 0 : (totals.passed + totals.flaky) / executed;
}

/** Pass rate counting only first attempts — the honest number (§18). */
export function firstRunPassRate(records: TestRecord[]): number {
  const executed = records.filter((record) => record.outcome !== 'skipped');
  if (executed.length === 0) return 0;
  const clean = executed.filter((record) => record.firstRunStatus === 'passed');
  return clean.length / executed.length;
}
