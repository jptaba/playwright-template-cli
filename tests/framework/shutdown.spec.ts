import { expect, test } from '@playwright/test';
import { shutdownHandler } from '../../src/support/ui/shutdown';

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
