import type { CatalogEntry } from '../catalog/extract';
import type { TestCase } from './schema';

/**
 * The request a spec author is given — one bundle, no vendor in it.
 *
 * **Why this is a file rather than an API call.** `AnthropicCaseAuthor` reaches
 * the Anthropic API directly, which needs a paid API account — a different
 * thing from a Claude Pro or a Copilot subscription, which is what most people
 * driving this actually hold. Making the *request* the artifact rather than the
 * *call* removes the coupling entirely: whatever agent somebody has — Claude
 * Code on a Pro plan, Copilot, a colleague with ten minutes — reads this and
 * returns a draft, and `spec:author` verifies it identically either way.
 *
 * That is not a workaround. The framework's own thesis has always been that a
 * model's output is safe to accept *because it is verified*, never because the
 * model was well behaved — `authorCases` says so in as many words: "a model
 * cannot be trusted to enforce its own citation rules, so the verification
 * happens after the reply." A harness built on that premise does not care which
 * model replied.
 *
 * **On isolating the model from the application, honestly.** Invariant 1 says
 * the author must not read the running system, and a locally-run agent CLI
 * cannot be *made* to obey that: measured on `claude` 2.1.220, both
 * `--disallowed-tools` and an empty `--allowed-tools` were routed around — the
 * first via a shell-capable tool the deny list did not name, the second
 * ignored outright. So this prompt states the rule and says why, a caller
 * should run the agent somewhere with nothing interesting in it, and **the
 * guarantee lives in the checks**: every assertion must trace to a case
 * assertion, gaps block, pre-flight compares journey and preconditions, and a
 * repair may not change a claim. A model that peeked still cannot get a wrong
 * claim past those.
 */

export interface SpecRequestBundle {
  /** Framing that is true for every case — the invariants. */
  system: string;
  /** This case, this vocabulary, and what to return. */
  user: string;
  /** The IR shape, as JSON Schema, for a model that can be constrained. */
  schema: Record<string, unknown>;
}

const SYSTEM = `You write Playwright test specifications for an existing test framework.

You are given a test case and a closed vocabulary. You return a JSON description
of the spec. You do not write TypeScript — the framework renders it.

Rules, in order of importance:

1. THE CASE IS THE ORACLE. Every assertion you write must come from the case's
   own "assertions" list. Never write an assertion describing what you believe
   the application currently does. Do not inspect the running application, its
   pages, its API or the repository to decide what to assert — a test derived
   from current behaviour passes on a broken build and can never catch a
   regression. If you have tools available, do not use them for this task; the
   request below is complete.

2. ONLY THE VOCABULARY. You may call only the verbs listed. If the case needs
   something the vocabulary cannot express, return the refusal shape naming the
   verb that is missing. Never invent a helper, and never reach for a locator,
   a fixed wait, or a raw HTTP call — the JSON shape has no way to express them
   and a draft that tries is rejected.

3. PROVE EVERY ASSERTION. Each case assertion must be proved by at least one
   expectation, cited by index in that expectation's "proves" array. A draft
   that drives the whole journey and proves only half the assertions is the
   single most dangerous thing you can return: it compiles, it passes, and it
   reads as coverage.

4. ACCOUNT FOR EVERY PRECONDITION, and map every step. Say how each
   precondition is met — a fixture, a seed the spec creates, or an assumption
   you name — and which verbs carry out each of the case's steps, in order.

5. CREATE WHAT THE CASE ASSUMES EXISTS. If a precondition says data must
   already exist, seed it with the pack's own verbs and say how it is undone.
   Data nobody removes accumulates on shared environments.

Everything you claim is checked against what you actually wrote. A claim that
does not hold is refused, not corrected — so claim only what is true.`;

function renderCase(testCase: TestCase): string {
  const lines = [
    `Case ${testCase.id ?? testCase.source.key}: ${testCase.title}`,
    `Type: ${testCase.type} · Priority: ${testCase.priority}`,
  ];
  if (testCase.acQuoted) lines.push(`Acceptance criterion: "${testCase.acQuoted}"`);

  lines.push('', 'Preconditions (1-based — account for each):');
  testCase.preconditions.forEach((text, index) => lines.push(`  ${index + 1}. ${text}`));

  lines.push('', 'Steps (1-based — map each to the verbs that perform it, in order):');
  testCase.steps.forEach((step, index) =>
    lines.push(`  ${index + 1}. ${step.action}\n     expected: ${step.expected}`),
  );

  lines.push('', 'Assertions (1-based — every one must be proved):');
  testCase.assertions.forEach((text, index) => lines.push(`  ${index + 1}. ${text}`));

  return lines.join('\n');
}

function renderVocabulary(fixtures: CatalogEntry[], verbs: CatalogEntry[]): string {
  const lines = ['Fixtures you may destructure:'];
  for (const entry of fixtures) lines.push(`  ${entry.name} — ${entry.doc || entry.signature}`);

  lines.push('', 'Verbs you may call (signature, then what it does):');
  for (const entry of verbs) {
    lines.push(`  ${entry.name}${entry.signature ? `: ${entry.signature}` : ''}`);
    if (entry.doc) lines.push(`      ${entry.doc}`);
  }
  lines.push(
    '',
    'The first argument of every verb above is the page — the renderer supplies it,',
    'so do not include it in "args".',
  );
  return lines.join('\n');
}

/** The IR, as JSON Schema. Kept beside the types it describes, tested against them. */
export const SPEC_IR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['kind', 'title', 'tags', 'fixtures', 'steps', 'preconditions', 'journey'],
  properties: {
    kind: { const: 'spec-ir' },
    title: { type: 'string', description: 'What the spec proves, in the case\'s own terms.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'e.g. ["@negative", "@admin"]' },
    fixtures: { type: 'array', items: { type: 'string' } },
    pageFixture: { type: 'string', description: 'Usually authedPage.' },
    given: {
      type: 'array',
      description: 'Values built before anything runs, e.g. testData builders.',
      items: {
        type: 'object',
        required: ['name', 'verb'],
        properties: {
          name: { type: 'string' },
          verb: { type: 'string' },
          args: { type: 'array' },
          async: { type: 'boolean', description: 'testData builders are synchronous — omit.' },
        },
      },
    },
    setup: { type: 'array', description: 'Navigation before the journey.', items: { $ref: '#/$defs/call' } },
    seed: {
      type: 'array',
      description: 'Data a precondition says must already exist, created by this spec.',
      items: {
        type: 'object',
        required: ['establishes', 'call'],
        properties: {
          establishes: { type: 'integer', description: '1-based precondition index.' },
          call: { $ref: '#/$defs/call' },
          undo: { $ref: '#/$defs/call' },
          undoNote: { type: 'string', description: 'Why nothing needs undoing.' },
          guard: {
            $ref: '#/$defs/assertion',
            description: 'Checks the arrangement worked. Its "proves" MUST be empty.',
          },
        },
      },
    },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['call'],
        properties: {
          call: { $ref: '#/$defs/call' },
          assertions: { type: 'array', items: { $ref: '#/$defs/assertion' } },
        },
      },
    },
    cleanup: { type: 'array', items: { $ref: '#/$defs/call' } },
    preconditions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['precondition', 'how'],
        properties: {
          precondition: { type: 'integer' },
          how: { enum: ['fixture', 'established', 'assumed', 'unsatisfiable'] },
          by: {
            type: 'string',
            description:
              'The fixture name, or the verb that establishes it — exactly as listed above, ' +
              'with nothing appended. "users.add", never "users.add (seed)".',
          },
          note: { type: 'string' },
        },
      },
    },
    journey: {
      type: 'array',
      items: {
        type: 'object',
        required: ['step', 'calls'],
        properties: {
          step: { type: 'integer' },
          calls: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  $defs: {
    value: {
      description: 'One of: literal, ref, object, regex, path, joined.',
      oneOf: [
        { type: 'object', required: ['of', 'value'], properties: { of: { const: 'literal' }, value: {} } },
        { type: 'object', required: ['of', 'name'], properties: { of: { const: 'ref' }, name: { type: 'string' } } },
        { type: 'object', required: ['of', 'fields'], properties: { of: { const: 'object' }, fields: { type: 'object' } } },
        {
          type: 'object',
          required: ['of', 'pattern'],
          properties: { of: { const: 'regex' }, pattern: { type: 'string' }, flags: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['of', 'base', 'path'],
          properties: { of: { const: 'path' }, base: { type: 'string' }, path: { type: 'array', items: { type: 'string' } } },
        },
        {
          type: 'object',
          required: ['of', 'base', 'path', 'separator'],
          properties: {
            of: { const: 'joined' },
            base: { type: 'string' },
            path: { type: 'array', items: { type: 'string' } },
            separator: { type: 'string' },
          },
        },
      ],
    },
    call: {
      type: 'object',
      required: ['verb'],
      properties: {
        verb: { type: 'string' },
        args: { type: 'array', items: { $ref: '#/$defs/value' } },
        bind: { type: 'string', description: 'Name the result, to assert about it later.' },
        page: { type: 'boolean', description: 'Omit — the page is passed for you.' },
      },
    },
    assertion: {
      type: 'object',
      required: ['subject', 'message', 'matcher', 'expected', 'proves'],
      properties: {
        subject: { $ref: '#/$defs/value' },
        message: { type: 'string', description: 'Says what went wrong, not what was expected.' },
        detail: { $ref: '#/$defs/value', description: 'Appended after a colon.' },
        matcher: {
          enum: [
            'toBe', 'toEqual', 'toContain', 'toMatch', 'toHaveLength',
            'toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
          ],
        },
        expected: { $ref: '#/$defs/value' },
        proves: {
          type: 'array',
          items: { type: 'integer' },
          description: '1-based case assertion indexes this proves. Empty for a seed guard.',
        },
      },
    },
  },
};

/** The refusal, described for the model alongside the shape it usually returns. */
const REFUSAL_SHAPE = `{ "kind": "needs-vocabulary",
  "missing": [ { "verb": "<name it would have>", "wanted": "<what the case needs>" } ] }`;

export function buildSpecRequest(
  testCase: TestCase,
  vocabulary: { fixtures: CatalogEntry[]; verbs: CatalogEntry[]; shapes?: string[] },
  target: string,
): SpecRequestBundle {
  const user = [
    `Application under test: ${target}`,
    '',
    renderCase(testCase),
    '',
    renderVocabulary(vocabulary.fixtures, vocabulary.verbs),
    '',
    /*
       The shapes, without which a verb's signature is half a sentence. A draft
       told `users.add(page, user: NewUser) => Promise<UserSaveResult>` and
       nothing more will guess the fields — `.error` for `errors`, `.count` for
       `total` — and every guess costs an attempt the compiler then rejects.
    */
    ...(vocabulary.shapes?.length
      ? [
          'The shapes those signatures refer to. Match them exactly — these are',
          'the fields, and there are no others:',
          '',
          ...vocabulary.shapes,
          '',
        ]
      : []),
    'Return ONE JSON object and nothing else — no prose, no code fences.',
    'Either a spec, matching the schema supplied with this request, or the refusal:',
    '',
    REFUSAL_SHAPE,
    '',
    'Return the refusal when the vocabulary genuinely cannot express the case.',
    'That is a useful answer and it is preferred to a spec that approximates.',
  ].join('\n');

  return { system: SYSTEM, user, schema: SPEC_IR_SCHEMA };
}

/**
 * The repair request: the draft that failed, why, and what may not move.
 *
 * **The constraint is repeated here and enforced regardless.** A prompt saying
 * "do not change the assertions" is worth having — it is how the model spends
 * its attention on the right thing — but it is not the guarantee.
 * `claimsUnchanged` compares the rendered claims before and after and refuses
 * the repair outright if any moved, so a model that ignores this paragraph
 * cannot get past it.
 *
 * What the model is *not* given is equally deliberate: no screenshot, no DOM, no
 * page content. It sees the error the run produced and the triage verdict, which
 * is what a person debugging sees in a CI log — not the application's current
 * contents, which is where a new assertion would come from.
 */
export function buildRepairRequest(
  previousSource: string,
  reason:
    | { kind: 'verification'; findings: Array<{ check: string; detail: string; remedy: string }> }
    | { kind: 'run'; category: string; summary: string; error: string; failedStep: string | null },
): string {
  const opening =
    reason.kind === 'verification'
      ? [
          'The spec you wrote did not pass the checks, so it was never run. Fix it.',
          '',
          'THE SPEC AS WRITTEN:',
          '',
          previousSource,
          '',
          'WHAT IS WRONG WITH IT:',
          '',
          ...reason.findings.map(
            (finding) => `  · ${finding.check}: ${finding.detail}\n      → ${finding.remedy}`,
          ),
          '',
          'Most of these are a verb used with a shape it does not have. Re-read the',
          'signatures in the vocabulary above and match them exactly — the argument',
          'objects and the fields on what each verb returns.',
          '',
        ]
      : [
          'The spec you wrote was run and it failed. Repair it.',
          '',
          'THE SPEC AS WRITTEN:',
          '',
          previousSource,
          '',
          'WHAT HAPPENED:',
          `  triage category: ${reason.category}`,
          `  summary: ${reason.summary}`,
          reason.failedStep
            ? `  failed at step: ${reason.failedStep}`
            : '  failed step: not recorded',
          '',
          '  error:',
          reason.error
            .split('\n')
            .slice(0, 40)
            .map((line) => `    ${line}`)
            .join('\n'),
          '',
        ];

  return [
    ...opening,
    'RULES FOR A REPAIR — the first one is absolute:',
    '',
    '1. THE ASSERTIONS DO NOT MOVE. Every expectation keeps its subject, its',
    '   matcher and its expected value exactly as they are, and the "proves"',
    '   arrays stay identical. Change how the spec reaches them — the setup, a',
    '   seed, a wait, a verb used wrongly — never what it claims. A repair that',
    '   edits an assertion to agree with the application turns a real defect into',
    '   a green test, and it is refused automatically, so it wastes the attempt.',
    '   If the only possible fix is a different claim, the case is wrong: return',
    '   the refusal shape and say so instead.',
    '',
    '2. Do not rename bindings. The check that guards rule 1 compares rendered',
    '   text, so a rename reads as a changed claim and is refused.',
    '',
    '3. Same vocabulary as before. Same shape of reply — one JSON object.',
    '',
    'Return the complete repaired draft, not a diff.',
  ].join('\n');
}

/**
 * The whole request as one piece of text, for an agent that takes a prompt and
 * not a system/user pair — which is most of the ways somebody will actually run
 * this, including a CLI and a person pasting into a chat window.
 */
export function renderSpecRequest(bundle: SpecRequestBundle): string {
  return [
    bundle.system,
    '',
    '--- REQUEST ---',
    '',
    bundle.user,
    '',
    '--- SCHEMA (the "spec" shape) ---',
    '',
    JSON.stringify(bundle.schema, null, 2),
  ].join('\n');
}
