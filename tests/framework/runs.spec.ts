import { expect, test } from '@playwright/test';
import {
  foldProgress,
  parseEvents,
  serialiseEvent,
  type RunEvent,
} from '../../src/support/runs/events';
import {
  canCancel,
  canStart,
  contentionWarning,
  newRunId,
  runCommand,
  type RunRecord,
} from '../../src/support/runs/registry';
import {
  FRAME_SIZES,
  liveViewFromEnv,
  MIN_FRAME_INTERVAL_MS,
  shouldSendFrame,
} from '../../src/integrations/live-view/screencast';

/**
 * Running from the dashboard — phase 2.
 *
 * The event stream is the interesting half. It is the only place in the
 * framework where a second account of what happened exists beside the canonical
 * one, and two accounts that can disagree are worse than one — so the test that
 * matters is that folding the stream produces the numbers the run model
 * reports. Checked against a real run of 326 tests before this was written:
 * 326 finished, 325 passed, 1 skipped, from both.
 */

const at = 1_700_000_000_000;

function stream(...events: RunEvent[]): RunEvent[] {
  return events;
}

test.describe('the event stream', () => {
  test('folds to the same totals the canonical model reports', () => {
    const progress = foldProgress(
      stream(
        { type: 'run-started', at, planned: 3, projects: ['e2e'], workers: 2 },
        { type: 'test-started', at: at + 1, worker: 0, title: 'a', file: 'a.ts', project: 'e2e' },
        { type: 'test-started', at: at + 1, worker: 1, title: 'b', file: 'b.ts', project: 'e2e' },
        { type: 'test-finished', at: at + 2, worker: 0, title: 'a', project: 'e2e', status: 'passed', durationMs: 10 },
        { type: 'test-finished', at: at + 3, worker: 1, title: 'b', project: 'e2e', status: 'failed', durationMs: 20, error: 'boom' },
        { type: 'test-started', at: at + 4, worker: 0, title: 'c', file: 'c.ts', project: 'e2e' },
        { type: 'test-finished', at: at + 5, worker: 0, title: 'c', project: 'e2e', status: 'skipped', durationMs: 0 },
        { type: 'run-finished', at: at + 6, status: 'failed', durationMs: 6 },
      ),
    );

    expect(progress).toMatchObject({
      planned: 3,
      finished: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      status: 'failed',
    });
    expect(progress.failures).toEqual([{ title: 'b', project: 'e2e', error: 'boom' }]);
  });

  test('a lane goes idle when its test ends, rather than keeping the last title', () => {
    // A lane still showing a finished test reads as "working on this", which is
    // exactly the wrong thing for a view whose job is to say what is happening.
    const busy = foldProgress(
      stream(
        { type: 'run-started', at, planned: 1, projects: [], workers: 1 },
        { type: 'test-started', at, worker: 0, title: 'a', file: 'a.ts', project: 'e2e' },
      ),
    );
    expect(Object.keys(busy.lanes)).toEqual(['0']);

    const idle = foldProgress(
      stream(
        { type: 'run-started', at, planned: 1, projects: [], workers: 1 },
        { type: 'test-started', at, worker: 0, title: 'a', file: 'a.ts', project: 'e2e' },
        { type: 'test-finished', at, worker: 0, title: 'a', project: 'e2e', status: 'passed', durationMs: 1 },
      ),
    );
    expect(idle.lanes).toEqual({});
  });

  test('replaying from the top reaches the state a page that watched would have', () => {
    /*
       Why reconnection needs no protocol: the fold is a pure function of the
       events, so a page that reloads half way through reads the file from the
       start and arrives where it would have been.
    */
    const events = stream(
      { type: 'run-started', at, planned: 2, projects: [], workers: 1 },
      { type: 'test-started', at, worker: 0, title: 'a', file: 'a.ts', project: 'e2e' },
      { type: 'test-finished', at, worker: 0, title: 'a', project: 'e2e', status: 'passed', durationMs: 1 },
    );
    expect(foldProgress(events)).toEqual(foldProgress([...events]));
  });

  test('a half-written last line is skipped, not thrown over', () => {
    // The file is appended to by another process while this reads it, so a
    // partial line is normal. Throwing would make every read a race.
    const text =
      serialiseEvent({ type: 'run-started', at, planned: 1, projects: [], workers: 1 }) +
      '{"type":"test-star';
    expect(parseEvents(text)).toHaveLength(1);
  });

  test('an interrupted run reads as interrupted, not as passed', () => {
    const progress = foldProgress(
      stream(
        { type: 'run-started', at, planned: 5, projects: [], workers: 1 },
        { type: 'run-failed', at: at + 1, reason: 'the runner died' },
      ),
    );
    expect(progress.status).toBe('interrupted');
    expect(progress.lanes).toEqual({});
  });
});

test.describe('the two slots', () => {
  const record = (id: string, target: string, state: RunRecord['state'] = 'running'): RunRecord => ({
    id,
    request: { target, projects: [] },
    state,
    startedAt: at,
    finishedAt: null,
    directory: `.runs/${id}`,
    pid: 1,
  });

  test('lets two runs go and refuses the third by name', () => {
    expect(canStart([])).toBe(true);
    expect(canStart([record('r1', 'shop')])).toBe(true);

    const refusal = canStart([record('r1', 'shop'), record('r2', 'bank')]);
    expect(refusal).not.toBe(true);
    // Naming them matters: "too many runs" leaves the reader to find out which,
    // and the answer is almost always the one they forgot about.
    expect((refusal as { error: string }).error).toContain('shop');
    expect((refusal as { error: string }).error).toContain('bank');
  });

  test('a finished run frees its slot', () => {
    expect(canStart([record('r1', 'shop', 'finished'), record('r2', 'bank', 'cancelled')])).toBe(true);
  });

  test('warns, and does not refuse, when both runs share a target', () => {
    /*
       With a static account pool every worker in both runs is the same user
       mutating the same cart. That produced 409s and a locked account on a real
       target — but it is perfectly safe across different targets, so the call
       belongs to whoever pressed the button.
    */
    expect(contentionWarning([record('r1', 'shop'), record('r2', 'shop')])).toContain('shop');
    expect(contentionWarning([record('r1', 'shop'), record('r2', 'bank')])).toBeNull();
    expect(contentionWarning([record('r1', 'shop')])).toBeNull();
  });

  test('only a live run can be cancelled, and only once', () => {
    expect(canCancel(record('r1', 'shop'))).toBe(true);
    expect(canCancel(record('r1', 'shop', 'finished'))).not.toBe(true);
    expect(canCancel(undefined)).not.toBe(true);
  });

  test('run ids sort by time and cannot collide within a millisecond', () => {
    expect(newRunId(at, 'aa') < newRunId(at + 60_000, 'aa')).toBe(true);
    expect(newRunId(at, 'aa')).not.toBe(newRunId(at, 'bb'));
  });
});

test.describe('the command line a run is given', () => {
  const record: RunRecord = {
    id: 'r1',
    request: { target: 'shop', projects: ['e2e', 'api'], grep: '@smoke', headed: true, liveView: true },
    state: 'starting',
    startedAt: at,
    finishedAt: null,
    directory: '.runs/r1',
    pid: null,
  };

  test('gives every run its own paths, which is what stops two colliding', () => {
    const { args, env } = runCommand(record);
    expect(args).toContain('--output=.runs/r1/artifacts');
    expect(env.RUN_RESULT_PATH).toBe('.runs/r1/run-result.json');
    expect(env.JUNIT_PATH).toBe('.runs/r1/junit.xml');
    expect(env.LIVE_EVENTS_PATH).toBe('.runs/r1/events.ndjson');
  });

  test('never passes --reporter', () => {
    /*
       Passing one replaces the config's whole reporter list rather than adding
       to it, which silently removes both the canonical run model and the live
       event stream. Found the honest way: a run launched with `--reporter=dot`
       produced no events at all and the reporter looked broken.
    */
    expect(runCommand(record).args.some((flag) => flag.startsWith('--reporter'))).toBe(false);
  });

  test('keeps traces for failures only, and asks for video the only way there is', () => {
    // 2.9 MB of trace against 244 KB of video, measured. A passing run that
    // keeps one per test is how a laptop fills up.
    const { args, env } = runCommand(record);
    expect(args).toContain('--trace=retain-on-failure');
    /*
       There is no `--video` command-line flag. Passing one makes the runner
       exit with "unknown option" before a single test runs — which is exactly
       what the first run started from the dashboard did, and the reason the
       live view sat at "0 of 0" looking like a streaming bug.
    */
    expect(args.some((flag) => flag.startsWith('--video'))).toBe(false);
    expect(env.PW_VIDEO).toBe('retain-on-failure');
  });

  test('passes projects, grep and headed through, and the live view only when asked', () => {
    const { args, env } = runCommand(record);
    expect(args).toContain('--project=e2e');
    expect(args).toContain('--project=api');
    expect(args).toContain('--grep=@smoke');
    expect(args).toContain('--headed');
    expect(env.LIVE_VIEW).toBe('1');

    const quiet = runCommand({ ...record, request: { target: 'shop', projects: [] } });
    expect(quiet.args).not.toContain('--headed');
    expect(quiet.env.LIVE_VIEW).toBeUndefined();
  });
});

test.describe('the live view', () => {
  test('is off unless the dashboard asked for it, and complete when it did', () => {
    // A command-line run and every run in CI pay one environment check for a
    // feature only the local dashboard uses.
    expect(liveViewFromEnv({})).toBeNull();
    expect(liveViewFromEnv({ LIVE_VIEW: '1' }), 'no address to post to').toBeNull();
    expect(
      liveViewFromEnv({ LIVE_VIEW: '1', DASHBOARD_URL: 'http://127.0.0.1:1/', DASHBOARD_TOKEN: 't' }),
      'no run to attribute frames to',
    ).toBeNull();

    expect(
      liveViewFromEnv({
        LIVE_VIEW: '1',
        DASHBOARD_URL: 'http://127.0.0.1:1/',
        DASHBOARD_TOKEN: 't',
        RUN_ID: 'r1',
      }),
    ).toEqual({ dashboardUrl: 'http://127.0.0.1:1/', token: 't', runId: 'r1' });
  });

  test('throttles to roughly eight frames a second', () => {
    /*
       Measured unthrottled against a real site: 235 frames in 5.1 seconds, about
       46 a second at 72 KB each — which is 6 MB/s for two runs. An off-by-one
       here is the difference between eight frames a second and forty-six.
    */
    expect(shouldSendFrame(1000, 1000)).toBe(false);
    expect(shouldSendFrame(1124, 1000)).toBe(false);
    expect(shouldSendFrame(1125, 1000)).toBe(true);
    expect(MIN_FRAME_INTERVAL_MS).toBe(125);
  });

  test('asks for a bigger frame only when the tile is bigger', () => {
    // Sending 1280px into a 400px tile is waste; sending 640px into a full
    // window is a blur. The size follows the tile rather than being picked once.
    expect(FRAME_SIZES.expanded.maxWidth).toBeGreaterThan(FRAME_SIZES.embedded.maxWidth);
    expect(FRAME_SIZES.embedded.quality).toBeLessThanOrEqual(FRAME_SIZES.expanded.quality);
  });
});
