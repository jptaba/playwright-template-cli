import type { TestCase } from './schema';

/**
 * The quality gate — §10.
 *
 * "'Automatically create scripts just by looking at test cases' holds only for
 * cases that are actually specific. A case reading *'Verify the report is
 * correct'* cannot be automated by a human either."
 *
 * Each check names the gap rather than returning a score, because the output
 * is routed back to a case author who has to fix something specific. Expect
 * this to reject a meaningful share of an existing legacy suite on first run —
 * that is the system working.
 */

export interface GateFinding {
  check: string;
  severity: 'blocker' | 'warning';
  detail: string;
  /** What the author has to do, stated as an action. */
  remedy: string;
}

export interface GateResult {
  caseId: string;
  title: string;
  passed: boolean;
  score: number;
  findings: GateFinding[];
}

/** Words that promise a check without saying what would fail it. */
const VAGUE_TERMS =
  /\b(correct|correctly|properly|as expected|appropriate|appropriately|valid|works|working|fine|ok|successful(ly)?|reasonable|good)\b/i;

/** A concrete expectation names a value, a state, or an exact message. */
const CONCRETE_SIGNAL =
  /(\d|"|'|=|<|>|£|\$|€|%|\bequals?\b|\bcontains?\b|\bdisplays?\b|\bshows?\b|\bis (shown|listed|rejected|accepted|disabled|enabled|visible|hidden)\b)/i;

export function gateCase(testCase: TestCase): GateResult {
  const findings: GateFinding[] = [];

  const add = (
    check: string,
    severity: GateFinding['severity'],
    detail: string,
    remedy: string,
  ): void => {
    findings.push({ check, severity, detail, remedy });
  };

  // 1. A defined starting state.
  if (testCase.preconditions.length === 0) {
    add(
      'preconditions',
      'blocker',
      'no preconditions, so the starting state is undefined',
      'state what must be true before step 1 — which account, what data, what screen',
    );
  }

  // 2. Steps that say what to do.
  if (testCase.steps.length === 0) {
    add('steps', 'blocker', 'no steps', 'write the steps a manual tester would follow');
  }

  testCase.steps.forEach((step, index) => {
    if (VAGUE_TERMS.test(step.expected) && !CONCRETE_SIGNAL.test(step.expected)) {
      add(
        'vague-expectation',
        'blocker',
        `step ${index + 1} expects "${step.expected}", which does not say what would fail`,
        'name the value, the message or the state that proves the step worked',
      );
    }
    if (step.action.trim().split(/\s+/).length < 3) {
      add(
        'thin-step',
        'warning',
        `step ${index + 1} action is "${step.action}"`,
        'say what is being acted on, not just the verb',
      );
    }
  });

  // 3. An explicit expected result.
  if (testCase.assertions.length === 0) {
    add(
      'assertions',
      'blocker',
      'no assertions, so there is nothing to check',
      'state what must be true at the end for this case to have passed',
    );
  }
  testCase.assertions.forEach((assertion, index) => {
    if (VAGUE_TERMS.test(assertion) && !CONCRETE_SIGNAL.test(assertion)) {
      add(
        'vague-assertion',
        'blocker',
        `assertion ${index + 1} reads "${assertion}"`,
        'replace it with a checkable statement — a number, a message, a state',
      );
    }
  });

  // 4. Concrete input data somewhere in the case.
  const allText = [
    ...testCase.preconditions,
    ...testCase.steps.flatMap((step) => [step.action, step.expected]),
    ...testCase.assertions,
  ].join(' ');
  if (!CONCRETE_SIGNAL.test(allText)) {
    add(
      'input-data',
      'blocker',
      'the case names no concrete data anywhere',
      'give at least one real input — an amount, a name, a status, a count',
    );
  }

  // 5. Traceability. A case with no cited criterion is speculative: valuable
  //    sometimes, but it must never enter the test management system
  //    unexamined (§09, §22).
  if (testCase.coversAC.length === 0 || !testCase.acQuoted.trim()) {
    add(
      'coverage',
      testCase.source.type === 'jira-story' ? 'blocker' : 'warning',
      'no acceptance criterion is cited and quoted',
      'add coversAC and the criterion verbatim in acQuoted, or mark the case speculative',
    );
  }

  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  const score = Math.max(0, Math.round(100 - blockers.length * 25 - (findings.length - blockers.length) * 5));

  return {
    caseId: testCase.id ?? testCase.source.key,
    title: testCase.title,
    passed: blockers.length === 0,
    score,
    findings,
  };
}

/**
 * Track A rejections can loop straight back to the case author with the gap
 * named — but only once. "A model that keeps rewriting a case until it
 * satisfies a specificity checker will eventually satisfy it by inventing the
 * missing specifics" (§10).
 */
export const MAX_AUTOMATED_GATE_RETRIES = 1;

export function shouldEscalateToHuman(attempt: number): boolean {
  return attempt > MAX_AUTOMATED_GATE_RETRIES;
}
