import type { TriageCategory, TriageVerdict } from '../triage/types';
import type { TestCase } from './schema';
import type { SpecDraft, SpecFinding, Vocabulary } from './spec-author';

/**
 * Phase 3: run the spec, triage the failure, repair it — and never once let the
 * repair change what the spec claims.
 *
 * The loop the owner asked for: *"run it, look at its output, triage it, the
 * circle back again until the playwright test script is robust enough."* It is
 * also the single most dangerous thing in this programme, because the naive
 * implementation — feed the failure to a model and ask for a fix — converges on
 * a green test rather than a correct one. Left alone it will eventually "repair"
 * a real defect into silence, which §"A defect in the application is a failure,
 * and it stays one" forbids outright.
 *
 * Two mechanisms contain it, and both are enforced here rather than requested
 * in a prompt:
 *
 *  1. **The triage category decides whether a repair is permitted at all.**
 *     `application-defect` stops the loop and produces a finding. The taxonomy
 *     already routes every category somewhere; this is that routing applied to
 *     one more consumer.
 *  2. **The claims are frozen.** A repaired draft is compared against the one it
 *     replaces, and any change to what is asserted is refused — not discouraged,
 *     refused. So the model may fix a wait, a precondition or a wrong verb, and
 *     *cannot* fix a failing assertion by making it agree with the application,
 *     which is the only repair that would be catastrophic.
 *
 * The model sees the triage verdict and the error the run produced. It does not
 * see the page, the DOM, a screenshot, or the application's current values as
 * something to write new assertions from — `author.ts:78-88`, still binding.
 *
 * ## Hardening triage and production triage are the same evidence, different question
 *
 * They deliberately **share every mechanism and answer to different intents**,
 * and conflating the two is the easiest mistake to make here because the input
 * is byte-identical.
 *
 * | | Production triage | Hardening triage (this module) |
 * |---|---|---|
 * | Asks | *what broke, and who owns it?* | *is this spec finished yet?* |
 * | A failure is | unexpected — a red build | expected — a normal step in authoring |
 * | Audience | a team, the report, PractiTest, Teams | the repair loop, then one reviewer |
 * | Routed by | `RecommendedAction` — file-defect, heal, fix-test | `RepairAct` — repair, retry, stop |
 *
 * The clustering, the rules and the taxonomy are shared outright:
 * `clusterFailures` and `classifyByRule` are called unchanged, and a category
 * means exactly what it means everywhere else. What differs is only the policy
 * applied to the verdict afterwards — which is why this module contains a table
 * and no rules of its own. A second copy of the rules, tuned for authoring,
 * would drift from the ones a run is judged by, and then a spec would be
 * hardened against a different idea of what a failure is than the suite it is
 * about to join.
 *
 * The clearest illustration is `application-defect`. In production it means
 * *file a defect, tell the team, the build is red*. In hardening it means
 * **the spec is finished and it works** — it caught a real defect on its first
 * outing. That is a success of authoring, not a failure of it, and the right
 * end state is a spec committed with a declared `known-failure` annotation
 * saying what the failure should contain (§"A defect in the application is a
 * failure, and it stays one"). Same verdict, opposite conclusions.
 */

/** What the loop may do about one failure. */
export type RepairAct = 'repair' | 'retry' | 'stop';

export interface RepairDisposition {
  act: RepairAct;
  /** Stated in the transcript, so a reviewer sees why the loop did what it did. */
  why: string;
  /**
   * Whether stopping means "this is a real finding about the application",
   * as opposed to "a person needs to look at this".
   *
   * The distinction matters at the end of the loop: a finding is reported as a
   * defect the suite has correctly caught, and is a *success* of the process.
   * An escalation is the loop admitting it cannot decide.
   */
  finding?: boolean;
}

/**
 * The **hardening** policy, by category.
 *
 * Not a second triage — the verdict arriving here was produced by the same
 * `classifyByRule` a run uses. This is only the answer to the authoring
 * question ("is this spec finished yet?") laid over it, and it is a table
 * rather than logic precisely so that it cannot quietly become a rival
 * classifier. See the module comment for why the two intents are separate.
 *
 * Every entry is a decision about who owns the failure, and the reasoning is
 * kept because it is exactly the sort of table that gets "simplified" later by
 * somebody who reads only the categories:
 *
 * - **`application-defect`** — the suite worked. Repairing it is the failure
 *   mode this whole module exists to prevent.
 * - **`contract-drift`** — a service no longer matches its published document.
 *   That is a finding about the provider, not a spec to adjust.
 * - **`case-defect`** — the *case* is wrong, so re-drafting from it produces the
 *   same spec again. The loop cannot fix its own oracle and must not try.
 * - **`network-infrastructure`, `dependency`, `flaky`** — nothing about the
 *   spec is wrong, so a repair would be a change made for no reason. Retry.
 * - **`locator-drift`, `test-data`, `test-logic-defect`,
 *   `timing-synchronisation`** — the four causes that genuinely live in the
 *   spec and the pack. This is what the loop is for.
 * - **`environment-config`** — the deployment is misconfigured. Not the spec's
 *   to fix, and quietly working around it hides a real problem.
 * - **`unclassified`** — no rule matched. `namesACause` treats this as
 *   undecided everywhere else, and a loop that repaired on an undecided verdict
 *   would be guessing with write access.
 */
const HARDENING_DISPOSITIONS: Record<TriageCategory, RepairDisposition> = {
  'application-defect': {
    act: 'stop',
    finding: true,
    why: 'the application is broken and the spec correctly caught it — repairing this would ' +
      'convert a real defect into a green test',
  },
  'contract-drift': {
    act: 'stop',
    finding: true,
    why: 'the service no longer matches its published document — a finding about the provider',
  },
  'case-defect': {
    act: 'stop',
    why: 'the case itself is wrong, and re-drafting from it would produce the same spec — ' +
      'fix the case, then generate again',
  },
  'environment-config': {
    act: 'stop',
    why: 'the deployment is misconfigured — working around it in the spec hides the problem',
  },
  unclassified: {
    act: 'stop',
    why: 'no rule settled this, and repairing on an undecided verdict is guessing with write access',
  },
  'network-infrastructure': {
    act: 'retry',
    why: 'the environment could not be reached — nothing about the spec is wrong',
  },
  dependency: {
    act: 'retry',
    why: 'something the application depends on was unavailable — not the spec',
  },
  flaky: {
    act: 'retry',
    why: 'it passed on a retry, so the next question is whether it is stable, not what to change',
  },
  'locator-drift': {
    act: 'repair',
    why: 'the spec is addressing something that has moved',
  },
  'test-data': {
    act: 'repair',
    why: 'the data the spec needed was not there — seed it or create it',
  },
  'test-logic-defect': {
    act: 'repair',
    why: 'the spec does the wrong thing, and the claim it makes can stay exactly as it is',
  },
  'timing-synchronisation': {
    act: 'repair',
    why: 'the spec read before the fact arrived — wait for the fact',
  },
};

export function dispositionFor(verdict: Pick<TriageVerdict, 'category'>): RepairDisposition {
  return HARDENING_DISPOSITIONS[verdict.category];
}

/**
 * A verdict nobody has, because triage settled nothing.
 *
 * Distinct from `unclassified`: that is a rule declining to name a cause, this
 * is no rule matching at all. Both stop the loop, and saying which is which is
 * the difference between a transcript somebody can act on and one that says
 * "stopped".
 */
export const NO_VERDICT: RepairDisposition = {
  act: 'stop',
  why: 'triage produced no verdict for this failure, so there is nothing to decide a repair on',
};

/**
 * How many times the loop may repair one spec before a person is asked.
 *
 * `gate.ts:145-151` sets the precedent and the reasoning transfers exactly: "a
 * model that keeps rewriting a case until it satisfies a specificity checker
 * will eventually satisfy it by inventing the missing specifics." A repair loop
 * fails the same way with a bigger blast radius, because its checker is a live
 * application.
 *
 * Three rather than one, and the difference is deliberate: a static gate gives
 * the model the *complete* problem on the first reply, so a second attempt adds
 * little. A run gives it one failure at a time — fixing a precondition can
 * legitimately reveal a wait, which reveals a missing seed. Three is enough for
 * that chain and far too few to grind toward a green by attrition.
 */
export const MAX_REPAIR_ATTEMPTS = 3;

/**
 * How many times a draft that failed *verification* may be handed back.
 *
 * Counted separately from `MAX_REPAIR_ATTEMPTS`, and lower, because the two
 * repairs are different in kind. A verification failure is oracle-free — no
 * compile error is fixable by changing what the spec claims — so retrying is
 * safe in a way a run repair is not, and it needs no triage gate.
 *
 * But it is bounded at two for `gate.ts`'s reason, which does apply here: a
 * model that keeps rewriting until a checker stops complaining will eventually
 * satisfy the checker rather than the case. The first reply gets the complete
 * list of problems, so a model that cannot fix them in two passes is not going
 * to find the answer on the fifth — it is going to find something that
 * compiles.
 */
export const MAX_STATIC_REPAIRS = 2;

/** What a repair is told. Deliberately not the application's current state. */
export interface RepairRequest {
  case: TestCase;
  vocabulary: Vocabulary;
  /** The draft that failed, so the repair is a revision rather than a rewrite. */
  previous: SpecDraft;
  failure: {
    category: TriageCategory;
    summary: string;
    evidence: string[];
    /** The error the run produced. The failure, not the application's contents. */
    error: string;
    failedStep: string | null;
  };
  /**
   * Repeated verbatim into the prompt, and enforced by `claimsUnchanged`
   * regardless of whether the model honours it.
   */
  readonly constraint: 'assertions are frozen: change how the spec gets there, never what it claims';
}

/** One pass of the loop, kept so the whole thing is reviewable afterwards. */
export interface RepairAttempt {
  attempt: number;
  passed: boolean;
  category: TriageCategory | null;
  disposition: RepairDisposition;
  error: string | null;
  /** Findings that stopped this attempt, when any did. */
  refusals: SpecFinding[];
  /**
   * Which kind of stop it was, and the distinction is not cosmetic.
   *
   * `verification` means the draft never ran — it did not compile, or it broke
   * a checker. `claims` means a repair tried to change what the spec asserts
   * and was refused. Both fill `refusals`, and reporting the first as the
   * second tells somebody a repair rewrote their assertions when nothing of the
   * kind happened. Observed doing exactly that on its first live run.
   */
  refusalKind?: 'verification' | 'claims';
}

/* ------------------------------------------------------------------ claims */

/**
 * The claims a body makes, normalised.
 *
 * A claim is the **subject, the matcher and the expected value** — never the
 * message, which is diagnostic and which a repair should be free to improve.
 * `expect(second.saved, 'anything at all').toBe(false)` and
 * `expect(second.saved, 'something else').toBe(false)` are the same claim.
 *
 * Extracted from the *rendered* body, so one implementation serves both draft
 * shapes: the IR renders to TypeScript before this sees it, and the free form
 * already is TypeScript.
 */
export function extractClaims(body: string): string[] {
  const claims: string[] = [];
  const pattern = /\bexpect\s*\(/g;

  for (const match of body.matchAll(pattern)) {
    const open = match.index + match[0].length - 1;
    const args = balanced(body, open);
    if (args === null) continue;

    // The subject is the first argument; the rest is the failure message.
    const subject = normalise(topLevelSplit(body.slice(open + 1, args)).at(0) ?? '');

    // Then `.not?.matcher(expected)` immediately after the closing paren.
    const tail = body.slice(args + 1);
    const matcher = /^\s*((?:\.\w+)+)\s*\(/.exec(tail);
    if (!matcher) {
      claims.push(`${subject}|<no matcher>`);
      continue;
    }
    const matcherOpen = args + 1 + matcher.index + matcher[0].length - 1;
    const matcherClose = balanced(body, matcherOpen);
    const expected =
      matcherClose === null ? '' : normalise(body.slice(matcherOpen + 1, matcherClose));

    claims.push(`${subject}|${matcher[1]}(${expected})`);
  }

  return claims;
}

/** Index of the `)` matching the `(` at `open`, or null when unbalanced. */
function balanced(text: string, open: number): number | null {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

/** Split on commas that are not inside brackets, braces, parens or quotes. */
function topLevelSplit(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const previous = text[index - 1];

    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Did the repair leave every claim exactly as it was?
 *
 * **This is the mechanism that makes the loop safe**, and it is deliberately
 * strict: order and multiplicity both count, so a repair may not drop an
 * assertion, add one, reorder them, or change a matcher. Anything that would
 * legitimately need a different claim is not a repair — it is a re-draft, and
 * it belongs in front of a person.
 *
 * Compared as rendered text rather than as structure so that a free-TypeScript
 * draft is held to the same standard as an IR one. The alternative — trusting
 * the IR's `proves` field — would leave the free form checked more weakly than
 * the shape it is the escape hatch for, which is exactly backwards.
 */
export function claimsUnchanged(before: string, after: string): SpecFinding[] {
  const original = extractClaims(before);
  const revised = extractClaims(after);

  if (original.length !== revised.length) {
    return [
      {
        check: 'repair-changed-claims',
        severity: 'blocker',
        detail:
          `the repair changed how much the spec asserts — ${original.length} expectation(s) ` +
          `became ${revised.length}`,
        remedy:
          'a repair may change how the spec gets there, never what it claims; if the claim is ' +
          'wrong, the case is wrong — take it to a person',
      },
    ];
  }

  const findings: SpecFinding[] = [];
  original.forEach((claim, index) => {
    const now = revised[index];
    if (claim !== now) {
      findings.push({
        check: 'repair-changed-claims',
        severity: 'blocker',
        detail: `expectation ${index + 1} was \`${claim}\` and the repair made it \`${now}\``,
        remedy:
          'restore the assertion and fix what stops it being reached — a failing assertion is ' +
          'a finding, not a thing to adjust',
      });
    }
  });
  return findings;
}

/**
 * Whether the loop should keep going after this attempt.
 *
 * Stated as one function because three things end it and they are easy to get
 * subtly wrong in a `while` condition: it passed, the gate said stop, or the
 * attempts ran out.
 */
export function shouldContinue(attempts: RepairAttempt[]): boolean {
  const last = attempts.at(-1);
  if (!last) return true;
  if (last.passed) return false;
  if (last.disposition.act === 'stop') return false;
  return attempts.length < MAX_REPAIR_ATTEMPTS;
}

/** How the loop ended, for the transcript and the exit code. */
export type HardeningOutcome =
  | 'passed'
  | 'defect-found'
  | 'escalated'
  | 'exhausted'
  | 'unverifiable'
  | 'refused-repair';

export function outcomeOf(attempts: RepairAttempt[]): HardeningOutcome {
  const last = attempts.at(-1);
  if (!last) return 'escalated';
  if (last.passed) return 'passed';
  if (last.refusals.length > 0) {
    return last.refusalKind === 'claims' ? 'refused-repair' : 'unverifiable';
  }
  if (last.disposition.finding) return 'defect-found';
  if (last.disposition.act === 'stop') return 'escalated';
  return 'exhausted';
}
