import { test, type Page } from '@playwright/test';
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
      await page.goto('/');
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

  /**
   * Who the session belongs to, or null when signed out.
   *
   * Reads the welcome line rather than the marker: the marker is a link
   * reading "Log Out", so the scaffold's version returned the words "Log Out"
   * as the signed-in user's name for every target it was generated into.
   */
  async signedInAs(page: Page): Promise<string | null> {
    const welcome = signInLocators.welcome(page);
    if (!(await welcome.isVisible())) return null;
    return (await welcome.textContent())?.trim().replace(/^Welcome\s+/, '') ?? null;
  },

  /** End the session, so a spec about signing out can be written. */
  async signOut(page: Page): Promise<void> {
    await test.step('Sign out', async () => {
      await signInLocators.signedInMarker(page).click();
      await signInLocators.submit(page).waitFor({ state: 'visible' });
    });
  },

  /** The error the form reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = signInLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },
};
