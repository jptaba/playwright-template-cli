import type { Page } from '@playwright/test';

/**
 * Wait until the page has stopped changing, before anything reads it.
 *
 * **This exists because the accessibility suite was reporting false passes**,
 * and had been for as long as it has existed. `a11y.scan()` ran axe the
 * instant it was called; on a single-page application the document has
 * `load`ed long before the application has rendered, so axe was inspecting a
 * shell. Measured on OrangeHRM's dashboard, four attempts out of four:
 *
 * | when | what axe found |
 * |---|---|
 * | immediately after `goto` | one waived violation — a green pass |
 * | once the DOM stopped changing | `button-name` ×4, `color-contrast` ×11, `list` ×1, `scrollable-region-focusable` ×1 |
 *
 * Seventeen real violations, four of them critical, on a page the suite had
 * been calling clean. That is the silent zero this repository refuses
 * everywhere else, wearing an accessibility badge — and it is worse than no
 * accessibility suite at all, because a green one is *evidence* to whoever
 * reads the report.
 *
 * **The fact being waited for is "the DOM stopped changing", not a duration
 * and not the network.** `networkidle` is the wrong instrument and the
 * conventions say so: it answered while a removed cart row was still in the
 * table. A `MutationObserver` watches the thing that actually matters to a
 * scanner, which is the tree axe is about to walk.
 *
 * The quiet period is a parameter of that fact rather than a sleep: the wait
 * ends as soon as the tree has been still for `quietMs`, so a static page
 * costs exactly `quietMs` and a slow one costs what it costs. `no-hard-waits`
 * governs specs and actions, where a fixed delay stands in for a condition
 * nobody worked out; this *is* the condition.
 */
export interface SettleOptions {
  /** How long the tree must be still before it counts as settled. */
  quietMs?: number;
  /** Give up after this, and say so rather than pretending. */
  timeoutMs?: number;
}

export const DEFAULT_QUIET_MS = 500;
export const DEFAULT_SETTLE_TIMEOUT_MS = 15_000;

/**
 * The observer, as source rather than as a function.
 *
 * `page.evaluate(fn)` is the obvious form and it does not survive this
 * repository's build: esbuild rewrites named inner functions with a `__name`
 * helper that exists in Node and not in a browser, so the call dies with
 * `ReferenceError: __name is not defined`. A string is evaluated as written.
 *
 * Playwright does not pass arguments to a string form, so the two numbers are
 * interpolated. They are numbers by the time they get here — the signature
 * says so and `Number()` enforces it — which is what keeps this from being an
 * injection into a page we drive.
 */
export function settleSource(quietMs: number, timeoutMs: number): string {
  const quiet = Number(quietMs);
  const limit = Number(timeoutMs);
  return `new Promise((resolve) => {
    var timer, deadline, observer;
    var done = function (ok) {
      observer.disconnect();
      clearTimeout(deadline);
      clearTimeout(timer);
      resolve(ok !== false);
    };
    observer = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(done, ${quiet});
    });
    deadline = setTimeout(function () { done(false); }, ${limit});
    timer = setTimeout(done, ${quiet});
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, characterData: true,
    });
  })`;
}

/**
 * @returns true when the tree went quiet, false when it never did.
 *
 * A page that never settles is not an error: a clock, a carousel or a polling
 * widget will mutate forever, and refusing to scan those would be worse than
 * scanning them late. The answer is carried on the scan as `settled` so a
 * reader knows which kind of result they have.
 */
export async function waitForSettled(page: Page, options: SettleOptions = {}): Promise<boolean> {
  const quiet = options.quietMs ?? DEFAULT_QUIET_MS;
  const limit = options.timeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;
  try {
    return Boolean(await page.evaluate(settleSource(quiet, limit)));
  } catch {
    /*
       A navigation mid-wait destroys the execution context. That is not a
       failure of the scan — the caller is about to look at whatever the page
       became — so report "not settled" and let the scan happen.
    */
    return false;
  }
}
