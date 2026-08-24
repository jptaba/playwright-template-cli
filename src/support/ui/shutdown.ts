/**
 * Stopping the dashboard without leaving its browsers behind — §08.
 *
 * The dashboard starts real browsers: a headless one per probe, and a **headed**
 * one for an assisted sign-in that stays open while somebody reads a code off
 * their phone. Nothing else on the machine knows those exist. If the process
 * goes without closing them, they are windows nobody can explain and, on
 * Windows, desktop heap nobody gets back — which is the 0xC0000142 that kills
 * the next launch.
 *
 * This is its own file because the mistake it exists to stop is a one-liner:
 *
 *     void closeEverything();   // starts a promise
 *     process.exit(0);          // …and never lets it finish
 *
 * `process.exit` is synchronous. A promise begun on the line above it does not
 * settle, the browser is not closed, and nothing anywhere reports a problem.
 * Written like that, the fix for the orphaned window *was itself* an orphaned
 * window.
 */

export interface ShutdownOptions {
  /** Synchronous teardown — cancelling runs, and anything else in memory. */
  stopSync?: () => void;
  /** Everything that has to be awaited. Failures are ignored deliberately. */
  closeAsync: () => Promise<unknown>;
  /** Called once everything is closed, or once the deadline passes. */
  exit: (code: number) => void;
  /**
   * How long to wait for `closeAsync` before leaving anyway.
   *
   * Bounded because a browser that has already died can hang on close, and
   * Ctrl-C has to keep meaning Ctrl-C. Injectable so a test does not sit
   * through it.
   */
  graceMs?: number;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Build the signal handler.
 *
 * Returns a function, and it is safe to call more than once: a second Ctrl-C
 * while the first is still closing must not start a second teardown, and must
 * not exit underneath the first one.
 */
export interface IdleOptions {
  /** Nothing happening for this long, and the server gives the machine back. */
  idleMs: number;
  /**
   * Sockets open right now.
   *
   * Load-bearing, and the reason "no requests lately" is not the test on its
   * own: the Runs page holds an `EventSource` open, so a page watching a run
   * makes no new requests for minutes at a time while being very much in use.
   * A watchdog counting requests would shut the server down underneath it.
   */
  connections: () => Promise<number>;
  /**
   * True while a run is in flight.
   *
   * The other way to get this wrong. Start a run, close the tab, and there is
   * no connection and no request — but there is a browser driving a suite, and
   * the teardown below cancels runs. Nobody watching is not the same as
   * nothing happening.
   */
  busy: () => boolean;
  /** What to do about it — the same teardown Ctrl-C runs. */
  onIdle: () => void;
  /** Injected so a test does not sit through the deadline. */
  now?: () => number;
}

/**
 * Give the machine back when nobody is using this — item 78.
 *
 * The dashboard binds port 0, so every invocation is a *new* server and none
 * of them knows about the others. Nothing reaps them: `shutdownHandler` covers
 * `SIGINT` and `SIGTERM`, which is Ctrl-C and an explicit kill, and neither is
 * what happens when the thing that launched a backgrounded server simply goes
 * away. On Windows no signal is delivered at all, so the server runs forever.
 *
 * Measured on this machine before this existed: **60 live dashboards holding
 * 5.4 GB**, the oldest six hours old, every one of them serving nobody.
 *
 * Exposed as `check` rather than run off a timer internally so the deadline is
 * testable without waiting for it — the same reason `shutdownHandler` injects
 * `wait`.
 */
export function idleWatcher(options: IdleOptions): {
  touch: () => void;
  check: () => Promise<void>;
} {
  const now = options.now ?? (() => Date.now());
  let last = now();
  let fired = false;

  return {
    touch: () => {
      last = now();
    },
    check: async () => {
      if (fired) return;
      if (options.busy()) {
        /* A run in flight is activity, and it is also what would be destroyed.
           Touching here means the deadline starts from when the run ends. */
        last = now();
        return;
      }
      if (now() - last < options.idleMs) return;
      if ((await options.connections()) > 0) return;

      fired = true;
      options.onIdle();
    },
  };
}

export function shutdownHandler(options: ShutdownOptions): () => void {
  const graceMs = options.graceMs ?? 3_000;
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let started = false;

  return function shutdown(): void {
    if (started) return;
    started = true;

    options.stopSync?.();

    void Promise.race([
      options.closeAsync().catch(() => undefined),
      wait(graceMs),
    ]).then(() => options.exit(0));
  };
}
