import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — typed endpoint descriptors: the HTTP equivalent of a named locator.
 * Data, not logic, and no concrete host — the base URL comes from the profile.
 *
 * Every `path` below is copied from the vendored OpenAPI document rather than
 * from an observed request, because the same string is the key the contract
 * registry validates responses against. A path that is *equivalent* but not
 * *identical* — `/users/{id}` where the document says `/users/{userId}` —
 * silently opts that endpoint out of schema checking, and the suite reports
 * coverage it does not have.
 *
 * `expect` is the set of statuses that are a normal outcome, not the set the
 * document lists: the document lists every status the endpoint can produce,
 * including the ones that mean the call was wrong.
 */
export const authEndpoints = {
  login: { name: 'Sign in', method: 'POST', path: '/users/login', expect: [200] },
  register: { name: 'Register a customer', method: 'POST', path: '/users/register', expect: [201] },
  me: { name: 'Read the signed-in user', method: 'GET', path: '/users/me', expect: [200] },
  logout: { name: 'Sign out', method: 'GET', path: '/users/logout', expect: [200] },
  refresh: { name: 'Refresh the access token', method: 'GET', path: '/users/refresh', expect: [200] },
  forgotPassword: {
    name: 'Request a password reset',
    method: 'POST',
    path: '/users/forgot-password',
    expect: [200],
  },
  changePassword: {
    name: 'Change the password',
    method: 'POST',
    path: '/users/change-password',
    expect: [200],
  },

  /**
   * Published, and not reachable for the seeded logins this suite uses: the
   * hosted deployment answers "please create your own account". Named here so
   * the contract project can still assert the document describes them, which
   * is a different claim from "we exercise them".
   */
  totpSetup: { name: 'Begin two-factor setup', method: 'POST', path: '/totp/setup', expect: [200] },
  totpVerify: { name: 'Verify a two-factor code', method: 'POST', path: '/totp/verify', expect: [200] },

  // ---- administrator-only ---------------------------------------------------
  listUsers: { name: 'List customers', method: 'GET', path: '/users', expect: [200] },
  searchUsers: { name: 'Search customers', method: 'GET', path: '/users/search', expect: [200] },
  readUser: { name: 'Read one customer', method: 'GET', path: '/users/{userId}', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;
