import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — typed endpoint descriptors: the HTTP equivalent of a named locator.
 * No logic, no assertions, and no host — the base URL comes from the profile.
 *
 * Every path below is written exactly as the vendored OpenAPI document writes
 * it, including the parameter names. That is what lets a response be
 * schema-checked without a second mapping to keep in step: the descriptor and
 * the contract agree because they are the same string.
 *
 * `target:doctor` compares this file against the document and reports an
 * endpoint the service does not publish — which is not hypothetical. An
 * invented `GET /categories/{categoryId}` on a previous target answered 405 on
 * every call, and the check exists because of it.
 */
export const catalogueEndpoints = {
  listProducts: { name: 'List products', method: 'GET', path: '/products', expect: [200] },
  getProduct: { name: 'Read a product', method: 'GET', path: '/products/{productId}', expect: [200] },
  searchProducts: { name: 'Search products', method: 'GET', path: '/products/search', expect: [200] },
  relatedProducts: {
    name: 'Products related to one',
    method: 'GET',
    path: '/products/{productId}/related',
    expect: [200],
  },
  listCategories: { name: 'List categories', method: 'GET', path: '/categories', expect: [200] },
  listBrands: { name: 'List brands', method: 'GET', path: '/brands', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;

export const authEndpoints = {
  login: { name: 'Sign in', method: 'POST', path: '/users/login', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;
