import {
  SyntaxKind,
  type ObjectLiteralExpression,
  type SourceFile,
  type Type,
} from 'ts-morph';

/**
 * The capability catalog's extraction, separated from its file I/O — §07.
 *
 * "The agent is instructed to select from this file and to stop and ask if the
 * needed action is absent. This is what stops helper-method hallucination, and
 * it cannot go stale because it is derived from code."
 *
 * Derived from code is only half of it: the derivation itself has to be right.
 * A vocabulary shape this misses is a whole surface the agent cannot see, and
 * the failure is silent — which is why this lives here, with tests, rather
 * than inline in the tool.
 */
export interface CatalogEntry {
  name: string;
  signature: string;
  doc: string;
}

/**
 * The first sentence of a doc comment. The next character must look like a new
 * sentence, so "e.g." does not end one.
 */
export function firstDocLine(doc: string | undefined): string {
  if (!doc) return '';
  const text = doc
    .replace(/\r/g, '')
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*+\s?/, '').trim())
    .filter((line) => line && !line.startsWith('@'))
    .join(' ')
    .trim();

  const sentence = /^(.*?[.!?])(\s+[A-Z(`]|$)/.exec(text);
  return (sentence?.[1] ?? text).slice(0, 240);
}

export function shortType(type: Type): string {
  return type
    .getText(undefined, 1 /* TypeFormatFlags.NoTruncation */)
    .replace(/import\([^)]*\)\./g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

interface ParameterLike {
  getName(): string;
  getType(): Type;
  isOptional(): boolean;
}

export function signatureOf(parameters: ParameterLike[], returnType: Type): string {
  const params = parameters
    .map((parameter) => {
      const optional = parameter.isOptional();
      // `dryRun?: boolean | undefined` is noise — the `?` already says it.
      const type = optional
        ? shortType(parameter.getType()).replace(/\s*\|\s*undefined$/, '')
        : shortType(parameter.getType());
      return `${parameter.getName()}${optional ? '?' : ''}: ${type}`;
    })
    .join(', ');
  return `(${params}) => ${shortType(returnType)}`;
}

/** The JSDoc block immediately above a node, when ts-morph will not attach it. */
function leadingDoc(node: {
  getLeadingCommentRanges(): Array<{ getText(): string }>;
}): string | undefined {
  return node
    .getLeadingCommentRanges()
    .map((range) => range.getText())
    .filter((text) => text.startsWith('/**'))
    .pop();
}

/** The members of one vocabulary object, named `<object>.<verb>`. */
export function readObjectLiteral(
  objectName: string,
  literal: ObjectLiteralExpression,
): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const property of literal.getProperties()) {
    const method = property.asKind(SyntaxKind.MethodDeclaration);
    if (method) {
      entries.push({
        name: `${objectName}.${method.getName()}`,
        signature: signatureOf(method.getParameters(), method.getReturnType()),
        doc: firstDocLine(method.getJsDocs()[0]?.getInnerText() ?? leadingDoc(method)),
      });
      continue;
    }

    const assignment = property.asKind(SyntaxKind.PropertyAssignment);
    const arrow = assignment?.getInitializerIfKind(SyntaxKind.ArrowFunction);
    if (assignment && arrow) {
      entries.push({
        name: `${objectName}.${assignment.getName()}`,
        signature: signatureOf(arrow.getParameters(), arrow.getReturnType()),
        // A property assignment is not a JSDocable node in ts-morph, so its
        // doc comment is read from the leading trivia instead.
        doc: firstDocLine(leadingDoc(assignment)),
      });
    }
  }
  return entries;
}

/**
 * Both idiomatic vocabulary shapes:
 *
 *   export const auth = { … }                                  — UI actions
 *   export function ordersApi(client) { return { … } }         — HTTP and DB
 *
 * The factory shape is what a vocabulary needs when a client has to be
 * injected, so missing it would hide the entire `api/` and `db/` surface.
 */
export function readVocabulary(file: SourceFile): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const declaration of file.getVariableDeclarations()) {
    if (!declaration.isExported()) continue;
    const literal = declaration.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (literal) entries.push(...readObjectLiteral(declaration.getName(), literal));
  }

  for (const declaration of file.getFunctions()) {
    if (!declaration.isExported()) continue;
    const returned = declaration
      .getStatements()
      .find((statement) => statement.getKind() === SyntaxKind.ReturnStatement)
      ?.asKind(SyntaxKind.ReturnStatement)
      ?.getExpressionIfKind(SyntaxKind.ObjectLiteralExpression);
    if (returned) entries.push(...readObjectLiteral(declaration.getName() ?? 'default', returned));
  }

  return entries;
}

/**
 * Members of the fixture interfaces — the injectable surface. A fixture whose
 * type is a whole vocabulary object is listed in full in its own table, so a
 * truncated dump of it here would help nobody.
 */
export function readFixtureInterfaces(file: SourceFile, names: RegExp): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const declaration of file.getInterfaces()) {
    if (!declaration.isExported() || !names.test(declaration.getName())) continue;
    for (const member of declaration.getProperties()) {
      const type = shortType(member.getType());
      entries.push({
        name: member.getName(),
        signature: type.startsWith('{') ? 'named actions — see the table below' : type,
        doc: firstDocLine(member.getJsDocs()[0]?.getInnerText()),
      });
    }
  }
  return entries;
}
