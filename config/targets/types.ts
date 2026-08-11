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
