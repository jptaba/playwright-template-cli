'use strict';

const { relPath, layerOf } = require('./lib/paths');

const RAW_HTTP = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);
const SQL_LITERAL = /^\s*(select|insert|update|delete|with|merge|truncate|drop)\s+/i;

/**
 * No raw `request.*` or SQL literals in specs (§07).
 *
 * A model asked to write an API test with a raw `request.post` available will
 * invent endpoints, payload shapes and status codes with total confidence and
 * no page to contradict it. A typed client generated from the same catalog the
 * UI actions live in turns that back into multiple choice (§05).
 *
 * Inline SQL is where injection-shaped mistakes and unreadable tests both come
 * from: named, parameterised statements live in `db/`, exactly like locators.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Specs call typed clients, never raw HTTP or inline SQL.' },
    schema: [],
    messages: {
      rawRequest:
        "Raw HTTP call '{{receiver}}.{{method}}()' in a spec. Call a typed client from the " +
        "target's api/ vocabulary — it carries the endpoint, the payload type and the schema " +
        'check that makes contract drift a reported category rather than a mystery (§05).',
      inlineSql:
        'Inline SQL in a spec. Named, parameterised statements live in the target\'s db/ ' +
        'vocabulary with typed return shapes, exactly like locators (§05).',
      rawFetch:
        'Raw fetch() in a spec. Use the typed client so the call inherits the proxy, the CA ' +
        'bundle, response-schema validation and the trace (§05).',
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};

    return {
      CallExpression(node) {
        const callee = node.callee;

        if (callee.type === 'Identifier' && callee.name === 'fetch') {
          context.report({ node, messageId: 'rawFetch' });
          return;
        }

        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const method = callee.property.name;
        if (!RAW_HTTP.has(method)) return;

        const receiver = receiverName(callee.object);
        if (receiver === 'request' || receiver === 'apiRequest' || receiver === 'page.request') {
          context.report({ node, messageId: 'rawRequest', data: { receiver, method } });
        }
      },

      Literal(node) {
        if (typeof node.value === 'string' && SQL_LITERAL.test(node.value)) {
          context.report({ node, messageId: 'inlineSql' });
        }
      },

      TemplateLiteral(node) {
        const raw = node.quasis.map((quasi) => quasi.value.raw).join(' ');
        if (SQL_LITERAL.test(raw)) context.report({ node, messageId: 'inlineSql' });
      },
    };
  },
};

function receiverName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    return `${receiverName(node.object)}.${node.property.name}`;
  }
  return '';
}
