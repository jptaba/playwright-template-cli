'use strict';

const { relPath, layerOf, projectOf } = require('./lib/paths');

/**
 * Every spec carries a PractiTest annotation — except the contract project (§07).
 *
 * The rule is scoped by project rather than applied globally, because contract
 * checks verify a published spec, not a scripted case: demanding a case id for
 * them would produce fictional ids, which is worse than none.
 *
 * Without the annotation, the reporter has nothing to post results against and
 * the coverage view in §18 silently under-counts.
 */
const EXEMPT_PROJECTS = new Set(['contract']);

/**
 * A seed is the template the generator agent starts from, and a setup file
 * establishes state. Neither implements a managed case, and demanding an id
 * for them produces fictional ids — which is worse than none.
 */
const EXEMPT_FILES = /(^|\/)(seed\.spec|[^/]*\.setup)\.ts$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Specs declare the managed test case they implement.' },
    schema: [],
    messages: {
      missing:
        "Spec has no `practitest` annotation, so its result cannot be posted against a case and " +
        'it will not appear in the coverage view. Add ' +
        "`{ annotation: [{ type: 'practitest', description: '<id>' }] }` (§14).",
      empty: 'The `practitest` annotation needs the case id in `description`.',
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};
    if (EXEMPT_PROJECTS.has(projectOf(file))) return {};
    if (EXEMPT_FILES.test(file)) return {};

    return {
      CallExpression(node) {
        if (!isTestDeclaration(node)) return;
        // test(title, details, fn) — the annotation lives in the middle argument.
        const [, second] = node.arguments;
        if (!second || second.type !== 'ObjectExpression') {
          context.report({ node, messageId: 'missing' });
          return;
        }

        const annotation = property(second, 'annotation');
        if (!annotation || annotation.value.type !== 'ArrayExpression') {
          context.report({ node, messageId: 'missing' });
          return;
        }

        const practitest = annotation.value.elements.find(
          (element) =>
            element &&
            element.type === 'ObjectExpression' &&
            literalValue(property(element, 'type')) === 'practitest',
        );
        if (!practitest) {
          context.report({ node, messageId: 'missing' });
          return;
        }

        const description = literalValue(property(practitest, 'description'));
        if (description !== undefined && String(description).trim() === '') {
          context.report({ node, messageId: 'empty' });
        }
      },
    };
  },
};

/**
 * A *declaration* of a test, as opposed to a modifier that happens to share
 * the name.
 *
 * `test.skip(condition, 'reason')` inside a test body is the conditional-skip
 * form: it declares nothing, it has no title and it cannot carry an
 * annotation. The rule used to treat it as a nameless test and demand a case
 * id for it — so any spec that skipped itself when its precondition was
 * missing failed lint, which is exactly what a data-dependent or
 * capability-gated spec is supposed to do.
 *
 * The distinguishing feature is the body: a declaration ends in a function, a
 * modifier does not.
 */
function isTestDeclaration(node) {
  const callee = node.callee;
  const named =
    callee.type === 'Identifier'
      ? callee.name === 'test'
      : callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'test' &&
        ['only', 'fixme', 'skip', 'fail', 'slow'].includes(callee.property.name);
  if (!named) return false;

  const last = node.arguments[node.arguments.length - 1];
  return Boolean(
    last && (last.type === 'ArrowFunctionExpression' || last.type === 'FunctionExpression'),
  );
}

function property(objectExpression, name) {
  return objectExpression.properties.find(
    (prop) =>
      prop.type === 'Property' &&
      !prop.computed &&
      (prop.key.name === name || prop.key.value === name),
  );
}

function literalValue(prop) {
  if (!prop || prop.value.type !== 'Literal') return undefined;
  return prop.value.value;
}
