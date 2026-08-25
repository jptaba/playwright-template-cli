import type { TestCase } from './schema';
import type { DraftFacts, SpecPlan } from './preflight';
import type { SpecFinding, SpecShell, Vocabulary } from './spec-author';

/**
 * The second authoring shape: the model describes the test, and we write it.
 *
 * `spec-author.ts` takes free TypeScript and verifies it afterwards. This takes
 * a structured description and renders the TypeScript itself — so the question
 * the two answer together is whether "correct by construction" is worth what it
 * costs in expressiveness.
 *
 * **What becomes impossible rather than merely checked.** There is no node here
 * for a locator, a fixed wait or a raw HTTP call, so a draft cannot contain
 * one — those three checks stop being checks. An assertion carries the case
 * assertions it proves *on the assertion itself*, so a citation cannot be
 * fabricated: the claim and the thing claimed are one object, where the free
 * form needs a verbatim-substring check to tell them apart. And the page
 * argument is supplied by the renderer, so it cannot be forgotten or passed
 * twice.
 *
 * **What it costs.** Every shape a spec might need has to exist as a node
 * first. `arrange / act / assert / cleanup` covers the cases this repository
 * actually writes, and the moment one needs a loop, a conditional, or a value
 * derived two hops deep, the IR either grows a node for it or cannot express
 * the test — and an IR that grows a node for everything is a worse TypeScript.
 */

/** A value a step can pass or an assertion can talk about. */
export type IrValue =
  | { of: 'literal'; value: string | number | boolean | null }
  /** A name bound earlier — a `given`, or a step's `bind`. */
  | { of: 'ref'; name: string }
  | { of: 'object'; fields: Record<string, IrValue> }
  | { of: 'regex'; pattern: string; flags?: string }
  /** A property path off a binding, e.g. `second.errors`. */
  | { of: 'path'; base: string; path: string[] }
  /** The same, joined into one string — the shape assertions on lists need. */
  | { of: 'joined'; base: string; path: string[]; separator: string };

/** A value built before the journey starts. Never takes a page. */
export interface IrBinding {
  name: string;
  /** A builder verb, e.g. `testData.username`. */
  verb: string;
  args?: IrValue[];
  /**
   * Whether the builder returns a promise. Defaults to **false**: `testData.*`
   * is synchronous on every pack here.
   *
   * Worth noticing as a cost of this shape. The free form never has to answer
   * this — the model writes `await` or does not, and `tsc` settles it. Here the
   * renderer has to know, and the fact it needs is in the catalog signature
   * (`=> Promise<T>` or not) which this does not currently read. So the IR asks
   * the draft for something the vocabulary already knows.
   */
  async?: boolean;
}

export interface IrCall {
  /** A catalog verb, e.g. `users.add`. */
  verb: string;
  args?: IrValue[];
  /** Bind the result: `const <bind> = await …`. */
  bind?: string;
  /**
   * Whether the page fixture is passed first. True for every L2 action, which
   * is why it is the default rather than something a draft has to remember.
   */
  page?: boolean;
}

export type IrMatcher =
  | 'toBe'
  | 'toEqual'
  | 'toContain'
  | 'toMatch'
  | 'toHaveLength'
  | 'toBeGreaterThan'
  | 'toBeGreaterThanOrEqual'
  | 'toBeLessThan'
  | 'toBeLessThanOrEqual';

export interface IrAssertion {
  subject: IrValue;
  /** The failure message. Says what went wrong, not what was expected. */
  message: string;
  /** Appended to the message after a colon — the application's own words. */
  detail?: IrValue;
  matcher: IrMatcher;
  expected: IrValue;
  /**
   * Which case assertions this proves, 1-based.
   *
   * **On the assertion rather than in a separate citation list**, and that is
   * the structural difference from the free form: there is no gap between
   * claiming coverage and writing the expectation, so a claim cannot be
   * checked for honesty because it cannot be made separately.
   */
  proves: number[];
}

export interface IrStep {
  call: IrCall;
  assertions?: IrAssertion[];
}

export interface SpecIR extends SpecPlan {
  kind: 'spec-ir';
  title: string;
  tags: string[];
  fixtures: string[];
  /** The page fixture the renderer passes to every action. */
  pageFixture?: string;
  /** Values built up front — `arrange`. */
  given?: IrBinding[];
  /** Navigation and preparation, before the `try` so a failure here is not a cleanup failure. */
  setup?: IrCall[];
  /** The journey and its assertions — `act` and `assert`. */
  steps: IrStep[];
  /** Rendered into a `finally`, so a shared demo is tidied whichever assertion failed. */
  cleanup?: IrCall[];
}

function literal(value: string | number | boolean | null): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return String(value);
}

/**
 * Object fields, using shorthand where a field reads a binding of the same
 * name.
 *
 * `{ username: username }` is what a naive renderer emits and no reviewer would
 * write, and the whole claim of this shape is that the output is code somebody
 * would sign off. Small, and exactly the class of thing a renderer has to keep
 * learning that a model writing TypeScript already knows.
 */
function objectFields(fields: Record<string, IrValue>): string[] {
  return Object.entries(fields).map(([key, field]) =>
    field.of === 'ref' && field.name === key ? key : `${key}: ${renderValue(field)}`,
  );
}

function expandObject(fields: Record<string, IrValue>): string {
  return `{\n${objectFields(fields)
    .map((field) => `  ${field.replace(/\n/g, '\n  ')},`)
    .join('\n')}\n}`;
}

export function renderValue(value: IrValue): string {
  switch (value.of) {
    case 'literal':
      return literal(value.value);
    case 'ref':
      return value.name;
    case 'regex':
      return `/${value.pattern}/${value.flags ?? ''}`;
    case 'path':
      return [value.base, ...value.path].join('.');
    case 'joined':
      return `${[value.base, ...value.path].join('.')}.join(${literal(value.separator)})`;
    case 'object': {
      const inline = `{ ${objectFields(value.fields).join(', ')} }`;
      if (inline.length <= 84) return inline;
      return expandObject(value.fields);
    }
  }
}

function renderCall(call: IrCall, pageFixture: string): string {
  const args = [
    ...(call.page === false ? [] : [pageFixture]),
    ...(call.args ?? []).map(renderValue),
  ];

  const prefix = call.bind ? `const ${call.bind} = await ` : 'await ';
  const inline = `${call.verb}(${args.join(', ')})`;
  if ((prefix + inline).length <= 96 && !inline.includes('\n')) return `${prefix}${inline};`;

  /*
     Too long, so something has to break — and *which* thing is the difference
     between output a reviewer skims and output they rewrite.

     Expanding the trailing object while the leading arguments stay on the first
     line is what a person writes, and what Prettier produces. Breaking every
     argument onto its own line is the naive move, and it strands `authedPage`
     alone on a line for no reason. A renderer earns its keep by knowing this;
     a model writing TypeScript never had to be told.
  */
  const last = (call.args ?? []).at(-1);
  if (last?.of === 'object') {
    const leading = args.slice(0, -1);
    const expanded = expandObject(last.fields);
    return `${prefix}${call.verb}(${[...leading, expanded].join(', ')});`;
  }

  const broken = `${call.verb}(\n${args.map((arg) => `  ${arg.replace(/\n/g, '\n  ')},`).join('\n')}\n)`;
  return `${prefix}${broken};`;
}

function renderAssertion(assertion: IrAssertion): string {
  const subject = renderValue(assertion.subject);
  const message = assertion.detail
    ? `\`${assertion.message.replace(/`/g, '\\`')}: \${${renderValue(assertion.detail)}}\``
    : literal(assertion.message);
  const expected = renderValue(assertion.expected);

  const inline = `expect(${subject}, ${message}).${assertion.matcher}(${expected});`;
  if (inline.length <= 96) return inline;
  return `expect(\n  ${subject},\n  ${message},\n).${assertion.matcher}(${expected});`;
}

function indent(lines: string[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return lines.flatMap((line) =>
    line.split('\n').map((part) => (part.trim() ? `${pad}${part}` : '')),
  );
}

/** Render the IR to the body of a test. The wrapper is `renderSpec`'s job. */
export function renderIrBody(ir: SpecIR): string {
  const page = ir.pageFixture ?? 'authedPage';
  const lines: string[] = [];

  for (const binding of ir.given ?? []) {
    const args = (binding.args ?? []).map(renderValue).join(', ');
    const call = `${binding.verb}(${args})`;
    lines.push(`const ${binding.name} = ${binding.async ? `await ${call}` : call};`);
  }
  if ((ir.given ?? []).length > 0) lines.push('');

  for (const call of ir.setup ?? []) lines.push(renderCall(call, page));
  if ((ir.setup ?? []).length > 0) lines.push('');

  const journey: string[] = [];
  ir.steps.forEach((step, index) => {
    journey.push(renderCall(step.call, page));
    for (const assertion of step.assertions ?? []) journey.push(renderAssertion(assertion));
    if (index < ir.steps.length - 1) journey.push('');
  });

  const cleanup = ir.cleanup ?? [];
  if (cleanup.length === 0) {
    lines.push(...journey);
  } else {
    lines.push('try {');
    lines.push(...indent(journey, 1));
    lines.push('} finally {');
    lines.push(
      ...indent(
        [
          '// A shared demo must not keep this run\'s records, whichever assertion failed.',
          ...cleanup.map((call) => renderCall(call, page)),
        ],
        1,
      ),
    );
    lines.push('}');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The `given` builders are not catalog verbs, so they are not checked as such. */
function callsIn(ir: SpecIR): IrCall[] {
  return [...(ir.setup ?? []), ...ir.steps.map((step) => step.call), ...(ir.cleanup ?? [])];
}

/**
 * What this draft does, in the shape pre-flight consumes.
 *
 * Order is the whole reason this is not a set: `verifyJourney` matches the
 * case's steps against the call sequence greedily, and "add, then add again" is
 * a different journey from "add once". Cleanup is included because it is still
 * something the spec does — a step mapped to a verb that only ever runs in a
 * `finally` should be visible rather than silently satisfying the check.
 */
export function irFacts(ir: SpecIR): DraftFacts {
  return { fixtures: ir.fixtures, verbs: callsIn(ir).map((call) => call.verb) };
}

export function verifyIr(ir: SpecIR, testCase: TestCase, vocabulary: Vocabulary): SpecFinding[] {
  const findings: SpecFinding[] = [];
  const add = (
    check: string,
    severity: SpecFinding['severity'],
    detail: string,
    remedy: string,
  ): void => {
    findings.push({ check, severity, detail, remedy });
  };

  const known = new Set(vocabulary.fixtures);
  for (const fixture of ir.fixtures) {
    if (!known.has(fixture)) {
      add(
        'unknown-fixture',
        'blocker',
        `the draft destructures "${fixture}", which ${vocabulary.target} does not expose`,
        `use one of: ${[...known].sort().join(', ')}`,
      );
    }
  }

  /*
     Exact rather than pattern-matched. The free form has to find verb calls in
     a string, which is a heuristic that leans on `tsc` to be authoritative;
     here the verb *is* a field, so an invented one is caught by name before
     anything is rendered.
  */
  const verbs = new Set(vocabulary.verbs);
  for (const call of callsIn(ir)) {
    if (!verbs.has(call.verb)) {
      add(
        'unknown-verb',
        'blocker',
        `the draft calls ${call.verb}(), which is not in the catalog`,
        'add the action deliberately, or return needs-vocabulary instead of inventing it',
      );
    }
  }

  const assertions = ir.steps.flatMap((step) => step.assertions ?? []);
  if (assertions.length === 0) {
    add(
      'no-assertion',
      'blocker',
      'the draft asserts nothing, so it proves nothing',
      'assert what the case says must be true at the end',
    );
  }

  for (const assertion of assertions) {
    for (const proves of assertion.proves) {
      if (proves < 1 || proves > testCase.assertions.length) {
        add(
          'citation-out-of-range',
          'blocker',
          `an assertion claims to prove case assertion ${proves}, and the case has ` +
            `${testCase.assertions.length}`,
          'prove an assertion the case actually contains',
        );
      }
    }
  }

  /*
     Bindings must exist before they are read. The free form leaves this to
     `tsc`; here it is worth catching, because a dangling `ref` renders into
     code naming a variable nobody declared and the type error that follows
     points at the rendered file rather than at the draft that caused it.
  */
  const bound = new Set<string>([
    ...(ir.given ?? []).map((binding) => binding.name),
    ...callsIn(ir).flatMap((call) => (call.bind ? [call.bind] : [])),
  ]);
  const referenced = new Set<string>();
  const walk = (value: IrValue): void => {
    if (value.of === 'ref') referenced.add(value.name);
    if (value.of === 'path' || value.of === 'joined') referenced.add(value.base);
    if (value.of === 'object') Object.values(value.fields).forEach(walk);
  };
  for (const call of callsIn(ir)) (call.args ?? []).forEach(walk);
  for (const assertion of assertions) {
    walk(assertion.subject);
    walk(assertion.expected);
    if (assertion.detail) walk(assertion.detail);
  }
  for (const name of referenced) {
    if (!bound.has(name)) {
      add(
        'unbound-reference',
        'blocker',
        `the draft reads "${name}", which nothing binds`,
        'bind it in `given`, or bind a step result to that name',
      );
    }
  }

  return findings;
}

/** Case assertions no rendered expectation claims to prove. */
export function irAssertionGaps(ir: SpecIR, testCase: TestCase): number[] {
  const proved = new Set(
    ir.steps.flatMap((step) => (step.assertions ?? []).flatMap((assertion) => assertion.proves)),
  );
  return testCase.assertions.map((_, index) => index + 1).filter((index) => !proved.has(index));
}

/** The IR as the shell `renderSpec` wraps, so both shapes share one file format. */
export function irShell(ir: SpecIR): SpecShell {
  return { title: ir.title, tags: ir.tags, fixtures: ir.fixtures, body: renderIrBody(ir) };
}
