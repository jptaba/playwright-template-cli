/**
 * Low-level failures, said in a sentence somebody can act on — §08.
 *
 * The dashboard drives real browsers and real services, so it meets real
 * failures. Left alone, those arrive as whatever the layer beneath produced:
 * Playwright's browser-launch failure is roughly four thousand characters of
 * Chromium command line, and what a person needs from it is two facts and one
 * instruction.
 *
 * The original is never thrown away — it is summarised and its useful part
 * kept — because the operator is not always the person who will debug it.
 */

/** `0xC0000142` — a Windows process that died before it finished starting. */
const DLL_INIT_FAILED = 3221225794;

/**
 * Whether a launch failure is the kind that usually works on the next try.
 *
 * `0xC0000142` is a process that reached DLL initialisation and could not
 * finish it. On Windows that is nearly always the interactive window station's
 * desktop heap being momentarily full — a shared, fixed-size resource that
 * every process with a window consumes a little of. It is a *state of the
 * machine*, not a property of the request, so the same call a second later
 * often just works.
 *
 * A missing executable is the opposite: it will fail identically forever, and
 * retrying only doubles the wait before somebody is told to install it.
 */
export function isTransientLaunchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/Executable doesn't exist|Please run the following command/i.test(message)) return false;
  return message.includes(String(DLL_INIT_FAILED)) || message.includes('0xC0000142');
}

/**
 * Launch a browser, and give a transient failure one more chance.
 *
 * One retry, not a loop. If the heap is genuinely exhausted rather than
 * momentarily full, a second attempt establishes that in a second rather than
 * a minute, and the message that comes back says what to do. Retrying five
 * times would turn a clear failure into a hang.
 *
 * @param launch  the thunk that starts the browser
 * @param pause   how long to wait before the second attempt, injectable so a
 *                test does not sit through it
 */
export async function launchBrowser<T>(
  launch: () => Promise<T>,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  try {
    return await launch();
  } catch (error) {
    if (!isTransientLaunchFailure(error)) throw asAdvice(error);
    await pause(750);
    try {
      return await launch();
    } catch (again) {
      throw asAdvice(again);
    }
  }
}

/**
 * Everything between a successful launch and somebody else holding the handle.
 *
 * A browser that has started and has not yet been stored anywhere is
 * unreachable: nothing can close it, and it outlives the request that made it.
 * The assisted sign-in had exactly that gap — launch, then navigate, then
 * assign — so a wrong sign-in path or an unreachable host left a **headed**
 * Chromium running for the life of the dashboard, one per attempt.
 *
 * On Windows that is not untidiness. Every process with a window takes part of
 * the interactive window station's desktop heap, which is fixed and shared,
 * and exhausting it produces the 0xC0000142 that kills the *next* launch. The
 * advice that failure prints — close some browser windows — was true, and was
 * describing windows this tool had orphaned.
 *
 * @param browser  the thing that was just started
 * @param setUp    the work that must succeed before anybody else can close it
 * @param explain  turns a setup failure into a sentence naming what to check
 */
export async function closeOnFailure<B extends { close(): Promise<unknown> }, T>(
  browser: B,
  setUp: (browser: B) => Promise<T>,
  explain: (error: unknown) => string,
): Promise<T> {
  try {
    return await setUp(browser);
  } catch (error) {
    // Swallowed deliberately: the failure worth reporting is the one that got
    // us here, not a second one from closing something already broken.
    await browser.close().catch(() => undefined);
    throw new Error(explain(error));
  }
}

/** The original, replaced by the sentence about it when there is one. */
function asAdvice(error: unknown): Error {
  const advice = describeBrowserLaunchFailure(error);
  return advice ? new Error(advice) : error instanceof Error ? error : new Error(String(error));
}

/**
 * Turn a browser that would not start into something to do about it.
 *
 * @returns advice, or null when the failure is not a launch failure.
 */
export function describeBrowserLaunchFailure(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/browserType\.launch|Executable doesn't exist|Failed to launch/i.test(message)) return null;

  /*
     The first line is the failure. Everything after it is the command line
     Chromium was given, which is the same every time and tells nobody
     anything — and it is what turns a readable error into a wall.
  */
  const firstLine = message.split('\n')[0]!.trim();

  if (/Executable doesn't exist|Please run the following command/i.test(message)) {
    return (
      'The browser is not installed. Run `npx playwright install chromium` and try again.\n\n' +
      firstLine
    );
  }

  if (message.includes(String(DLL_INIT_FAILED)) || message.includes('0xC0000142')) {
    return (
      'The browser started and then died before it finished loading (Windows exit code ' +
      '0xC0000142). That is almost always the machine being out of room for another browser ' +
      'rather than anything to do with this application or what you typed — it comes and goes ' +
      'with how many browser windows are open.\n\n' +
      'Close some browser windows and try again. If it keeps happening, `npx playwright install ' +
      'chromium` repairs a partial install, and a reboot clears the Windows desktop heap this ' +
      'exhausts.\n\n' +
      firstLine
    );
  }

  return (
    'The browser would not start, so nothing was read. This is about this machine rather than ' +
    'about the application. Try again; if it persists, `npx playwright install chromium`.\n\n' +
    firstLine
  );
}
