import { test, type Page } from '@playwright/test';
import { loginLocators } from '../locators/login';
import { navLocators } from '../locators/nav';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * L2 — business verbs. Composes L1, returns data, asserts nothing except its
 * own invariants (§03).
 *
 * Step titles are the report's narrative, so they are named for intent, not
 * mechanics — "Sign in as the shopper", never "click #login-button" (§18).
 * `step-naming` fails the build on the second kind.
 */
export const auth = {
  /**
   * Submit the sign-in form. Does not assert the outcome: a spec about a
   * locked-out account needs this to return normally so it can assert the
   * error itself.
   */
  async signIn(page: Page, credentials: Credentials): Promise<void> {
    await test.step(`Sign in as ${credentials.username}`, async () => {
      await page.goto('/');
      await loginLocators.username(page).fill(credentials.username);
      await loginLocators.password(page).fill(credentials.password);
      await loginLocators.submit(page).click();
    });
  },

  /**
   * Whether the current page is inside the signed-in area. Returns data rather
   * than asserting, so a spec can use it either way — and so `auth.setup.ts`
   * can confirm a session without importing L1 (§03).
   */
  async isSignedIn(page: Page): Promise<boolean> {
    return (await navLocators.cartLink(page).count()) > 0;
  },

  /** The heading of the current signed-in page, e.g. "Products". */
  async currentSectionTitle(page: Page): Promise<string> {
    return (await navLocators.pageTitle(page).textContent())?.trim() ?? '';
  },

  /** The sign-in error banner text, or null when the form reported no error. */
  async readSignInError(page: Page): Promise<string | null> {
    const banner = loginLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },

  /** Sign out through the burger menu, ending the session. */
  async signOut(page: Page): Promise<void> {
    await test.step('Sign out', async () => {
      await navLocators.openMenu(page).click();
      await navLocators.logout(page).click();
    });
  },

  /**
   * Discard cart and sort state through the application's own menu action.
   * Used instead of clearing localStorage directly: state cleared behind the
   * application's back produces failures that surface three tests later and
   * look like something else entirely (§05).
   */
  async resetApplicationState(page: Page): Promise<void> {
    await test.step('Reset the application state', async () => {
      await navLocators.openMenu(page).click();
      await navLocators.resetAppState(page).click();
      await navLocators.closeMenu(page).click();
    });
  },
};
