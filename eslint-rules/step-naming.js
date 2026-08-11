'use strict';

const { relPath, layerOf } = require('./lib/paths');

/**
 * Mechanics, not intent: the report reads as instructions to a browser.
 *
 * Only unambiguous verbs are listed. "Check out as far as the order overview"
 * is business language that happens to start with "check", so `check` carries
 * a negative lookahead — a rule that cries wolf gets disabled file-wide, and
 * then it enforces nothing at all.
 */
const MECHANICAL_VERB =
  /^\s*(click|dbl?click|fill|type|press|select|check(?!\s*(out|-out))|uncheck|hover|drag|scroll|goto|navigate to the url|waitfor)\b/i;
/** A selector wandered into a step title. */
const SELECTOR_SHAPED = /(#[\w-]+|\.[a-z][\w-]*\s*$|\[data-[\w-]+|css=|xpath=|\/\/[a-z]+\[)/i;

/**
 * `test.step()` titles become the report's narrative, so step naming stops
 * being cosmetic and becomes the report's readability (§18).
 *
 * "Submit the expense claim", never "click #submit-btn". A product owner
 * reading the evidence band should not have to know what a locator is.
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Step titles state intent in business language, not mechanics.' },
    schema: [],
    messages: {
      mechanical:
        'Step title "{{title}}" describes mechanics. Step titles are the report\'s narrative for ' +
        'a reader who does not know what a locator is — name the intent: "Submit the expense ' +
        'claim", not "click #submit-btn" (§18).',
      selector:
        'Step title "{{title}}" contains a selector. Titles are read by product owners in the ' +
        'evidence band of the report (§18).',
      empty: 'Step title is empty. An unnamed step is a gap in the report\'s narrative.',
    },
  },

  create(context) {
    const file = relPath(context);
    const layer = layerOf(file);
    if (layer !== 'vocabulary' && layer !== 'spec') return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.name !== 'step' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'test'
        ) {
          return;
        }

        const [titleNode] = node.arguments;
        if (!titleNode) return;

        const title = staticText(titleNode);
        if (title === null) return; // computed at runtime — nothing to check

        if (title.trim() === '') {
          context.report({ node: titleNode, messageId: 'empty' });
          return;
        }
        if (SELECTOR_SHAPED.test(title)) {
          context.report({ node: titleNode, messageId: 'selector', data: { title } });
          return;
        }
        if (MECHANICAL_VERB.test(title)) {
          context.report({ node: titleNode, messageId: 'mechanical', data: { title } });
        }
      },
    };
  },
};

/** Text of a literal or of a template literal's fixed parts. */
function staticText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.raw).join('…');
  return null;
}
