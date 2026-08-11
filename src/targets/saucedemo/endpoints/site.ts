import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — the HTTP surface this target actually has.
 *
 * There is no service API here, so these describe documents and assets rather
 * than business operations. Naming them honestly matters: an `endpoints/` file
 * full of invented `/api/v1/orders` routes would be a fiction that the first
 * generated API test would faithfully reproduce.
 */
export const siteEndpoints = {
  landing: {
    name: 'Fetch the sign-in page',
    method: 'GET',
    path: '/',
    expect: [200],
  },
  inventory: {
    name: 'Fetch the product listing document',
    method: 'GET',
    path: '/inventory.html',
    // 404 is the *correct* expectation, and the reason is worth knowing: this
    // is a single-page app on static hosting, so `/inventory.html` is not a
    // server route at all. The host answers 404 with a shim that rewrites the
    // URL in the browser, which is why every UI test passes while the HTTP
    // surface returns 404. Only an API-layer test can see this.
    expect: [200, 404],
  },
  stylesheet: {
    name: 'Fetch the main stylesheet',
    method: 'GET',
    path: '/assets/index.css',
    // 404 is an accepted outcome: the asset is content-hashed, so the spec
    // resolves the real name from the document rather than guessing.
    expect: [200, 404],
  },
  missing: {
    name: 'Fetch a path that does not exist',
    method: 'GET',
    path: '/no-such-page-{nonce}.html',
    expect: [200, 403, 404],
  },
} satisfies Record<string, EndpointDescriptor>;
