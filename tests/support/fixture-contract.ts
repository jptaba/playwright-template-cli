import { defineQuery } from '../../src/integrations/db/reader';

/**
 * Fixtures for the framework's own tests.
 *
 * These used to be imported from a target pack, which was a coupling the
 * framework forbids everywhere else: the self-tests would have failed the day
 * that application was removed, and they were quietly asserting one target's
 * choices rather than the framework's behaviour.
 *
 * Everything the unit tests need now lives here, owned by the tests.
 */
// Typed loosely on purpose: this is a document fixture, and the registry's
// own parser is what should be under test rather than TypeScript's view of a
// literal.
export const CONTRACT_DOCUMENT: Record<string, unknown> = {
  openapi: '3.0.3',
  info: { title: 'Fixture orders service', version: '1.0' },
  paths: {
    '/orders': {
      post: {
        operationId: 'createOrder',
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
          '400': {
            description: 'Invalid payload',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } },
          },
        },
      },
      get: {
        operationId: 'listOrders',
        responses: {
          '200': {
            description: 'A page of orders',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/orders/{id}': {
      get: {
        operationId: 'getOrder',
        responses: {
          '200': {
            description: 'The order',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
        },
      },
      delete: { operationId: 'cancelOrder', responses: { '204': { description: 'Cancelled' } } },
    },
  },
  components: {
    schemas: {
      Order: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'reference', 'customerId', 'status', 'total', 'lines', 'createdAt'],
        properties: {
          id: { type: 'string' },
          reference: { type: 'string' },
          customerId: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
          total: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['sku', 'quantity'],
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
      Problem: {
        type: 'object',
        required: ['title', 'status'],
        properties: {
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
        },
      },
    },
  },
};

/** Named, parameterised statements — the shape a target's `queries/` takes. */
export const fixtureQueries = {
  entryForReference: defineQuery<{ reference: string; amount: number }>({
    name: 'ledger entry for a reference',
    sql: `SELECT reference, amount FROM ledger_entries WHERE reference = $1 LIMIT 1`,
    parameters: 1,
  }),
  auditTrailForOrder: defineQuery<{ action: string; at: string }>({
    name: 'audit trail for an order',
    sql: `SELECT action, occurred_at AS "at" FROM order_audit WHERE order_id = $1`,
    parameters: 1,
  }),
};
