import type { Locator, Page } from '@playwright/test';

/**
 * L1 — TEMPLATE. A flat map of named locators, and nothing else.
 *
 * Rules this file has to keep, all enforced by lint:
 *  - `getByRole` first, then `getByLabel` / `getByPlaceholder`, then
 *    `getByTestId`. Raw CSS needs an inline justification; XPath is never
 *    permitted.
 *  - No logic, no waits, no assertions. If you want to *do* something with
 *    these, that belongs in `actions/`.
 *  - Ground them in a real page: `npx playwright-cli open <url>` then
 *    `npx playwright-cli snapshot`, and write what the snapshot says rather
 *    than what you expect it to say.
 *  - Scope to a container when a test id is reused across pages, or the
 *    locator will answer the wrong question with a plausible result.
 */
export const signInLocators = {
  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Username' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Sign in' }),
  error: (page: Page): Locator => page.getByRole('alert'),
};
