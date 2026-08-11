import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — TEMPLATE. Typed endpoint descriptors: the HTTP equivalent of a named
 * locator. No logic, no assertions, and no concrete host — the base URL comes
 * from the profile.
 *
 * Paths are OpenAPI templates so the same string identifies the endpoint in
 * the vendored contract document, which is what lets every response be
 * schema-checked without a second mapping to keep in step.
 */
export const orderEndpoints = {
  create: { name: 'Create an order', method: 'POST', path: '/orders', expect: [201] },
  get: { name: 'Read an order', method: 'GET', path: '/orders/{id}', expect: [200] },
  cancel: { name: 'Cancel an order', method: 'DELETE', path: '/orders/{id}', expect: [204] },
} satisfies Record<string, EndpointDescriptor>;
