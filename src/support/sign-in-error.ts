import type { Locator, Page } from '@playwright/test';

/**
 * What the application said when a sign-in failed.
 *
 * **Why this is framework code and not a locator in each pack.** The
 * scaffolder writes one guess — `getByRole('alert')` — and a guess is exactly
 * what it sounds like: an application whose error banner carries no `role`
 * attribute matches nothing, `readError` returns null, and the run reports
 * *"the form reported no error, so the credential was accepted but no session
 * marker appeared — check the signed-in locator rather than the credential"*.
 *
 * Every clause of that can be false at once, and was: the application was
 * displaying *"Account locked, too many failed attempts. Please contact the
 * administrator."* while the suite said it had reported nothing. Three runs of
 * the improvement loop went looking at worker partitioning and locators.
 *
 * So the target's own locator stays the **preferred** answer — it is the
 * precise one — and this is the floor beneath it: if the named locator finds
 * nothing, read what is actually on the screen rather than claiming silence.
 * A diagnostic that is emptier than the page is worse than no diagnostic,
 * because it sends the reader somewhere else.
 *
 * The pure half is separated from the browser half on purpose, like the
 * accessibility scanner: what counts as an error message is a decision worth
 * testing without a browser.
 */

/**
 * Where applications put sign-in errors, in rough order of confidence.
 *
 * Roles and ARIA first because they are what a screen reader is told, then the
 * class and attribute conventions that every CSS framework of the last decade
 * has settled on. This is a *fallback*, so breadth beats precision — it runs
 * only when the target's own locator already found nothing, and returning the
 * wrong sentence from the page is still more use than returning silence.
 */
export const ERROR_CANDIDATE_SELECTORS = [
  '[role="alert"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  '[data-test*="error" i]',
  '[data-testid*="error" i]',
  '[class*="alert-danger" i]',
  '[class*="alert-error" i]',
  '[class*="error" i]',
  '[class*="invalid-feedback" i]',
];

/**
 * The longest a message may be before it stops being one.
 *
 * A selector like `[class*="error"]` happily matches a whole form wrapper, and
 * returning three hundred words of page furniture as "what the application
 * said" is its own kind of lie.
 */
const MAX_MESSAGE = 300;

/**
 * Pick the message a person should be shown, out of everything that matched.
 *
 * Deliberately conservative about what counts. An empty string is not a
 * message; neither is a single character, nor a wall of text that is plainly a
 * container rather than a sentence. Duplicates are collapsed because nested
 * matches are the norm — `div.alert > div.help-block` returns the same words
 * twice, and reporting them twice reads like two separate problems.
 */
export function chooseErrorText(candidates: readonly string[]): string | null {
  const seen = new Set<string>();
  const usable: string[] = [];

  for (const raw of candidates) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > MAX_MESSAGE) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    usable.push(text);
  }

  if (usable.length === 0) return null;
  /*
     The shortest wins, and that is not arbitrary. Nested error markup means
     the outer match is the inner message plus its surroundings, so the
     shortest candidate is the one closest to the sentence the application
     actually wrote.
  */
  return usable.reduce((best, text) => (text.length < best.length ? text : best));
}

/**
 * Read the sign-in error: the target's named locator first, the page second.
 *
 * `preferred` is the pack's own `signInLocators.error`. It is tried first and
 * trusted when it resolves, so a target that named its banner precisely keeps
 * the precise answer and pays nothing for this.
 */
export async function readVisibleError(
  page: Page,
  preferred?: Locator,
): Promise<string | null> {
  if (preferred) {
    try {
      // `first()` because a named locator can still match more than one node,
      // and a strict-mode violation here would replace a diagnostic with an
      // exception — turning a bad message into a worse failure.
      const named = preferred.first();
      if (await named.isVisible()) {
        const text = (await named.textContent())?.trim();
        if (text) return text;
      }
    } catch {
      // A locator that throws is exactly the case this fallback exists for.
    }
  }

  try {
    const found = await page.evaluate((selectors: string[]) => {
      const texts: string[] = [];
      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const element = node as HTMLElement;
          // Visible in the sense that matters: it occupies space on screen.
          if (!element.offsetParent && element.offsetHeight === 0) continue;
          const text = element.innerText ?? element.textContent ?? '';
          if (text.trim()) texts.push(text);
        }
      }
      return texts;
    }, ERROR_CANDIDATE_SELECTORS);
    return chooseErrorText(found);
  } catch {
    // A page that has navigated or closed underneath us has no message to
    // give, and failing here would mask the failure being diagnosed.
    return null;
  }
}
