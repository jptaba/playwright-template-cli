import type {
  ArrayLiteralExpression,
  CallExpression,
  Node,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  StringLiteral,
} from 'ts-morph';

/**
 * What a spec says about the managed case it implements — §09, §18.
 *
 * The link between a case and the spec that automates it is written in the
 * spec's own annotations, and it is the only link there is:
 *
 *   { type: 'practitest', description: '5104' }                  the case id
 *   { type: 'case',       description: 'cases/app/thing.yaml' }  the case file
 *   { type: 'case-hash',  description: 'a1b2…' }                 the version of it
 *
 * Read from the syntax tree rather than by regular expression. `check-hashes`
 * reads the hash with one, and it is right for a single field on generated
 * files — but the same regular expression against a hand-written spec finds
 * nothing the moment somebody uses double quotes or wraps a line, and finding
 * nothing here reads as "this spec cites no case", which is a coverage report
 * that quietly under-counts.
 *
 * Nothing in this file imports ts-morph as a value: kinds are compared by name
 * so the module stays free of the TypeScript compiler, which is a fifth of a
 * second of startup the dashboard should not pay to serve a page that does not
 * open it. `collect.ts` loads it when a report is actually asked for.
 */

export interface SpecFact {
  /** Repo-relative, forward-slashed. */
  file: string;
  title: string;
  /** The `practitest` annotation — the managed case id, when it names one. */
  caseId: string | null;
  /** The `case` annotation — the case file the spec was written against. */
  casePath: string | null;
  /** The `case-hash` annotation — which version of that case. */
  caseHash: string | null;
}

/**
 * Which Playwright project a spec belongs to, from its path.
 *
 * The same derivation `eslint-rules/lib/paths.js` makes, because the two have
 * to agree: a rule that demands a case id for a file this excuses would leave
 * an author with a lint error telling them to add the thing a page reports as
 * wrong.
 */
export function projectOfSpec(file: string): string | null {
  return /^src\/targets\/[^/]+\/tests\/([^/]+)\//.exec(file)?.[1] ?? null;
}

/** Contract checks verify a published schema, not a scripted case (§07). */
const EXEMPT_PROJECTS = new Set(['contract']);

/** A template and a state-establishing setup file implement no case. */
const EXEMPT_FILES = /(^|\/)(seed\.spec|[^/]*\.setup)\.ts$/;

/**
 * Whether this spec is expected to name a case — `require-case-id`'s question,
 * asked here so coverage and lint give the same answer.
 *
 * Exempt files are left out of the report entirely rather than counted as
 * uncited. The seed template cites the literal string `PT-ID`, and a report
 * that called that a spec citing a case which does not exist would be
 * technically true and useless.
 */
export function specNeedsCase(file: string): boolean {
  const project = projectOfSpec(file);
  if (project && EXEMPT_PROJECTS.has(project)) return false;
  return !EXEMPT_FILES.test(file);
}

function asKind<T extends Node>(node: Node | null | undefined, kind: string): T | null {
  return node && node.getKindName() === kind ? (node as T) : null;
}

/** The text of a string literal, in either quoting style. Not a template. */
function literalText(node: Node | null | undefined): string | null {
  const string =
    asKind<StringLiteral>(node, 'StringLiteral') ??
    asKind<StringLiteral>(node, 'NoSubstitutionTemplateLiteral');
  return string ? string.getLiteralText() : null;
}

function propertyValue(literal: ObjectLiteralExpression, name: string): Node | null {
  for (const property of literal.getProperties()) {
    const assignment = asKind<PropertyAssignment>(property, 'PropertyAssignment');
    if (!assignment) continue;
    // A quoted key is the same key: `'case-hash'` has to be written that way.
    if (assignment.getName().replace(/^['"]|['"]$/g, '') !== name) continue;
    return assignment.getInitializer() ?? null;
  }
  return null;
}

/**
 * A *declaration* of a test, as opposed to a modifier that shares its name.
 *
 * `test.skip(condition, 'reason')` inside a body declares nothing and carries
 * no annotation; the distinguishing feature is that a declaration ends in a
 * function. Same reasoning, and same list, as the lint rule.
 */
function isTestDeclaration(call: CallExpression): boolean {
  const callee = call.getExpression().getText();
  if (callee !== 'test' && !/^test\.(only|fixme|skip|fail|slow)$/.test(callee)) return false;

  const last = call.getArguments().at(-1)?.getKindName();
  return last === 'ArrowFunction' || last === 'FunctionExpression';
}

/** Every `{ type, description }` pair in a test's `annotation` array. */
function annotations(details: Node | undefined): Map<string, string> {
  const found = new Map<string, string>();
  const literal = asKind<ObjectLiteralExpression>(details, 'ObjectLiteralExpression');
  if (!literal) return found;

  const list = asKind<ArrayLiteralExpression>(
    propertyValue(literal, 'annotation'),
    'ArrayLiteralExpression',
  );
  if (!list) return found;

  for (const element of list.getElements()) {
    const entry = asKind<ObjectLiteralExpression>(element, 'ObjectLiteralExpression');
    if (!entry) continue;
    const type = literalText(propertyValue(entry, 'type'));
    const description = literalText(propertyValue(entry, 'description'));
    // First wins: two `practitest` annotations on one test is a mistake, and
    // silently preferring the last one hides it.
    if (type && description !== null && !found.has(type)) found.set(type, description);
  }
  return found;
}

/** Every test declared in one spec file, and what each one cites. */
export function readSpecFacts(source: SourceFile, file: string): SpecFact[] {
  const facts: SpecFact[] = [];

  source.forEachDescendant((node) => {
    const call = asKind<CallExpression>(node, 'CallExpression');
    if (!call || !isTestDeclaration(call)) return;

    const [title, details] = call.getArguments();
    const cited = annotations(details);

    facts.push({
      file,
      title: literalText(title) ?? '',
      caseId: cited.get('practitest')?.trim() || null,
      casePath: cited.get('case')?.trim() || null,
      caseHash: cited.get('case-hash')?.trim() || null,
    });
  });

  return facts;
}
