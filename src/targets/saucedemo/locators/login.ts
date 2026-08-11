import type { Locator, Page } from '@playwright/test';

/**
 * L1 — flat map of named locators. `getByRole` first, then `getByLabel`, then
 * `getByTestId`. No logic, no waits, no assertions (§03).
 *
 * Grounded in a real accessibility snapshot of https://www.saucedemo.com taken
 * with `npx playwright-cli snapshot`, not from priors. Locator hallucination is
 * the single largest source of dead-on-arrival generated tests (§02).
 */
export const loginLocators = {
  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Username' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Login' }),
  /** `h3[data-test="error"]` — the red banner above the form. */
  error: (page: Page): Locator => page.getByTestId('error'),
  acceptedUsernamesHeading: (page: Page): Locator =>
    page.getByRole('heading', { name: 'Accepted usernames are:' }),
};
