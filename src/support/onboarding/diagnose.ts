import { describeOrphanedSessions, orphanedSessions } from './sessions';
import { poolSizeFor } from '../paths';
import { SCAFFOLDED_SPECS } from './scaffold';
import { COVERAGE_KINDS } from '../journey';
import { KNOWN_A11Y_STANDARDS, type TargetProfile } from '../../../config/targets/types';

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
  /**
   * The coverage tags every spec in the pack carries, deduplicated.
   *
   * Passed in rather than read here, like every other fact, so this module
   * stays pure — and read from the *tags* rather than from directory names,
   * because the tag is what the suite itself selects on and therefore cannot
   * drift from what actually runs.
   *
   * Absent means nobody looked, which is not the same as none: a caller that
   * cannot read spec sources gets no finding rather than a wrong one.
   */
  specTags?: string[];
  /** Roles whose credentials the configured secret store can resolve. */
  resolvableRoles: string[];
  /** Whether roles could be checked at all — a Vault store may be unreachable. */
  credentialsChecked: boolean;
  /** Whether the declared contract document is on disk. */
  contractSpecExists: boolean;
  /**
   * `METHOD /path` for every endpoint descriptor in the pack, and every
   * operation the vendored document describes. Both empty when the target has
   * no API or no contract document, which is the commonest case.
   */
  declaredEndpoints?: string[];
  documentedOperations?: string[];
  /**
   * Every file in `.auth/`, and every target this repository has a profile
   * for. Together they answer a question no per-target check can: which
   * stored sessions belong to nothing at all.
   */
  storageStateFiles?: string[];
  knownTargets?: string[];
  /** Environment values the framework reads at run time. */
  env: { MAIL_API_URL?: string; GENERATION_HOST_ALLOWLIST?: string };
}

const ALWAYS_ALLOWED = ['localhost', '127.0.0.1', '::1'];

/** Hosts that mean "nobody has filled this in yet". */
const PLACEHOLDER_HOST = /\.(invalid|example|test|localdomain)$|^example\./i;

/**
 * What is actually in the pack, asked the way each question means.
 *
 * `specsUnder` exists because `hasUnder` answered the wrong question and three
 * checks were silently dead for it. The scaffolder writes `tests/api/.gitkeep`
 * and `tests/contract/.gitkeep` to keep those directories in git, and a
 * `.gitkeep` satisfies "some file starts with this prefix" — so
 * `api-no-specs` and `contracts-no-specs` could never fire on a scaffolded
 * pack, and `a11y-no-specs` stopped firing the moment somebody removed the
 * scaffolded spec and left a placeholder behind. Measured, not reasoned about:
 * `target:doctor` reported "profile, pack and credentials agree — nothing to
 * fix" for a target declaring a contracts capability whose only contract file
 * was a `.gitkeep`.
 *
 * The vocabulary directories (`locators`, `actions`, `api`, `db`) still use
 * `hasUnder` on purpose: the scaffolder writes real modules into every one of
 * them and never a placeholder, so the question "does this vocabulary exist"
 * is answered correctly by any file being there.
 */
interface PackView {
  has(file: string): boolean;
  hasUnder(dir: string): boolean;
  specsUnder(dir: string): boolean;
  /**
   * True once any spec exists anywhere in the pack.
   *
   * A pack with no specs at all has not been written yet, and that state is
   * already named once by `no-e2e-specs`. Repeating it per capability would
   * put three more warning blocks on the dashboard's success panel — which
   * renders every diagnostic in full, directly above a "Next" list that
   * already says to write the specs. The capability warnings are for the
   * other case, which is the one that actually hides: a target that has been
   * written, is passing, and left one declared capability validating nothing.
   */
  startedWriting: boolean;
}

export function diagnose(profile: TargetProfile, facts: TargetFacts): Diagnostic[] {
  const found: Diagnostic[] = [];
  const pack: PackView = {
    has: (file) => facts.packFiles.includes(file),
    hasUnder: (dir) => facts.packFiles.some((file) => file.startsWith(`${dir}/`)),
    specsUnder: (dir) =>
      facts.packFiles.some((file) => file.startsWith(`${dir}/`) && file.endsWith('.spec.ts')),
    /*
       A spec the *scaffolder* wrote does not count as somebody having
       started. Scaffolding with `--with=a11y` ships
       `tests/a11y/landing.spec.ts`, which made a brand-new pack look
       written-in and put `api-no-specs` on the success panel of a target
       nobody had touched yet — the same way `.gitkeep` used to defeat the
       check this guard belongs to.
    */
    startedWriting: facts.packFiles.some(
      (file) =>
        file.endsWith('.spec.ts') && !(SCAFFOLDED_SPECS as readonly string[]).includes(file),
    ),
  };
  const error = (code: string, message: string, fix: string): void => {
    found.push({ level: 'error', code, message, fix });
  };
  const warn = (code: string, message: string, fix: string): void => {
    found.push({ level: 'warning', code, message, fix });
  };

  checkHost(profile, facts, error, warn);
  checkPack(profile, facts, pack, error, warn);
  checkRoles(profile, facts, pack, error, warn);
  checkCapabilities(profile, facts, pack, error, warn);
  checkAuthentication(profile, facts, error, warn);
  checkParked(profile, warn);
  checkRotation(profile, warn);
  checkOrphanedSessions(facts, warn);

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
  { has, hasUnder, specsUnder, startedWriting }: PackView,
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

  if (!specsUnder('tests/e2e')) {
    warn(
      'no-e2e-specs',
      'The pack has no specs in tests/e2e/, so the e2e project will run nothing.',
      'Add specs there. Signed-out flows go in *login|mfa|password.spec.ts so the auth-flows ' +
        'project picks them up (§13).',
    );
  }

  /*
     A written, passing pack with no ground truth for triage.

     Guarded on `startedWriting` for the reason the capability warnings are:
     a freshly scaffolded pack has no specs of any kind, `no-e2e-specs`
     already says so, and repeating it would put a second block on the
     success panel of a target nobody has touched. The case worth naming is
     the other one — a suite that runs, passes, and has never exercised the
     triage it claims to have, which `npm run app:journey` reports as a
     failed stage and nothing else ever mentions.
  */
  /*
     Coverage kinds the pack does not have.

     `npm run app:journey` reports this as a failed stage, and until now that
     was the only thing that did — so an application could sit for weeks with
     one happy-path spec while `target:doctor` said there was nothing to fix.
     Same shape as `no-triage-fixture` above, and raised for the same reason:
     a condition a run should have caught earlier belongs in the preflight.

     `COVERAGE_KINDS` is the journey's own list, imported rather than copied,
     so the two cannot come to disagree about what five kinds means.
  */
  if (startedWriting && facts.specTags) {
    const missing = COVERAGE_KINDS.filter(({ tag }) => !facts.specTags!.includes(tag));
    if (missing.length > 0) {
      warn(
        'coverage-incomplete',
        `The pack has ${COVERAGE_KINDS.length - missing.length} of ${COVERAGE_KINDS.length} ` +
          `coverage kinds: missing ${missing.map((one) => `${one.kind} (${one.tag})`).join(', ')}.`,
        'Add specs carrying those tags. A suite of happy paths is a suite that has never ' +
          'been told no — and `npm run app:journey` reports this as a failed stage (§08).',
      );
    }
  }

  /*
     An application paying the worker cap without having answered the question
     that imposes it — item 66.

     `serverState: true` with no pool caps a target at **one worker**: the
     whole suite runs serially. That is sometimes right and nothing here can
     know — but it was reaching four of five applications as a scaffold
     default nobody revisited, every one still carrying the generated
     `// does state need cross-test cleanup?` comment verbatim.

     A warning rather than an error, and it names the command rather than the
     answer. Whether an application tolerates two workers on one identity is a
     measurement, and inventing a verdict here is the defect `triage:measure`
     exists to catch, one subject over.
  */
  if (
    profile.capabilities.serverState &&
    profile.capabilities.sharedIdentitySafe === undefined &&
    poolSizeFor(profile.credentials.poolSize, profile.roles[0] ?? '') <= 1
  ) {
    warn(
      'worker-cap-unmeasured',
      `serverState: true with a single account for '${profile.roles[0] ?? '?'}' caps this ` +
        'target at 1 worker, so the suite runs serially.',
      'Run `npm run pool:measure` to find out whether that cap is earned. If it is not, ' +
        'declare `sharedIdentitySafe: true` — it keeps serverState meaning cleanup and stops ' +
        'it also meaning "one worker". If it is, say so there too, so the next person does ' +
        'not re-measure it (§19).',
    );
  }

  /*
     A `.gitkeep` in a directory that now holds real files.

     The scaffolder writes one per empty test directory, because git cannot
     track an empty directory and a pack missing `tests/api/` is a different
     pack. It has no way to know when a directory stops being empty, so the
     marker survives the first spec written into it — eight of them across the
     five applications onboarded here, none of them doing anything.

     Reported rather than pruned, because deleting a file in a pack is the
     pack owner's call. Reported at all, because "harmless" is why nothing
     ever noticed: the same reasoning left a `.gitkeep` satisfying three
     capability checks that then validated nothing (`api-no-specs` above).
  */
  const stale = facts.packFiles.filter((file) => {
    if (!file.endsWith('.gitkeep')) return false;
    const dir = file.slice(0, file.length - '.gitkeep'.length);
    return facts.packFiles.some((other) => other !== file && other.startsWith(dir));
  });
  if (stale.length > 0) {
    warn(
      'gitkeep-outlived',
      `${stale.length} .gitkeep file(s) sit in directories that now hold real files: ` +
        `${stale.join(', ')}.`,
      'Delete them. A .gitkeep exists only to keep an empty directory in git, and a ' +
        'directory with a spec in it is not empty.',
    );
  }

  if (startedWriting && !specsUnder('tests/triage-fixture')) {
    warn(
      'no-triage-fixture',
      'The pack has no specs in tests/triage-fixture/, so triage is never exercised for it.',
      'Add specs written to fail a stated way, each carrying a `triage-ground-truth` ' +
        'annotation naming the category it should produce, then measure them with ' +
        '`npm run triage:measure`. A green suite says nothing about triage (§21).',
    );
  }
}

function checkRoles(
  profile: TargetProfile,
  facts: TargetFacts,
  { has }: PackView,
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

  /*
     A reservation that cannot be honoured is worse than none: it reads as
     "auth-flows has its own identity" while every worker and every login spec
     go on sharing account 1, which is the exact defect it was added to fix.
  */
  const reserved = profile.credentials.authFlowAccount;
  if (reserved !== undefined) {
    const first = profile.roles[0];
    const pool = first ? poolSizeFor(profile.credentials.poolSize, first) : 1;
    if (pool < 2) {
      warn(
        'authflow-account-no-pool',
        `credentials.authFlowAccount reserves account ${reserved}, but role '${first ?? '(none)'}' ` +
          'has a pool of one, so there is no spare identity and the reservation is ignored.',
        'Declare poolSize for that role with at least two accounts, or remove ' +
          'authFlowAccount. A pool of one cannot both run the suite and drive a login form.',
      );
    } else if (reserved < 1 || reserved > pool) {
      error(
        'authflow-account-outside-pool',
        `credentials.authFlowAccount is ${reserved}, which is not one of the ${pool} account(s) ` +
          `role '${first}' declares.`,
        `Set it to an index between 1 and ${pool}. As written it reserves nothing and the ` +
          'auth-flow specs read a credential path that does not exist.',
      );
    }
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
  { hasUnder, specsUnder, startedWriting }: PackView,
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
  for (const [name, baseURL] of Object.entries(api.services ?? {})) {
    if (!api.enabled) {
      warn(
        'api-services-unreachable',
        `capabilities.api names the service '${name}' but the api capability is disabled.`,
        'Enable it, or remove the service — an `apis` entry nothing can reach is a URL that ' +
          'looks configured and is not.',
      );
      break;
    }
    if (!baseURL || !/^https?:\/\//.test(baseURL)) {
      error(
        'api-service-bad-url',
        `capabilities.api.services.${name} is '${baseURL || '(empty)'}', which is not a URL.`,
        'Give it an absolute http(s) base URL, or remove the service. A client built on this ' +
          'resolves every call against nothing and fails where the endpoint is named.',
      );
    }
    if (name === 'api') {
      warn(
        'api-service-shadows-primary',
        "A service named 'api' is confusing beside the `api` fixture, which is the primary one.",
        'Name it after the service — `billing`, `search` — so a spec taking `apis.billing` says ' +
          'which back end it is talking to.',
      );
    }
  }

  if (api.enabled && startedWriting && !specsUnder('tests/api')) {
    warn(
      'api-no-specs',
      'capabilities.api is enabled but there are no specs in tests/api/, so the api project ' +
        'runs nothing and the run is green anyway.',
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

  /*
     Endpoint descriptors that the published document does not describe.

     This is the API's version of grounding a locator in the accessibility
     tree, and it exists because the same mistake happens: an endpoint written
     from REST convention rather than from the document. `GET
     /categories/{categoryId}` is the one that produced this check — a
     collection has members, so a member must be readable. The service answers
     405 and the document agrees with the service: that path declares `put`,
     `delete` and `patch`, and no `get` at all.

     A descriptor nobody documented is not always wrong — an undocumented
     endpoint is a real thing — so this is a warning that names each one rather
     than an error. What it stops is the version where the document was
     vendored, sitting in the pack, and never consulted.
  */
  const declared = facts.declaredEndpoints ?? [];
  const documented = new Set(facts.documentedOperations ?? []);
  if (declared.length > 0 && documented.size > 0) {
    const undocumented = declared.filter((endpoint) => !documented.has(endpoint));
    if (undocumented.length > 0) {
      warn(
        'endpoint-not-documented',
        `${undocumented.length} endpoint descriptor(s) are not in the published document: ` +
          `${undocumented.join(', ')}.`,
        'Check each against the vendored schema. An endpoint written from REST convention rather ' +
          'than from the document is the API\'s version of a hallucinated locator — it fails as a ' +
          '405 or a 404 that reads like an application fault (§05).',
      );
    }
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
  for (const waiver of contracts.waived ?? []) {
    if (Date.parse(waiver.reviewBy) < Date.now()) {
      warn(
        'contract-waiver-expired',
        `The contract waiver for '${waiver.endpoint}'${waiver.at ? ` at ${waiver.at}` : ''} was ` +
          `due for review on ${waiver.reviewBy}.`,
        'Re-agree it with the provider and move the date, or remove the waiver and let the ' +
          'drift fail. Accepted drift nobody revisits is a provider defect with better paperwork.',
      );
    }
  }

  if (contracts.enabled && startedWriting && !specsUnder('tests/contract')) {
    warn(
      'contracts-no-specs',
      'capabilities.contracts is enabled but there are no specs in tests/contract/, so the ' +
        'vendored document is validated against nothing and the run is green anyway.',
      'Add conformance specs there. Note that they are exempt from the case-id rule by design.',
    );
  }

  const { a11y } = profile.capabilities;
  if (a11y.enabled && !a11y.standard) {
    error(
      'a11y-no-standard',
      'capabilities.a11y is enabled but names no standard.',
      'Say which bar this application is held to. An accessibility suite with no stated ' +
        'standard argues about every finding it produces.',
    );
  } else if (
    a11y.enabled &&
    !(KNOWN_A11Y_STANDARDS as readonly string[]).includes(a11y.standard)
  ) {
    // A warning, not an error: standards outlive frameworks, and a target
    // should never wait on this repository to adopt a newer one.
    warn(
      'a11y-unknown-standard',
      `'${a11y.standard}' is not a standard this framework recognises.`,
      `If it is newer than ${KNOWN_A11Y_STANDARDS.join(', ')}, carry on — this check exists to ` +
        'catch a typo, not to hold you to the list. Add it to KNOWN_A11Y_STANDARDS to quieten ' +
        'the warning.',
    );
  }
  if (a11y.enabled && startedWriting && !specsUnder('tests/a11y')) {
    warn(
      'a11y-no-specs',
      'capabilities.a11y is enabled but there are no specs in tests/a11y/.',
      'Add accessibility specs there, or disable the capability. An empty accessibility ' +
        'project reports as a silent zero, which reads like a pass.',
    );
  }
  if (!a11y.enabled && specsUnder('tests/a11y')) {
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

  /*
     Deliberately *not* checked here: `accountPool: 'static'` together with
     `serverState: true`, which is what puts every parallel worker on one
     identity mutating one account's cart, favourites and orders.

     It is a real hazard — onboarding Toolshop hit it twice, once between two
     workers and once between two projects — but it is not a diagnosable one.
     That pair is also the scaffolder's own default, so warning on it means
     every freshly scaffolded target fails its own preflight on day one, which
     is the noise trap this checker already learned to avoid: a warning that
     fires on the default configuration is a warning people learn to scroll
     past, and it takes the useful ones with it.

     Nothing here can tell the difference between a suite where that pairing is
     harmless and one where it is not — that depends on whether two specs
     mutate the same record, which is a property of the specs. So it is a
     convention in docs/CONVENTIONS.md, and the answer lives in the target's own
     vocabulary: partition by `run.workerIndex`, or make the verb tolerate
     contention instead of assuming it owns the account.
  */
}

/**
 * Sessions in `.auth/` belonging to no application here.
 *
 * The one check in this file that is not about the target being doctored, and
 * it is here because this is the only thing anybody runs routinely that looks
 * at the repository rather than at one pack. A session outlives its target
 * easily — a rename, a removal by hand, a branch switched underneath a
 * gitignored directory — and then nothing ever looks at it again. Two were
 * found here for applications this repository had not known about for weeks.
 *
 * A warning, not an error: a stale credential is a real thing to deal with and
 * it does not stop the run in front of you.
 */
function checkOrphanedSessions(facts: TargetFacts, warn: Report): void {
  if (!facts.storageStateFiles || !facts.knownTargets) return;
  const orphans = orphanedSessions(facts.storageStateFiles, facts.knownTargets);
  if (orphans.length === 0) return;

  warn(
    'session-orphaned',
    describeOrphanedSessions(orphans),
    `Delete them: ${orphans.map((session) => `.auth/${session.file}`).join(', ')}. ` +
      'Nothing is lost — `setup:auth` writes a fresh session per run.',
  );
}

/**
 * An application somebody has paused, and whether the pause has expired.
 *
 * Said on **every** check rather than only when the date passes, because the
 * cost of parking is invisible by construction: the suites do not run, so
 * nothing turns red, so nothing reminds anybody. A waiver at least sits beside
 * a spec that still runs.
 */
function checkParked(profile: TargetProfile, warn: Report): void {
  if (!profile.parked) return;

  const expired = Date.parse(profile.parked.reviewBy) < Date.now();
  warn(
    expired ? 'parked-review-due' : 'target-parked',
    expired
      ? `This application has been parked since before ${profile.parked.reviewBy}, ` +
        `which has passed: "${profile.parked.reason}"`
      : `This application is parked and its live suites are not run: ` +
        `"${profile.parked.reason}" — review by ${profile.parked.reviewBy}.`,
    expired
      ? 'Decide again. Either the reason still holds and the date moves, or it does not and ' +
        `\`parked\` comes off config/targets/${profile.name}.ts.`
      : 'Nothing to fix. Run `npm run suites:live -- --target=' +
        `${profile.name}\` to check whether the reason still holds.`,
  );
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
