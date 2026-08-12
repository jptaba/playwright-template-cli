import type { TargetProfile } from './types';

/**
 * toolshop — the application under test is configuration, not code (§04).
 *
 * The Toolshop demo (practicesoftwaretesting.com): an Angular storefront over a
 * Laravel REST API, with a published OpenAPI 3.2 document.
 *
 * Every value below is a claim about the application: set them to what is
 * *true*, not to what you would like. Two of them were set to what is true of
 * *this deployment* rather than of the product, and the distinction is the
 * whole point of the capability matrix:
 *
 *  - `mfa: 'none'` even though the API publishes `/totp/setup` and
 *    `/totp/verify`, and the profile page offers the full setup for some seeded
 *    logins (others are refused with "please create your own account" — it
 *    varies by account, not by deployment). The product has two-factor
 *    authentication and this account could enable it; none of the accounts the
 *    suite signs in as has it *enabled*, so no sign-in demands a second factor.
 *    A capability describes what the suite must actually handle, not what the
 *    product is capable of.
 *  - `db: { enabled: false }` because the hosted deployment exposes no database
 *    port. The same application run from its own docker-compose publishes
 *    MariaDB on 3306, so a `toolshop-local` profile would turn this on and the
 *    same target pack would gain the `db` layer with no other change.
 *
 * `npm run target:doctor` checks this file against the pack and the secret
 * store, and names the file to fix for anything that disagrees.
 */
export const toolshop: TargetProfile = {
  name: 'toolshop',

  // Environment values come from the pipeline where there is one, so a profile
  // never ships a host someone can accidentally point at production.
  baseURL: process.env.BASE_URL ?? 'https://practicesoftwaretesting.com',
  environment: process.env.TARGET_ENV ?? 'demo',

  /**
   * A vendor's public demonstration site, shared with everyone on the internet.
   *
   * Set from hard experience during onboarding: specs asserting that a wrong
   * password is refused locked the shared customer account — twice, on two
   * different accounts — and the lock is permanent until an administrator
   * clears it. Anything whose blast radius is somebody else's next test run is
   * skipped while this is true. Point the profile at a local `docker compose`
   * deployment and it becomes false, and those specs run.
   */
  sharedEnvironment: process.env.SHARED_ENVIRONMENT !== 'false',

  credentials: {
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? 'local',
    root: 'qa/toolshop/pools',
    accountType: 'workforce',
  },

  capabilities: {
    mfa: 'none', // 'none' | 'totp' | 'email'
    accountPool: 'static', // 'static' | 'leased'
    serverState: true, // does state need cross-test cleanup?
    api: { enabled: true, baseURL: process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com' },
    // The hosted deployment publishes no database port. Running the same
    // application from its own docker-compose exposes MariaDB on 3306, which is
    // when this becomes `{ enabled: true, dialect: 'mysql' }`.
    db: { enabled: false, vaultRole: 'qa-readonly', dialect: 'mysql' },
    // The service's own published document, vendored and pinned. Not written by
    // hand from observed responses — a schema derived from traffic can only
    // ever agree with itself.
    contracts: { enabled: true, spec: 'src/targets/toolshop/contracts/openapi.json' },
    a11y: {
      enabled: true,
      standard: process.env.A11Y_STANDARD ?? 'wcag22aa',
      /**
       * Accepted exceptions, each with a reason and a review date, so a known
       * problem is a recorded decision rather than a deleted assertion.
       *
       * Both are scoped. A bare rule id waives that rule on every page the
       * suite will ever scan, which turns an accepted exception into a
       * blindfold — accept one unlabelled button here and an unlabelled button
       * added to the checkout next month is never reported. The scan still
       * counts the nodes each waiver suppressed, and any node the waiver does
       * not cover is still a failure.
       *
       * Both findings below are real, reproduced against the live deployment,
       * and both are upstream defects in the application under test rather
       * than anything this suite can fix.
       */
      waived: [
        {
          rule: 'button-name',
          reason:
            'The show/hide-password toggle on the sign-in and registration forms is an icon ' +
            'button with no accessible name (WCAG 4.1.2). Upstream defect in the application; ' +
            'accepted so the rest of the suite can hold every other button to the standard.',
          urlPattern: '/auth/(login|register)',
          selector: 'btn-outline-secondary',
          reviewBy: '2026-11-30',
        },
        {
          rule: 'list',
          reason:
            'The category and brand filter tree nests a <ul> directly inside a wrapper <div> ' +
            'rather than inside an <li> (WCAG 1.3.1). Upstream markup defect in the filter ' +
            'component; it does not affect the announced grouping in practice.',
          selector: 'checkbox',
          reviewBy: '2026-11-30',
        },
      ],
    },
  },

  // Which attribute `getByTestId` reads. Applications disagree — data-test,
  // data-testid, data-qa — and it is a property of the app, not the framework.
  testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-test',

  // Hosts this profile may drive. Generation and exploration run against test
  // environments only, enforced here rather than by convention (§17).
  hostAllowlist: ['practicesoftwaretesting.com'],

  /**
   * Specs that must start signed out, and therefore belong to `auth-flows`
   * rather than `e2e`.
   *
   * The framework's default is `(login|mfa|password).spec.ts`, which does not
   * cover registration — and registering is a signed-out journey on every
   * application that has one. Left on the default, `register.spec.ts` runs in
   * the `e2e` project carrying a customer session, and the application
   * redirects away from the form before the spec can touch it.
   */
  authFlowPattern: /(login|mfa|password|register|forgot)\.spec\.ts$/,

  suites: ['smoke', 'regression'],

  // The first role is the default identity for `authedPage`.
  roles: ['customer', 'admin'],
};
