'use strict';

const { relPath, isFramework, targetNames } = require('./lib/paths');

/**
 * Framework code may not name an application under test (§04).
 *
 * `layer-boundaries` stops the framework *importing* a target pack. This stops
 * the subtler version: a hostname in a comment is harmless, but
 * `if (target.name === 'saucedemo')` in a fixture is how a framework acquires
 * a special case for the app it was written against, and the special case is
 * never noticed until the second application arrives.
 *
 * Target names are read from `config/targets/*.ts`, so adding an application
 * never means editing this rule.
 *
 * The way to branch is a declared capability — `capabilities.mfa === 'none'`
 * says *what is true of the target*, and holds for every application that
 * shares the property.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Framework code branches on capabilities, never on a target name.' },
    schema: [],
    messages: {
      namesTarget:
        "Framework code refers to the target '{{name}}' by name. Branch on a declared capability " +
        'from the target profile instead — `capabilities.api.enabled`, `capabilities.mfa` — so ' +
        'the behaviour holds for every application with that property (§04).',
      pathsIntoTarget:
        "Framework code builds a path into 'src/targets/{{name}}'. Resolve target paths from the " +
        'profile (`target.name`) rather than writing one in (§04).',
    },
  },

  create(context) {
    const file = relPath(context);
    if (!isFramework(file)) return {};

    const names = targetNames();
    if (names.length === 0) return {};

    const check = (node, text) => {
      for (const name of names) {
        if (!text.includes(name)) continue;
        const messageId = text.includes(`src/targets/${name}`) ? 'pathsIntoTarget' : 'namesTarget';
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
