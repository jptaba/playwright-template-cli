/**
 * The triage contract — §20.
 *
 * "The most valuable component in this plan, and the one most likely to be
 * built wrong — because the obvious implementation is to hand every failure to
 * a model and ask what happened."
 *
 * Output is a strict JSON contract, validated on receipt: free-text findings
 * cannot be aggregated, filtered, or trended.
 */

/** The taxonomy. Each category routes somewhere different — that is the point. */
export const TRIAGE_CATEGORIES = [
  'application-defect',
  'locator-drift',
  'test-data',
  'network-infrastructure',
  'environment-config',
  'test-logic-defect',
  'contract-drift',
  'case-defect',
  'timing-synchronisation',
  'dependency',
  'flaky',
  'unclassified',
] as const;

export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

/** Three levels, never a percentage: a model's "92% confident" is not calibrated. */
export type Confidence = 'high' | 'medium' | 'low';

export type RecommendedAction =
  | 'file-defect'
  | 'heal'
  | 'fix-test'
  | 'fix-data'
  | 'escalate'
  | 'none';

/** Where a verdict came from. The report marks AI verdicts as distinct (§22). */
export type VerdictSource = 'rule' | 'agent' | 'none';

export interface TriageVerdict {
  clusterId: string;
  category: TriageCategory;
  confidence: Confidence;
  summary: string;
  /**
   * Every claim cites evidence. A verdict without a specific artifact
   * reference is rejected by the schema validator — that is what makes the
   * output reviewable rather than merely confident-sounding.
   */
  evidence: string[];
  affectedTests: string[];
  recommendedAction: RecommendedAction;
  suggestedOwner: string | null;
  /** A valid answer. An agent that always produces a category produces wrong ones. */
  needsHumanReview: boolean;
  source: VerdictSource;
  /** The rule that decided it, when source is 'rule'. */
  rule?: string;
}

export interface FailureCluster {
  id: string;
  /** Normalised error + failing step + time window — the clustering signature. */
  signature: string;
  summary: string;
  category: TriageCategory;
  testIds: string[];
  caseIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  /** Breadth is itself evidence for an infrastructure cause (§20). */
  size: number;
}

export interface TriageResult {
  schemaVersion: number;
  runId: string;
  generatedAt: string;
  clusters: FailureCluster[];
  verdicts: TriageVerdict[];
  stats: {
    failures: number;
    clusters: number;
    resolvedByRule: number;
    sentToAgent: number;
    needingHumanReview: number;
  };
}

export const TRIAGE_SCHEMA_VERSION = 1;

/**
 * Whether a triage result describes the run in front of you.
 *
 * `triage-result.json` is a fixed path, so what is sitting there is whatever
 * the last triage produced. Everything that reads it has to ask this, and the
 * report is the one that hurts: the first green run after a red one rendered
 * "All passed" above four failures and a network-infrastructure verdict
 * belonging to a different run. Every figure on that page is supposed to come
 * from one run.
 */
export function triageIsForRun(triage: { runId: string } | null | undefined, runId: string): boolean {
  return Boolean(triage) && triage!.runId === runId;
}

/**
 * Validates an agent's reply before it is allowed anywhere near a report.
 * @returns the problems found, empty when the verdict is acceptable.
 */
export function validateVerdict(candidate: unknown): string[] {
  const problems: string[] = [];
  if (typeof candidate !== 'object' || candidate === null) return ['verdict is not an object'];
  const verdict = candidate as Partial<TriageVerdict>;

  if (!verdict.clusterId) problems.push('clusterId is missing');
  if (!verdict.category || !TRIAGE_CATEGORIES.includes(verdict.category)) {
    problems.push(`category must be one of: ${TRIAGE_CATEGORIES.join(', ')}`);
  }
  if (!['high', 'medium', 'low'].includes(String(verdict.confidence))) {
    problems.push('confidence must be high, medium or low — never a percentage');
  }
  if (!verdict.summary || verdict.summary.trim().length < 10) {
    problems.push('summary is missing or too short to be useful');
  }
  if (!Array.isArray(verdict.evidence) || verdict.evidence.length === 0) {
    problems.push('evidence is required: a verdict without a cited artifact is not reviewable');
  }
  if (!Array.isArray(verdict.affectedTests) || verdict.affectedTests.length === 0) {
    problems.push('affectedTests is required');
  }
  if (
    !verdict.recommendedAction ||
    !['file-defect', 'heal', 'fix-test', 'fix-data', 'escalate', 'none'].includes(
      verdict.recommendedAction,
    )
  ) {
    problems.push('recommendedAction is missing or not one of the permitted actions');
  }
  if (typeof verdict.needsHumanReview !== 'boolean') {
    problems.push('needsHumanReview must be stated explicitly');
  }
  return problems;
}

/**
 * Whether a verdict actually names a cause.
 *
 * `unclassified` is a real and useful answer — a rule may recognise *what*
 * happened and still be unable to say *why*, which is what the `sign-in-setup-failed`
 * rule does. But it is not a settled cluster: the count must not report it as
 * resolved, and the model must still be asked about it, or a rule that
 * declines would silently take the cluster out of triage altogether.
 *
 * One definition because three places ask the question — the rules stage's
 * count, the agent stage's work list, and the agreement measurement, which has
 * always scored `unclassified` as a decline.
 */
export function namesACause(verdict: Pick<TriageVerdict, 'category'>): boolean {
  return verdict.category !== 'unclassified';
}
