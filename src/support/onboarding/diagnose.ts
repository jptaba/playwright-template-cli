import type { TargetProfile } from '../../../config/targets/types';

/**
 * Onboarding preflight — the checks that turn "it fails somewhere in the suite"
 * into "this profile says X but the pack does not have Y".
 *
 * Every diagnostic here corresponds to a real failure the framework can produce
 * at run time, and each one names the file or path to fix. That is the whole
 * design rule: a check that cannot say what to do is a check that gets ignored.
 *
 * Pure by construction — it takes a profile and a description of the
 * filesystem, so the rules are unit-tested without a target on disk and without
 * a network. `tools/check-target.ts` is the I/O around it.
 */

export type DiagnosticLevel = 'error' | 'warning';

export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable and greppable, so a CI log line can be searched for. */
  code: string;
  /** What is true. */
  message: string;
  /** What to do about it. Every diagnostic has one. */
  fix: string;
}

/**
 * What the checker observed on disk and in the environment. Supplied by the
 * caller so this module stays pure.
 */
export interface TargetFacts {
  /**
   * Paths inside `src/targets/<name>/` that exist, using forward slashes and
   * no leading slash — `fixtures.ts`, `tests/e2e/orders.spec.ts`. Empty when
   * the pack directory itself is absent.
   */
  packFiles: string[];
  /** True when `src/targets/<name>/` exists at all. */
  packExists: boolean;
  /** Roles whose credentials the configured secret store can resolve. */
  resolvableRoles: string[];
  /** Whether roles could be checked at all — a Vault store may be unreachable. */
  credentialsChecked: boolean;
  /** Whether the declared contract document is on disk. */
  contractSpecExists: boolean;
  /** Environment values the framework reads at run time. */
  env: { MAIL_API_URL?: string; GENERATION_HOST_ALLOWLIST?: string };
}

const ALWAYS_ALLOWED = ['localhost', '127.0.0.1', '::1'];

/** Hosts that mean "nobody has filled this in yet". */
const PLACEHOLDER_HOST = /\.(invalid|example|test|localdomain)$|^example\./i;

export function diagnose(profile: TargetProfile, facts: TargetFacts): Diagnostic[] {
  const found: Diagnostic[] = [];
  const has = (file: string): boolean => facts.packFiles.includes(file);
  const hasUnder = (dir: string): boolean =>
    facts.packFiles.some((file) => file.startsWith(`${dir}/`));
  const error = (code: string, message: string, fix: string): void => {
    found.push({ level: 'error', code, message, fix });
  };
  const warn = (code: string, message: string, fix: string): void => {
    found.push({ level: 'warning', code, message, fix });
  };

  checkHost(profile, facts, error, warn);
  checkPack(profile, facts, has, hasUnder, error, warn);
  checkRoles(profile, facts, has, error, warn);
  checkCapabilities(profile, facts, hasUnder, error, warn);
  checkAuthentication(profile, facts, error, warn);
  checkRotation(profile, warn);

  // Errors first: a run cannot start until they are gone, and burying them
  // under a list of smells is how a checker gets skimmed.
  return [...found.filter((d) => d.level === 'error'), ...found.filter((d) => d.level === 'warning')];
}

type Report = (code: string, message: string, fix: string) => void;

function checkHost(profile: TargetProfile, facts: TargetFacts, error: Report, warn: Report): void {
  let host: string | null = null;
  try {
    host = new URL(profile.baseURL).hostname;
  } catch {
    error(
      'baseurl-unparseable',
      `baseURL '${profile.baseURL}' is not a URL.`,
      'Set baseURL to an absolute URL including the scheme, or set BASE_URL in the environment.',
    );
    return;
  }

  const fromEnv = (facts.env.GENERATION_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowed = [...profile.hostAllowlist, ...fromEnv];

  if (allowed.length === 0) {
    error(
      'allowlist-empty',
      'The profile permits no hosts.',
      'Set hostAllowlist to the test-environment host suffixes this target may drive. ' +
        'An empty allowlist is a refusal, not permission (§17).',
    );
  } else if (!allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    error(
      'host-not-allowed',
      `baseURL host '${host}' is not covered by the allowlist [${allowed.join(', ')}].`,
      `Add '${host}' to hostAllowlist, or set GENERATION_HOST_ALLOWLIST for this environment. ` +
        'Every run resolves the profile through this check, so nothing will start until it passes.',
    );
  }

  if (PLACEHOLDER_HOST.test(host) && !ALWAYS_ALLOWED.includes(host)) {
    warn(
      'baseurl-placeholder',
      `baseURL still points at the reserved host '${host}', which can never resolve.`,
      'Replace baseURL and hostAllowlist with the real test environment, or set BASE_URL. ' +
        'This is the scaffold default and it is meant to be replaced.',
    );
  }
}

function checkPack(
  profile: TargetProfile,
  facts: TargetFacts,
  has: (file: string) => boolean,
  hasUnder: (dir: string) => boolean,
  error: Report,
  warn: Report,
): void {
  if (!facts.packExists) {
    error(
      'pack-missing',
      `No pack at src/targets/${profile.name}/, so this profile has no locators, actions or specs.`,
      `Run \`npm run target:new -- --name=${profile.name}\` to scaffold one, or remove the profile.`,
    );
    return;
  }

  if (!has('fixtures.ts')) {
    error(
      'fixtures-missing',
      `src/targets/${profile.name}/fixtures.ts is absent, and it is the only import a spec makes.`,
      'Add it, extending the framework `test` with this target’s named actions and testData (§03).',
    );
  }

  if (!hasUnder('locators')) {
    warn(
      'locators-missing',
      'The pack has no locators/ directory.',
      'Explore the running application with `npm run explore` and write L1 from the snapshot ' +
        'rather than from memory — transcribed locators are the largest source of dead tests.',
    );
  }

  if (!hasUnder('actions')) {
    warn(
      'actions-missing',
      'The pack has no actions/ directory, so specs have no business verbs to call.',
      'Add L2 verbs that compose locators and return data. A spec may not import from locators/.',
    );
  }

  if (!hasUnder('tests/e2e')) {
    warn(
      'no-e2e-specs',
      'The pack has no tests/e2e/ directory, so the e2e project will run nothing.',
      'Add specs there. Signed-out flows go in *login|mfa|password.spec.ts so the auth-flows ' +
        'project picks them up (§13).',
    );
  }
}

function checkRoles(
  profile: TargetProfile,
  facts: TargetFacts,
  has: (file: string) => boolean,
  error: Report,
  warn: Report,
): void {
  const nonAuth = profile.nonAuthenticatingRoles ?? [];
  const overlap = profile.roles.filter((role) => nonAuth.includes(role));
  if (overlap.length > 0) {
    error(
      'role-overlap',
      `Role(s) ${overlap.join(', ')} are listed as both authenticating and non-authenticating.`,
      'Remove them from one list. setup:auth would try to establish a session for an account ' +
        'that is not supposed to be able to sign in.',
    );
  }

  if (profile.roles.length === 0) {
    warn(
      'roles-empty',
      'The profile declares no roles, so every e2e spec runs signed out and `authedPage` throws.',
      'List the roles that get a storage state. The first is the default for `authedPage`.',
    );
    return;
  }

  if (facts.packExists && !has('tests/auth.setup.ts')) {
    error(
      'auth-setup-missing',
      `Roles are declared (${profile.roles.join(', ')}) but src/targets/${profile.name}/tests/` +
        'auth.setup.ts does not exist, so no storage state is ever written.',
      'Add it. Without it every spec taking `authedPage` fails with "No storage state for role", ' +
        'which points at the wrong thing entirely.',
    );
  }

  if (!facts.credentialsChecked) {
    warn(
      'credentials-unchecked',
      'Credentials could not be checked against the configured secret store.',
      'Run `npm run vault:check` if the source is Vault. Until this passes, setup:auth is ' +
        'unverified and a whole run can fail at sign-in.',
    );
    return;
  }

  const missing = [...profile.roles, ...nonAuth].filter(
    (role) => !facts.resolvableRoles.includes(role),
  );
  const { root, accountType } = profile.credentials;
  for (const role of missing) {
    error(
      'credentials-missing',
      `No credentials for role '${role}' at ${root}/${accountType}/${role}/1.`,
      profile.credentials.source === 'local'
        ? `Add that key to config/secrets.local.json with username and password fields.`
        : `Write username and password to that KV v2 path in Vault, or correct credentials.root.`,
    );
  }
}

function checkCapabilities(
  profile: TargetProfile,
  facts: TargetFacts,
  hasUnder: (dir: string) => boolean,
  error: Report,
  warn: Report,
): void {
  const { api, contracts, db } = profile.capabilities;

  if (api.enabled && !api.baseURL) {
    error(
      'api-no-baseurl',
      'capabilities.api is enabled but no api.baseURL is set.',
      'Set it, or set API_BASE_URL. The `api` fixture refuses to construct a client that would ' +
        'resolve against nothing, so every spec taking `api` fails.',
    );
  }
  if (api.enabled && !hasUnder('tests/api')) {
    warn(
      'api-no-specs',
      'capabilities.api is enabled but the pack has no tests/api/ directory.',
      'Add API specs there, or disable the capability so the report says "not applicable" ' +
        'rather than showing an empty project.',
    );
  }
  if (!api.enabled && hasUnder('api')) {
    warn(
      'api-vocabulary-unreachable',
      'The pack has an api/ vocabulary but capabilities.api is disabled, so no spec can use it.',
      'Enable the capability and set its baseURL, or delete the unused vocabulary.',
    );
  }

  if (contracts.enabled && !contracts.spec) {
    error(
      'contracts-no-spec',
      'capabilities.contracts is enabled but contracts.spec is null.',
      'Point it at the vendored, pinned schema document for this service.',
    );
  } else if (contracts.enabled && contracts.spec && !facts.contractSpecExists) {
    error(
      'contracts-spec-missing',
      `capabilities.contracts points at ${contracts.spec}, which is not on disk.`,
      'Vendor the published schema to that path. The registry reads it per test and will throw ' +
        'for every spec until it is there.',
    );
  }
  if (!contracts.enabled && contracts.spec && facts.contractSpecExists) {
    warn(
      'contracts-ready-not-enabled',
      `A contract document is vendored at ${contracts.spec} but capabilities.contracts is off, ` +
        'so nothing is validated against it.',
      'Set contracts.enabled to true. Every API response the shared client returns is then ' +
        'schema-checked on the way through, including the setup calls inside UI tests (§05).',
    );
  }
  if (contracts.enabled && !hasUnder('tests/contract')) {
    warn(
      'contracts-no-specs',
      'capabilities.contracts is enabled but the pack has no tests/contract/ directory.',
      'Add conformance specs there. Note that they are exempt from the case-id rule by design.',
    );
  }

  const { a11y } = profile.capabilities;
  if (a11y.enabled && !hasUnder('tests/a11y')) {
    warn(
      'a11y-no-specs',
      'capabilities.a11y is enabled but the pack has no tests/a11y/ directory.',
      'Add accessibility specs there, or disable the capability. An empty accessibility ' +
        'project reports as a silent zero, which reads like a pass.',
    );
  }
  if (!a11y.enabled && hasUnder('tests/a11y')) {
    warn(
      'a11y-specs-not-enabled',
      'The pack has tests/a11y/ specs but capabilities.a11y is disabled, so none of them run.',
      'Set a11y.enabled to true and name the standard the application is held to.',
    );
  }
  for (const waiver of a11y.waived ?? []) {
    if (Date.parse(waiver.reviewBy) < Date.now()) {
      warn(
        'a11y-waiver-expired',
        `The accessibility waiver for '${waiver.rule}' was due for review on ${waiver.reviewBy}.`,
        'Re-agree it with the product owner and move the date, or remove the waiver and fix ' +
          'the finding. A waiver nobody revisits is a defect with better paperwork.',
      );
    }
  }

  if (db.enabled) {
    error(
      'db-no-driver',
      'capabilities.db is enabled, but no database driver adapter is registered in the framework.',
      'The `db` fixture throws for every spec that takes it while this is on. Leave db disabled ' +
        'until a driver built on dynamic read-only Vault credentials exists (§05).',
    );
  }
  if (db.enabled && !db.vaultRole) {
    warn(
      'db-no-vault-role',
      'capabilities.db is enabled without a vaultRole to issue read-only credentials.',
      'Name the database-secrets-engine role. A static password in a KV path is not acceptable.',
    );
  }
  if (!db.enabled && hasUnder('db')) {
    warn(
      'db-vocabulary-unreachable',
      'The pack has a db/ vocabulary but capabilities.db is disabled, so no spec can use it.',
      'That is the correct state while there is no driver — the vocabulary is ready for one.',
    );
  }
}

function checkAuthentication(
  profile: TargetProfile,
  facts: TargetFacts,
  error: Report,
  warn: Report,
): void {
  const { mfa, accountPool } = profile.capabilities;
  const source = profile.credentials.source;

  if (mfa === 'totp' && source !== 'vault') {
    error(
      'totp-needs-vault',
      `capabilities.mfa is 'totp' but credentials.source is '${source}'.`,
      'TOTP codes are issued by Vault’s TOTP engine; the local store cannot issue them. ' +
        'Set SECRET_SOURCE=vault (§12).',
    );
  }

  if (mfa === 'email') {
    if (!profile.mailBaseAddress) {
      error(
        'email-otp-no-address',
        "capabilities.mfa is 'email' but the profile has no mailBaseAddress.",
        'Set it to the address the application sends codes to. Workers get plus-addressed ' +
          'variants so parallel workers cannot read each other’s mail (§12).',
      );
    }
    if (!facts.env.MAIL_API_URL) {
      error(
        'email-otp-no-inbox',
        "capabilities.mfa is 'email' but MAIL_API_URL is unset, so there is no inbox to read.",
        'Set it to the read interface of the environment’s mail tool. If it has none, email OTP ' +
          'cannot be automated at all — say so rather than working around it.',
      );
    }
  }

  if (accountPool === 'leased' && source !== 'vault') {
    warn(
      'leasing-degrades-silently',
      `capabilities.accountPool is 'leased' but credentials.source is '${source}', and leasing ` +
        'needs compare-and-swap that only the Vault store provides.',
      'Set SECRET_SOURCE=vault, or declare the pool static. As configured every worker reads the ' +
        'same account with no lease and no TTL, which looks fine until two workers collide.',
    );
  }
}

function checkRotation(profile: TargetProfile, warn: Report): void {
  if (!profile.rotation) return;

  if (profile.capabilities.accountPool !== 'leased') {
    warn(
      'rotation-without-pool',
      'A rotation schedule is configured on a target whose account pool is static.',
      'Rotation exists to keep a leased pool healthy. On a static list there is nothing to ' +
        'rotate, and running it would change credentials nobody is tracking.',
    );
  }

  if (!profile.passwordPolicy) {
    warn(
      'rotation-without-policy',
      'Rotation is configured but the profile declares no passwordPolicy.',
      'State the application’s real policy. The generator must produce values it accepts, or ' +
        'rotation fails half-way — with the account already changed in one place (§13).',
    );
  }
}

/** True when nothing blocks a run. Warnings are smells, not blockers. */
export function isRunnable(diagnostics: readonly Diagnostic[]): boolean {
  return !diagnostics.some((diagnostic) => diagnostic.level === 'error');
}
