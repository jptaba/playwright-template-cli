#!/usr/bin/env tsx
import fs from 'node:fs';
import { RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { JiraClient, defectFingerprint } from '../src/integrations/jira/client';
import type { RunResult, TestRecord } from '../src/support/reporters/run-result';
import type { TriageResult } from '../src/support/triage/types';

/**
 * `npm run publish:jira` — §15, §20.
 *
 * **Off by default and enabled per pipeline.** "An automated defect filer
 * pointed at a broken environment can create hundreds of tickets in one
 * night." It also files per *cluster*, never per test: forty tests failing on
 * one incident is one problem, not forty.
 */
const AUTOFILE = process.env.JIRA_AUTOFILE === 'true';
const PROJECT_KEY = process.env.JIRA_DEFECT_PROJECT ?? '';

function loadTriage(): TriageResult | null {
  if (!fs.existsSync(TRIAGE_RESULT_PATH)) return null;
  return JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult;
}

function describe(cluster: { summary: string; category: string; tests: TestRecord[] }): string {
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

async function main(): Promise<number> {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn('No run-result.json. Nothing to file.');
    return 0;
  }
  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  const triage = loadTriage();

  const failures = run.tests.filter((record) => record.outcome === 'unexpected');
  if (failures.length === 0) {
    console.log('No failures. Nothing to file.');
    return 0;
  }

  // Cluster from the triage result when there is one; otherwise fall back to
  // one cluster per distinct fingerprint so this never files per test.
  const clusters =
    triage?.clusters.map((cluster) => ({
      summary: cluster.summary,
      category: cluster.category,
      fingerprint: cluster.id,
      tests: failures.filter((record) => cluster.testIds.includes(record.id)),
    })) ??
    groupByFingerprint(failures);

  console.log(
    `${failures.length} failure(s) in ${clusters.length} cluster(s). ` +
      `Autofile is ${AUTOFILE ? 'ON' : 'OFF'}.`,
  );

  if (!AUTOFILE) {
    for (const cluster of clusters) {
      console.log(`  would file: [${cluster.category}] ${cluster.summary} (${cluster.tests.length} test(s))`);
    }
    console.log(
      '\nSet JIRA_AUTOFILE=true to file for real. Keep it off until the triage agreement rate ' +
        'has been measured for several weeks (§20).',
    );
    return 0;
  }

  if (!PROJECT_KEY) {
    console.error('JIRA_DEFECT_PROJECT is not set, so there is nowhere to file. Nothing filed.');
    return 0;
  }

  const client = JiraClient.fromEnvironment();
  try {
    for (const cluster of clusters) {
      if (cluster.tests.length === 0) continue;
      const existing = await client.findDefectByFingerprint(PROJECT_KEY, cluster.fingerprint);

      if (existing && !existing.resolved) {
        // One ticket with a failure count, not forty tickets (§15).
        await client.comment(
          existing.key,
          `Failed again in run ${run.run.id} (${run.run.environment}), ${cluster.tests.length} test(s).`,
        );
        console.log(`  updated ${existing.key}`);
        continue;
      }

      if (existing?.resolved) {
        const applied = await client.transitionByName(existing.key, ['Reopen Issue', 'Reopen', 'Back to Open']);
        await client.comment(
          existing.key,
          `Reopened by run ${run.run.id}: this failure signature returned.` +
            (applied ? '' : ' (No reopen transition available in this workflow — please triage.)'),
        );
        console.log(`  reopened ${existing.key}${applied ? '' : ' (comment only)'}`);
        continue;
      }

      const key = await client.createDefect({
        projectKey: PROJECT_KEY,
        summary: `[${cluster.category}] ${cluster.summary}`.slice(0, 200),
        description: describe(cluster),
        fingerprint: cluster.fingerprint,
        labels: [`env-${run.run.environment}`, `target-${run.run.target}`],
      });
      console.log(`  created ${key}`);
    }
  } catch (error) {
    console.error(
      `Jira reporting failed: ${error instanceof Error ? error.message : String(error)}\n` +
        'Degrading to a warning — reporting never turns a green suite red (§01).',
    );
  } finally {
    await client.dispose();
  }

  return 0;
}

function groupByFingerprint(failures: TestRecord[]): Array<{
  summary: string;
  category: string;
  fingerprint: string;
  tests: TestRecord[];
}> {
  const groups = new Map<string, TestRecord[]>();
  for (const record of failures) {
    const fingerprint = defectFingerprint(record.title, record.error?.message ?? '');
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), record]);
  }
  return [...groups.entries()].map(([fingerprint, tests]) => ({
    fingerprint,
    category: 'untriaged',
    summary: (tests[0]?.error?.message ?? tests[0]?.title ?? 'Failure').split('\n')[0]!.slice(0, 120),
    tests,
  }));
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Unexpected filer failure: ${String(error)}`);
    process.exit(0);
  },
);
