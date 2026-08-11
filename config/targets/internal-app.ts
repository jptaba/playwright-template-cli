import type { TargetProfile } from './types';

/**
 * The real target — §04, §05.
 *
 * Deliberately env-driven with no usable default. A profile that ships a
 * guessable internal hostname is a profile someone eventually points at the
 * wrong environment. Every value here comes from the pipeline, and
 * `assertNonProductionHost` in config/target.ts still has to pass.
 *
 * Its locator, action, endpoint, query and spec packs live under
 * `src/targets/internal-app/`. Swapping targets selects a pack — it does not
 * reuse one. A base URL swap is a line of config; a different application is a
 * different set of locators, actions and specs, and no indirection changes that.
 */
const PLACEHOLDER = 'https://app.internal.invalid';

export const internalApp: TargetProfile = {
  name: 'internal-app',
  baseURL: process.env.BASE_URL ?? PLACEHOLDER,

  credentials: {
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? 'vault',
    root: `qa/${process.env.TARGET_ENV ?? 'staging'}/pools`,
    accountType: 'workforce',
  },

  capabilities: {
    mfa: 'totp',
    accountPool: 'leased',
    serverState: true,
    api: {
      enabled: process.env.API_ENABLED === 'true',
      baseURL: process.env.API_BASE_URL ?? PLACEHOLDER,
    },
    // Off until §23 answers "which facts genuinely need database assertions?".
    // If everything under test has an API surface, this capability stays off
    // and a class of brittleness never enters the suite.
    db: {
      enabled: process.env.DB_ENABLED === 'true',
      vaultRole: 'qa-readonly',
      dialect: 'postgres',
    },
    contracts: {
      enabled: process.env.CONTRACTS_ENABLED === 'true',
      spec: 'src/targets/internal-app/contracts/openapi.yaml',
    },
  },

  environment: process.env.TARGET_ENV ?? 'staging',
  mailBaseAddress: process.env.OTP_MAIL_ADDRESS ?? 'qa-automation@internal.invalid',

  testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid',
  hostAllowlist: (process.env.GENERATION_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((suffix) => suffix.trim())
    .filter(Boolean),

  suites: ['smoke', 'regression', 'api', 'contract'],

  roles: ['submitter', 'approver'],
};
