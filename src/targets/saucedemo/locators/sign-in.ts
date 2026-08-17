import type { Locator, Page } from '@playwright/test';

/**
 * L1 — named locators, and nothing else. No logic, no waits, no assertions.
 *
 * The three names below were **read off the running application** at
 * `/` during onboarding: they are the accessible names, which is
 * what `getByRole` matches and what a screen reader announces. They are not
 * guesses, and they should not be "tidied" into something that reads better —
 * a name taken from a placeholder or an id is a name `getByRole` will not
 * find, and it fails as a bare timeout on a control plainly on screen.
 *
 * `error` is still a guess: nothing can read it off a page that has not had a
 * sign-in refused.
 *
 * `signedInMarker` was derived by signing in once and diffing the page — it
 * is the control that appeared and was not there before.
 *
 * Priority order, enforced by `no-raw-locators`:
 *   getByRole → getByLabel/getByPlaceholder/getByText → getByTestId → CSS with
 *   a written justification. XPath never.
 *
 * Scope to a container when a test id is reused across pages, or the locator
 * answers the wrong question with a plausible result.
 */
export const signInLocators = {
  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Username' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Login' }),
  error: (page: Page): Locator => page.getByRole('alert'),
  /** Something only a signed-in page shows. Used to verify a session, not to assert. */
  signedInMarker: (page: Page): Locator =>
    page.getByRole('button', { name: 'Open Menu' }),
};
