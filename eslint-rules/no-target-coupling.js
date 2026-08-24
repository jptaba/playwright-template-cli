'use strict';

const { relPath, isFramework, targetNames, TARGET_PACK_ROOT } = require('./lib/paths');

/**
 * Framework code may not name an application under test (§04).
 *
 * `layer-boundaries` stops the framework *importing* a target pack. This stops
 * the subtler version: a hostname in a comment is harmless, but
 * `if (target.name === 'saucedemo')` in a fixture is how a framework acquires
 * a special case for the app it was written against, and the special case is
 * never noticed until the second application arrives.
 *
 * Target names are read from the directories under `targets/`, so adding an
 * application never means editing this rule.
 *
 * The way to branch is a declared capability — `capabilities.mfa === 'none'`
 * says *what is true of the target*, and holds for every application that
 * shares the property.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Framework code branches on capabilities, never on a target name.' },
    /**
     * The names to treat as targets. Defaults to whatever is in `targets/`,
     * which is what every real run uses — `eslint.config.js` passes nothing.
     *
     * It exists for this rule's own tests. They previously asserted against
     * whichever application happened to be onboarded, so they proved nothing
     * in the state the repository ships in (no targets at all) and broke the
     * moment a different application was onboarded — the framework's own
     * suite coupled to one application, inside the tests of the rule that
     * exists to prevent exactly that.
     */
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { names: { type: 'array', items: { type: 'string' } } },
      },
    ],
    messages: {
      namesTarget:
        "Framework code refers to the target '{{name}}' by name. Branch on a declared capability " +
        'from the target profile instead — `capabilities.api.enabled`, `capabilities.mfa` — so ' +
        'the behaviour holds for every application with that property (§04).',
      pathsIntoTarget:
        "Framework code builds a path into 'targets/{{name}}'. Resolve target paths from the " +
        'profile (`target.name`) rather than writing one in (§04).',
    },
  },

  create(context) {
    const file = relPath(context);
    if (!isFramework(file)) return {};

    const names = context.options[0]?.names ?? targetNames();
    if (names.length === 0) return {};

    const check = (node, text) => {
      for (const name of names) {
        if (!text.includes(name)) continue;
        const messageId = text.includes(`${TARGET_PACK_ROOT}/${name}`)
          ? 'pathsIntoTarget'
          : 'namesTarget';
        context.report({ node, messageId, data: { name } });
        return;
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
