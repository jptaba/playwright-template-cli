/**
 * Whether to open a browser at the dashboard — item 79.
 *
 * `main()` ended with an unconditional `open(url)` for as long as it existed,
 * which is right for the person who typed `npm run dashboard` and wrong for
 * every other caller: a scheduled run, a headless check, the improvement loop.
 * Run 96 measured what that costs. Sixty orphaned servers had each spawned a
 * browser tab, and those tabs were still holding connections — which is why
 * the idle watchdog written in the same run correctly declined to reap them.
 * The window nobody asked for was keeping alive the server nobody wanted.
 *
 * **The default is a fact, not a flag.** A terminal attached to stdout is what
 * separates "a person is running this" from "something is running this", and
 * it needs nobody to remember an environment variable — which is the whole
 * problem with the alternative, since the callers that most need this are the
 * automated ones that nobody is watching.
 *
 * A pure function of the two inputs so the decision is testable, with the
 * `spawn` left where the side effect belongs.
 */

export interface OpenChoice {
  open: boolean;
  /**
   * Why the browser is not opening, when nobody asked for that explicitly.
   *
   * Null when it is opening, and null when somebody set the variable — they
   * asked, so saying it back is noise. It is only worth a line when the tool
   * decided, because that is the case where somebody expected a window and
   * did not get one.
   */
  explain: string | null;
}

/** Values that mean "no" to a person typing one. */
const NO = /^(0|false|no|off)$/i;

export function shouldOpenBrowser(
  env: Record<string, string | undefined>,
  isTTY: boolean | undefined,
): OpenChoice {
  const asked = env.DASHBOARD_OPEN;
  if (asked !== undefined && asked.trim() !== '') {
    return { open: !NO.test(asked.trim()), explain: null };
  }

  if (isTTY) return { open: true, explain: null };

  return {
    open: false,
    explain: 'No terminal attached, so no browser was opened. DASHBOARD_OPEN=1 to open one.',
  };
}
