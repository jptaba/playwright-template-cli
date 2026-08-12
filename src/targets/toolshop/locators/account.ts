import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the signed-in account area: overview, profile, favourites, invoices and
 * messages.
 *
 * `page-title` is the same test id on every one of those pages, which makes it
 * the cheapest way to say "the right page rendered" without asserting on a URL.
 */
export const accountLocators = {
  pageTitle: (page: Page): Locator => page.getByTestId('page-title'),

  favorites: (page: Page): Locator => page.getByTestId('nav-favorites'),
  profile: (page: Page): Locator => page.getByTestId('nav-profile'),
  invoices: (page: Page): Locator => page.getByTestId('nav-invoices'),
  messages: (page: Page): Locator => page.getByTestId('nav-messages'),
};

/**
 * The profile page carries three independent forms — details, password and
 * two-factor setup — and each has its own submit. Naming them separately is
 * what stops a spec submitting the wrong one.
 */
export const profileLocators = {
  firstName: (page: Page): Locator => page.getByTestId('first-name'),
  lastName: (page: Page): Locator => page.getByTestId('last-name'),
  email: (page: Page): Locator => page.getByTestId('email'),
  phone: (page: Page): Locator => page.getByTestId('phone'),
  street: (page: Page): Locator => page.getByTestId('street'),
  postcode: (page: Page): Locator => page.getByTestId('postal_code'),
  city: (page: Page): Locator => page.getByTestId('city'),
  state: (page: Page): Locator => page.getByTestId('state'),
  country: (page: Page): Locator => page.getByTestId('country'),
  updateProfile: (page: Page): Locator => page.getByTestId('update-profile-submit'),

  currentPassword: (page: Page): Locator => page.getByTestId('current-password'),
  newPassword: (page: Page): Locator => page.getByTestId('new-password'),
  confirmNewPassword: (page: Page): Locator => page.getByTestId('new-password-confirm'),
  changePassword: (page: Page): Locator => page.getByTestId('change-password-submit'),

  /**
   * The two-factor panel.
   *
   * Which of these renders depends on the account, not on the deployment. Some
   * seeded logins are refused with "Access denied: if you want to configure
   * TOTP, please create your own account"; others are offered the full setup —
   * a secret, a code field and a verify button.
   *
   * That distinction is why `capabilities.mfa` is `'none'`: the product has
   * two-factor authentication and this account *may* enable it, but no account
   * the suite signs in as has it enabled, so no sign-in demands a second
   * factor. A capability describes what the suite must actually handle.
   */
  twoFactorHeading: (page: Page): Locator =>
    page.getByRole('heading', { name: 'Set up Two-Factor Authentication' }),
  totpError: (page: Page): Locator => page.getByTestId('totp-error'),
  totpSecret: (page: Page): Locator => page.getByTestId('totp-secret'),
  totpCode: (page: Page): Locator => page.getByTestId('totp-code'),
  verifyTotp: (page: Page): Locator => page.getByTestId('verify-totp'),
};

export const favoritesLocators = {
  /** Every favourite card. The test id carries a ULID, so match on the prefix. */
  cards: (page: Page): Locator => page.getByTestId(/^favorite-/),
  card: (page: Page, productName: string): Locator =>
    page.getByTestId(/^favorite-/).filter({ hasText: productName }),
  /**
   * `delete` repeats once per favourite with no accessible name at all, so it
   * is only ever reachable through its card.
   */
  cardRemove: (card: Locator): Locator => card.getByTestId('delete'),
  cardName: (card: Locator): Locator => card.getByTestId('product-name'),
};

export const invoiceLocators = {
  /**
   * Invoice rows, identified by the `Details` link each one carries.
   *
   * Scoped to rows containing that link rather than to "rows of a table":
   * several pages in this application render a table, and an unscoped table
   * locator quietly answers for whichever one happens to be on screen.
   */
  rows: (page: Page): Locator =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Details' }) }),
  rowDetails: (row: Locator): Locator => row.getByRole('link', { name: 'Details' }),
  nextPage: (page: Page): Locator => page.getByTestId('pagination-next'),
  previousPage: (page: Page): Locator => page.getByTestId('pagination-prev'),

  // ---- one invoice ---------------------------------------------------------
  invoiceNumber: (page: Page): Locator => page.getByTestId('invoice-number'),
  invoiceDate: (page: Page): Locator => page.getByTestId('invoice-date'),
  downloadPdf: (page: Page): Locator => page.getByRole('link', { name: /download/i }),
};
