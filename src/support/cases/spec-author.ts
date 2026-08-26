import path from 'node:path';
import { hashCase, slugify } from './store';
import type { TestCase } from './schema';
import { irAssertionGaps, irFacts, irShell, verifyIr, type SpecIR } from './spec-ir';
import { typecheckSpec } from './typecheck';
import {
  renderPlanComment,
  verifyPreflight,
  type DraftFacts,
  type SpecPlan,
} from './preflight';

/**
 * Track C: a managed case becomes a Playwright spec — the third hop.
 *
 * The chain `check-hashes` already enforces has three links and only two
 * writers:
 *
 *   Jira story ──contentHash──▶ case ──caseHash──▶ spec annotation
 *                  (cases:author)      (nothing, until now)
 *
 * `schema.ts` has carried `specPath` — *"where the generator put the spec, once
 * one exists"* — and `caseHash` since the format was written, and `specs.ts`
 * has read a `case`/`case-hash` annotation pair off *generated files* for just
 * as long. Nothing ever wrote either. This is that writer.
 *
 * **The spec author never sees the running application, and that is the whole
 * design.** `author.ts` makes the argument for the case author and it applies
 * here with more force, not less: a model that can read the application will
 * write assertions describing what the application currently does, and those
 * pass on day one, pass on a broken build, and can never catch a regression.
 * The oracle is the case. The vocabulary is the catalog. There is no browser.
 *
 * The corollary is the sharpest rule here: **iterate against the compiler,
 * never against a test result.** A compile error is oracle-free, so fixing one
 * cannot change what the spec claims. Feeding a *failing run* back to the model
 * is oracle collapse — it will tune the spec until it matches the application,
 * turning a real defect into a green test, which is exactly what §10 refuses.
 *
 * As in `authorCases`, the invention guards live out here rather than in the
 * prompt. A model cannot be trusted to enforce its own citation rules.
 */

/**
 * What a spec is allowed to reach for, for one application.
 *
 * The same closed set `docs/generated/catalog.md` renders for a human — read
 * from the AST rather than from the rendered markdown, so the check and the
 * document cannot drift apart.
 */
export interface Vocabulary {
  target: string;
  /** Fixture names a spec may destructure. */
  fixtures: string[];
  /** Dotted verb names, e.g. `users.searchByUsername`. */
  verbs: string[];
}

/**
 * Which case assertion this expectation proves, and the message that proves it.
 *
 * The message is verified as a **verbatim substring of the body**, which is the
 * same mechanism `quoteIsVerbatim` uses on a criterion and for the same reason:
 * it separates "covers the assertion" from "claims to cover the assertion". A
 * model cannot cite coverage it did not actually write.
 */
export interface AssertionCitation {
  /** 1-based index into the case's `assertions`. */
  assertion: number;
  /** The `expect()` message string, quoted verbatim from the body. */
  provedBy: string;
}

/**
 * The parts of a spec that are the same however the body was arrived at.
 *
 * Both authoring shapes — free TypeScript verified afterwards, and the
 * structured IR rendered by us — produce one of these, so the file wrapper
 * (imports, the annotation triple, the title format) is written once and the
 * two can be compared on the only thing that actually differs.
 */
export interface SpecShell {
  title: string;
  tags: string[];
  fixtures: string[];
  body: string;
}

/** What the model is asked to return. Deliberately narrow. */
export interface DraftedSpec extends SpecShell, SpecPlan {
  kind: 'spec';
  coverage: AssertionCitation[];
}

/**
 * The refusal, and it is the most valuable thing this can return.
 *
 * §"When the vocabulary is missing" is explicit: a missing verb is a design
 * question and the answer is a new action, added deliberately, once. So a case
 * needing a verb the pack does not have produces **no spec at all** — it
 * produces the name of the action somebody has to write first. Inventing a
 * helper, or reaching for `page.locator`, is the failure this exists to
 * prevent.
 */
export interface VocabularyRefusal {
  kind: 'needs-vocabulary';
  missing: Array<{
    /** The verb the case needs, in catalog form. */
    verb: string;
    /** What the case asked for that nothing can express. */
    wanted: string;
  }>;
}

/**
 * The two authoring shapes, plus the refusal.
 *
 * `spec` is free TypeScript verified afterwards; `spec-ir` is a structured
 * description this renders. They exist side by side deliberately — see
 * `spec-ir.ts` for what each one makes impossible and what each one costs.
 */
export type SpecDraft = DraftedSpec | SpecIR | VocabularyRefusal;

export interface SpecRequest {
  case: TestCase;
  vocabulary: Vocabulary;
}

/**
 * The spec author. No tools, no browser, no filesystem — one schema-constrained
 * completion, exactly like `CaseAuthorModel`.
 */
export interface SpecAuthorModel {
  readonly identity: string;
  draft(request: SpecRequest): Promise<SpecDraft>;
  /**
   * Revise a draft that failed when it was run — phase 3's loop.
   *
   * Optional, because a model that cannot see a failure is still a perfectly
   * good author: the draft-on-disk stand-in has no way to respond to one, and
   * `spec:author` never needs this at all. A loop that finds it absent says so
   * and stops rather than re-drafting from scratch and calling that a repair.
   */
  repair?(request: SpecRepairContext): Promise<SpecDraft>;
}

/**
 * What a repair is shown. Never the application's current state — see `repair.ts`.
 *
 * **Two kinds, and the difference is who is allowed to decide.** A
 * `verification` repair answers the compiler and the checkers: it is
 * *oracle-free*, because no compile error can be fixed by changing what the
 * spec claims, so it needs no gate beyond an attempt limit. A `run` repair
 * answers a failing test, and that one is dangerous — it is permitted only for
 * the triage categories `repair.ts` allows, and its reply is compared against
 * the previous claims before it is accepted.
 */
export interface SpecRepairContext {
  case: TestCase;
  vocabulary: Vocabulary;
  /** The rendered spec that failed, so the reply is a revision not a rewrite. */
  previousSource: string;
  reason:
    | { kind: 'verification'; findings: SpecFinding[] }
    | {
        kind: 'run';
        category: string;
        summary: string;
        error: string;
        failedStep: string | null;
      };
}

/** A finding names the gap rather than scoring, as `gate.ts` does. */
export interface SpecFinding {
  check: string;
  severity: 'blocker' | 'warning';
  detail: string;
  /** What has to change, stated as an action. */
  remedy: string;
}

export interface SpecAuthoringResult {
  /** The rendered file. Present even when blocked, so it can be read. */
  source: string | null;
  /** Where it belongs, derived from the vocabulary the draft actually uses. */
  specPath: string | null;
  refusal: VocabularyRefusal | null;
  findings: SpecFinding[];
  /** 1-based case assertion indexes no expectation cites. */
  gaps: number[];
  /** Blockers empty and nothing refused. */
  publishable: boolean;
}

/**
 * Verbs that read as vocabulary but are not — `page` is a Playwright object
 * whose surface is not in the catalog, so a `authedPage.goto(...)` must not be
 * reported as an unknown verb. Only roots the catalog actually speaks for are
 * checked.
 */
function rootsWithVerbs(vocabulary: Vocabulary): Set<string> {
  const roots = new Set<string>();
  for (const verb of vocabulary.verbs) {
    const root = verb.split('.')[0];
    if (root) roots.add(root);
  }
  return roots;
}

/** Normalised for comparison, so a citation survives whitespace reflow. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[""'']/g, "'").trim();
}

/**
 * Every `root.verb(` call in the body, for roots the catalog speaks for.
 *
 * A regular expression rather than a parse, and that is a deliberate limit:
 * this is a *fast, better-worded* pre-check, not the authority. `tsc --noEmit`
 * is the authority, because the fixtures are fully typed — an invented verb or
 * a wrong argument type cannot compile. This exists so the common failure is
 * reported as "the pack has no such verb" instead of as a type error twelve
 * lines long.
 */
function calledVerbs(body: string, roots: Set<string>): string[] {
  const found: string[] = [];
  const pattern = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of body.matchAll(pattern)) {
    const [, root, verb] = match;
    if (root && verb && roots.has(root)) found.push(`${root}.${verb}`);
  }
  return found;
}

/**
 * What this draft does, in the shape pre-flight consumes.
 *
 * **In source order, which is a weaker claim than the IR's.** The IR knows its
 * call sequence; this reads a string top to bottom, so a call inside a `finally`
 * appears after the assertions it follows in the text — which is the order a
 * reader sees and not always the order the runtime takes. Good enough for the
 * journey check, which asks whether the case's steps happen in the order the
 * case describes, and one more reason `tsc` rather than this is the authority.
 */
export function draftFacts(draft: DraftedSpec, vocabulary: Vocabulary): DraftFacts {
  return {
    fixtures: draft.fixtures,
    verbs: calledVerbs(draft.body, rootsWithVerbs(vocabulary)),
  };
}

/**
 * Shapes a spec may not contain, checked before anything reaches disk.
 *
 * Lint is authoritative for all of these and stays so — the point of repeating
 * them here is that a generated file which would fail lint should never be
 * written in the first place, and the author should be told which rule it broke
 * rather than left to read a lint report about a file it did not write.
 */
const FORBIDDEN: Array<{ check: string; pattern: RegExp; detail: string; remedy: string }> = [
  {
    check: 'raw-locator',
    pattern: /\.(locator|getBy[A-Z]\w*)\s*\(/,
    detail: 'the body addresses an element directly',
    remedy: 'a spec may not reach for a locator — use an action, or report the missing verb',
  },
  {
    check: 'hard-wait',
    pattern: /waitForTimeout\s*\(|\bsleep\s*\(/,
    detail: 'the body contains a fixed delay',
    remedy: 'wait for the fact with a web-first assertion or expect.poll',
  },
  {
    check: 'raw-request',
    pattern: /\b(fetch|request)\s*\.\s*(get|post|put|patch|delete)\s*\(/i,
    detail: 'the body calls HTTP directly',
    remedy: 'call a typed client from the pack instead',
  },
];

export function verifyDraft(draft: DraftedSpec, request: SpecRequest): SpecFinding[] {
  const findings: SpecFinding[] = [];
  const add = (
    check: string,
    severity: SpecFinding['severity'],
    detail: string,
    remedy: string,
  ): void => {
    findings.push({ check, severity, detail, remedy });
  };

  // 1. Fixtures the pack does not have.
  const known = new Set(request.vocabulary.fixtures);
  for (const fixture of draft.fixtures) {
    if (!known.has(fixture)) {
      add(
        'unknown-fixture',
        'blocker',
        `the draft destructures "${fixture}", which ${request.vocabulary.target} does not expose`,
        `use one of: ${[...known].sort().join(', ')}`,
      );
    }
  }

  // 2. Verbs the pack does not have — the hallucination this is built against.
  const verbs = new Set(request.vocabulary.verbs);
  // Deduped: `calledVerbs` keeps order and repetition for the journey check,
  // and one invented verb called twice is still one thing to fix.
  for (const called of new Set(calledVerbs(draft.body, rootsWithVerbs(request.vocabulary)))) {
    if (!verbs.has(called)) {
      add(
        'unknown-verb',
        'blocker',
        `the body calls ${called}(), which is not in the catalog`,
        'add the action deliberately, or return needs-vocabulary instead of inventing it',
      );
    }
  }

  // 3. Shapes lint would reject anyway.
  for (const forbidden of FORBIDDEN) {
    if (forbidden.pattern.test(draft.body)) {
      add(forbidden.check, 'blocker', forbidden.detail, forbidden.remedy);
    }
  }

  // 4. Something has to be asserted.
  if (!/\bexpect\s*\(/.test(draft.body)) {
    add(
      'no-assertion',
      'blocker',
      'the body asserts nothing, so it proves nothing',
      'assert what the case says must be true at the end',
    );
  }

  // 5. Every citation is real — the verbatim check.
  const haystack = comparable(draft.body);
  for (const citation of draft.coverage) {
    if (!draft.body.includes(citation.provedBy) && !haystack.includes(comparable(citation.provedBy))) {
      add(
        'citation-not-verbatim',
        'blocker',
        `assertion ${citation.assertion} claims to be proved by "${citation.provedBy}", ` +
          'which does not appear in the body',
        'cite the expect() message as written, or write the expectation that proves it',
      );
    }
    if (citation.assertion < 1 || citation.assertion > request.case.assertions.length) {
      add(
        'citation-out-of-range',
        'blocker',
        `citation names assertion ${citation.assertion}, and the case has ` +
          `${request.case.assertions.length}`,
        'cite an assertion the case actually contains',
      );
    }
  }

  return findings;
}

/**
 * Case assertions nothing claims to prove.
 *
 * **The inverse check, and it is the more useful one** — the same lesson
 * `buildCoverage` records. A spec that drives every step and quietly asserts
 * half of what the case asked for is the dangerous output: it compiles, it
 * lints, it passes, and it reads as coverage. Nobody spots it by reading a spec
 * that looks reasonable.
 */
export function assertionGaps(testCase: TestCase, coverage: AssertionCitation[]): number[] {
  const cited = new Set(coverage.map((citation) => citation.assertion));
  return testCase.assertions.map((_, index) => index + 1).filter((index) => !cited.has(index));
}

/** Where the spec for a case belongs, and under which project. */
export function specPathFor(testCase: TestCase, draft: SpecShell, slug: string): string {
  /*
     Inferred from the vocabulary the draft actually uses rather than asked for
     as a flag: a draft touching only the service belongs in `tests/api/`, and
     one that opens a page does not. Defaulting to `e2e` is the honest fallback
     — it is where a journey lives, and a misplaced spec is a move rather than a
     rewrite.
  */
  const usesPage = /\bauthedPage\b|\bpage\b/.test(draft.body);
  const project = !usesPage && /\bapis?\b/.test(draft.body) ? 'api' : 'e2e';
  return `targets/${testCase.target}/tests/${project}/${slug}.spec.ts`;
}

function titleFor(testCase: TestCase, draft: SpecShell): string {
  const reference = testCase.id ?? testCase.source.key;
  const tags = draft.tags.map((tag) => (tag.startsWith('@') ? tag : `@${tag}`)).join(' ');
  return `${reference} · ${draft.title}${tags ? ` ${tags}` : ''}`;
}

/**
 * Render the spec.
 *
 * The model returns a body and an envelope; the *file* is written here — the
 * imports, the annotation triple, the title format. Everything a spec has to
 * get right structurally is therefore correct by construction rather than by a
 * model remembering it, which is the same division `authorCases` draws.
 */
export function renderSpec(
  testCase: TestCase,
  draft: SpecShell,
  options: { casePath: string; authoredBy: string; plan?: Partial<SpecPlan> },
): string {
  const annotations = [
    `      { type: 'practitest', description: '${testCase.id ?? testCase.source.key}' },`,
    `      { type: 'case', description: '${options.casePath.replace(/\\/g, '/')}' },`,
    `      { type: 'case-hash', description: '${hashCase(testCase)}' },`,
  ];
  if (testCase.source.type === 'jira-story') {
    annotations.push(`      { type: 'jira', description: '${testCase.source.key}' },`);
  }

  const body = draft.body
    .split('\n')
    .map((line) => (line.trim() ? `    ${line}` : ''))
    .join('\n')
    .replace(/\s+$/, '');

  // The spec shows its work: which fixture or verb meets each precondition, and
  // which call carries out each step. A reviewer holding the case beside the
  // file should not have to infer the mapping the draft already stated.
  const planLines = options.plan ? renderPlanComment(testCase, options.plan) : [];
  const planComment = planLines.length > 0 ? `${planLines.join('\n')}\n` : '';

  return `import { expect, test } from '../../fixtures';

/**
 * ${testCase.title}
 *
 * **Generated from ${options.casePath.replace(/\\/g, '/')} by ${options.authoredBy}.**
 * The case is the oracle; this file is the automation of it. Edit the case and
 * regenerate rather than editing here — \`npm run hashes:check\` reports a spec
 * whose case has moved on, and a hand-edit is invisible to it.
${testCase.acQuoted ? ` *\n * Acceptance criterion: "${testCase.acQuoted}"\n` : ''} *
${planComment} */

test(
  '${titleFor(testCase, draft).replace(/'/g, "\\'")}',
  {
    annotation: [
${annotations.join('\n')}
    ],
  },
  async ({ ${draft.fixtures.join(', ')} }) => {
${body}
  },
);
`;
}

/**
 * Draft a spec for one case, and verify it before anybody sees it.
 *
 * Writes nothing. `cases:author` publishes nothing for the same reason — git is
 * the staging area and the diff is the review — and a generated spec is code,
 * which makes that more important rather than less.
 */
export async function authorSpec(
  testCase: TestCase,
  model: SpecAuthorModel,
  vocabulary: Vocabulary,
  casePath: string,
  /**
   * Typecheck the rendered spec before calling it verified.
   *
   * Off by default so the framework's own tests can author against synthetic
   * vocabularies that no tsconfig knows about. **Every real caller turns it
   * on**, and should: without it "verified" means the draft used real verb
   * *names*, which is a much smaller claim than it sounds.
   */
  options: { typecheck?: boolean; repair?: SpecRepairContext } = {},
): Promise<SpecAuthoringResult> {
  const request: SpecRequest = { case: testCase, vocabulary };
  /*
     A repair goes through the identical pipeline — same checks, same renderer,
     same refusal to write while a blocker stands. Only where the draft came
     from differs, and a repaired draft has one extra gate on top of these
     (`claimsUnchanged`), applied by the caller that holds the previous source.
  */
  const draft =
    options.repair && model.repair
      ? await model.repair(options.repair)
      : await model.draft(request);

  if (draft.kind === 'needs-vocabulary') {
    return {
      source: null,
      specPath: null,
      refusal: draft,
      findings: [],
      gaps: [],
      publishable: false,
    };
  }

  /*
     The two shapes verify differently and that is the entire point of having
     both: the free form is checked *after* the fact against a string, the IR
     *before* the fact against fields. What they share is the shell, the
     assertion-gap rule and the refusal to write while a blocker stands.
  */
  const shell: SpecShell = draft.kind === 'spec-ir' ? irShell(draft) : draft;
  const facts: DraftFacts =
    draft.kind === 'spec-ir' ? irFacts(draft) : draftFacts(draft, vocabulary);

  const findings =
    draft.kind === 'spec-ir'
      ? verifyIr(draft, testCase, vocabulary)
      : verifyDraft(draft, request);

  /*
     Pre-flight, and it is shape-independent on purpose. Whether the body was
     written as TypeScript or described as IR changes nothing about whether the
     spec starts where the case starts and goes where the case goes — so both
     shapes reduce to `DraftFacts` and answer the same questions.
  */
  findings.push(...verifyPreflight(draft, testCase, facts, vocabulary));

  const gaps =
    draft.kind === 'spec-ir'
      ? irAssertionGaps(draft, testCase)
      : assertionGaps(testCase, draft.coverage);

  for (const gap of gaps) {
    findings.push({
      check: 'assertion-gap',
      severity: 'blocker',
      detail: `nothing proves assertion ${gap}: "${testCase.assertions[gap - 1]}"`,
      remedy: 'assert it, or say why the case asks for something the suite cannot check',
    });
  }

  const source = renderSpec(testCase, shell, {
    casePath: path.relative(process.cwd(), casePath).replace(/\\/g, '/'),
    authoredBy: model.identity,
    plan: draft,
  });

  const specPath = specPathFor(testCase, shell, slugify(testCase.title));

  /*
     Last, and only when nothing else already blocks: the compiler is the
     expensive check and the most authoritative one, so there is no sense
     running it over a draft that invented a fixture.
  */
  if (options.typecheck && findings.every((finding) => finding.severity !== 'blocker')) {
    findings.push(...typecheckSpec(specPath, source));
  }

  return {
    source,
    specPath,
    refusal: null,
    findings,
    gaps,
    publishable: findings.every((finding) => finding.severity !== 'blocker'),
  };
}

/**
 * Track A rejections loop back to the author once and no further, because "a
 * model that keeps rewriting a case until it satisfies a specificity checker
 * will eventually satisfy it by inventing the missing specifics" (§10). A model
 * rewriting a spec until it compiles fails the same way — it will eventually
 * satisfy the compiler by asserting something trivially true.
 */
export const MAX_SPEC_RETRIES = 1;
