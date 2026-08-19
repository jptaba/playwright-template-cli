'use strict';

const { relPath, layerOf } = require('./lib/paths');

/**
 * A known failure is declared, not inverted — §10, open-items.md item 59.
 *
 * `test.fail()` inverts the *whole* test. A spec marked that way is reported as
 * **passing** when it never reaches its own assertion at all — the application
 * answered HTTP 500 two pages earlier, a locator moved, the session expired.
 * That is not a corner case: an application with known defects is exactly the
 * kind that also falls over upstream, so it is the normal case there.
 *
 * Watched happen on ParaBank. Two specs marked `test.fail()` for defects the
 * bank genuinely has — it accepts a negative transfer, and one larger than the
 * account holds — were reported green for a whole run in which neither reached
 * a transfer form.
 *
 * The narrower marker is an annotation stating what the failure should *say*,
 * checked against the error the run actually produced:
 *
 * ```ts
 * annotation: [
 *   { type: 'practitest', description: 'PB-2-01' },
 *   { type: 'known-failure', description: 'a bank accepted a negative transfer' },
 * ]
 * ```
 *
 * The run then reports it three ways rather than one — still failing as
 * declared, failing for something else, or passing and ready to have the
 * marker removed. The assertion underneath is left alone, which is what §10
 * asks for: known-failure handling belongs in triage and the report, never in
 * the code under the assertion.
 */
const ANNOTATION = 'known-failure';

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Known failures are declared in an annotation, not inverted with test.fail().' },
    schema: [],
    messages: {
      inverted:
        '`test.fail()` inverts the whole test, so this is reported as passing whenever it ' +
        'fails for any *other* reason — an outage, a moved locator, an expired session. Declare ' +
        "the failure instead: `{ type: 'known-failure', description: '<text the error contains>' }` " +
        'in the annotation, and leave the assertion as it is (§10).',
      empty:
        'A `known-failure` annotation needs the text the failure should contain in `description`. ' +
        'An empty one confirms nothing, so it silently disables the check it was meant to add.',
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};

    return {
      CallExpression(node) {
        if (!isTestDeclaration(node)) return;

        if (isFailModifier(node)) {
          context.report({ node, messageId: 'inverted' });
          return;
        }

        const [, second] = node.arguments;
        if (!second || second.type !== 'ObjectExpression') return;
        const annotation = property(second, 'annotation');
        if (!annotation || annotation.value.type !== 'ArrayExpression') return;

        for (const element of annotation.value.elements) {
          if (!element || element.type !== 'ObjectExpression') continue;
          if (literalValue(property(element, 'type')) !== ANNOTATION) continue;
          const description = literalValue(property(element, 'description'));
          if (description === undefined || String(description).trim() === '') {
            context.report({ node: element, messageId: 'empty' });
          }
        }
      },
    };
  },
};

/**
 * A *declaration* of a test rather than a modifier sharing the name, decided
 * by whether it ends in a body — the same distinction `require-case-id` draws,
 * and for the same reason: `test.fail(condition, 'reason')` inside a body is
 * the conditional form and declares nothing.
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

function isFailModifier(node) {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'fail'
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
