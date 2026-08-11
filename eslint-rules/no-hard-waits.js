'use strict';

const { relPath, layerOf } = require('./lib/paths');

/**
 * No `waitForTimeout`, ever (§03).
 *
 * `expect.poll` is the only acceptable answer to eventual consistency, and it
 * is what lets the no-hard-waits rule survive contact with integration
 * testing: a ledger posting that is asynchronous gets polled with a bounded
 * timeout, not slept at (§05).
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban fixed sleeps in target packs. Wait for a condition instead.' },
    schema: [],
    messages: {
      waitForTimeout:
        'waitForTimeout() makes a suite slow and flaky at the same time. Wait for the ' +
        'condition: a web-first assertion, locator.waitFor(), or expect.poll() for eventual consistency.',
      sleep:
        'Hand-rolled sleep via {{how}}. Wait for the condition instead — expect.poll() with a ' +
        'bounded timeout fails as a clear assertion rather than a hung test.',
    },
  },

  create(context) {
    const file = relPath(context);
    if (!layerOf(file)) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.name === 'waitForTimeout'
        ) {
          context.report({ node, messageId: 'waitForTimeout' });
          return;
        }

        if (callee.type === 'Identifier' && callee.name === 'setTimeout') {
          context.report({ node, messageId: 'sleep', data: { how: 'setTimeout' } });
          return;
        }

        if (callee.type === 'Identifier' && /^(sleep|delay|pause|wait)$/.test(callee.name)) {
          context.report({ node, messageId: 'sleep', data: { how: `${callee.name}()` } });
        }
      },
    };
  },
};
