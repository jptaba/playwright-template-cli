import type { RunResult, TestRecord } from '../reporters/run-result';
import { redact } from '../redact';
import { validateVerdict, TRIAGE_CATEGORIES, type FailureCluster, type TriageVerdict } from './types';

/**
 * Pass 3 — the model, on the remainder only (§20).
 *
 * The agent is advisory: it annotates the report, it never files and never
 * heals. Its output is validated on receipt, and a reply that cites no
 * evidence is rejected rather than displayed — that is what makes it
 * reviewable rather than merely confident-sounding.
 */

export interface TriageEvidence {
  clusterId: string;
  size: number;
  normalisedError: string;
  failingStep: string | null;
  precedingSteps: string[];
  affected: Array<{ caseId: string | null; title: string; kind: string; project: string }>;
  retryHistory: string;
  /** Breadth is itself evidence for an infrastructure cause. */
  otherFailuresInWindow: number;
  runContext: { target: string; environment: string; branch: string | null; commit: string | null };
  /**
   * The case's provenance — who authored it, which criterion it claims to
   * cover, and the criterion's text. This is what makes *case defect*
   * decidable rather than guessed at (§20).
   */
  caseProvenance?: Array<{
    caseId: string;
    authoredBy: string | null;
    coversAC: string[];
    acQuoted: string;
  }>;
}

export interface TriageAgent {
  readonly identity: string;
  classify(evidence: TriageEvidence): Promise<TriageVerdict>;
}

export const TRIAGE_SYSTEM_PROMPT = [
  'You triage automated test failures. You are given evidence about one cluster of failures',
  'that deterministic rules could not settle.',
  '',
  `Choose exactly one category from: ${TRIAGE_CATEGORIES.join(', ')}.`,
  '',
  'Rules:',
  '- Cite specific evidence for every claim. A verdict with no artifact reference is rejected.',
  '- Confidence is high, medium or low. Never a percentage — a percentage implies a calibration',
  '  you do not have.',
  '- "unclassified" with needsHumanReview true is a valid and often correct answer. An agent',
  '  that always produces a category will produce wrong categories.',
  '- You recommend; you never act. Filing a defect and healing a locator are both human-gated.',
  '- A failure where the application matches the quoted acceptance criterion and the assertion',
  '  does not is a case defect, not an application defect.',
].join('\n');

/** Evidence is scrubbed before it leaves the process (§17, §20). */
export function buildEvidence(
  cluster: FailureCluster,
  run: RunResult,
  tests: TestRecord[],
): TriageEvidence {
  const first = tests[0];
  const failingIndex = first?.steps.findIndex((step) => step.failed) ?? -1;

  return {
    clusterId: cluster.id,
    size: cluster.size,
    normalisedError: redact(first?.error?.message ?? 'no error message'),
    failingStep: failingIndex >= 0 ? redact(first!.steps[failingIndex]!.title) : null,
    precedingSteps:
      failingIndex > 0 ? first!.steps.slice(0, failingIndex).map((step) => redact(step.title)) : [],
    affected: tests.map((test) => ({
      caseId: test.caseId,
      title: redact(test.title),
      kind: test.kind,
      project: test.project,
    })),
    retryHistory: tests
      .map((test) => `${test.caseId ?? test.title}: ${test.retries} retry(ies), first ${test.firstRunStatus}`)
      .join('; '),
    otherFailuresInWindow: run.totals.failed - cluster.size,
    runContext: {
      target: run.run.target,
      environment: run.run.environment,
      branch: run.run.branch,
      commit: run.run.commit,
    },
  };
}

/**
 * Wraps any agent with the guardrails from §20: the reply is schema-checked,
 * and an invalid one degrades to `unclassified` + `needsHumanReview` rather
 * than being shown as if it were a verdict.
 */
export function guarded(agent: TriageAgent): TriageAgent {
  return {
    identity: agent.identity,
    async classify(evidence: TriageEvidence): Promise<TriageVerdict> {
      let candidate: TriageVerdict;
      try {
        candidate = await agent.classify(evidence);
      } catch (error) {
        return unclassified(evidence, [
          `the triage agent failed: ${error instanceof Error ? error.message : String(error)}`,
        ]);
      }

      // The cluster id is the wrapper's to assign, not the model's — asking a
      // model to echo an identifier is a way to get a mismatched one.
      const attributed: TriageVerdict = {
        ...candidate,
        clusterId: evidence.clusterId,
        source: 'agent',
      };

      const problems = validateVerdict(attributed);
      if (problems.length > 0) return unclassified(evidence, problems);
      return attributed;
    },
  };
}

function unclassified(evidence: TriageEvidence, problems: string[]): TriageVerdict {
  return {
    clusterId: evidence.clusterId,
    category: 'unclassified',
    confidence: 'low',
    summary: 'Not classified — routed to a person',
    evidence: [
      `${evidence.size} test(s) failed with: ${evidence.normalisedError.slice(0, 160)}`,
      ...problems.map((problem) => `agent output rejected: ${problem}`),
    ],
    affectedTests: evidence.affected.map((test) => test.caseId ?? test.title),
    recommendedAction: 'escalate',
    suggestedOwner: null,
    needsHumanReview: true,
    source: 'none',
  };
}
