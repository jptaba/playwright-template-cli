'use strict';

const { relPath, layerOf, authFlowPatternFor } = require('./lib/paths');

const AUTH_TAG = /@auth\b/;

/**
 * Any spec tagged `@auth` must run in the `auth-flows` project (§13).
 *
 * Two failures this prevents. A spec about signing in that inherits a session
 * passes without ever exercising the login form. And a spec that takes
 * `authedPage` while tagged `@auth` is asking for a session it was supposed to
 * establish itself — which reads as green until login actually breaks.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: '@auth specs live where the signed-out project picks them up.' },
    schema: [],
    messages: {
      wrongFile:
        'This spec is tagged @auth but lives in "{{file}}", which the auth-flows project does not ' +
        'match ({{pattern}}). Move it into a file that pattern matches, or widen ' +
        "`authFlowPattern` in the target's profile — otherwise it runs with a session already " +
        'established and passes without testing anything (§13).',
      authedPageInAuthFlow:
        'An @auth spec must not take `authedPage` — it runs signed out by design. Use `page` and ' +
        'establish the session the spec is about (§13).',
      pageInSignedInFile:
        'This file runs in the e2e project, which is signed in. A spec here that drives the login ' +
        'form is testing a session it already has; tag it @auth and move it into a file the ' +
        "target's `authFlowPattern` matches (§13).",
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};
    /*
       Taken from the selecting target's own profile, so the rule and
       `playwright.config.ts` cannot disagree about which files the signed-out
       project owns. A hardcoded copy here rejected files the runner handled
       correctly, and told the author to undo the override that made them work.
    */
    const pattern = authFlowPatternFor(file);
    const isAuthFlowFile = pattern.test(file);

    return {
      CallExpression(node) {
        const callee = node.callee;
        const isTest =
          (callee.type === 'Identifier' && callee.name === 'test') ||
          (callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'test' &&
            ['only', 'fixme', 'skip', 'fail', 'slow'].includes(callee.property.name));
        if (!isTest) return;

        const [titleNode] = node.arguments;
        if (!titleNode || titleNode.type !== 'Literal' || typeof titleNode.value !== 'string') {
          return;
        }
        const tagged = AUTH_TAG.test(titleNode.value);

        if (tagged && !isAuthFlowFile) {
          context.report({
            node: titleNode,
            messageId: 'wrongFile',
            data: { file, pattern: String(pattern) },
          });
          return;
        }

        if (tagged && usesFixture(node, 'authedPage')) {
          context.report({ node, messageId: 'authedPageInAuthFlow' });
          return;
        }

        if (!tagged && isAuthFlowFile && usesFixture(node, 'authedPage')) {
          context.report({ node, messageId: 'pageInSignedInFile' });
        }
      },
    };
  },
};

/** Does the test body destructure the named fixture from its arguments? */
function usesFixture(callNode, fixtureName) {
  const body = callNode.arguments[callNode.arguments.length - 1];
  if (!body || (body.type !== 'ArrowFunctionExpression' && body.type !== 'FunctionExpression')) {
    return false;
  }
  const [firstParam] = body.params;
  if (!firstParam || firstParam.type !== 'ObjectPattern') return false;
  return firstParam.properties.some(
    (prop) => prop.type === 'Property' && !prop.computed && prop.key.name === fixtureName,
  );
}
