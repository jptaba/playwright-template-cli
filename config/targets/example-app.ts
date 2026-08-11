import type { TargetProfile } from './types';

/**
 * TEMPLATE — copy this file, rename it, and replace every value.
 *
 * It is not a real application. There is no usable default host, so nothing
 * runs against it by accident, and the capability matrix is set to the
 * combination a typical service-backed application has rather than to
 * whatever happens to be true of a demo site.
 *
 * The four steps to add your own application are in docs/handbook.html §08.
 * In short: copy this profile, register it in `config/target.ts`, copy
 * `src/targets/example-app/` alongside it, and replace the contents.
 */
const NO_DEFAULT_HOST = 'https://app.example.invalid';

export const exampleApp: TargetProfile = {
  name: 'example-app',

  // Every environment value comes from the pipeline. A profile that ships a
  // guessable hostname is a profile someone eventually points at production.
  baseURL: process.env.BASE_URL ?? NO_DEFAULT_HOST,
  environment: process.env.TARGET_ENV ?? 'staging',

  credentials: {
    // `vault` for a real application; `local` only where the credentials are
    // genuinely public, as they are for a public demo site.
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? 'local',
    root: 'qa/example-app/pools',
    accountType: 'workforce',
  },

  /**
   * The capability matrix is how every downstream decision is made without
   * anything naming your application. Set these to what is *true*, not to
   * what you would like: a capability declared on but absent fails obscurely,
   * and one declared off is reported as "not applicable" rather than as a
   * silent zero.
   */
  capabilities: {
    mfa: 'none', // 'none' | 'totp' | 'email'
    accountPool: 'static', // 'static' | 'leased'
    serverState: true, // does state need cross-test cleanup?
    api: { enabled: false, baseURL: process.env.API_BASE_URL },
    db: { enabled: false, vaultRole: 'qa-readonly', dialect: 'postgres' },
    contracts: { enabled: false, spec: 'src/targets/example-app/contracts/openapi.yaml' },
  },

  // Which attribute `getByTestId` reads. Applications disagree: `data-test`,
  // `data-testid`, `data-qa`. It is a property of the app, not the framework.
  testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid',

  /**
   * Hosts this profile may drive. An empty allowlist is a refusal, not
   * permission — generation runs against test environments only, enforced by
   * configuration rather than by convention.
   *
   * The default is `.invalid`, which RFC 2606 reserves so it can never
   * resolve. That keeps the template loadable out of the box while making it
   * impossible to reach anything real; replace it, and `baseURL`, together.
   */
  hostAllowlist: (process.env.GENERATION_HOST_ALLOWLIST ?? 'example.invalid')
    .split(',')
    .map((suffix) => suffix.trim())
    .filter(Boolean),

  suites: ['smoke', 'regression'],

  roles: ['standard'],
};
