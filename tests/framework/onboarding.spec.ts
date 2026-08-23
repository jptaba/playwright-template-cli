import { expect, test } from '@playwright/test';
import {
  diagnose,
  isRunnable,
  type Diagnostic,
  type TargetFacts,
} from '../../src/support/onboarding/diagnose';
import { COVERAGE_KINDS } from '../../src/support/journey';
import {
  camelCase,
  parseScaffoldArgs,
  defaultAllowlist,
  pascalCase,
  planScaffold,
  SCAFFOLDED_SPECS,
  ScaffoldError,
} from '../../src/support/onboarding/scaffold';
import { resolveExploreUrl } from '../../src/support/onboarding/explore-url';
import { SIGN_IN_PATHS, signInPathsToTry } from '../../src/support/onboarding/probe';
import { KNOWN_A11Y_STANDARDS, type TargetProfile } from '../../config/targets/types';

/**
 * Onboarding an application is the moment this framework is judged. Everything
 * here is about the failures that used to happen *later* — at test time, three
 * directories from their cause — being reported up front with the file to fix.
 *
 * The diagnostics are pure functions over a profile and a description of the
 * filesystem, which is what lets every one of them be tested without a target
 * on disk, a Vault, or a network.
 */

function profile(overrides: Partial<TargetProfile> = {}): TargetProfile {
  return {
    name: 'demo',
    baseURL: 'https://demo.internal.corp',
    environment: 'staging',
    credentials: { source: 'local', root: 'qa/demo/pools', accountType: 'workforce' },
    capabilities: {
      mfa: 'none',
      accountPool: 'static',
      serverState: true,
      /*
         Answered, so the fixture is a profile with nothing left to say about
         it. Item 66 made an unanswered worker cap a warning, and a "says
         nothing when everything agrees" fixture that leaves the question open
         is not a profile that agrees — it is one nobody has finished.
      */
      sharedIdentitySafe: true,
      api: { enabled: false },
      db: { enabled: false },
      contracts: { enabled: false, spec: null },
      a11y: { enabled: false, standard: 'wcag22aa' },
    },
    testIdAttribute: 'data-testid',
    hostAllowlist: ['internal.corp'],
    suites: ['smoke'],
    roles: ['standard'],
    ...overrides,
  };
}

/** A pack that has everything a healthy UI-only target needs. */
/**
 * A pack with nothing to fix — which now includes ground truth for triage.
 *
 * `tests/triage-fixture/` joined this list when `no-triage-fixture` was added:
 * a written, passing pack that has never exercised triage is exactly the state
 * the check exists to name, and leaving it out of "healthy" would have meant
 * asserting the warning was absent from a pack that earns it.
 */
const HEALTHY_PACK = [
  'fixtures.ts',
  'locators/sign-in.ts',
  'actions/sign-in.ts',
  'tests/auth.setup.ts',
  'tests/e2e/orders.spec.ts',
  'tests/triage-fixture/known-failures.spec.ts',
];

function facts(overrides: Partial<TargetFacts> = {}): TargetFacts {
  return {
    packExists: true,
    packFiles: HEALTHY_PACK,
    resolvableRoles: ['standard'],
    credentialsChecked: true,
    contractSpecExists: false,
    env: {},
    ...overrides,
  };
}

const codes = (found: readonly Diagnostic[]): string[] => found.map((one) => one.code);

test.describe('the onboarding preflight', () => {
  test('says nothing when the profile, the pack and the credentials agree', () => {
    expect(diagnose(profile(), facts())).toEqual([]);
  });

  test('a worker cap nobody has measured is a smell, and names the command', () => {
    /*
       Item 66. `serverState: true` with no pool caps a target at one worker,
       so the suite runs serially — and it reached four of the first five
       applications as a scaffold default nobody revisited, every one still
       carrying the generated comment verbatim.

       A warning rather than an error, and it names the command rather than
       the answer: whether an application tolerates two workers on one
       identity is a measurement, and inventing a verdict here would be the
       defect `triage:measure` exists to catch, one subject over.
    */
    const unanswered = profile({
      capabilities: { ...profile().capabilities, sharedIdentitySafe: undefined },
    });
    const found = diagnose(unanswered, facts());

    expect(codes(found)).toContain('worker-cap-unmeasured');
    expect(found.find((one) => one.code === 'worker-cap-unmeasured')?.fix).toContain(
      'pool:measure',
    );
  });

  test('answering the question either way retires the smell', () => {
    // "Yes it is earned" is an answer too, and the point of recording it is
    // that the next person does not re-run the measurement.
    for (const answer of [true, false]) {
      const answered = profile({
        capabilities: { ...profile().capabilities, sharedIdentitySafe: answer },
      });
      expect(codes(diagnose(answered, facts()))).not.toContain('worker-cap-unmeasured');
    }
  });

  test('every diagnostic names what to do, not just what is wrong', () => {
    // A check that cannot say what to do is a check that gets ignored, so the
    // fix text is part of the contract rather than a nicety.
    const found = diagnose(
      profile({ capabilities: { ...profile().capabilities, db: { enabled: true } } }),
      facts({ packExists: false }),
    );
    expect(found.length).toBeGreaterThan(0);
    for (const diagnostic of found) {
      expect(diagnostic.fix.length, `${diagnostic.code} has no fix`).toBeGreaterThan(20);
      expect(diagnostic.code).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  test('errors sort ahead of warnings, because errors are what stop a run', () => {
    const found = diagnose(profile({ baseURL: 'https://demo.other.corp' }), facts());
    const levels = found.map((one) => one.level);
    expect(levels).toEqual([...levels].sort((a, b) => (a === 'error' ? -1 : b === 'error' ? 1 : 0)));
    expect(isRunnable(found)).toBe(false);
  });

  test('a missing auth.setup.ts is an error, not a warning', () => {
    // Without it nothing writes a storage state, and every spec taking
    // `authedPage` fails with "No storage state for role" — which points at
    // the wrong thing entirely.
    const found = diagnose(
      profile(),
      facts({ packFiles: HEALTHY_PACK.filter((file) => file !== 'tests/auth.setup.ts') }),
    );
    expect(codes(found)).toContain('auth-setup-missing');
    expect(found.find((one) => one.code === 'auth-setup-missing')?.level).toBe('error');
  });

  test('a role with no credentials is reported with the exact path it looked at', () => {
    const found = diagnose(
      profile({ roles: ['standard', 'approver'] }),
      facts({ resolvableRoles: ['standard'] }),
    );
    const missing = found.find((one) => one.code === 'credentials-missing');
    expect(missing?.message).toContain('qa/demo/pools/workforce/approver/1');
  });

  test('an unreachable secret store is a warning, not a wall of missing roles', () => {
    // Reporting an unreachable Vault as a broken profile is how a checker
    // trains people to ignore it.
    const found = diagnose(profile(), facts({ credentialsChecked: false, resolvableRoles: [] }));
    expect(codes(found)).toEqual(['credentials-unchecked']);
    expect(isRunnable(found)).toBe(true);
  });

  test('a role that both can and cannot sign in is a contradiction', () => {
    const found = diagnose(
      profile({ roles: ['standard'], nonAuthenticatingRoles: ['standard'] }),
      facts(),
    );
    expect(codes(found)).toContain('role-overlap');
  });

  test('an enabled API with nowhere to call is an error', () => {
    const found = diagnose(
      profile({
        capabilities: { ...profile().capabilities, api: { enabled: true } },
      }),
      facts({ packFiles: [...HEALTHY_PACK, 'api/orders.ts', 'tests/api/orders.spec.ts'] }),
    );
    expect(codes(found)).toContain('api-no-baseurl');
  });

  test('a vocabulary the capability matrix has switched off is reported as unreachable', () => {
    const found = diagnose(profile(), facts({ packFiles: [...HEALTHY_PACK, 'api/orders.ts'] }));
    expect(codes(found)).toContain('api-vocabulary-unreachable');
  });

  test('a contract document that is declared but absent is an error', () => {
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          contracts: { enabled: true, spec: 'src/targets/demo/contracts/openapi.yaml' },
        },
      }),
      facts({ contractSpecExists: false }),
    );
    expect(codes(found)).toContain('contracts-spec-missing');
  });

  test('an endpoint the published document does not describe is reported', () => {
    /*
       The API's version of a hallucinated locator, and it happened exactly
       this way: `GET /categories/{categoryId}` written from REST convention —
       a collection has members, so a member is readable. The service answers
       405, and the document agrees with the service: that path declares
       `put`, `delete` and `patch` and no `get` at all. The document was
       already vendored in the pack; nothing had ever compared the two.
    */
    const found = diagnose(
      profile(),
      facts({
        declaredEndpoints: ['GET /products', 'GET /categories/{categoryId}'],
        documentedOperations: ['GET /products', 'PUT /categories/{categoryId}'],
      }),
    );

    const warning = found.find((entry) => entry.code === 'endpoint-not-documented');
    expect(warning?.message).toContain('GET /categories/{categoryId}');
    expect(warning?.message, 'the documented one is not reported').not.toContain('GET /products,');
    // A warning, not an error: an undocumented endpoint is a real thing, and
    // the point is that somebody looked.
    expect(warning?.level).toBe('warning');
  });

  test('with no contract document there is nothing to compare endpoints against', () => {
    const found = diagnose(
      profile(),
      facts({ declaredEndpoints: ['GET /products'], documentedOperations: [] }),
    );
    expect(codes(found)).not.toContain('endpoint-not-documented');
  });

  test('a contract document that has landed prompts turning the capability on', () => {
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          contracts: { enabled: false, spec: 'src/targets/demo/contracts/openapi.yaml' },
        },
      }),
      facts({ contractSpecExists: true }),
    );
    expect(codes(found)).toContain('contracts-ready-not-enabled');
  });

  test('accessibility specs that no capability turns on are reported as dead', () => {
    // An accessibility project nobody enabled reports a silent zero, which
    // reads exactly like a pass.
    const found = diagnose(profile(), facts({ packFiles: [...HEALTHY_PACK, 'tests/a11y/nav.spec.ts'] }));
    expect(codes(found)).toContain('a11y-specs-not-enabled');
  });

  test('an accessibility capability with no specs behind it is reported too', () => {
    const found = diagnose(
      profile({
        capabilities: { ...profile().capabilities, a11y: { enabled: true, standard: 'wcag22aa' } },
      }),
      facts(),
    );
    expect(codes(found)).toContain('a11y-no-specs');
  });

  test('a .gitkeep is not a spec, and used to silence three checks entirely', () => {
    /*
       The scaffolder writes `tests/api/.gitkeep` and `tests/contract/.gitkeep`
       to keep those directories in git, and the checks asked whether any file
       started with the directory name — which a `.gitkeep` satisfies. So
       `api-no-specs` and `contracts-no-specs` could never fire on a scaffolded
       pack, and `a11y-no-specs` went quiet the moment somebody removed the
       scaffolded spec and left a placeholder. Found by running the live suites
       and reading what they listed: `target:doctor` said "profile, pack and
       credentials agree — nothing to fix" for a target whose contracts
       capability was validated by nothing at all.
    */
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          api: { enabled: true, baseURL: 'https://api.internal.corp' },
          contracts: { enabled: true, spec: 'src/targets/demo/contracts/openapi.yaml' },
          a11y: { enabled: true, standard: 'wcag22aa' },
        },
      }),
      facts({
        contractSpecExists: true,
        packFiles: [
          ...HEALTHY_PACK,
          'tests/api/.gitkeep',
          'tests/contract/.gitkeep',
          'tests/a11y/.gitkeep',
        ],
      }),
    );

    expect(codes(found)).toContain('api-no-specs');
    expect(codes(found)).toContain('contracts-no-specs');
    expect(codes(found)).toContain('a11y-no-specs');
  });

  test('a real spec in the directory settles it, whatever else is in there', () => {
    // The counterweight: the placeholder alongside a genuine spec must not
    // keep the warning alive, or the fix trades one wrong answer for another.
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          api: { enabled: true, baseURL: 'https://api.internal.corp' },
        },
      }),
      facts({ packFiles: [...HEALTHY_PACK, 'tests/api/.gitkeep', 'tests/api/orders.spec.ts'] }),
    );

    expect(codes(found)).not.toContain('api-no-specs');
  });

  test('a pack nobody has written specs for yet is told once, not per capability', () => {
    /*
       Every freshly scaffolded pack is in this state, and the dashboard's
       success panel renders each diagnostic in full directly above a "Next"
       list that already says to write the specs. Three more warning blocks
       there would be noise at the moment somebody succeeded — and the case
       these checks exist for is the opposite one: a target that has been
       written, is passing, and left a declared capability validating nothing.
    */
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          api: { enabled: true, baseURL: 'https://api.internal.corp' },
          a11y: { enabled: true, standard: 'wcag22aa' },
        },
      }),
      facts({
        packFiles: ['fixtures.ts', 'locators/sign-in.ts', 'actions/sign-in.ts', 'tests/auth.setup.ts', 'tests/e2e/.gitkeep', 'tests/api/.gitkeep'],
      }),
    );

    expect(codes(found)).toContain('no-e2e-specs');
    expect(codes(found)).not.toContain('api-no-specs');
    expect(codes(found)).not.toContain('a11y-no-specs');
  });

  test('a pack missing coverage kinds is told which, before a journey has to say so', () => {
    /*
       `npm run app:journey` reported this as a failed stage and nothing else
       did, so an application could sit for weeks with one happy-path spec
       while the doctor said there was nothing to fix. Same shape as
       `no-triage-fixture`, and raised for the same reason: a condition a run
       should catch earlier belongs in the preflight.
    */
    const found = diagnose(profile(), facts({ specTags: ['@smoke'] }));
    const message = found.find((one) => one.code === 'coverage-incomplete')?.message ?? '';

    expect(message).toContain('1 of 5');
    expect(message).toContain('@negative');
    expect(message).toContain('@boundary');
  });

  test('a pack with all five kinds is not told anything', () => {
    const found = diagnose(
      profile(),
      facts({ specTags: ['@smoke', '@negative', '@idempotency', '@audit', '@boundary'] }),
    );

    expect(codes(found)).not.toContain('coverage-incomplete');
  });

  test('nobody having looked is not the same as none, and gets no finding', () => {
    // A caller that cannot read spec sources omits the tags. Reporting that as
    // "no coverage" would be a wrong answer where the honest one is silence.
    expect(codes(diagnose(profile(), facts()))).not.toContain('coverage-incomplete');
  });

  test('a pack nobody has written yet is not told its coverage is thin', () => {
    // It has no specs at all, `no-e2e-specs` already says so, and a second
    // block saying the same thing is how a checker gets skimmed.
    const found = diagnose(
      profile(),
      facts({
        packFiles: ['fixtures.ts', 'locators/sign-in.ts', 'actions/sign-in.ts', 'tests/auth.setup.ts'],
        specTags: [],
      }),
    );

    expect(codes(found)).toContain('no-e2e-specs');
    expect(codes(found)).not.toContain('coverage-incomplete');
  });

  test('the kinds it checks are the journey’s own, not a second list', () => {
    // Two lists is how the doctor and the journey come to disagree about what
    // "five kinds" means, which is the argument that put every other shared
    // pattern in one place.
    const found = diagnose(profile(), facts({ specTags: [] }));
    const message = found.find((one) => one.code === 'coverage-incomplete')?.message ?? '';

    for (const { tag } of COVERAGE_KINDS) expect(message).toContain(tag);
  });

  test('a written pack with no triage ground truth is told so', () => {
    /*
       `npm run app:journey` reports stage 5 as failed for a pack with no
       `tests/triage-fixture/`, and until this check nothing else mentioned
       it — so the only way to find out was to run the whole journey. A suite
       that is green and has never classified a failure is two claims where
       one was checked (§21).
    */
    const found = diagnose(
      profile(),
      facts({ packFiles: ['fixtures.ts', 'locators/sign-in.ts', 'actions/sign-in.ts', 'tests/auth.setup.ts', 'tests/e2e/orders.spec.ts'] }),
    );

    expect(codes(found)).toContain('no-triage-fixture');
  });

  test('a pack nobody has written yet is not also told it has no triage fixture', () => {
    // Same reasoning as the capability warnings: `no-e2e-specs` already says
    // the pack is unwritten, and a second block saying it again on the panel
    // somebody meets at the moment they succeed is how a checker gets skimmed.
    const found = diagnose(
      profile(),
      facts({ packFiles: ['fixtures.ts', 'locators/sign-in.ts', 'actions/sign-in.ts', 'tests/auth.setup.ts', 'tests/e2e/.gitkeep'] }),
    );

    expect(codes(found)).toContain('no-e2e-specs');
    expect(codes(found)).not.toContain('no-triage-fixture');
  });

  test('a parked application is said on every check, not only when it lapses', () => {
    /*
       The cost of parking is invisible by construction: the suites do not run,
       so nothing turns red, so nothing reminds anybody. A waiver at least sits
       beside a spec that still runs.
    */
    const found = diagnose(
      profile({ parked: { reason: 'the application answers HTTP 500', reviewBy: '2099-01-01' } }),
      facts(),
    );

    expect(codes(found)).toContain('target-parked');
    expect(found.find((one) => one.code === 'target-parked')?.message).toContain('HTTP 500');
  });

  test('a parking past its review date is a different finding, and says decide again', () => {
    // "For now" becoming "forever" is the failure mode, and the review date is
    // the only thing standing between the two.
    const found = diagnose(
      profile({ parked: { reason: 'the application answers HTTP 500', reviewBy: '2020-01-01' } }),
      facts(),
    );

    expect(codes(found)).toContain('parked-review-due');
    expect(codes(found)).not.toContain('target-parked');
    expect(found.find((one) => one.code === 'parked-review-due')?.fix).toContain('Decide again');
  });

  test('an application nobody parked is not told anything about parking', () => {
    expect(codes(diagnose(profile(), facts()))).not.toContain('target-parked');
  });

  test('an accessibility waiver past its review date is surfaced, not forgotten', () => {
    // A waiver nobody revisits is a defect with better paperwork.
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          a11y: {
            enabled: true,
            standard: 'wcag22aa',
            waived: [{ rule: 'color-contrast', reason: 'brand palette review', reviewBy: '2020-01-01' }],
          },
        },
      }),
      facts({ packFiles: [...HEALTHY_PACK, 'tests/a11y/nav.spec.ts'] }),
    );
    expect(codes(found)).toContain('a11y-waiver-expired');
  });

  test('an auth-flow reservation on a pool of one is reported, since it cannot be honoured', () => {
    /*
       Worse than no reservation: the profile reads as "auth-flows has its own
       identity" while every worker and every login spec go on sharing account
       1 — the exact defect it was added to fix.
    */
    const found = diagnose(
      profile({ credentials: { ...profile().credentials, authFlowAccount: 2 } }),
      facts(),
    );

    expect(codes(found)).toContain('authflow-account-no-pool');
    expect(isRunnable(found), 'a reservation that does nothing is a smell, not a blocker').toBe(true);
  });

  test('an auth-flow reservation outside the pool is an error, not a warning', () => {
    // It names a credential path that does not exist, so the auth-flow specs
    // fail at sign-in rather than degrading quietly.
    const found = diagnose(
      profile({
        roles: ['customer'],
        credentials: { ...profile().credentials, poolSize: { customer: 3 }, authFlowAccount: 9 },
      }),
      facts(),
    );

    expect(codes(found)).toContain('authflow-account-outside-pool');
    expect(isRunnable(found)).toBe(false);
  });

  test('a contract waiver past its review date is surfaced the same way', () => {
    /*
       Accepted provider drift gets the same treatment as an accepted
       accessibility finding, and for the same reason: the value of a waiver
       over a deleted spec is that somebody has to come back to it. A review
       date nothing reads is a comment, which is what this replaced.
    */
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          contracts: {
            enabled: true,
            spec: 'src/targets/demo/contracts/openapi.yaml',
            waived: [
              {
                endpoint: 'GET /products/search',
                at: '/from',
                reason: 'vendor demo returns null on an empty page',
                reviewBy: '2020-01-01',
              },
            ],
          },
        },
      }),
      facts({ contractSpecExists: true, packFiles: [...HEALTHY_PACK, 'tests/contract/api.spec.ts'] }),
    );

    expect(codes(found)).toContain('contract-waiver-expired');
    expect(isRunnable(found), 'a stale waiver is a smell, not a blocker').toBe(true);
  });

  test('an accessibility standard the framework does not know is a warning, not a block', () => {
    // Standards outlive frameworks. A target needing one newer than this
    // repository has heard of must not wait on a change here — the check
    // exists to catch a typo.
    const found = diagnose(
      profile({
        capabilities: {
          ...profile().capabilities,
          a11y: { enabled: true, standard: 'wcag30aa' },
        },
      }),
      facts({ packFiles: [...HEALTHY_PACK, 'tests/a11y/nav.spec.ts'] }),
    );
    expect(codes(found)).toContain('a11y-unknown-standard');
    expect(isRunnable(found)).toBe(true);
  });

  test('a known standard passes without comment', () => {
    for (const standard of KNOWN_A11Y_STANDARDS) {
      const found = diagnose(
        profile({
          capabilities: { ...profile().capabilities, a11y: { enabled: true, standard } },
        }),
        facts({ packFiles: [...HEALTHY_PACK, 'tests/a11y/nav.spec.ts'] }),
      );
      expect(codes(found), standard).not.toContain('a11y-unknown-standard');
    }
  });

  test('enabling accessibility without naming a standard is an error', () => {
    const found = diagnose(
      profile({
        capabilities: { ...profile().capabilities, a11y: { enabled: true, standard: '' } },
      }),
      facts({ packFiles: [...HEALTHY_PACK, 'tests/a11y/nav.spec.ts'] }),
    );
    expect(codes(found)).toContain('a11y-no-standard');
    expect(isRunnable(found)).toBe(false);
  });

  test('enabling the database capability is an error while no driver exists', () => {
    // The `db` fixture throws for every spec that takes it, so this is a trap
    // rather than a preference.
    const found = diagnose(
      profile({ capabilities: { ...profile().capabilities, db: { enabled: true } } }),
      facts(),
    );
    const diagnostic = found.find((one) => one.code === 'db-no-driver');
    expect(diagnostic?.level).toBe('error');
  });

  test('TOTP against the local secret store is an error, because it cannot issue codes', () => {
    const found = diagnose(
      profile({ capabilities: { ...profile().capabilities, mfa: 'totp' } }),
      facts(),
    );
    expect(codes(found)).toContain('totp-needs-vault');
  });

  test('email OTP needs both an address to watch and an inbox to read', () => {
    const found = diagnose(
      profile({ capabilities: { ...profile().capabilities, mfa: 'email' } }),
      facts(),
    );
    expect(codes(found)).toContain('email-otp-no-address');
    expect(codes(found)).toContain('email-otp-no-inbox');

    const configured = diagnose(
      profile({
        capabilities: { ...profile().capabilities, mfa: 'email' },
        mailBaseAddress: 'qa@example.test',
      }),
      facts({ env: { MAIL_API_URL: 'http://127.0.0.1:8025' } }),
    );
    expect(codes(configured)).not.toContain('email-otp-no-address');
    expect(codes(configured)).not.toContain('email-otp-no-inbox');
  });

  test('leasing against a store that cannot lease is called out as a silent degradation', () => {
    // This one passes every test and looks fine until two workers collide on
    // the same identity, which is exactly why it is worth naming.
    const found = diagnose(
      profile({ capabilities: { ...profile().capabilities, accountPool: 'leased' } }),
      facts(),
    );
    const diagnostic = found.find((one) => one.code === 'leasing-degrades-silently');
    expect(diagnostic?.message).toContain('compare-and-swap');
  });

  test('a base URL outside its own allowlist is an error before a browser opens', () => {
    const found = diagnose(profile({ hostAllowlist: ['other.corp'] }), facts());
    expect(codes(found)).toContain('host-not-allowed');
  });

  test('the environment may widen the allowlist without editing the profile', () => {
    const found = diagnose(
      profile({ hostAllowlist: [] }),
      facts({ env: { GENERATION_HOST_ALLOWLIST: 'internal.corp' } }),
    );
    expect(codes(found)).not.toContain('allowlist-empty');
    expect(codes(found)).not.toContain('host-not-allowed');
  });

  test('a reserved host is flagged as the scaffold default nobody replaced', () => {
    const found = diagnose(
      profile({ baseURL: 'https://app.example.invalid', hostAllowlist: ['example.invalid'] }),
      facts(),
    );
    expect(codes(found)).toContain('baseurl-placeholder');
    expect(isRunnable(found)).toBe(true);
  });

  test('rotation on a static pool, or without a policy, is a smell worth stating', () => {
    const found = diagnose(
      profile({
        rotation: {
          enabled: true,
          maxAgeDays: 60,
          jitterDays: 5,
          blackout: { start: '18:00', end: '06:00' },
          onFailure: 'quarantine',
        },
      }),
      facts(),
    );
    expect(codes(found)).toContain('rotation-without-pool');
    expect(codes(found)).toContain('rotation-without-policy');
  });
});

test.describe('the target scaffolder', () => {
  const options = { name: 'new-app', baseURL: 'https://app.new-app.test' };
  const paths = (): string[] => planScaffold(options).files.map((file) => file.path);

  test('writes a profile and a complete four-layer pack', () => {
    expect(paths()).toEqual([
      'config/targets/new-app.ts',
      'src/targets/new-app/locators/sign-in.ts',
      'src/targets/new-app/actions/sign-in.ts',
      'src/targets/new-app/fixtures.ts',
      'src/targets/new-app/tests/auth.setup.ts',
      'src/targets/new-app/tests/e2e/.gitkeep',
    ]);
  });

  test('the scaffolded pack passes its own preflight', () => {
    // The scaffolder and the checker are the two halves of onboarding, and a
    // scaffold that fails the check is worse than no scaffold at all.
    const plan = planScaffold({ ...options, roles: ['shopper'] });
    const packFiles = plan.files
      .filter((file) => file.path.startsWith('src/targets/new-app/'))
      .map((file) => file.path.replace('src/targets/new-app/', ''));

    const found = diagnose(
      profile({
        name: 'new-app',
        baseURL: options.baseURL,
        hostAllowlist: ['new-app.test'],
        roles: ['shopper'],
        credentials: { source: 'vault', root: 'qa/new-app/pools', accountType: 'workforce' },
      }),
      facts({ packFiles, resolvableRoles: ['shopper'] }),
    );
    expect(found.filter((one) => one.level === 'error')).toEqual([]);
  });

  test('names the symbols after the target so two packs never collide', () => {
    const rendered = new Map(planScaffold(options).files.map((file) => [file.path, file.contents]));
    expect(rendered.get('config/targets/new-app.ts')).toContain('export const newApp: TargetProfile');
    expect(rendered.get('src/targets/new-app/fixtures.ts')).toContain('interface NewAppFixtures');
    expect(camelCase('new-app')).toBe('newApp');
    expect(pascalCase('new-app')).toBe('NewApp');
  });

  test('derives the allowlist from the host rather than defaulting to something permissive', () => {
    // A wildcard allowlist is how a suite ends up pointed at production with
    // the check that would have caught it passing silently.
    expect(defaultAllowlist('https://shop.staging.acme.test')).toEqual(['acme.test']);
    expect(defaultAllowlist('https://intranet.test')).toEqual(['intranet.test']);
    expect(defaultAllowlist('http://127.0.0.1:8080')).toEqual(['127.0.0.1']);
  });

  test('optional layers are opt-in, and each brings its own spec directory', () => {
    const withAll = planScaffold({
      ...options,
      apiBaseURL: 'https://api.new-app.test',
      include: { api: true, db: true, contracts: true },
    }).files.map((file) => file.path);

    expect(withAll).toContain('src/targets/new-app/endpoints/orders.ts');
    expect(withAll).toContain('src/targets/new-app/api/orders.ts');
    expect(withAll).toContain('src/targets/new-app/tests/api/.gitkeep');
    expect(withAll).toContain('src/targets/new-app/queries/ledger.ts');
    expect(withAll).toContain('src/targets/new-app/db/ledger.ts');
    expect(withAll).toContain('src/targets/new-app/contracts/README.md');
  });

  test('the accessibility layer ships a spec, not an empty directory', () => {
    // A directory with a .gitkeep in it teaches nobody the shape. The spec
    // shows the one thing that matters: the fixture returns findings and the
    // spec decides what counts as a failure.
    const rendered = new Map(
      planScaffold({ ...options, include: { a11y: true } }).files.map((f) => [f.path, f.contents]),
    );
    const spec = rendered.get('src/targets/new-app/tests/a11y/landing.spec.ts') ?? '';
    expect(spec).toContain("from '../../fixtures'");
    expect(spec).toContain('a11y.scan(authedPage)');
    expect(spec).toContain('scan.incomplete');
    expect(spec).toContain('@a11y');
    expect(spec).toContain('practitest');
  });

  test('refuses to scaffold an API capability with nowhere to call', () => {
    // Scaffolding the failure and letting the checker report it a minute later
    // is worse than refusing here, where the message can say what to pass.
    expect(() => planScaffold({ ...options, include: { api: true } })).toThrow(ScaffoldError);
    expect(() => planScaffold({ ...options, include: { api: true } })).toThrow(/--api-url/);
  });

  test('ships the contract capability off until the document is vendored', () => {
    const rendered = new Map(
      planScaffold({ ...options, include: { contracts: true } }).files.map((file) => [
        file.path,
        file.contents,
      ]),
    );
    const written = rendered.get('config/targets/new-app.ts') ?? '';
    expect(written).toContain("contracts: { enabled: false, spec: 'src/targets/new-app/contracts/openapi.yaml' }");
  });

  test('the accessibility standard is a choice at scaffold time and after it', () => {
    // Asked at onboarding, and environment-overridable afterwards — the bar an
    // application is held to can be raised for one environment before another,
    // and it changes on the standards body's schedule, not this repository's.
    const written = (options_: Parameters<typeof planScaffold>[0]): string =>
      new Map(planScaffold(options_).files.map((f) => [f.path, f.contents])).get(
        'config/targets/new-app.ts',
      ) ?? '';

    expect(written({ ...options, include: { a11y: true } })).toContain(
      "standard: process.env.A11Y_STANDARD ?? 'wcag22aa'",
    );
    expect(
      written({ ...options, include: { a11y: true }, a11yStandard: 'en301549' }),
    ).toContain("standard: process.env.A11Y_STANDARD ?? 'en301549'");
    // Not on the list is still accepted: the doctor spell-checks, it does not gate.
    expect(written({ ...options, a11yStandard: 'wcag30aa' })).toContain("?? 'wcag30aa'");
  });

  test('parses flag names containing digits', () => {
    // `--a11y-standard` was rejected as an unrecognised argument by a parser
    // that matched flag names with [a-z-]+, while the CLI printed that exact
    // flag in its own usage text. The parser lives in this module rather than
    // in the tool so it can be tested at all.
    const parsed = parseScaffoldArgs([
      '--name=new-app',
      '--url=https://app.new-app.test',
      '--with=a11y',
      '--a11y-standard=en301549',
    ]);
    expect(parsed.options.a11yStandard).toBe('en301549');
    expect(parsed.options.include?.a11y).toBe(true);
    expect(parsed.dryRun).toBe(false);
  });

  test('rejects arguments it does not understand, and says so', () => {
    const base = ['--name=new-app', '--url=https://app.new-app.test'];
    expect(() => parseScaffoldArgs([...base, '-name=x'])).toThrow(ScaffoldError);
    expect(() => parseScaffoldArgs([...base, '--with=telepathy'])).toThrow(/telepathy/);
    expect(() => parseScaffoldArgs([...base, '--secrets=guesswork'])).toThrow(/vault/);
    expect(() => parseScaffoldArgs(['--url=https://app.new-app.test'])).toThrow(/--name/);
  });

  test('rejects a name that cannot be a directory, a TARGET value and a filename', () => {
    for (const bad of ['New App', 'new_app', '-app', 'app-', '']) {
      expect(() => planScaffold({ ...options, name: bad }), bad).toThrow(ScaffoldError);
    }
  });

  test('rejects a base URL that is not one, rather than writing a broken profile', () => {
    expect(() => planScaffold({ ...options, baseURL: 'app.new-app.test' })).toThrow(ScaffoldError);
  });

  test('the next steps put exploration before writing locators', () => {
    // Locator hallucination is the largest single source of dead-on-arrival
    // generated tests, and the order of these steps is the fix.
    const steps = planScaffold(options).nextSteps;
    const explore = steps.findIndex((step) => step.includes('explore'));
    const write = steps.findIndex((step) => step.includes('locators/sign-in.ts'));
    expect(explore).toBeGreaterThanOrEqual(0);
    expect(explore).toBeLessThan(write);
  });

  test.describe('what the next steps say about credentials', () => {
    /*
       Item 60, found by onboarding a scratch target through the running
       dashboard and reading the panel afterwards. The credential had just
       been written to the gitignored file — the default step 4 offers — and
       the panel said "Add credentials for standard to
       config/secrets.local.json". Both halves wrong: nothing to add, and the
       tracked file named as the place to add it.
    */
    const local = { ...options, secretSource: 'local' as const, roles: ['standard'] };

    test('a credential the caller has already written earns no instruction', () => {
      const steps = planScaffold({
        ...local,
        credentialsWritten: true,
        credentialLocation: 'private-file' as const,
      }).nextSteps;

      expect(steps.some((step) => step.includes('Add credentials'))).toBe(false);
      // And nothing else went missing with it.
      expect(steps.some((step) => step.includes('explore'))).toBe(true);
    });

    test('the tracked file is not named anywhere after writing to the private one', () => {
      // The other half of the regression, asserted across the whole list
      // rather than the first step: `secrets.local.json` is tracked, and
      // `.gitignore`, the Test users page and item 15 all agree that a real
      // value does not belong in it.
      const steps = planScaffold({
        ...local,
        credentialsWritten: true,
        credentialLocation: 'private-file' as const,
      }).nextSteps;

      expect(steps.join('\n')).not.toContain('secrets.local.json');
    });

    test('with nothing written it names the gitignored file, not the tracked one', () => {
      // The CLI path: `target:new` writes no credential, so the instruction is
      // still needed — it just has to name where a real value belongs.
      const steps = planScaffold(local).nextSteps;

      expect(steps[0]).toContain('config/secrets.private.json');
      expect(steps[0]).not.toContain('config/secrets.local.json');
    });

    test('choosing the committed file is taken at its word', () => {
      // A vendor demo that prints its own logins is exactly what the tracked
      // file is for, so naming it is right when somebody asked for it.
      const steps = planScaffold({ ...local, credentialLocation: 'shared-file' as const }).nextSteps;

      expect(steps[0]).toContain('config/secrets.local.json');
    });

    test('a Vault target is told to write the path, whatever the local choice was', () => {
      const steps = planScaffold({
        ...options,
        secretSource: 'vault' as const,
        credentialLocation: 'private-file' as const,
      }).nextSteps;

      expect(steps[0]).toContain('in Vault');
    });
  });

  test('exploration cannot be argued into a host the profile never allowed', () => {
    // The host comes from the profile so that exploring runs through the same
    // non-production guard as a test run. An argument that parses as an
    // absolute URL would replace the origin and skip it — and this is not
    // hypothetical: Git Bash rewrites a leading `/path` into a local
    // filesystem path before the process ever sees it.
    const base = 'https://app.internal.corp';
    expect(resolveExploreUrl(base)).toBe(base);
    expect(resolveExploreUrl(base, '/checkout')).toBe(`${base}/checkout`);
    expect(resolveExploreUrl(base, 'orders?state=open')).toBe(`${base}/orders?state=open`);

    expect(() => resolveExploreUrl(base, 'https://elsewhere.corp/x')).toThrow(/not the target/);
    expect(() => resolveExploreUrl(base, 'C:/Program Files/Git/checkout')).toThrow(/not the target/);
  });

  test('no scaffolded file names a host outside the profile', () => {
    const plan = planScaffold({
      ...options,
      apiBaseURL: 'https://api.new-app.test',
      include: { api: true, db: true, contracts: true },
    });
    for (const file of plan.files) {
      if (file.path.startsWith('config/targets/')) continue; // the one place a host may appear
      expect(file.contents, file.path).not.toMatch(/https?:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// Sessions belonging to nothing
// ---------------------------------------------------------------------------

test.describe('stored sessions with no application', () => {
  /*
     The one check in `diagnose` that is not about the target being doctored.
     It is here because this is the only thing anybody runs routinely that
     looks at the repository rather than at one pack — a session belonging to
     no target is invisible to every per-target check by definition. Two were
     found in this repository for applications it had not known about for
     weeks, and a storage state is a live credential.
  */
  test('are reported, with the file to delete named', () => {
    const found = diagnose(
      profile(),
      facts({
        storageStateFiles: ['demo.standard.json', 'saucedemo.standard.json'],
        knownTargets: ['demo'],
      }),
    );
    const orphan = found.find((one) => one.code === 'session-orphaned')!;

    expect(orphan).toBeDefined();
    expect(orphan.level, 'a stale credential does not stop the run in front of you').toBe(
      'warning',
    );
    expect(orphan.message).toContain('saucedemo.standard.json');
    expect(orphan.fix).toContain('.auth/saucedemo.standard.json');
    expect(orphan.fix, 'and says why deleting one costs nothing').toContain('setup:auth');
  });

  test('are not reported when every session belongs to something', () => {
    expect(
      codes(diagnose(profile(), facts({ storageStateFiles: ['demo.standard.json'], knownTargets: ['demo'] }))),
    ).not.toContain('session-orphaned');
  });

  test('a caller with no repository-wide facts gets no finding, not a wrong one', () => {
    // The dashboard reports on a target it has just written and has no reason
    // to have read `.auth/`. Absent facts must not become a false positive.
    expect(codes(diagnose(profile(), facts()))).not.toContain('session-orphaned');
  });

  test('something in .auth that is not a session is left alone', () => {
    // The directory is gitignored, which makes it somewhere people put things.
    expect(
      codes(
        diagnose(profile(), facts({ storageStateFiles: ['notes.txt', '.DS_Store'], knownTargets: ['demo'] })),
      ),
    ).not.toContain('session-orphaned');
  });
});

test.describe('the sign-in path the operator typed', () => {
  /*
     A hint that is thrown away is worse than not offering the field. Typing
     `/admin` and pressing "Read the application" probed eight guessed paths —
     none of them `/admin` — then reported "No sign-in form found on any of /,
     /auth/login, …" and advised exploring the application by hand. The
     operator had already supplied the answer. Measured on
     automationintesting.online, whose `/admin` carries an ordinary
     username/password form the probe never loaded.
  */
  test('is tried first, ahead of the guesses', () => {
    expect(signInPathsToTry('/admin')[0]).toBe('/admin');
    expect(signInPathsToTry('/admin')).toEqual(expect.arrayContaining(SIGN_IN_PATHS));
  });

  test('a bare path is normalised, because people type both', () => {
    expect(signInPathsToTry('admin')[0]).toBe('/admin');
  });

  test('is not tried twice when it is already one of the defaults', () => {
    const paths = signInPathsToTry('/login');
    expect(paths[0]).toBe('/login');
    expect(paths.filter((path) => path === '/login')).toHaveLength(1);
  });

  test('nothing typed, or the default, leaves the list exactly as it was', () => {
    // The common case must not pay for the hint.
    expect(signInPathsToTry(undefined)).toEqual(SIGN_IN_PATHS);
    expect(signInPathsToTry('   ')).toEqual(SIGN_IN_PATHS);
    expect(signInPathsToTry('/'), 'the field default is not a hint').toEqual(SIGN_IN_PATHS);
  });
});

test.describe('a spec the scaffolder wrote is not somebody having started', () => {
  /*
     Scaffolding with `--with=a11y` ships `tests/a11y/landing.spec.ts`. That
     made a brand-new pack look written-in, so `api-no-specs` appeared on the
     success panel of a target nobody had touched — the same way `.gitkeep`
     defeated the check this guard belongs to. Observed onboarding
     restful-booker-platform.
  */
  const withApiAndA11y = profile({
    capabilities: {
      ...profile().capabilities,
      api: { enabled: true, baseURL: 'https://api.demo.internal.corp' },
      a11y: { enabled: true, standard: 'wcag22aa' },
    },
  });

  test('a freshly scaffolded pack is told once, not per capability', () => {
    const found = diagnose(
      withApiAndA11y,
      facts({
        packFiles: [
          'fixtures.ts',
          'locators/sign-in.ts',
          'actions/sign-in.ts',
          'tests/auth.setup.ts',
          'tests/e2e/.gitkeep',
          'tests/api/.gitkeep',
          'tests/a11y/landing.spec.ts',
        ],
      }),
    );

    expect(codes(found)).toContain('no-e2e-specs');
    expect(codes(found), 'the scaffolder wrote that a11y spec, not a person').not.toContain(
      'api-no-specs',
    );
  });

  test('one real spec anywhere and the capability warnings come back', () => {
    // The counterweight: once somebody has written something, a declared
    // capability validating nothing is exactly what should be reported.
    const found = diagnose(
      withApiAndA11y,
      facts({
        packFiles: [...HEALTHY_PACK, 'tests/a11y/landing.spec.ts', 'tests/api/.gitkeep'],
      }),
    );

    expect(codes(found)).toContain('api-no-specs');
  });

  test('the list matches what the scaffolder actually writes', () => {
    // Two copies of a list is how the two came to disagree. If the scaffolder
    // gains or renames a spec, this fails rather than silently re-breaking the
    // guard.
    const written = planScaffold({
      name: 'demo',
      baseURL: 'https://demo.internal.corp',
      roles: ['standard'],
      include: { api: true, db: true, contracts: true, a11y: true },
      apiBaseURL: 'https://api.demo.internal.corp',
    })
      .files.map((file) => file.path.replace('src/targets/demo/', ''))
      .filter((path) => path.endsWith('.spec.ts'));

    expect([...SCAFFOLDED_SPECS].sort()).toEqual(written.sort());
  });
});
