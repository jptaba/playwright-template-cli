#!/usr/bin/env tsx
import fs from 'node:fs';
import { RUN_RESULT_PATH } from '../src/support/paths';
import { PractiTestClient } from '../src/integrations/practitest/client';
import { publishableResults, resultStatusOf } from '../src/support/publish/payloads';
import type { RunResult } from '../src/support/reporters/run-result';

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

async function main(): Promise<number> {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn(`No run-result.json at ${RUN_RESULT_PATH}. Nothing to publish.`);
    return 0;
  }

  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  // The same builder the dashboard previews from: one description of what
  // leaves the building, so a preview is of the thing actually sent (§08).
  const { results, unreportable } = publishableResults(run);
  const missingAnnotation = unreportable.filter((entry) =>
    entry.reason.includes('no practitest annotation'),
  );

  console.log(
    `Run ${run.run.id} (${run.run.target}/${run.run.environment}): ` +
      `${run.tests.length} test(s), ${results.length} carrying a PractiTest id.`,
  );
  if (missingAnnotation.length > 0) {
    console.warn(
      `${missingAnnotation.length} spec(s) have no practitest annotation and will not be reported. ` +
        'They are also invisible in the coverage view (§18): ' +
        missingAnnotation.map((entry) => entry.title).join('; '),
    );
  }
  if (results.length === 0) return 0;

  if (process.env.PRACTITEST_DRY_RUN === 'true') {
    for (const record of run.tests.filter((test) => test.caseId)) {
      console.log(
        `  would post ${record.caseId} → ${resultStatusOf(record)} (${record.durationMs}ms)`,
      );
    }
    return 0;
  }

  const client = PractiTestClient.fromEnvironment();
  try {
    const outcome = await client.postRunResults(results, (message) => console.warn(`  ${message}`));
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
