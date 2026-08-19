import { test, type Page } from '@playwright/test';
import { readVisibleError } from '../../../support/sign-in-error';
import { signInLocators } from '../locators/sign-in';

export interface Credentials {
  username: string;
  password: string;
}


/**
 * L2 — named business verbs.
 *
 *  - Compose L1, return data, assert nothing. An assertion buried in an action
 *    is invisible to whoever reviews the spec.
 *  - Name the step for intent, not mechanics: these titles are the narrative a
 *    product owner reads in the report.
 *  - Derive the application's internal identifiers from the running
 *    application; never transcribe one into the code.
 */
export const signIn = {
  /**
   * Submit the sign-in form. Deliberately does not assert the outcome, so a
   * spec about a rejected credential can use the same verb.
   */
  async withCredentials(page: Page, credentials: Credentials): Promise<void> {
    await test.step(`Sign in as ${credentials.username}`, async () => {
      await page.goto('/web/index.php/auth/login');
      await signInLocators.username(page).fill(credentials.username);
      await signInLocators.password(page).fill(credentials.password);
      await signInLocators.submit(page).click();
    });
  },

  /**
   * Whether the page currently carries a session. Used by auth.setup.ts to
   * fail loudly rather than write a storage state that holds no session.
   */
  async isSignedIn(page: Page): Promise<boolean> {
    return signInLocators.signedInMarker(page).isVisible();
  },

  /** Who the session belongs to, or null when signed out. */
  async signedInAs(page: Page): Promise<string | null> {
    const marker = signInLocators.signedInMarker(page);
    if (!(await marker.isVisible())) return null;
    return (await marker.textContent())?.trim() ?? null;
  },

  /**
   * What the application said when the sign-in failed.
   *
   * The named locator above is tried first and trusted when it resolves. The
   * framework reads the page itself when it does not — because
   * `signInLocators.error` is a *guess* until somebody checks it against the
   * running application, and a guess that matches nothing used to report
   * "the form reported no error" while the screen said "Account locked, too
   * many failed attempts". A diagnostic emptier than the page is worse than
   * none: it sends the reader somewhere else.
   */
  async readError(page: Page): Promise<string | null> {
    return readVisibleError(page, signInLocators.error(page));
  },
};
