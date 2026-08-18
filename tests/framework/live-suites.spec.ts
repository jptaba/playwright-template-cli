import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import {
  formatLiveReport,
  liveExitCode,
  liveRunNotRun,
  summariseLiveRun,
} from '../../src/support/live-suites';
import { tally, type RunResult, type TestRecord } from '../../src/support/reporters/run-result';

/**
 * Running the live suites, and saying what happened — backlog item 29.
 *
 * The command exists because `npm run verify` runs the framework's own two
 * projects and not one spec against a real application, so the improvement
 * loop recorded 39 green verifies while the specs the repository exists to run
 * went unexecuted. Everything asserted here is pure: a run model in, a summary
 * out, no browser and no network — which is what lets the reporting be tested
 * at all, given the thing it reports on needs three public demos to be up.
 */

function failing(id: string, message: string, overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id,
    title: `Test ${id}`,
    caseId: `TC-${id}`,
    jiraKey: null,
    caseHash: null,
    file: 'src/targets/demo/tests/e2e/x.spec.ts',
    project: 'e2e',
    kind: 'ui',
    tags: [],
    outcome: 'unexpected',
    status: 'failed',
    firstRunStatus: 'failed',
    retries: 0,
    durationMs: 1000,
    workerIndex: 0,
    error: { message, stack: null, snippet: null },
    steps: [],
    attachments: [],
    annotations: [],
    ...overrides,
  };
}

function runWith(tests: TestRecord[]): RunResult {
  const run = fixtureRun();
  run.tests = tests;
  run.totals = tally(tests);
  return run;
}

function passing(id: string): TestRecord {
  return failing(id, '', { outcome: 'expected', status: 'passed', firstRunStatus: 'passed', error: null });
}

test.describe('summarising one application’s live run', () => {
  test('a run with nothing unexpected is a pass, carrying its totals', () => {
    const result = summariseLiveRun('shop', runWith([passing('a'), passing('b')]));

    expect(result.status).toBe('passed');
    expect(result.totals.passed).toBe(2);
    expect(result.failures).toEqual([]);
  });

  test('a failure carries the triage category a rule settled it as', () => {
    /*
       The reason this reuses the triage rules rather than reporting a bare
       count: a suite failing because the demo is unreachable and one failing
       because a locator drifted need different reactions, and the taxonomy
       already draws that line. Inventing a second vocabulary here would give
       the two something to disagree about.
    */
    const result = summariseLiveRun(
      'shop',
      runWith([failing('a', 'connect ECONNREFUSED 10.0.0.5:443')]),
    );

    expect(result.status).toBe('failed');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.category).toBe('network-infrastructure');
    expect(result.failures[0]?.rule).toBe('transport-failure');
  });

  test('a failure no rule matches is reported as needing judgement, not guessed at', () => {
    // A rule inventing a category for a judgement call is the defect
    // `triage:measure` exists to catch, so `null` here is the right answer.
    const result = summariseLiveRun(
      'shop',
      runWith([failing('a', 'Expected 3 lines in the cart, received 2')]),
    );

    expect(result.failures[0]?.category).toBeNull();
    expect(formatLiveReport([result]).join('\n')).toContain('no rule matched');
  });

  test('the case id and the project reach the report, so a failure can be looked up', () => {
    const result = summariseLiveRun(
      'shop',
      runWith([failing('a', 'boom', { caseId: 'TOOL-3-01', project: 'a11y' })]),
    );
    const report = formatLiveReport([result]).join('\n');

    expect(report).toContain('TOOL-3-01');
    expect(report).toContain('[a11y]');
  });

  test('flaky and skipped are reported rather than folded into passed', () => {
    // "A suite that is green only after retries is not green" — the run model
    // records the distinction and this must not throw it away.
    const tests = [
      passing('a'),
      failing('b', 'first attempt failed', { outcome: 'flaky', status: 'passed', retries: 1 }),
      failing('c', '', { outcome: 'skipped', status: 'skipped', error: null }),
    ];
    const report = formatLiveReport([summariseLiveRun('shop', runWith(tests))]).join('\n');

    expect(report).toContain('1 flaky');
    expect(report).toContain('1 skipped');
  });
});

test.describe('what the command exits with', () => {
  const passed = summariseLiveRun('shop', runWith([passing('a')]));
  const failed = summariseLiveRun('shop', runWith([failing('a', 'boom')]));

  test('every application passing is a zero', () => {
    expect(liveExitCode([passed, passed])).toBe(0);
  });

  test('any failure is a one, whatever its category', () => {
    /*
       The alternative considered and rejected: forgive a failure a rule
       blamed on the deployment. A rule is a heuristic over error text, an
       outage is itself worth knowing about, and a command that goes green on
       "the application was down" cannot answer "are the suites passing".
    */
    const outage = summariseLiveRun('shop', runWith([failing('a', 'connect ECONNREFUSED 10.0.0.5:443')]));
    expect(outage.failures[0]?.category).toBe('network-infrastructure');
    expect(liveExitCode([passed, outage])).toBe(1);
    expect(liveExitCode([passed, failed])).toBe(1);
  });

  test('a suite that could not run at all is a two, not a one', () => {
    // Nothing was measured, which is a different thing from something
    // failing — reporting it as red would hide a broken command.
    expect(liveExitCode([passed, liveRunNotRun('shop', 'no run model was written')])).toBe(2);
  });

  test('nothing to run is a two as well, never a green', () => {
    expect(liveExitCode([])).toBe(2);
  });
});

test('the report says how many applications are passing, not only how many tests', () => {
  const lines = formatLiveReport([
    summariseLiveRun('one', runWith([passing('a')])),
    summariseLiveRun('two', runWith([failing('b', 'boom')])),
    liveRunNotRun('three', 'no run model was written'),
  ]);

  expect(lines.join('\n')).toContain('1 application(s) passing · 1 failing · 1 could not be run');
  // The reason a suite did not run is shown where its counts would be, rather
  // than left as a bare zero that reads like an empty pass.
  expect(lines.join('\n')).toContain('no run model was written');
});
