import { redact } from '../redact';
import type { RunResult, TestRecord } from '../reporters/run-result';
import type { RunInstanceResult } from '../../integrations/practitest/client';

/**
 * Exactly what leaves the building — §14, §15, §08 phase 6.
 *
 * One description of every outbound payload, used by `publish:practitest`,
 * `publish:jira` and the dashboard's preview alike. That is the whole reason
 * this file exists: a preview built from a second copy of the payload builder
 * is a preview of something nobody is about to send, and it would drift within
 * a month of the first change to either.
 *
 * Pure. Nothing here opens a socket or reads a credential.
 */

export function resultStatusOf(record: TestRecord): RunInstanceResult['status'] {
  switch (record.outcome) {
    case 'expected':
      return 'PASSED';
    case 'flaky':
      // Passed, but not first time. Reported as passed with the retry noted in
      // the output, because the run *did* pass — the flake signal lives in the
      // report, where it can be read as a rate (§18).
      return 'PASSED';
    case 'skipped':
      return 'NO RUN';
    default:
      return 'FAILED';
  }
}

export function resultOutputFor(record: TestRecord): string {
  const lines: string[] = [`${record.project} · ${record.file}`];
  if (record.outcome === 'flaky') {
    lines.push(`Passed on retry ${record.retries} — first attempt: ${record.firstRunStatus}.`);
  }
  if (record.error) {
    lines.push('', record.error.message);
    if (record.steps.some((step) => step.failed)) {
      lines.push('', `Failed at step: ${record.steps.find((step) => step.failed)!.title}`);
    }
  }
  // Belt and braces: the reporter already scrubbed, and so does the client.
  return redact(lines.join('\n')).slice(0, 4_000);
}

/** A test that carries no case id, and why nothing will be posted for it. */
export interface UnreportableTest {
  title: string;
  reason: string;
}

export interface PublishableResults {
  results: RunInstanceResult[];
  /** Named rather than dropped: silence about these is how coverage rots. */
  unreportable: UnreportableTest[];
}

/**
 * Framework self-tests, contract checks and setup projects implement no
 * managed case by design (§07), so their absence from a report is correct.
 * Anything else without an id is a gap worth stating.
 */
function unreportableReason(record: TestRecord): string | null {
  if (record.caseId) return null;
  if (record.project === 'framework') return 'framework self-test — implements no managed case';
  if (record.project === 'contract') return 'contract check — verifies a schema, not a case';
  if (record.project.startsWith('setup:')) return 'setup project — establishes state';
  return 'no practitest annotation, so there is no case to post against';
}

export function publishableResults(run: RunResult): PublishableResults {
  const results: RunInstanceResult[] = [];
  const unreportable: UnreportableTest[] = [];

  for (const record of run.tests) {
    if (record.caseId) {
      results.push({
        caseDisplayId: record.caseId,
        status: resultStatusOf(record),
        durationSeconds: Math.round(record.durationMs / 1000),
        actualResult: resultOutputFor(record),
      });
      continue;
    }
    const reason = unreportableReason(record);
    if (reason) unreportable.push({ title: record.title, reason });
  }

  return { results, unreportable };
}

export interface DefectCluster {
  summary: string;
  category: string;
  /** The fingerprint the deduplication turns on. */
  fingerprint: string;
  tests: TestRecord[];
}

export function defectSummary(cluster: DefectCluster): string {
  return `[${cluster.category}] ${cluster.summary}`.slice(0, 200);
}

/** Wiki markup, not ADF: a Cloud payload here renders as raw JSON (§15). */
export function defectDescription(cluster: DefectCluster): string {
  const first = cluster.tests[0];
  return [
    'h3. What failed',
    `${cluster.tests.length} test(s) failed with the same signature.`,
    '',
    'h3. Triage',
    `Category: ${cluster.category}`,
    `Summary: ${cluster.summary}`,
    '',
    'h3. Affected tests',
    ...cluster.tests.map((test) => `* ${test.caseId ? `${test.caseId} — ` : ''}${test.title}`),
    '',
    'h3. Error',
    '{noformat}',
    (first?.error?.message ?? 'No error message recorded.').slice(0, 2_000),
    '{noformat}',
  ].join('\n');
}

export function defectLabels(run: RunResult): string[] {
  return [`env-${run.run.environment}`, `target-${run.run.target}`];
}

export function repeatComment(run: RunResult, cluster: DefectCluster): string {
  return `Failed again in run ${run.run.id} (${run.run.environment}), ${cluster.tests.length} test(s).`;
}

export function reopenComment(run: RunResult, transitioned: boolean): string {
  return (
    `Reopened by run ${run.run.id}: this failure signature returned.` +
    (transitioned ? '' : ' (No reopen transition available in this workflow — please triage.)')
  );
}

/** Transitions to try, in order, when a resolved defect fails again. */
export const REOPEN_TRANSITIONS = ['Reopen Issue', 'Reopen', 'Back to Open'];
