import { defineConfig, devices, type Project } from '@playwright/test';
import { resolveTarget } from './config/target';
import type { FrameworkOptions } from './src/fixtures/base';

/**
 * Resolved once, here, and injected everywhere else through the `target`
 * fixture. No spec, action or locator ever names a host (§04).
 */
const target = resolveTarget();
const isCI = Boolean(process.env.CI);
const targetRoot = `src/targets/${target.name}`;

/**
 * Declared capabilities travel to the reporter through the environment, so the
 * report can say "api: not applicable for <target>" rather than showing a
 * silent zero — and so the reporter never has to import a target profile (§05).
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
    capability: 'mfa',
    enabled: target.capabilities.mfa !== 'none',
    note: `mfa: ${target.capabilities.mfa}`,
  },
]);

/**
 * Files the `auth-flows` project owns. The e2e project must not also run them.
 * The convention is documented in docs/CONVENTIONS.md and enforced by the
 * `auth-project-boundary` lint rule; a target may override it.
 */
const AUTH_FLOW_FILES = target.authFlowPattern ?? /(login|mfa|password)\.spec\.ts$/;

const projects: Project<FrameworkOptions>[] = [
  {
    // Framework self-tests: lint rules, adapters, reporters, triage. No
    // browser, no network, no target. They are the executable half of the
    // conventions in docs/CONVENTIONS.md.
    name: 'unit',
    testDir: 'tests/unit',
  },
  {
    name: 'setup:auth',
    testDir: targetRoot,
    testMatch: /auth\.setup\.ts$/,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'auth-flows',
    testDir: `${targetRoot}/tests/e2e`,
    testMatch: AUTH_FLOW_FILES,
    // Must start signed out. Making the exception its own project — rather
    // than leaving it to each test to remember — means a spec cannot
    // accidentally inherit a session (§13).
    use: { ...devices['Desktop Chrome'], role: '' },
  },
  {
    name: 'e2e',
    testDir: `${targetRoot}/tests/e2e`,
    testIgnore: AUTH_FLOW_FILES,
    dependencies: ['setup:auth'],
    use: { ...devices['Desktop Chrome'], role: target.roles[0] ?? '' },
  },
];

/**
 * The triage ground-truth fixture: specs that are *meant* to fail, with causes
 * known in advance (§21 phase 6). Opt-in only, so a green pipeline stays
 * green — run it deliberately to produce a failing run for measuring triage
 * agreement.
 */
if (process.env.TRIAGE_FIXTURE === 'true') {
  projects.push({
    name: 'triage-fixture',
    testDir: `${targetRoot}/tests/triage-fixture`,
    retries: 0, // a retried known failure would report as flaky and skew the ground truth
    use: { ...devices['Desktop Chrome'], role: '' },
  });
}

// Capability-gated projects. A disabled capability means the project does not
// run for this target and the report says so explicitly — "api: not applicable
// for <target>" rather than a silent zero (§05).
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

export default defineConfig<FrameworkOptions>({
  testDir: '.',
  /** Generated specs are reviewed, not trusted — a runaway test must not hang CI. */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : undefined,

  reporter: [
    ['list'],
    // Straight onto the merge request widget. One line, best feedback surface
    // available (§16).
    ['junit', { outputFile: 'results/junit.xml' }],
    // The canonical, versioned model every downstream consumer reads. Nothing
    // else re-derives facts from raw Playwright output (§18).
    ['./src/support/reporters/run-result-reporter.ts'],
    ...(isCI ? ([['blob']] as const) : []),
  ] as NonNullable<Parameters<typeof defineConfig>[0]['reporter']>,

  use: {
    baseURL: target.baseURL,
    // Which attribute `getByTestId` reads is a property of the application
    // under test, so it comes from the profile (§04).
    testIdAttribute: target.testIdAttribute,
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects,
});
