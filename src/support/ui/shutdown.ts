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
