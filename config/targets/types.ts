import type { PasswordPolicy } from '../../src/support/rotation/policy';
import type { RotationConfig } from '../../src/support/rotation/schedule';

/**
 * Target profile types — §04 of docs/plan.html.
 *
 * The application under test is configuration, not code. A profile carries a
 * base URL, credential references and a capability matrix. Nothing else in the
 * framework may name a host: `no-hardcoded-urls` fails any `http(s)://` literal
 * outside `config/targets/`.
 */

/** How multi-factor authentication is done on this target, if at all. */
export type MfaMode = 'none' | 'totp' | 'email';

/**
 * `static` — fixed users, no leasing, no rotation (a demo app).
 * `leased`  — accounts leased per worker from a Vault-backed pool (§13).
 */
export type AccountPoolMode = 'static' | 'leased';

/** Where the `secrets` fixture resolves credential references from (§11). */
export type SecretSource = 'vault' | 'local';

export type SqlDialect = 'postgres' | 'mysql' | 'mssql';

export interface ApiCapability {
  enabled: boolean;
  /** Base URL for the service API. Often a different host from the web front end. */
  baseURL?: string;
}

export interface DbCapability {
  enabled: boolean;
  /** Vault database-secrets-engine role issuing short-lived read-only credentials. */
  vaultRole?: string;
  dialect?: SqlDialect;
}

export interface ContractsCapability {
  enabled: boolean;
  /** Repo-relative path to the vendored, pinned OpenAPI/JSON Schema document. */
  spec: string | null;
}

/**
 * Accessibility standards this framework knows the names of. Used for the
 * scaffolder's validation and the doctor's spell-check — not as a closed set.
 */
export const KNOWN_A11Y_STANDARDS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
  'wcag22aaa',
  'en301549',
  'section508',
] as const;

export type KnownA11yStandard = (typeof KNOWN_A11Y_STANDARDS)[number];

/**
 * Which accessibility standard this application has actually committed to.
 *
 * Deliberately an *open* union: the known names give autocomplete and a
 * spell-check, but any string is accepted. Standards outlive frameworks — WCAG
 * 2.2 became a Recommendation in 2023 and 3.0 is in draft — and a target
 * needing a newer one must not have to wait on an edit to a shared type in
 * this repository. That is the same rule the rest of onboarding follows: if
 * adding an application means editing framework code, the framework is wrong.
 *
 * `npm run target:doctor` warns when the value is not one it recognises, which
 * catches the typo without blocking the standard that has not been invented
 * yet.
 */
export type A11yStandard = KnownA11yStandard | (string & {});

/**
 * Accessibility testing (§05).
 *
 * A capability rather than a tag, because "is this application held to WCAG
 * 2.2 AA?" is a property of the application and its contract with its users,
 * not a property of a spec. Naming the standard matters: an accessibility
 * suite with no stated standard is a suite that argues about every finding.
 */
export interface A11yCapability {
  enabled: boolean;
  /**
   * The standard this application is held to. Environment-overridable in a
   * generated profile, like every other value here that can differ between
   * deployments — a pipeline should be able to raise the bar for one
   * environment without a code change.
   */
  standard: A11yStandard;
  /**
   * Rules the product owner has accepted and dated, so a known exception is a
   * recorded decision rather than a test somebody quietly deleted.
   */
  waived?: { rule: string; reason: string; reviewBy: string }[];
}

/**
 * Capabilities are consulted, not assumed. A fixture for a disabled capability
 * skips the test with a stated reason rather than hanging until timeout, and
 * the run report says "not applicable for <target>" rather than a silent zero.
 */
export interface TargetCapabilities {
  mfa: MfaMode;
  accountPool: AccountPoolMode;
  /** False when all state is client-side, so no cross-test cleanup is needed. */
  serverState: boolean;
  api: ApiCapability;
  db: DbCapability;
  contracts: ContractsCapability;
  a11y: A11yCapability;
}

export interface CredentialRefs {
  source: SecretSource;
  /**
   * Root of the credential path shape shared by every target:
   *   `<root>/<accountType>/<role>/<n>`
   * On Vault this is a KV v2 path; on `local` it is a key in the dev store.
   */
  root: string;
  /** The account type this target's suites lease from. */
  accountType: string;
}

export interface TargetProfile {
  name: string;
  baseURL: string;
  credentials: CredentialRefs;
  capabilities: TargetCapabilities;

  /**
   * Which deployment of the application this profile points at — `staging`,
   * `uat`, `reference`. Reported in the run report's verdict band, and it is
   * half of the TOTP key name (`totp/keys/<env>-<account>`).
   */
  environment: string;

  /**
   * Base address emailed OTPs are sent to. Workers receive plus-addressed
   * variants of it so parallel workers cannot read each other's mail (§12).
   * Only meaningful when `capabilities.mfa === 'email'`.
   */
  mailBaseAddress?: string;

  /**
   * The attribute `getByTestId` reads. Applications disagree about this
   * (`data-test`, `data-testid`, `data-qa`), and it is a property of the
   * application, not of the framework — so it lives here rather than in
   * `playwright.config.ts`.
   */
  testIdAttribute: string;

  /**
   * Hostname suffixes this profile is permitted to drive. Generation and
   * exploration run against test environments only, enforced by configuration
   * rather than convention (§17). `GENERATION_HOST_ALLOWLIST` extends it.
   */
  hostAllowlist: string[];

  /**
   * Spec files that must start signed out, and therefore belong to the
   * `auth-flows` project rather than `e2e` (§13). Defaults to the convention
   * in docs/CONVENTIONS.md; override only if a target names them differently.
   */
  authFlowPattern?: RegExp;
  /** Suite names this target is expected to carry. Used by the coverage view. */
  suites: string[];
  /**
   * Roles that get a storage state established by the `setup:auth` project.
   * The first entry is the default role for `authedPage`.
   */
  roles: string[];
  /**
   * Roles that exist for negative-path testing and must NOT get a storage
   * state (a locked-out account cannot log in, by design).
   */
  nonAuthenticatingRoles?: string[];

  /**
   * Scheduled password rotation (§13). Only meaningful when the pool is
   * `leased`; a static demo account list has nothing to rotate. Off unless a
   * profile says otherwise — this is the most dangerous automation in the
   * plan, and it should never start because a default said so.
   */
  rotation?: RotationConfig;

  /**
   * The application's real password policy. The generator must produce values
   * it will accept, or rotation fails half-way (§13).
   */
  passwordPolicy?: PasswordPolicy;
}
