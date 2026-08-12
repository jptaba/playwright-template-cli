import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the contact form.
 *
 * Reachable signed out and signed in, and the two are not the same form: signed
 * in, the name and email fields arrive pre-filled and read-only. Both are
 * addressed by the same test ids, so the difference belongs in the action, not
 * here.
 */
export const contactLocators = {
  firstName: (page: Page): Locator => page.getByTestId('first-name'),
  lastName: (page: Page): Locator => page.getByTestId('last-name'),
  email: (page: Page): Locator => page.getByTestId('email'),
  subject: (page: Page): Locator => page.getByTestId('subject'),
  message: (page: Page): Locator => page.getByTestId('message'),
  attachment: (page: Page): Locator => page.getByTestId('attachment'),
  submit: (page: Page): Locator => page.getByTestId('contact-submit'),

  /** Per-field validation, matching the registration form's convention. */
  fieldError: (page: Page, field: string): Locator => page.getByTestId(`${field}-error`),
};
