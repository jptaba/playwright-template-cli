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
