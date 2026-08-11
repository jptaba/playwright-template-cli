import { test, type Page } from '@playwright/test';
import { signInLocators } from '../locators/sign-in';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * L2 — TEMPLATE. Named business verbs.
 *
 * Three rules make this layer work:
 *  - **Compose L1, return data, assert nothing.** A spec that cannot see the
 *    outcome cannot make an interesting claim about it, and an assertion
 *    buried in an action is invisible to the person reviewing the spec.
 *  - **Name the step for intent, not mechanics.** These titles become the
 *    report's narrative for someone who does not know what a locator is.
 *    "Sign in as the approver", never "click #login-btn".
 *  - **Derive identifiers, never transcribe them.** If a verb needs one of
 *    the application's internal ids, read it from the running application.
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

  /** The error the form reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = signInLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },
};
