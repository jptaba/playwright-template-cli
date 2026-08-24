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
 */
export const signIn = {
  /**
   * Submit the sign-in form. Deliberately does not assert the outcome, so a
   * spec about a rejected credential can use the same verb.
   */
  async withCredentials(page: Page, credentials: Credentials): Promise<void> {
    await test.step(`Sign in as ${credentials.username}`, async () => {
      await page.goto('/auth/login');
      await signInLocators.username(page).fill(credentials.username);
      await signInLocators.password(page).fill(credentials.password);
      await signInLocators.submit(page).click();
    });
  },

  /**
   * Whether the page currently carries a session.
   *
   * `isVisible()` does not wait, which is right here and wrong everywhere
   * else: this is asked *after* signing out as well, and a call that waited
   * would sit for fifteen seconds every time the honest answer is "no".
   */
  async isSignedIn(page: Page): Promise<boolean> {
    return signInLocators.signedInMarker(page).isVisible();
  },

  /** The error the form reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = signInLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },

  /** End the session. The menu has to be opened before its items exist. */
  async signOut(page: Page): Promise<void> {
    await test.step('Sign out', async () => {
      await signInLocators.signedInMarker(page).click();
      await signInLocators.signOut(page).click();
      // The fact, not the network: the sign-in link returning is what "signed
      // out" means, and it is what the next spec depends on.
      await signInLocators.signInLink(page).waitFor({ state: 'visible' });
    });
  },
};
