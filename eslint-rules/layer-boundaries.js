'use strict';

const { relPath, layerOf, targetOf, isFramework, resolveImport } = require('./lib/paths');

/**
 * The rules that make the four-layer split hold (§03, §04, §06).
 *
 *   L4 specs        may not import L1 primitives — if a spec needs an element,
 *                   the missing thing is an action.
 *   L1 primitives   may not import anything above them.
 *   L2 vocabularies may not import specs or fixtures.
 *   framework       may not import a target pack. This is the rule that keeps
 *                   the framework agnostic of the application under test: it
 *                   fails the build the first time `src/fixtures` reaches for
 *                   `targets/<app>/actions`.
 *   one target      may not import another target's code.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce the layer and target boundaries.' },
    schema: [],
    messages: {
      specImportsPrimitive:
        'A spec may not import from {{dir}}/. If this spec needs an element directly, the ' +
        'missing thing is an action — add it to the target\'s L2 vocabulary and call that.',
      primitiveImportsUp:
        'L1 ({{dir}}/) holds primitives only: no logic, no waits, no assertions, and no imports ' +
        'from higher layers.',
      vocabularyImportsUp:
        'L2 vocabularies compose primitives and return data. They may not import {{what}}.',
      frameworkImportsTarget:
        'Framework code must work for any application under test, so it may not import the ' +
        "'{{target}}' target pack. Move the shared part into src/support or src/integrations, " +
        'or drive it through a fixture (§04).',
      crossTarget:
        "Target '{{from}}' may not import target '{{to}}'. Swapping targets selects a pack — " +
        'it does not reuse one (§04).',
    },
  },

  create(context) {
    const file = relPath(context);
    const layer = layerOf(file);
    const fromTarget = targetOf(file);
    const framework = isFramework(file);

    const check = (node, specifier) => {
      const resolved = resolveImport(file, specifier);
      const importedTarget = resolved ? targetOf(resolved) : targetFromBareSpecifier(specifier);

      if (framework && importedTarget) {
        context.report({
          node,
          messageId: 'frameworkImportsTarget',
          data: { target: importedTarget },
        });
        return;
      }

      if (fromTarget && importedTarget && importedTarget !== fromTarget) {
        context.report({
          node,
          messageId: 'crossTarget',
          data: { from: fromTarget, to: importedTarget },
        });
        return;
      }

      if (!resolved) return;
      const importedLayer = layerOf(resolved);
      const dir = /\/(locators|endpoints|queries|actions|api|db|tests)\//.exec(resolved)?.[1];

      if (layer === 'spec' && importedLayer === 'primitive') {
        context.report({ node, messageId: 'specImportsPrimitive', data: { dir } });
        return;
      }

      if (layer === 'primitive' && importedLayer && importedLayer !== 'primitive') {
        context.report({
          node,
          messageId: 'primitiveImportsUp',
          data: { dir: /\/(locators|endpoints|queries)\//.exec(file)?.[1] },
        });
        return;
      }

      if (
        layer === 'vocabulary' &&
        (importedLayer === 'spec' || importedLayer === 'fixtures')
      ) {
        context.report({
          node,
          messageId: 'vocabularyImportsUp',
          data: { what: importedLayer === 'spec' ? 'specs' : 'fixtures' },
        });
      }
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      'CallExpression[callee.name="require"]'(node) {
        const [arg] = node.arguments;
        if (arg && arg.type === 'Literal' && typeof arg.value === 'string') check(node, arg.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          check(node, node.source.value);
        }
      },
    };
  },
};

/** Catch aliased imports such as `@targets/<name>/actions/...`. */
function targetFromBareSpecifier(specifier) {
  const match = /^@targets\/([^/]+)\//.exec(specifier);
  return match ? match[1] : null;
}
