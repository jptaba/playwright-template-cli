import { defineConfig, devices, type Project } from '@playwright/test';
import { resolveTarget, TargetSelectionError } from './config/target';
import { DEFAULT_AUTH_FLOW_PATTERN } from './src/support/auth-flows';
import { resolveWorkers, workerCeiling } from './src/support/paths';
import type { FrameworkOptions } from './src/fixtures/base';

const isCI = Boolean(process.env.CI);

/**
 * Resolved once, here, and injected everywhere else through the `target`
 * fixture. No spec, action or locator ever names a host (§04).
 *
 * A repository with several applications in it and no `TARGET` set has not
 * chosen one — so the browser projects are not built and only the framework's
 * own tests run. That keeps `npm run verify` working the moment a second
 * application is onboarded, without alphabetical order silently deciding which
 * application gets tested.
 *
 * Only *selection* degrades this way. A target that is selected and
 * misconfigured — an allowlist that does not cover its own base URL, a profile
 * that will not load — throws, because a suite that quietly skipped itself and
 * reported green is worse than one that failed to start.
 */
const selection = ((): { target: ReturnType<typeof resolveTarget> | null; reason: string | null } => {
  try {
    return { target: resolveTarget(), reason: null };
  } catch (error) {
    if (error instanceof TargetSelectionError) return { target: null, reason: error.message };
    throw error;
  }
})();

const target = selection.target;

/**
 * Cap workers at the account pool the selected target's own tests share, so
 * two workers never sign in as the same customer on an application whose
 * state lives on the server. Measured live rather than assumed: toolshop's
 * suite passed 3 of 3 runs at 3 workers (its customer pool) and 1 of 4 at the
 * local default of 7, a different spec failing each time (backlog item 30).
 */
const ceiling = target
  ? workerCeiling(target.roles, target.credentials.poolSize, target.capabilities.serverState)
  : null;

const projects: Project<FrameworkOptions>[] = [
  {
    /*
       The framework's own tests — lint rules, adapters, reporters, triage,
       onboarding — against in-process fakes. No browser, no network, no
       target.

       Deliberately *not* called `unit`. Nothing here tests the application
       under test, and a project of that name sitting beside `e2e` and `api`
       reads as "we unit-test the app in Playwright", which is neither true
       nor a thing this framework does. The application is tested through
       e2e, api, contract, a11y and the mixed specs that span them.
    */
    name: 'framework',
    testDir: 'tests/framework',
  },
  {
    /*
       The framework's own *pages*, driven by a browser.

       Same job as `framework` and the same rule about what it may touch — no
       target, no network, and every service behind an in-process fake. It is a
       separate project only because it needs a browser, and `framework` is
       deliberately the project that does not.

       It exists because the onboarding dashboard is half server and half a few
       hundred lines of DOM code, and the defects were all in the second half:
       fields that kept a previous application's values, a button left enabled
       after a preview refused, a form that emptied when you came back to it.
       None of that is reachable by asserting on the string the page is
       rendered from.
    */
    name: 'dashboard',
    testDir: 'tests/dashboard',
    use: { ...devices['Desktop Chrome'] },
  },
];

if (!target) {
  console.warn(
    `\nNo application selected, so only the 'framework' project is available.\n${selection.reason}\n`,
  );
} else {
  const targetRoot = `src/targets/${target.name}`;

  /**
   * Declared capabilities travel to the reporter through the environment, so
   * the report can say "api: not applicable for <target>" rather than showing a
   * silent zero — and so the reporter never has to import a profile (§05).
   */
  process.env.TARGET = target.name;
  process.env.TARGET_ENV = target.environment;
  process.env.CAPABILITY_NOTES = JSON.stringify([
    {
      capability: 'api',
      enabled: target.capabilities.api.enabled,
      note: target.capabilities.api.enabled
        ? 'service API tests ran'
        : `not applicable for ${target.name}: no service API`,
    },
    {
      capability: 'contracts',
      enabled: target.capabilities.contracts.enabled,
      note: target.capabilities.contracts.enabled
        ? `validated against ${target.capabilities.contracts.spec}`
        : `not applicable for ${target.name}: no published schema`,
    },
    {
      capability: 'db',
      enabled: target.capabilities.db.enabled,
      note: target.capabilities.db.enabled
        ? 'read-only database assertions enabled'
        : `not applicable for ${target.name}: database assertions off`,
    },
    {
      capability: 'a11y',
      enabled: target.capabilities.a11y.enabled,
      note: target.capabilities.a11y.enabled
        ? `accessibility checked against ${target.capabilities.a11y.standard}`
        : `not applicable for ${target.name}: accessibility testing off`,
    },
    {
      capability: 'mfa',
      enabled: target.capabilities.mfa !== 'none',
      note: `mfa: ${target.capabilities.mfa}`,
    },
  ]);

  /**
   * Files the `auth-flows` project owns. The e2e project must not also run them.
   * The convention is documented in docs/CONVENTIONS.md and enforced by the
   * `auth-project-boundary` lint rule, which reads the same default and honours
   * the same per-target override; a framework test holds the two in step.
   */
  const authFlowFiles = target.authFlowPattern ?? DEFAULT_AUTH_FLOW_PATTERN;

  projects.push(
    {
      name: 'setup:auth',
      testDir: targetRoot,
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      /*
         The one project where a retry is the right answer, and only because of
         what it is: establishing a precondition, not making a claim. Every
         other project retries nothing, because a retried assertion is a
         result nobody can trust.

         It earns its place. Signing in reaches the account page and the
         navigation intermittently renders with *neither* the account menu nor
         a "Sign in" link — a third state that is neither signed in nor out.
         That is the application's defect, it is visible in the screenshot the
         failure captures, and it must not be hidden by weakening the marker
         until it passes. A second attempt establishes the session; the first
         failure is still in the report.
      */
      retries: 2,
    },
    {
      name: 'auth-flows',
      testDir: `${targetRoot}/tests/e2e`,
      testMatch: authFlowFiles,
      // Must start signed out. Making the exception its own project — rather
      // than leaving it to each test to remember — means a spec cannot
      // accidentally inherit a session (§13).
      use: { ...devices['Desktop Chrome'], role: '' },
    },
    {
      name: 'e2e',
      testDir: `${targetRoot}/tests/e2e`,
      testIgnore: authFlowFiles,
      dependencies: ['setup:auth'],
      use: { ...devices['Desktop Chrome'], role: target.roles[0] ?? '' },
    },
  );

  /**
   * The triage ground-truth fixture: specs that are *meant* to fail, with
   * causes known in advance (§21 phase 6). Opt-in only, so a green pipeline
   * stays green — run it deliberately to produce a failing run for measuring
   * triage agreement.
   */
  if (process.env.TRIAGE_FIXTURE === 'true') {
    projects.push({
      name: 'triage-fixture',
      testDir: `${targetRoot}/tests/triage-fixture`,
      retries: 0, // a retried known failure reports as flaky and skews the ground truth
      use: { ...devices['Desktop Chrome'], role: '' },
    });
  }

  // Capability-gated projects. A disabled capability means the project does not
  // run for this target and the report says so explicitly — "api: not
  // applicable for <target>" rather than a silent zero (§05).
  if (target.capabilities.api.enabled) {
    projects.push({
      name: 'api',
      testDir: `${targetRoot}/tests/api`,
      // No browser: this is most of the wall-clock time in a naive mixed suite.
      use: {},
    });
  }

  if (target.capabilities.contracts.enabled) {
    projects.push({
      name: 'contract',
      testDir: `${targetRoot}/tests/contract`,
      use: {},
    });
  }

  /**
   * Accessibility is its own project rather than a tag on `e2e`, for the same
   * reason `api` is: it is a distinct kind of claim about the application, it
   * is reported separately, and a target that has not committed to a standard
   * should show "not applicable" rather than a silent zero.
   *
   * It runs signed in, because the interesting accessibility problems are
   * almost never on the landing page.
   */
  if (target.capabilities.a11y.enabled) {
    projects.push({
      name: 'a11y',
      testDir: `${targetRoot}/tests/a11y`,
      dependencies: ['setup:auth'],
      use: { ...devices['Desktop Chrome'], role: target.roles[0] ?? '' },
    });
  }
}

export default defineConfig<FrameworkOptions>({
  testDir: '.',
  /** Generated specs are reviewed, not trusted — a runaway test must not hang CI. */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: resolveWorkers(ceiling, isCI),

  reporter: [
    ['list'],
    // Straight onto the merge request widget. One line, best feedback surface
    // available (§16).
    // Same reason as RUN_RESULT_PATH: concurrent runs must not share a file.
    ['junit', { outputFile: process.env.JUNIT_PATH ?? 'results/junit.xml' }],
    // The canonical, versioned model every downstream consumer reads. Nothing
    // else re-derives facts from raw Playwright output (§18).
    ['./src/support/reporters/run-result-reporter.ts'],
    /*
       Narrates the run while it happens, for the local dashboard. Does nothing
       whatsoever unless LIVE_EVENTS_PATH is set, so a command-line run and
       every run in CI pay one environment check for it.
    */
    ['./src/support/reporters/live-events-reporter.ts'],
    ...(isCI ? ([['blob']] as const) : []),
  ] as NonNullable<Parameters<typeof defineConfig>[0]['reporter']>,

  use: {
    ...(target
      ? {
          baseURL: target.baseURL,
          // Which attribute `getByTestId` reads is a property of the
          // application under test, so it comes from the profile (§04).
          testIdAttribute: target.testIdAttribute,
        }
      : {}),
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    /* There is no `--video` flag, so a run that wants video says so here. */
    video: (process.env.PW_VIDEO as 'off' | 'on' | 'retain-on-failure' | undefined) ??
      (isCI ? 'retain-on-failure' : 'off'),
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects,
});
