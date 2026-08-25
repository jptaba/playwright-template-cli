import type { TestCase } from './schema';
import type { SpecFinding, Vocabulary } from './spec-author';

/**
 * Pre-flight: does this spec actually implement *this* case?
 *
 * Assertion coverage was never the whole question. A spec can prove every
 * assertion the case ends with and still not be the case: it can start from a
 * state the case never described, or take a different route to the same
 * endpoint. Both pass. Both are traceable to a case id. Neither is the test
 * somebody wrote.
 *
 * So three things are checked here, and they are the three halves of "ties up
 * to the case" that `spec-author.ts` alone does not ask about:
 *
 *  1. **Preconditions are accounted for, one by one.** Not "did the spec
 *     probably arrange this" — the draft says *how* each one is met, and the
 *     claim is checked against what the draft actually does.
 *  2. **The journey is the journey.** Every step maps to a call, and the calls
 *     happen in the order the steps describe. A route that visits the same
 *     places in a different order is a different test.
 *  3. **Data the spec did not create is named as such.** §"State the suite does
 *     not own" is explicit that asserting on data somebody else made passes
 *     until it does not, for reasons unrelated to the test. A precondition
 *     satisfied by assumption is exactly that, so it is surfaced rather than
 *     left implicit.
 *
 * As everywhere else here, the model states its intent in a structured field
 * and the intent is verified against the artifact. A model cannot be trusted to
 * enforce its own claims — `authorCases` established that and it has not
 * stopped being true one hop later.
 */

/** How one precondition is met. */
export type PreconditionHow =
  /** A fixture supplies it — `authedPage` is "a user is signed in". */
  | 'fixture'
  /** The spec creates it before the journey — the safe answer. */
  | 'established'
  /** It is taken on trust from the environment. Real, and a smell. */
  | 'assumed'
  /** The pack cannot arrange it at all. */
  | 'unsatisfiable';

export interface PreconditionPlan {
  /** 1-based index into the case's `preconditions`. */
  precondition: number;
  how: PreconditionHow;
  /**
   * The fixture that supplies it, or the verb that establishes it. Required
   * for `fixture` and `established`, because those are the two claims that can
   * be checked — and a claim nobody can check is a sentence, not a guarantee.
   */
  by?: string;
  /** Why, for `assumed` and `unsatisfiable`, where there is nothing to check. */
  note?: string;
}

export interface StepMapping {
  /** 1-based index into the case's `steps`. */
  step: number;
  /** The catalog verbs that carry this step out, in order. */
  calls: string[];
}

/** What a draft did, however it was written. Both shapes reduce to this. */
export interface DraftFacts {
  fixtures: string[];
  /**
   * Verbs in call order, duplicates kept.
   *
   * Order and repetition both matter: a journey is a sequence, and "add, then
   * add again" is the whole of this repository's duplicate-username case.
   */
  verbs: string[];
  /**
   * The subset the *journey* performs — setup and steps, never arrangement.
   *
   * The journey check matches greedily against this rather than against
   * everything the spec does, because a seed sharing a verb with a step would
   * otherwise satisfy it: the call happened, in the right order, and the
   * journey still never performed the step. Optional, and falls back to
   * `verbs`, because the free-TypeScript shape has no structural seed block to
   * separate out.
   */
  journeyVerbs?: string[];
}

/** The plan a draft must carry alongside its body, whichever shape it is. */
export interface SpecPlan {
  preconditions: PreconditionPlan[];
  journey: StepMapping[];
}

function finding(
  check: string,
  severity: SpecFinding['severity'],
  detail: string,
  remedy: string,
): SpecFinding {
  return { check, severity, detail, remedy };
}

export function verifyPreconditions(
  plan: PreconditionPlan[] | undefined,
  testCase: TestCase,
  facts: DraftFacts,
  vocabulary: Vocabulary,
): SpecFinding[] {
  const findings: SpecFinding[] = [];

  if (!plan) {
    return [
      finding(
        'preconditions-unplanned',
        'blocker',
        'the draft says nothing about how the case\'s preconditions are met',
        'account for each precondition: a fixture, a verb that establishes it, or say it is assumed',
      ),
    ];
  }

  const planned = new Set(plan.map((entry) => entry.precondition));
  testCase.preconditions.forEach((text, index) => {
    if (!planned.has(index + 1)) {
      findings.push(
        finding(
          'precondition-unplanned',
          'blocker',
          `nothing accounts for precondition ${index + 1}: "${text}"`,
          'say how the spec meets it, or that it is assumed and why',
        ),
      );
    }
  });

  const fixtures = new Set(facts.fixtures);
  const called = new Set(facts.verbs);

  for (const entry of plan) {
    const text = testCase.preconditions[entry.precondition - 1];
    if (!text) {
      findings.push(
        finding(
          'precondition-out-of-range',
          'blocker',
          `the plan names precondition ${entry.precondition}, and the case has ` +
            `${testCase.preconditions.length}`,
          'account for a precondition the case actually states',
        ),
      );
      continue;
    }

    switch (entry.how) {
      case 'fixture': {
        if (!entry.by) {
          findings.push(
            finding(
              'precondition-unattributed',
              'blocker',
              `precondition ${entry.precondition} claims a fixture supplies it, and names none`,
              'name the fixture, so the claim can be checked',
            ),
          );
          break;
        }
        if (!vocabulary.fixtures.includes(entry.by)) {
          findings.push(
            finding(
              'precondition-unknown-fixture',
              'blocker',
              `precondition ${entry.precondition} names fixture "${entry.by}", which ` +
                `${vocabulary.target} does not expose`,
              'name a fixture from the catalog',
            ),
          );
          break;
        }
        if (!fixtures.has(entry.by)) {
          findings.push(
            finding(
              'precondition-fixture-unused',
              'blocker',
              `precondition ${entry.precondition} says "${entry.by}" supplies it, but the spec ` +
                'does not take that fixture',
              `destructure ${entry.by}, or account for the precondition another way`,
            ),
          );
        }
        break;
      }

      case 'established': {
        if (!entry.by) {
          findings.push(
            finding(
              'precondition-unattributed',
              'blocker',
              `precondition ${entry.precondition} claims the spec establishes it, and names no verb`,
              'name the verb that establishes it, so the claim can be checked',
            ),
          );
          break;
        }
        if (!called.has(entry.by)) {
          findings.push(
            finding(
              'precondition-not-established',
              'blocker',
              `precondition ${entry.precondition} says ${entry.by}() establishes it, and the spec ` +
                'never calls it',
              'call it, or say the precondition is assumed and why that is acceptable',
            ),
          );
        }
        break;
      }

      case 'assumed': {
        /*
           A warning rather than a blocker, deliberately. Some preconditions
           genuinely are environmental — an application being deployed, a
           feature flag being on — and refusing them outright would push people
           to write `established` and mean nothing by it.

           But it is never silent. §"State the suite does not own" is explicit:
           "the seeded customer has order history" passes until the account
           behind the role changes, and then fails for a reason unrelated to
           what it tests. A reviewer should see every one of these.
        */
        findings.push(
          finding(
            'precondition-assumed',
            'warning',
            `precondition ${entry.precondition} is taken on trust: "${text}"` +
              (entry.note ? ` — ${entry.note}` : ''),
            'create what the spec asserts about where you can; a shared demo changes underneath you',
          ),
        );
        break;
      }

      case 'unsatisfiable': {
        findings.push(
          finding(
            'precondition-unsatisfiable',
            'blocker',
            `precondition ${entry.precondition} cannot be arranged with this pack: "${text}"` +
              (entry.note ? ` — ${entry.note}` : ''),
            'return needs-vocabulary naming the verb that would arrange it, rather than a spec ' +
              'that starts from the wrong state',
          ),
        );
        break;
      }
    }
  }

  return findings;
}

export function verifyJourney(
  journey: StepMapping[] | undefined,
  testCase: TestCase,
  facts: DraftFacts,
): SpecFinding[] {
  const findings: SpecFinding[] = [];

  if (!journey) {
    return [
      finding(
        'journey-unmapped',
        'blocker',
        'the draft says nothing about which calls carry out the case\'s steps',
        'map each step to the verbs that perform it',
      ),
    ];
  }

  // The journey is judged against what the journey does, not against the
  // arrangement that preceded it. See `DraftFacts.journeyVerbs`.
  const performed = facts.journeyVerbs ?? facts.verbs;
  const mapped = new Map(journey.map((entry) => [entry.step, entry]));
  testCase.steps.forEach((step, index) => {
    if (!mapped.has(index + 1)) {
      findings.push(
        finding(
          'step-unmapped',
          'blocker',
          `nothing carries out step ${index + 1}: "${step.action}"`,
          'map it to the verb that performs it, or drop the step from the case',
        ),
      );
    }
  });

  for (const entry of journey) {
    if (!testCase.steps[entry.step - 1]) {
      findings.push(
        finding(
          'step-out-of-range',
          'blocker',
          `the journey names step ${entry.step}, and the case has ${testCase.steps.length}`,
          'map a step the case actually contains',
        ),
      );
      continue;
    }
    if (entry.calls.length === 0) {
      findings.push(
        finding(
          'step-no-calls',
          'blocker',
          `step ${entry.step} is mapped to no calls at all`,
          'name the verb that performs it',
        ),
      );
    }
    for (const call of entry.calls) {
      if (!performed.includes(call)) {
        findings.push(
          finding(
            'step-cites-uncalled-verb',
            'blocker',
            `step ${entry.step} says ${call}() carries it out, and the spec never calls it`,
            'call it, or map the step to the verb that actually performs it',
          ),
        );
      }
    }
  }

  /*
     And the order, which is the check with no analogue anywhere else here.

     Matched greedily against the call sequence: each step must find one of its
     verbs at or after the position the previous step reached. A spec that makes
     every call the case lists, in a different order, is not the journey the
     case describes — it is a different test that happens to touch the same
     verbs, and every other check in this file would pass it.
  */
  const ordered = [...journey].sort((a, b) => a.step - b.step);
  let cursor = 0;
  for (const entry of ordered) {
    if (entry.calls.length === 0) continue;
    const at = performed.findIndex(
      (verb, index) => index >= cursor && entry.calls.includes(verb),
    );
    if (at === -1) {
      // Already reported as uncalled if it is nowhere; only order is news here.
      if (entry.calls.some((call) => performed.includes(call))) {
        findings.push(
          finding(
            'journey-out-of-order',
            'blocker',
            `step ${entry.step} happens before the step that should precede it`,
            'put the calls in the order the case describes, or correct the case',
          ),
        );
      }
      continue;
    }
    cursor = at;
  }

  return findings;
}

/** Both checks, which is what "ties up to the case" means in one call. */
export function verifyPreflight(
  plan: Partial<SpecPlan> | undefined,
  testCase: TestCase,
  facts: DraftFacts,
  vocabulary: Vocabulary,
): SpecFinding[] {
  return [
    ...verifyPreconditions(plan?.preconditions, testCase, facts, vocabulary),
    ...verifyJourney(plan?.journey, testCase, facts),
  ];
}

/**
 * The plan, rendered into the spec's own doc comment.
 *
 * A generated spec should show its work. A reviewer holding the case beside the
 * file should not have to infer which line arranges precondition 2 — and the
 * `assumed` entries are exactly what a reviewer most needs to see, because
 * those are the ones that will fail six months from now for a reason nobody
 * connects to this file.
 */
export function renderPlanComment(testCase: TestCase, plan: Partial<SpecPlan>): string[] {
  const lines: string[] = [];

  if (plan.preconditions?.length) {
    lines.push(' * Preconditions, and how this spec meets them:');
    for (const entry of [...plan.preconditions].sort((a, b) => a.precondition - b.precondition)) {
      const text = testCase.preconditions[entry.precondition - 1] ?? '(unknown)';
      const how =
        entry.how === 'fixture'
          ? `fixture ${entry.by}`
          : entry.how === 'established'
            ? `established by ${entry.by}()`
            : entry.how === 'assumed'
              ? `ASSUMED${entry.note ? ` — ${entry.note}` : ''}`
              : 'UNSATISFIABLE';
      lines.push(` *   ${entry.precondition}. ${text} — ${how}`);
    }
    lines.push(' *');
  }

  if (plan.journey?.length) {
    lines.push(' * The journey, step by step from the case:');
    for (const entry of [...plan.journey].sort((a, b) => a.step - b.step)) {
      const step = testCase.steps[entry.step - 1];
      lines.push(` *   ${entry.step}. ${step?.action ?? '(unknown)'} — ${entry.calls.join(', ')}`);
    }
    lines.push(' *');
  }

  // The separator after the final section belongs to whatever follows it, and
  // what follows is the comment's closing line. Left on, it renders as `* */`.
  while (lines.at(-1) === ' *') lines.pop();
  return lines;
}
