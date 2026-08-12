import { clusterFailures } from './cluster';
import { classifyByRule, flakyVerdicts } from './rules';
import { agreementOf, latestVerdicts, type Agreement, type HumanVerdict } from './verdicts';
import type { FailureCluster, TriageVerdict } from './types';
import type { RunResult } from '../reporters/run-result';
import type { FlakeCandidate, QuarantineEntry } from '../quarantine';

/**
 * One run, triaged and put in front of a person — §20, §08 phase 5.
 *
 * The order is the design: cluster, then rules, then — only for what is left —
 * whatever judgement was recorded elsewhere. Forty tests failing on one
 * connection error is one incident, and a per-test view cannot see that, which
 * is why breadth is computed before anything is classified.
 *
 * This runs the first two passes in process. It does not run the model: §21
 * says measure how much clustering and rules resolve on their own before
 * adding one, and a page with a button that spends money on judgement nobody
 * asked for is how that measurement never gets taken. Agent verdicts made
 * deliberately by `npm run triage:agent` are read and shown.
 *
 * Pure. Everything it reads is passed in.
 */

export interface ClusterTest {
  id: string;
  title: string;
  caseId: string | null;
  error: string | null;
}

export interface ClusterView {
  id: string;
  size: number;
  summary: string;
  signature: string;
  tests: ClusterTest[];
  /** What the rules or the agent settled, or null when both declined. */
  verdict: TriageVerdict | null;
  /** What a person said, when they have said anything. */
  human: { category: string; note: string | null; by: string; at: string } | null;
  /** Null when there is nothing to compare — not false. */
  agreed: boolean | null;
}

export interface QuarantineView {
  /** Ranked by rate, not count: 1-in-3 matters more than two failures ever. */
  candidates: FlakeCandidate[];
  /** Runs available to compute a rate from. */
  runs: number;
  /** Below this, no rate is computed and none is shown. */
  minimumRuns: number;
  /** Already quarantined, with age — so a forgotten entry is visible. */
  quarantined: Array<QuarantineEntry & { ageDays: number; overdue: boolean }>;
}

export interface TriageReview {
  runId: string;
  target: string;
  finishedAt: string;
  clusters: ClusterView[];
  /** Decided by definition rather than inference: it passed on retry. */
  flaky: TriageVerdict[];
  stats: {
    failures: number;
    clusters: number;
    settledByRule: number;
    settledByAgent: number;
    declined: number;
    ruled: number;
  };
  agreement: Agreement;
  quarantine: QuarantineView;
}

export interface ReviewInput {
  run: RunResult;
  /** Verdicts from a `triage-result.json` written for this same run, if any. */
  existing?: readonly TriageVerdict[];
  human: readonly HumanVerdict[];
  quarantine: QuarantineView;
}

export function buildReview(input: ReviewInput): TriageReview {
  const { run } = input;
  const clusters = clusterFailures(run);
  const recorded = latestVerdicts(input.human);

  /*
     An agent verdict is only ever used for a cluster the rules declined. That
     is the CLI's order too, and it matters: a deterministic answer that cost
     nothing must never be overridden by a probabilistic one that did.
  */
  const fromAgent = new Map(
    (input.existing ?? [])
      .filter((verdict) => verdict.source === 'agent')
      .map((verdict) => [verdict.clusterId, verdict]),
  );

  const views = clusters.map((cluster) => view(cluster, run, fromAgent, recorded));

  return {
    runId: run.run.id,
    target: run.run.target,
    finishedAt: run.run.finishedAt,
    clusters: views,
    flaky: flakyVerdicts(run),
    stats: {
      failures: run.tests.filter((test) => test.outcome === 'unexpected').length,
      clusters: views.length,
      settledByRule: views.filter((entry) => entry.verdict?.source === 'rule').length,
      settledByAgent: views.filter((entry) => entry.verdict?.source === 'agent').length,
      declined: views.filter((entry) => entry.verdict === null).length,
      ruled: views.filter((entry) => entry.human !== null).length,
    },
    agreement: agreementOf(input.human),
    quarantine: input.quarantine,
  };
}

function view(
  cluster: FailureCluster,
  run: RunResult,
  fromAgent: Map<string, TriageVerdict>,
  recorded: Map<string, HumanVerdict>,
): ClusterView {
  const tests = run.tests.filter((test) => cluster.testIds.includes(test.id));
  const verdict = classifyByRule(cluster, { run, tests }) ?? fromAgent.get(cluster.id) ?? null;
  const human = recorded.get(`${run.run.id}:${cluster.id}`) ?? null;

  return {
    id: cluster.id,
    size: cluster.size,
    summary: cluster.summary,
    signature: cluster.signature,
    tests: tests.map((test) => ({
      id: test.id,
      title: test.title,
      caseId: test.caseId,
      error: test.error?.message ?? null,
    })),
    verdict,
    human: human
      ? { category: human.category, note: human.note, by: human.by, at: human.at }
      : null,
    agreed: human && verdict ? human.category === verdict.category : null,
  };
}
