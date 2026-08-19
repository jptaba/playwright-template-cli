#!/usr/bin/env tsx
import fs from 'node:fs';
import { RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { clusterFailures } from '../src/support/triage/cluster';
import { classifyByRule, flakyVerdicts } from '../src/support/triage/rules';
import { buildEvidence, guarded } from '../src/support/triage/agent';
import { AnthropicTriageAgent } from '../src/integrations/llm/triage-agent';
import { namesACause, TRIAGE_SCHEMA_VERSION, triageIsForRun, type TriageResult, type TriageVerdict } from '../src/support/triage/types';
import type { RunResult } from '../src/support/reporters/run-result';

/**
 * `npm run triage:cluster | triage:rules | triage:agent` — §20.
 *
 * The order is the whole design: cluster, then rules, then the model on the
 * remainder only. Each stage reads and rewrites `triage-result.json`, so the
 * pipeline can stop after any of them — and the first two need no API key,
 * no network, and no data leaving the building.
 */
type Stage = 'cluster' | 'rules' | 'agent';

function load<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null;
}

function save(result: TriageResult): void {
  fs.writeFileSync(TRIAGE_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

async function main(): Promise<number> {
  const stage = (process.argv
    .find((arg) => arg.startsWith('--stage='))
    ?.split('=')[1] ?? 'cluster') as Stage;

  const run = load<RunResult>(RUN_RESULT_PATH);
  if (!run) {
    console.warn('No run-result.json. Nothing to triage.');
    return 0;
  }

  let result =
    load<TriageResult>(TRIAGE_RESULT_PATH) ??
    ({
      schemaVersion: TRIAGE_SCHEMA_VERSION,
      runId: run.run.id,
      generatedAt: new Date().toISOString(),
      clusters: [],
      verdicts: [],
      stats: { failures: 0, clusters: 0, resolvedByRule: 0, sentToAgent: 0, needingHumanReview: 0 },
    } satisfies TriageResult);

  // A stale triage file from a previous run must not leak into this one.
  if (!triageIsForRun(result, run.run.id)) {
    result = {
      schemaVersion: TRIAGE_SCHEMA_VERSION,
      runId: run.run.id,
      generatedAt: new Date().toISOString(),
      clusters: [],
      verdicts: [],
      stats: { failures: 0, clusters: 0, resolvedByRule: 0, sentToAgent: 0, needingHumanReview: 0 },
    };
  }

  if (stage === 'cluster') {
    result.clusters = clusterFailures(run);
    result.verdicts = flakyVerdicts(run);
    result.stats.failures = run.totals.failed;
    result.stats.clusters = result.clusters.length;
    save(result);
    console.log(
      `${run.totals.failed} failure(s) → ${result.clusters.length} cluster(s). ` +
        'Triage the cluster once, not the tests individually.',
    );
    for (const cluster of result.clusters) {
      console.log(`  ${cluster.id}  ×${cluster.size}  ${cluster.summary}`);
    }
    return 0;
  }

  if (stage === 'rules') {
    const settled: TriageVerdict[] = result.verdicts.filter((verdict) => verdict.clusterId === 'flaky');
    for (const cluster of result.clusters) {
      const tests = run.tests.filter((test) => cluster.testIds.includes(test.id));
      const ruled = classifyByRule(cluster, { run, tests });
      if (ruled) {
        settled.push(ruled);
        cluster.category = ruled.category;
      }
    }
    result.verdicts = settled;
    /*
       A verdict that names no cause has not settled anything. Counting it as
       resolved would report a run as fully triaged while the one failure in it
       was still waiting for a person — which is the reporting half of the
       defect this rule set was just corrected for.
    */
    result.stats.resolvedByRule = settled.filter(
      (verdict) => verdict.clusterId !== 'flaky' && namesACause(verdict),
    ).length;
    save(result);

    const remaining = result.clusters.length - result.stats.resolvedByRule;
    console.log(
      `${result.stats.resolvedByRule} of ${result.clusters.length} cluster(s) settled ` +
        `deterministically. ${remaining} need judgement.`,
    );
    for (const verdict of settled) {
      console.log(`  [${verdict.category}] ${verdict.summary}  (rule: ${verdict.rule ?? 'n/a'})`);
    }
    return 0;
  }

  // stage === 'agent'
  // Same distinction as the count above: a cluster a rule recognised but could
  // not explain is exactly what the model is for, and its evidence travels
  // with it rather than being thrown away.
  const settledIds = new Set(
    result.verdicts.filter(namesACause).map((verdict) => verdict.clusterId),
  );
  const remaining = result.clusters.filter((cluster) => !settledIds.has(cluster.id));

  if (remaining.length === 0) {
    console.log('Every cluster was settled by rule. The model is not needed for this run.');
    save(result);
    return 0;
  }

  if (process.env.TRIAGE_AGENT_ENABLED !== 'true') {
    console.log(
      `${remaining.length} cluster(s) need judgement, but TRIAGE_AGENT_ENABLED is not 'true'.\n` +
        'Measure how much clustering and rules resolve alone before adding the model (§21), and ' +
        'get the data-handling terms reviewed first — traces carry application data (§17).',
    );
    for (const cluster of remaining) {
      console.log(`  unclassified  ×${cluster.size}  ${cluster.summary}`);
    }
    save(result);
    return 0;
  }

  const agent = guarded(new AnthropicTriageAgent());
  for (const cluster of remaining) {
    const tests = run.tests.filter((test) => cluster.testIds.includes(test.id));
    const verdict = await agent.classify(buildEvidence(cluster, run, tests));
    result.verdicts.push(verdict);
    cluster.category = verdict.category;
    console.log(
      `  [${verdict.category}] ${verdict.summary}  ` +
        `(${verdict.confidence} confidence${verdict.needsHumanReview ? ', needs review' : ''})`,
    );
  }

  result.stats.sentToAgent = remaining.length;
  result.stats.needingHumanReview = result.verdicts.filter((verdict) => verdict.needsHumanReview).length;
  save(result);

  console.log(
    '\nAdvisory only: the agent annotates the report. It never files a defect and never heals ' +
      '(§20). Record its category against the human verdict so agreement can be measured.',
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // Triage is allow_failure in the pipeline: it never blocks reporting.
    console.error(`Triage failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  },
);
