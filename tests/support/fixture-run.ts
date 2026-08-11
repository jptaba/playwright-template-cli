import {
  RUN_RESULT_SCHEMA_VERSION,
  tally,
  type RunResult,
  type TestRecord,
} from '../../src/support/reporters/run-result';

/**
 * A run with a known mix of pass, fail, flaky and skipped — §18.
 *
 * "A useful side effect: the report becomes testable. Feed a fixture
 * run-result.json with a known mix and assert the rendered HTML. Reports that
 * are generated only from live runs are never tested and quietly rot."
 */
function record(overrides: Partial<TestRecord> & Pick<TestRecord, 'id' | 'title'>): TestRecord {
  return {
    caseId: null,
    jiraKey: null,
    caseHash: null,
    file: 'src/targets/demo/tests/e2e/thing.spec.ts',
    project: 'e2e',
    kind: 'ui',
    tags: [],
    outcome: 'expected',
    status: 'passed',
    firstRunStatus: 'passed',
    retries: 0,
    durationMs: 1200,
    workerIndex: 0,
    error: null,
    steps: [],
    attachments: [],
    annotations: [],
    ...overrides,
  };
}

export function fixtureRun(overrides: Partial<RunResult['run']> = {}): RunResult {
  const tests: TestRecord[] = [
    record({
      id: 't1',
      title: 'A shopper can sign in @smoke',
      caseId: '5101',
      steps: [{ title: 'Sign in as the shopper', durationMs: 800, failed: false }],
    }),
    record({
      id: 't2',
      title: 'Checkout totals include tax @checkout',
      caseId: '5104',
      outcome: 'unexpected',
      status: 'failed',
      firstRunStatus: 'failed',
      durationMs: 3400,
      error: {
        message: 'Expected 2.40 but received 0.00\n  at checkout-totals.spec.ts:21',
        stack: null,
        snippet: null,
      },
      steps: [
        { title: 'Add two products to the cart', durationMs: 900, failed: false },
        {
          title: 'Check out as far as the order overview',
          durationMs: 1500,
          failed: true,
          error: 'Expected 2.40 but received 0.00',
        },
      ],
      attachments: [{ name: 'screenshot', contentType: 'image/png', path: 'test-results/x.png' }],
    }),
    record({
      id: 't3',
      title: 'An order can be placed @checkout',
      caseId: '5105',
      // Passed, but not first time — the distinction that disappears if you
      // record only the final state.
      outcome: 'flaky',
      status: 'passed',
      firstRunStatus: 'failed',
      retries: 1,
      durationMs: 5100,
    }),
    record({
      id: 't4',
      title: 'MFA challenge is required @auth',
      caseId: '5106',
      outcome: 'skipped',
      status: 'skipped',
      firstRunStatus: 'skipped',
      durationMs: 0,
    }),
    record({
      id: 't5',
      title: 'Orders API rejects an invalid payload',
      caseId: '6001',
      project: 'api',
      kind: 'api',
      durationMs: 220,
    }),
  ];

  return {
    schemaVersion: RUN_RESULT_SCHEMA_VERSION,
    run: {
      id: 'run-fixture-1',
      startedAt: '2026-03-01T22:00:00.000Z',
      finishedAt: '2026-03-01T22:04:10.000Z',
      durationMs: 250_000,
      target: 'demo',
      environment: 'staging',
      branch: 'main',
      commit: 'abc1234',
      buildId: '4821',
      trigger: 'schedule',
      status: 'failed',
      ...overrides,
    },
    totals: tally(tests),
    capabilities: [
      { capability: 'api', enabled: true, note: 'service API tests ran' },
      { capability: 'db', enabled: false, note: 'not applicable for demo: database assertions off' },
    ],
    tests,
  };
}
