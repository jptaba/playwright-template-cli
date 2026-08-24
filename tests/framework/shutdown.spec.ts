import { expect, test } from '@playwright/test';
import { idleWatcher, shutdownHandler } from '../../src/support/ui/shutdown';

/**
 * Stopping the dashboard without leaving its browsers behind.
 *
 * The property is unglamorous and was got wrong twice in the same afternoon,
 * from opposite ends: once by launching a headed browser and not storing the
 * handle, so nothing could close it — and once by *writing the fix* as
 * `void close(); process.exit(0)`, which starts a promise and then leaves
 * before it settles. The second is worse, because it looks like a fix.
 */

/** A close that never finishes, for the deadline tests. */
const never = () => new Promise<never>(() => {});

test('everything is closed before the process leaves', async () => {
  const order: string[] = [];
  let resolveClose: () => void = () => {};

  const shutdown = shutdownHandler({
    stopSync: () => order.push('runs cancelled'),
    closeAsync: () =>
      new Promise<void>((resolve) => {
        order.push('closing the browser');
        resolveClose = resolve;
      }),
    exit: () => order.push('exit'),
  });

  shutdown();
  expect(order, 'exit has not happened yet').toEqual(['runs cancelled', 'closing the browser']);

  resolveClose();
  await expect.poll(() => order).toEqual(['runs cancelled', 'closing the browser', 'exit']);
});

test('a close that hangs does not stop Ctrl-C meaning Ctrl-C', async () => {
  // A browser that has already died can hang on close.
  let waited = 0;
  let exited = false;

  shutdownHandler({
    closeAsync: never,
    exit: () => (exited = true),
    graceMs: 3_000,
    wait: async (ms) => {
      waited = ms;
    },
  })();

  await expect.poll(() => exited).toBe(true);
  expect(waited, 'it waited the grace period, not forever').toBe(3_000);
});

test('a close that throws still lets the process leave', async () => {
  let exited = false;
  shutdownHandler({
    closeAsync: async () => {
      throw new Error('Target page, context or browser has been closed');
    },
    exit: () => (exited = true),
  })();

  await expect.poll(() => exited).toBe(true);
});

test('a second Ctrl-C does not start a second teardown', async () => {
  /*
     Pressing it twice is what people do when the first press looks like it did
     nothing. Closing twice throws, and exiting twice from underneath the first
     teardown is how the browser gets orphaned after all.
  */
  let closes = 0;
  let exits = 0;
  let resolveClose: () => void = () => {};

  const shutdown = shutdownHandler({
    closeAsync: () =>
      new Promise<void>((resolve) => {
        closes += 1;
        resolveClose = resolve;
      }),
    exit: () => (exits += 1),
  });

  shutdown();
  shutdown();
  shutdown();
  expect(closes).toBe(1);

  resolveClose();
  await expect.poll(() => exits).toBe(1);
});

test('the synchronous half runs first, and only once', () => {
  // Cancelling runs has to happen before anything is awaited: a run that
  // starts a browser while we are closing browsers is a race with no winner.
  let cancels = 0;
  const shutdown = shutdownHandler({
    stopSync: () => (cancels += 1),
    closeAsync: never,
    exit: () => undefined,
    wait: never,
  });

  shutdown();
  shutdown();
  expect(cancels).toBe(1);
});

test('nothing to close is not a special case', async () => {
  let exited = false;
  shutdownHandler({ closeAsync: async () => undefined, exit: () => (exited = true) })();
  await expect.poll(() => exited).toBe(true);
});

// ---------------------------------------------------------------------------
// Leaving when nobody is here — item 78
// ---------------------------------------------------------------------------

/**
 * The dashboard binds port 0, so every invocation is a new server that knows
 * nothing of the others, and `SIGINT`/`SIGTERM` do not fire when whatever
 * launched a backgrounded one simply goes away. Measured before this existed:
 * 60 live dashboards holding 5.4 GB, the oldest six hours old, serving nobody.
 *
 * The deadline is driven by a fake clock rather than waited out — the same
 * reason the handler above injects `wait`.
 */
const anIdleWatcher = (over: Partial<Parameters<typeof idleWatcher>[0]> = {}) => {
  const state = { clock: 0, idled: 0, sockets: 0, running: false };
  const watcher = idleWatcher({
    idleMs: 1_000,
    now: () => state.clock,
    connections: async () => state.sockets,
    busy: () => state.running,
    onIdle: () => (state.idled += 1),
    ...over,
  });
  return { ...watcher, state };
};

test('a server nobody has touched gives the machine back', async () => {
  const idle = anIdleWatcher();

  idle.state.clock = 999;
  await idle.check();
  expect(idle.state.idled, 'not yet — the deadline has not passed').toBe(0);

  idle.state.clock = 1_000;
  await idle.check();
  expect(idle.state.idled).toBe(1);
});

test('an open socket is somebody, even with no request for an hour', async () => {
  /*
     The Runs page holds an EventSource open, so a page watching a run makes no
     new request for minutes while being very much in use. A watchdog counting
     requests alone would close the server underneath it.
  */
  const idle = anIdleWatcher();
  idle.state.sockets = 1;
  idle.state.clock = 10_000;

  await idle.check();
  expect(idle.state.idled).toBe(0);

  idle.state.sockets = 0;
  await idle.check();
  expect(idle.state.idled, 'and it leaves once the last page closes').toBe(1);
});

test('a run in flight is never cancelled because nobody was watching it', async () => {
  // Start a run, close the tab: no socket and no request, but a browser is
  // driving a suite — and the teardown this triggers cancels runs.
  const idle = anIdleWatcher();
  idle.state.running = true;
  idle.state.clock = 10_000;

  await idle.check();
  expect(idle.state.idled).toBe(0);

  // And the deadline restarts from the end of the run, rather than the server
  // leaving the instant the last one finishes.
  idle.state.running = false;
  await idle.check();
  expect(idle.state.idled).toBe(0);

  idle.state.clock = 11_000;
  await idle.check();
  expect(idle.state.idled).toBe(1);
});

test('a request puts the deadline back', async () => {
  const idle = anIdleWatcher();

  idle.state.clock = 900;
  idle.touch();
  idle.state.clock = 1_800;
  await idle.check();

  expect(idle.state.idled, 'touched at 900, so the deadline is 1900').toBe(0);
});

test('it leaves once, however often it is checked afterwards', async () => {
  // The teardown calls process.exit; a second one racing it is the shape
  // `shutdownHandler` guards against, and this must not hand it the chance.
  const idle = anIdleWatcher();
  idle.state.clock = 10_000;

  await idle.check();
  await idle.check();
  await idle.check();

  expect(idle.state.idled).toBe(1);
});
