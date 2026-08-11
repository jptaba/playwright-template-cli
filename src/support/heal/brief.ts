import type { RunResult, TestRecord } from '../reporters/run-result';
import type { TriageResult } from '../triage/types';

/**
 * The healing brief — §10, §22.
 *
 * "Auto-healing is the most dangerous capability here: a healer that 'fixes' a
 * test to match newly-broken behaviour destroys the test's reason for
 * existing."
 *
 * So nothing here edits a spec. It decides only *what may be offered to a
 * healer*, and everything else is escalated with the reason — which is the
 * decision that keeps a locator repair from quietly erasing a regression.
 */
export interface HealCandidate {
  caseId: string | null;
  title: string;
  file: string;
  failingStep: string | null;
  error: string;
  kind: 'locator' | 'timing';
}

export interface HealEscalation {
  caseId: string | null;
  title: string;
  reason: string;
}

export interface HealBrief {
  runId: string;
  target: string;
  generatedAt: string;
  candidates: HealCandidate[];
  escalations: HealEscalation[];
  constraints: string[];
}

const LOCATOR_SHAPED =
  /(locator|getBy\w+|strict mode violation|element is not|resolved to \d+ elements|waiting for locator|not visible|not attached)/i;
const TIMING_SHAPED = /(Timeout \d+ms|exceeded while waiting|navigation timeout|expect\.poll)/i;
const ASSERTION_SHAPED = /(toBe\b|toEqual|toHaveText|toMatchObject|toBeCloseTo|Expected .*received)/i;

export const HEAL_CONSTRAINTS = [
  'Locator and timing repairs only.',
  'Never change an assertion or an expected value.',
  'Label every healed test with what changed, so review is a diff read rather than an act of faith.',
  'Open a merge request. Never push to a protected branch, and never auto-merge.',
  'If the same locator is repaired more than once in a fortnight, file a defect instead — ' +
    'repeated drift in one place is a signal, not a chore.',
];

function triageForbidsHealing(triage: TriageResult | null, test: TestRecord): string | null {
  const cluster = triage?.clusters.find((entry) => entry.testIds.includes(test.id));
  if (!cluster) return null;
  const verdict = triage?.verdicts.find((entry) => entry.clusterId === cluster.id);
  if (!verdict || verdict.recommendedAction === 'heal') return null;
  return `triage classified this cluster as ${verdict.category} (${verdict.recommendedAction})`;
}

export function buildHealBrief(
  run: RunResult,
  triage: TriageResult | null = null,
  now = new Date(),
): HealBrief {
  const candidates: HealCandidate[] = [];
  const escalations: HealEscalation[] = [];

  for (const test of run.tests) {
    if (test.outcome !== 'unexpected' || !test.error) continue;
    const message = test.error.message;

    const blocked = triageForbidsHealing(triage, test);
    if (blocked) {
      escalations.push({ caseId: test.caseId, title: test.title, reason: blocked });
      continue;
    }

    // A changed assertion or expected value is escalated, never healed: if a
    // button's accessible name changed because someone broke the i18n bundle,
    // healing the locator hides a real defect and the suite goes green on a
    // broken build (§22).
    if (ASSERTION_SHAPED.test(message) && !LOCATOR_SHAPED.test(message)) {
      escalations.push({
        caseId: test.caseId,
        title: test.title,
        reason: 'the assertion or expected value differs — healing this would erase the coverage',
      });
      continue;
    }

    const kind = LOCATOR_SHAPED.test(message)
      ? ('locator' as const)
      : TIMING_SHAPED.test(message)
        ? ('timing' as const)
        : null;

    if (!kind) {
      escalations.push({
        caseId: test.caseId,
        title: test.title,
        reason: 'not a locator or timing failure',
      });
      continue;
    }

    candidates.push({
      caseId: test.caseId,
      title: test.title,
      file: test.file,
      failingStep: test.steps.find((step) => step.failed)?.title ?? null,
      error: message.split('\n')[0]!.slice(0, 300),
      kind,
    });
  }

  return {
    runId: run.run.id,
    target: run.run.target,
    generatedAt: now.toISOString(),
    candidates,
    escalations,
    constraints: HEAL_CONSTRAINTS,
  };
}
