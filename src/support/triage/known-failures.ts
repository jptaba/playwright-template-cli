import type { TestRecord } from '../reporters/run-result';

/**
 * A narrower marker than `test.fail()` — open-items.md item 59.
 *
 * `test.fail()` inverts the *whole* test, so a spec that never reaches its own
 * assertion — because the application answered HTTP 500 two pages earlier,
 * which is exactly the shape a known application defect takes — is reported
 * as a pass. A known-failure marker that cannot tell "the defect is still
 * there" from "this stopped testing anything" is worse than no marker.
 *
 * So a spec states the error it expects to fail *with*, as a `known-failure`
 * annotation, and this module checks the failure actually matches it — the
 * same "state a fact in advance, measure it against what happened" shape
 * `triage-ground-truth` already proved for the triage rules.
 *
 * **A substring of the error text, not a triage category.** A category was
 * tried first and rejected: none of the rules in `rules.ts` key on a
 * hand-written business-logic assertion like "a bank accepted a negative
 * transfer" — they key on transport, timeout and auth text — so a rule-based
 * category is `null` for exactly the failures this exists to track, which
 * would report every confirmed known failure as having drifted. The message a
 * spec already writes into its own `expect()` call is the fact that actually
 * distinguishes "still the same defect" from "failing somewhere else now",
 * and it needs no triage pass to read.
 */
export const KNOWN_FAILURE_ANNOTATION = 'known-failure';

export type KnownFailureOutcome = 'confirmed' | 'drifted' | 'resolved';

export interface KnownFailureRow {
  testId: string;
  title: string;
  caseId: string | null;
  /** The substring the spec declared it expects its failure to contain. */
  expected: string;
  outcome: KnownFailureOutcome;
}

export interface KnownFailures {
  rows: KnownFailureRow[];
  /**
   * Declarations with nothing in them — reported rather than skipped, on the
   * same reasoning as `unknownCategories` in `agreement.ts`. A blank marker
   * confirms nothing and would otherwise read as an absent one, which is a
   * typo silently disabling the check it was meant to add.
   */
  malformed: Array<{ testId: string; title: string }>;
}

/**
 * Classify every test in a run that carries a `known-failure` annotation.
 *
 * Pure, and needs nothing beyond one run model — no clustering, no triage
 * result — because the fact being checked (does this failure contain the text
 * the spec declared) is already in the test record written to
 * `run-result.json`.
 */
export function classifyKnownFailures(tests: TestRecord[]): KnownFailures {
  const rows: KnownFailureRow[] = [];
  const malformed: KnownFailures['malformed'] = [];

  for (const test of tests) {
    const declared = test.annotations.find(
      (annotation) => annotation.type === KNOWN_FAILURE_ANNOTATION,
    )?.description;
    if (declared === undefined) continue;

    const expected = declared.trim();
    if (expected === '') {
      malformed.push({ testId: test.id, title: test.title });
      continue;
    }

    /*
       A test that did not fail is not confirming anything. That is good news
       rather than a fault — the defect it tracked may be fixed — so it is
       reported as resolved and fails nothing. It is the opposite of a
       ground-truth spec that passed, which really is a broken fixture.
    */
    const outcome: KnownFailureOutcome =
      test.outcome !== 'unexpected'
        ? 'resolved'
        : (test.error?.message ?? '').includes(expected)
          ? 'confirmed'
          : 'drifted';

    rows.push({ testId: test.id, title: test.title, caseId: test.caseId, expected, outcome });
  }

  return { rows, malformed };
}
