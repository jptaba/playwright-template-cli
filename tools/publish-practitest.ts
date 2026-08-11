#!/usr/bin/env tsx
import fs from 'node:fs';
import { RUN_RESULT_PATH } from '../src/support/paths';
import { PractiTestClient, type RunInstanceResult } from '../src/integrations/practitest/client';
import type { RunResult, TestRecord } from '../src/support/reporters/run-result';
import { redact } from '../src/support/redact';

/**
 * `npm run publish:practitest` — §14, §16.
 *
 * Reads the canonical run model and posts once, from the merge job, after all
 * shards have reported. One merge job means one batched set of API calls
 * rather than N shards each calling independently — which is what the rate
 * limit requires and what makes flaky status knowable at all.
 *
 * **This job never fails the pipeline.** A reporting failure degrades to a
 * warning plus an artifact; it does not turn a green suite red (§01).
 */

function statusOf(record: TestRecord): RunInstanceResult['status'] {
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

function outputFor(record: TestRecord): string {
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

async function main(): Promise<number> {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn(`No run-result.json at ${RUN_RESULT_PATH}. Nothing to publish.`);
    return 0;
  }

  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  const withCases = run.tests.filter((record) => record.caseId);
  const withoutCases = run.tests.filter(
    (record) =>
      !record.caseId &&
      // Framework self-tests, contract checks and setup projects implement no
      // managed case by design (§07).
      !['unit', 'contract'].includes(record.project) &&
      !record.project.startsWith('setup:'),
  );

  console.log(
    `Run ${run.run.id} (${run.run.target}/${run.run.environment}): ` +
      `${run.tests.length} test(s), ${withCases.length} carrying a PractiTest id.`,
  );
  if (withoutCases.length > 0) {
    console.warn(
      `${withoutCases.length} spec(s) have no practitest annotation and will not be reported. ` +
        'They are also invisible in the coverage view (§18): ' +
        withoutCases.map((record) => record.title).join('; '),
    );
  }
  if (withCases.length === 0) return 0;

  if (process.env.PRACTITEST_DRY_RUN === 'true') {
    for (const record of withCases) {
      console.log(`  would post ${record.caseId} → ${statusOf(record)} (${record.durationMs}ms)`);
    }
    return 0;
  }

  const client = PractiTestClient.fromEnvironment();
  try {
    const outcome = await client.postRunResults(
      withCases.map((record) => ({
        caseDisplayId: record.caseId!,
        status: statusOf(record),
        durationSeconds: Math.round(record.durationMs / 1000),
        actualResult: outputFor(record),
      })),
      (message) => console.warn(`  ${message}`),
    );
    console.log(
      `Posted ${outcome.posted} result(s); ${outcome.unresolved.length} unresolved, ` +
        `${outcome.failed.length} failed.`,
    );
  } catch (error) {
    // Best-effort by design. The digest and the report still carry the truth.
    console.error(
      `PractiTest reporting failed: ${error instanceof Error ? error.message : String(error)}\n` +
        'Degrading to a warning: reporting never turns a green suite red (§01). ' +
        'run-result.json is retained as the artifact of record.',
    );
    return 0;
  } finally {
    await client.dispose();
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Unexpected publisher failure: ${String(error)}`);
    process.exit(0);
  },
);
