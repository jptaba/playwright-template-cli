import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — the customer-facing surfaces that are neither catalogue nor order:
 * contact messages, favourites and the postcode lookup.
 */
export const messageEndpoints = {
  send: { name: 'Send a contact message', method: 'POST', path: '/messages', expect: [200] },
  list: { name: 'List contact messages', method: 'GET', path: '/messages', expect: [200] },
  read: { name: 'Read one contact message', method: 'GET', path: '/messages/{messageId}', expect: [200] },
  reply: {
    name: 'Reply to a contact message',
    method: 'POST',
    path: '/messages/{messageId}/reply',
    expect: [200],
  },
  updateStatus: {
    name: 'Change a message’s status',
    method: 'PUT',
    path: '/messages/{messageId}/status',
    expect: [200],
  },
} satisfies Record<string, EndpointDescriptor>;

export const favoriteEndpoints = {
  list: { name: 'List favourites', method: 'GET', path: '/favorites', expect: [200] },
  /**
   * The service answers **201**; the published document declares only 200.
   *
   * `expect` describes what the running service actually does, because its job
   * is to stop a behavioural spec failing for a reason that has nothing to do
   * with the behaviour. The disagreement itself is not swallowed — it is
   * asserted in `tests/contract/status-codes.spec.ts`, where a document that
   * does not describe its own service is exactly the finding the contract
   * project exists to produce.
   */
  add: { name: 'Add a favourite', method: 'POST', path: '/favorites', expect: [200, 201] },
  read: { name: 'Read one favourite', method: 'GET', path: '/favorites/{favoriteId}', expect: [200] },
  remove: {
    name: 'Remove a favourite',
    method: 'DELETE',
    path: '/favorites/{favoriteId}',
    expect: [204],
  },
} satisfies Record<string, EndpointDescriptor>;

export const lookupEndpoints = {
  /**
   * Backed by a third-party service, and documented as able to answer 502 when
   * that service is unavailable. A spec that treats 502 as a defect in this
   * application would be reporting somebody else's outage.
   */
  postcode: { name: 'Look up a postcode', method: 'GET', path: '/postcode-lookup', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;
