import type { EndpointDescriptor } from '../../../src/integrations/http/api-client';

/**
 * L1 — typed endpoint descriptors: the HTTP equivalent of a named locator.
 * Data, not logic, and no concrete host — the base URL comes from the profile.
 *
 * Naming the endpoints once is what lets `typed-clients-only` forbid raw
 * `request.*` in specs: a model given a free hand at HTTP invents paths,
 * payloads and status codes with total confidence and no page to contradict it.
 *
 * Paths are OpenAPI templates so the same string identifies the endpoint in the
 * vendored contract document, and every response is schema-checked without a
 * second mapping to keep in step.
 */
export const orderEndpoints = {
  create: { name: 'Create an order', method: 'POST', path: '/orders', expect: [201] },
  get: { name: 'Read an order', method: 'GET', path: '/orders/{id}', expect: [200] },
  cancel: { name: 'Cancel an order', method: 'DELETE', path: '/orders/{id}', expect: [204] },
} satisfies Record<string, EndpointDescriptor>;
