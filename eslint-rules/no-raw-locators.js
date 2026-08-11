'use strict';

const { relPath, layerOf } = require('./lib/paths');

const FORBIDDEN_METHODS = new Set(['locator', '$', '$$', 'elementHandle', 'waitForSelector']);
const JUSTIFICATION = /locator-justification:/i;

/**
 * A markdown rule saying "prefer getByRole" is advisory. This is a feedback
 * signal the agent can act on by itself (§02).
 *
 * Raw CSS and XPath are permitted only with an inline justification comment
 * the rule recognises, because there is always one dialog somewhere with no
 * accessible name and nothing to hang a role on. Making the escape hatch
 * explicit and greppable is better than a rule people disable file-wide.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Use Playwright user-facing locators. Raw CSS/XPath needs an inline justification.',
    },
    schema: [],
    messages: {
      rawLocator:
        "Raw selector via '.{{method}}()'. Prefer getByRole, then getByLabel, then getByTestId. " +
        'If nothing else works, add a `// locator-justification: <reason>` comment on the line above.',
      xpath: 'XPath selectors are not permitted. Prefer getByRole, getByLabel or getByTestId.',
    },
  },

  create(context) {
    const file = relPath(context);
    const layer = layerOf(file);
    // Framework code and tools do not drive pages; only the target packs do.
    if (!layer) return {};

    const source = context.sourceCode ?? context.getSourceCode();

    /**
     * The escape hatch is textual and deliberately so: the comment may sit on
     * the line above or trail the call, and it survives the reformatting that
     * moves an AST node away from the comment attached to it.
     */
    const hasJustification = (node) => {
      const line = node.loc.start.line;
      const current = source.lines[line - 1] ?? '';
      const previous = source.lines[line - 2] ?? '';
      return JUSTIFICATION.test(current) || JUSTIFICATION.test(previous);
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const name = callee.property.name;
        if (!FORBIDDEN_METHODS.has(name)) return;

        const [first] = node.arguments;
        if (first && first.type === 'Literal' && typeof first.value === 'string') {
          if (/^(xpath=|\/\/|\.\/\/)/.test(first.value.trim())) {
            context.report({ node, messageId: 'xpath' });
            return;
          }
        }

        if (hasJustification(node)) return;
        context.report({ node, messageId: 'rawLocator', data: { method: name } });
      },
    };
  },
};
