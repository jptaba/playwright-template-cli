import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import {
  formatLiveReport,
  liveExitCode,
  liveRunNotRun,
  liveRunParked,
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

test.describe('a failure a spec declared in advance', () => {
  /*
     Item 59. `test.fail()` inverts the whole test, so a spec marked for a
     defect the application genuinely has is reported as *passing* whenever it
     fails for some other reason — which on an application with known defects
     is the normal case rather than a corner one. ParaBank did exactly that:
     two markers, green through a run where neither spec reached a transfer
     form, because the bank was answering HTTP 500 two pages earlier.
  */
  const declaring = (id: string, message: string, expected: string, overrides = {}) =>
    failing(id, message, {
      annotations: [{ type: 'known-failure', description: expected }],
      ...overrides,
    });

  test('still failing for the reason it declared is not a red suite', () => {
    const result = summariseLiveRun(
      'bank',
      runWith([
        passing('a'),
        declaring('b', 'a bank accepted a negative transfer: Transfer Complete!', 'accepted a negative transfer'),
      ]),
    );

    expect(result.status).toBe('passed');
    expect(result.failures).toEqual([]);
    expect(result.totals.expectedFailures).toBe(1);
    // Moved across rather than added, so the columns still sum to the total.
    expect(result.totals.passed + result.totals.failed).toBe(result.totals.total);
  });

  test('failing for something else stays an ordinary failure', () => {
    // The whole defect item 59 names: a marker that cannot tell "the defect is
    // still there" from "this stopped testing anything".
    const result = summariseLiveRun(
      'bank',
      runWith([
        declaring('b', 'connect ECONNREFUSED 10.0.0.5:443', 'accepted a negative transfer'),
      ]),
    );

    expect(result.status).toBe('failed');
    expect(result.failures).toHaveLength(1);
    expect(result.totals.expectedFailures).toBe(0);
    expect(formatLiveReport([result]).join('\n')).toContain('failing for something else');
  });

  test('passing says the marker can go, and fails nothing', () => {
    /*
       The opposite of a ground-truth spec that passed, which really is a
       broken fixture. A known-failure spec passing is the defect being fixed.
    */
    const passed = declaring('b', '', 'accepted a negative transfer', {
      outcome: 'expected',
      status: 'passed',
      firstRunStatus: 'passed',
      error: null,
    });
    const result = summariseLiveRun('bank', runWith([passed]));

    expect(result.status).toBe('passed');
    expect(formatLiveReport([result]).join('\n')).toContain('remove the known-failure marker');
  });

  test('a confirmed one is still named in the report, never quietly folded away', () => {
    // A suite that accumulates known failures must not read as perfectly green
    // — the same claim `expectedFailures` already makes about `test.fail()`.
    const result = summariseLiveRun(
      'bank',
      runWith([declaring('b', 'a bank accepted a negative transfer', 'accepted a negative transfer')]),
    );
    const report = formatLiveReport([result]).join('\n');

    expect(report).toContain('known failure');
    expect(report).toContain('still failing as declared');
  });

  test('a declaration with nothing in it is reported, not skipped', () => {
    // A blank marker confirms nothing and would otherwise read as an absent
    // one — a typo silently disabling the check it was meant to add.
    const result = summariseLiveRun('bank', runWith([declaring('b', 'boom', '   ')]));

    expect(result.malformedKnownFailures).toHaveLength(1);
    expect(result.status).toBe('failed');
    expect(formatLiveReport([result]).join('\n')).toContain('declares nothing to match');
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

test('a failure a rule recognised but could not explain says what it found', () => {
  /*
     parabank's sign-in, live: `sign-in-setup-failed` matches the cluster and
     names no cause, because a locked account, a rotated credential and a
     stale marker all look identical here. The line used to read "no rule
     matched", which was untrue and threw away the one useful sentence.
  */
  const lines = formatLiveReport([
    {
      target: 'demo',
      status: 'failed',
      reason: null,
      totals: { total: 3, passed: 0, failed: 1, flaky: 0, skipped: 2, expectedFailures: 0 },
      knownFailures: [],
      malformedKnownFailures: [],
      failures: [
        {
          title: 'Establish a session for each role',
          caseId: null,
          project: 'setup:auth',
          category: null,
          rule: 'sign-in-setup-failed',
          unnamedCause: "Sign-in for role 'customer' established no session — the run had no identity",
        },
      ],
    },
  ]).join('\n');

  expect(lines).toContain('needs judgement');
  expect(lines).toContain("role 'customer'");
  expect(lines).not.toContain('no rule matched');
});

test.describe('an application somebody has parked', () => {
  /*
     ParaBank answered HTTP 500 on its own login and accounts pages twice in
     one day. Nothing in this repository can fix that, and five red specs
     nobody can act on cost the signal on the four applications that pass — so
     the profile says not to run it, with a reason and a review date.
  */
  const parked = liveRunParked('parabank', 'the application answers HTTP 500');
  const passed = summariseLiveRun('shop', runWith([passing('a')]));
  const failed = summariseLiveRun('shop', runWith([failing('a', 'boom')]));

  test('is a zero, because not running it is the decision rather than a fault', () => {
    expect(liveExitCode([passed, parked])).toBe(0);
  });

  test('everything parked is a two, not a green board', () => {
    /*
       The trap parking sets, and the reason this is not simply "parked never
       fails". A command that reported success having run nothing at all is the
       silent zero this model refuses everywhere else.
    */
    expect(liveExitCode([parked])).toBe(2);
    expect(liveExitCode([parked, liveRunParked('other', 'also down')])).toBe(2);
  });

  test('does not hide a real failure beside it', () => {
    expect(liveExitCode([parked, failed])).toBe(1);
  });

  test('says so, with the reason, rather than being quietly dropped', () => {
    const report = formatLiveReport([passed, parked]).join('\n');

    expect(report).toContain('parked');
    expect(report).toContain('the application answers HTTP 500');
    // Named in the total too: a parked application is coverage nobody is
    // getting, and a summary that omitted it would read as though everything
    // onboarded had been tested.
    expect(report).toContain('1 parked');
  });

  test('is not reported the same way as a suite that could not be run', () => {
    // One is a decision and the other is something going wrong. Reporting them
    // alike would let a broken command hide inside a deliberate pause.
    const both = formatLiveReport([parked, liveRunNotRun('x', 'no run model was written')]).join(
      '\n',
    );

    expect(both).toContain('could not be run');
    expect(liveExitCode([parked, liveRunNotRun('x', 'no run model was written')])).toBe(2);
  });
});
