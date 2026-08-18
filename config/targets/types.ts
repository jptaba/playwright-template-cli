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
  /**
   * Base URL for the service API. Often a different host from the web front
   * end, and the one the `api` fixture is bound to.
   */
  baseURL?: string;
  /**
   * Additional services, by name — `{ billing: 'https://…', search: 'https://…' }`.
   *
   * Applications routinely have more than one back end, and a suite that can
   * only call one of them ends up with a raw `fetch` in a spec the first time
   * it needs the second. Each name here becomes an entry in the `apis` fixture,
   * carrying the same schema validation, cleanup tracking and trace as the
   * primary client.
   *
   * The name is the vocabulary: `apis.billing`, not a URL. Nothing outside
   * `config/targets/` may name a host, and that does not stop being true
   * because there are three of them.
   */
  services?: Record<string, string>;
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
  /**
   * Drift the team has accepted, so a known provider defect is a recorded
   * decision rather than a deleted spec.
   */
  waived?: ContractWaiver[];
}

/**
 * An accepted difference between the published document and the running
 * service.
 *
 * The same instrument accessibility already has, for the same reason, and it
 * exists because the first real contract suite immediately needed one:
 * toolshop's `/products/search` answers `from: null, to: null` on an empty
 * result set where its own document types both as `integer`. It is a vendor
 * demo and a vendor document, so neither side is this repository's to fix —
 * and the three options without a waiver are all bad. Deleting the spec is the
 * exception nobody can see. Leaving it failing spends the suite's whole signal
 * on something that will never be fixed. `test.fail()` works, but buries the
 * reason and the review date in a comment where no tool can read them.
 *
 * `at` is what keeps a waiver from being a blindfold, exactly as `selector`
 * does for an accessibility waiver: accept a null `from` and the endpoint's
 * every other property is still checked. Omitting it waives the whole
 * endpoint, which is occasionally the right call and should be a decision
 * rather than a default.
 *
 * Waived drift is still **counted and reported**, never silently dropped: an
 * exception accepted for one property must be visible when it is suddenly
 * firing on nine.
 */
export interface ContractWaiver {
  /** `METHOD /path`, written exactly as the document names it — `GET /products/search`. */
  endpoint: string;
  reason: string;
  /** ISO date. `target:doctor` reports a waiver whose review date has passed. */
  reviewBy: string;
  /**
   * JSON Pointer to the property whose failure is accepted — `/from`. Omit to
   * accept every failure on the endpoint.
   */
  at?: string;
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
  waived?: A11yWaiver[];
}

/**
 * An accepted accessibility exception.
 *
 * `urlPattern` and `selector` are what keep a waiver from being a blindfold.
 * A waiver written as a bare rule id suppresses that rule *everywhere*: accept
 * one unlabelled button in a third-party widget and the suite stops reporting
 * unlabelled buttons on every page it will ever scan, including the ones added
 * next month. Narrowing the waiver to the pages and nodes it was actually
 * granted for keeps the rest of the rule live.
 *
 * Both are optional, and omitting both is still allowed — sometimes a rule
 * genuinely is accepted product-wide. It should be a decision, not a default.
 */
export interface A11yWaiver {
  /** Axe rule id — `color-contrast`, `button-name`, `list`. */
  rule: string;
  reason: string;
  /** ISO date. `target:doctor` reports a waiver whose review date has passed. */
  reviewBy: string;
  /**
   * Substring or regular-expression source matched against the scanned URL.
   * Omit to waive the rule on every page.
   */
  urlPattern?: string;
  /**
   * Substring matched against the CSS path axe reports for a node. Omit to
   * waive every node the rule fires on.
   */
  selector?: string;
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

  /**
   * How many accounts exist per role at `<root>/<accountType>/<role>/<n>`.
   *
   * Defaults to 1, which is the shape every target had before this: one
   * account per role, `…/<role>/1`, shared by every worker.
   *
   * Above 1, workers are partitioned across the accounts — worker 0 takes
   * account 1, worker 1 takes account 2, and so on, wrapping. That is what
   * §19 has always prescribed for a static pool and what nothing implemented:
   * `leased` needs Vault's compare-and-swap, so a target with three perfectly
   * good accounts in a local store still had every worker signing in as the
   * first one. On an application with server-side state — a cart, a draft, a
   * wizard — that is not a slow suite, it is a wrong one: the failures look
   * like defects and land on whichever spec lost the race.
   *
   * Partitioning needs no coordination and no lock, which is why it works
   * where leasing cannot. It is exact only when the worker count divides the
   * pool; beyond that two workers share, which is the same contention as
   * before and no worse.
   *
   * **Per role, because roles genuinely differ.** A number applies to every
   * role; a map states each one. Written as a single number first, this broke
   * immediately on the first real application: three customer accounts and one
   * administrator, and `setup:auth` went looking for `admin/2`.
   */
  poolSize?: number | Record<string, number>;
}

export interface TargetProfile {
  name: string;
  baseURL: string;
  credentials: CredentialRefs;
  capabilities: TargetCapabilities;

  /**
   * True when this deployment is shared with people outside the team — a
   * vendor's public demo, a joint integration environment, a sandbox other
   * suites also point at.
   *
   * It gates the tests that are *destructive to the environment rather than to
   * the data they create*: account lockout, password rotation, rate-limit
   * exhaustion, anything whose blast radius is other people's next test run.
   * Those are legitimate tests — an application that never locks an account
   * after repeated failures has a real defect — but they need an environment
   * the team owns.
   *
   * This exists because nothing else expressed it. Onboarding a public demo,
   * two specs asserting "a wrong password is refused" locked the shared account
   * every other spec signed in as; twenty-one tests failed across five
   * features, and the lockout is permanent until an administrator clears it.
   * Moving those specs onto disposable registered accounts was not enough,
   * because the lockout counter turned out not to be per-account either.
   *
   * `serverState` is a different claim: it says data needs cleaning up, not
   * that the environment can be damaged for others.
   */
  sharedEnvironment?: boolean;

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
