import type { RunResult } from '../reporters/run-result';
import { namesACause, TRIAGE_CATEGORIES, type TriageCategory, type TriageResult } from './types';

/**
 * Agreement between what triage settled and what the fixture said was true —
 * §20's "record the category against the human verdict so agreement can be
 * measured", made repeatable.
 *
 * The expected category is read from a `triage-ground-truth` annotation on the
 * spec, not from anything a target exports. That matters: framework code may
 * not import a target pack, and annotations already travel into
 * `run-result.json` verbatim, so any target that grows a fixture is measured by
 * the same command with no framework change.
 */
export const GROUND_TRUTH_ANNOTATION = 'triage-ground-truth';

/**
 * `declined` is not a failure. A rule that refuses a genuine judgement call is
 * behaving correctly — the model exists for those. `contradicted` is the only
 * outcome that says a rule is wrong.
 */
export type AgreementOutcome = 'agreed' | 'contradicted' | 'declined' | 'not-reproduced';

export interface AgreementRow {
  testId: string;
  title: string;
  expected: TriageCategory;
  settled: TriageCategory | null;
  rule: string | null;
  outcome: AgreementOutcome;
}

export interface Agreement {
  rows: AgreementRow[];
  totals: Record<AgreementOutcome, number>;
  /** Annotations naming a category the taxonomy does not have — a typo, not a result. */
  unknownCategories: Array<{ testId: string; category: string }>;
}

function isCategory(value: string): value is TriageCategory {
  return (TRIAGE_CATEGORIES as readonly string[]).includes(value);
}

export function measureAgreement(run: RunResult, triage: TriageResult): Agreement {
  const rows: AgreementRow[] = [];
  const unknownCategories: Agreement['unknownCategories'] = [];

  for (const test of run.tests) {
    const declared = test.annotations.find(
      (annotation) => annotation.type === GROUND_TRUTH_ANNOTATION,
    )?.description;
    if (!declared) continue;
    if (!isCategory(declared)) {
      unknownCategories.push({ testId: test.id, category: declared });
      continue;
    }

    const cluster = triage.clusters.find((candidate) => candidate.testIds.includes(test.id));
    const verdict = cluster
      ? triage.verdicts.find((candidate) => candidate.clusterId === cluster.id)
      : undefined;
    const settled = verdict && namesACause(verdict) ? verdict.category : null;

    rows.push({
      testId: test.id,
      title: test.title,
      expected: declared,
      settled,
      rule: verdict?.rule ?? null,
      // A spec that was supposed to fail and did not measures nothing: the
      // fixture stopped reproducing its own cause, which is its own bug.
      outcome:
        test.outcome !== 'unexpected'
          ? 'not-reproduced'
          : settled === null
            ? 'declined'
            : settled === declared
              ? 'agreed'
              : 'contradicted',
    });
  }

  const totals: Record<AgreementOutcome, number> = {
    agreed: 0,
    contradicted: 0,
    declined: 0,
    'not-reproduced': 0,
  };
  for (const row of rows) totals[row.outcome]++;

  return { rows, totals, unknownCategories };
}
