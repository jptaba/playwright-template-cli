import { test, type Page } from '@playwright/test';
import { navigationLocators } from '../locators/navigation';
import { forgotPasswordLocators, signInLocators } from '../locators/sign-in';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * L2 — signing in and out.
 *
 * Compose L1, return data, assert nothing. `withCredentials` deliberately does
 * not check the outcome, so the spec about a rejected password and the spec
 * about a good one can use the same verb — an action that asserted success
 * would need a second, near-identical action for the negative path, and the
 * two would drift.
 */
export const signIn = {
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
   * Reads the user menu, which renders the account holder's name where `Sign
   * in` sits when signed out. Used by `auth.setup.ts` to fail loudly rather
   * than write a storage state holding no session.
   */
  async isSignedIn(page: Page): Promise<boolean> {
    return navigationLocators.userMenu(page).isVisible();
  },

  /** The name the user menu shows, or null when signed out. */
  async signedInAs(page: Page): Promise<string | null> {
    const menu = navigationLocators.userMenu(page);
    if (!(await menu.isVisible())) return null;
    return (await menu.textContent())?.trim() ?? null;
  },

  /** The error the form reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = signInLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },

  async signOut(page: Page): Promise<void> {
    await test.step('Sign out', async () => {
      await navigationLocators.userMenu(page).click();
      await navigationLocators.signOut(page).click();
    });
  },

  /**
   * Ask for a password-reset mail. Returns nothing to assert on by design —
   * the application answers identically whether or not the address exists,
   * which is the correct behaviour and the thing a spec should check.
   */
  async requestPasswordReset(page: Page, email: string): Promise<void> {
    await test.step('Request a password reset', async () => {
      await page.goto('/auth/forgot-password');
      await forgotPasswordLocators.email(page).fill(email);
      await forgotPasswordLocators.submit(page).click();
    });
  },

  /**
   * Whatever the application said in answer to a reset request — the announced
   * message, or the empty string when it said nothing.
   *
   * Exists because the spec comparing the two answers reached for
   * `page.getByRole('main')` and timed out: this application renders no `main`
   * landmark at all. A spec guessing at page structure is the same mistake as a
   * spec guessing at a locator, and the fix is the same — put the read in the
   * vocabulary, where it is written against the page.
   */
  async readPasswordResetOutcome(page: Page): Promise<string> {
    return test.step('Read what the reset request answered', async () => {
      const toast = navigationLocators.toast(page);
      await toast.waitFor().catch(() => undefined);
      if (await toast.isVisible()) return ((await toast.textContent()) ?? '').trim();
      // No announcement: the form's own state is the answer.
      const error = await this.readError(page);
      return error ?? '';
    });
  },
};
