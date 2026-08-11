import type { TargetProfile } from './types';

/**
 * The reference target — §04.
 *
 * It earns its place for four reasons: it is reachable and stable, it has
 * deliberately broken users (`problem_user`, `performance_glitch_user`,
 * `error_user`) that produce genuine failures with *known causes*, it has a
 * locked-out user for a real negative login path, and it is small enough to
 * reach 100% case coverage.
 *
 * It is a reference target, not a proving ground. Green here demonstrates the
 * wiring works. It says nothing about MFA, account pools, rotation or UI drift
 * — see §22.
 */
export const saucedemo: TargetProfile = {
  name: 'saucedemo',
  baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',

  // Public, trivial credentials — and they still go through the `secrets`
  // fixture on the same path shape as every other target. The moment one
  // target is allowed to bypass the fixture, the lint rule stops being
  // enforceable and the pattern erodes (§04).
  credentials: {
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? 'local',
    root: 'qa/saucedemo/pools',
    accountType: 'shopper',
  },

  capabilities: {
    mfa: 'none', // no MFA here — §12 providers are inert
    accountPool: 'static', // fixed users: no leasing, no rotation, no quarantine
    serverState: false, // cart lives in localStorage; no cross-test cleanup
    // This target publishes no *service* API — it is a client-rendered site
    // with no backend to call. What it does have is an HTTP surface: the
    // documents and assets it serves, whose status codes, content types and
    // headers are a real contract worth asserting. That is what the `api`
    // project tests here, and the vocabulary in `endpoints/` says so plainly
    // rather than pretending there are business endpoints.
    api: {
      enabled: true,
      baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',
    },
    // No database. Nothing to read, and nothing this framework could assert
    // that the UI or the HTTP surface does not already expose — which is the
    // hierarchy in §05 arriving at its correct answer for this target.
    db: { enabled: false },
    // No published JSON schema, so schema conformance has nothing to validate
    // against. `api` on and `contracts` off is a coherent combination, and
    // exactly what the capability matrix exists to express.
    contracts: { enabled: false, spec: null },
  },

  environment: process.env.TARGET_ENV ?? 'reference',

  // This application labels its elements `data-test`; others use
  // `data-testid` or `data-qa`. It is a property of the app, not the framework.
  testIdAttribute: 'data-test',
  hostAllowlist: ['saucedemo.com'],

  suites: ['smoke', 'checkout', 'inventory', 'auth'],

  roles: ['standard'],
  nonAuthenticatingRoles: ['locked_out'],
};
