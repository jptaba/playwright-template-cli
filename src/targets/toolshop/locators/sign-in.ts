import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the sign-in, registration and forgotten-password forms.
 *
 * `login-submit` is an `<input type="submit" value="Login">` rather than a
 * `<button>`, which still exposes the `button` role — so the role locator is
 * both correct and the one a screen-reader user would follow.
 *
 * The names below are the **accessible** names — `Email address *`, taken from
 * the `<label>` — not the placeholders, which read `Your email`. The first
 * version of this file used the placeholders, because the exploration script
 * that produced it fell back to the placeholder attribute when dumping the DOM.
 * Every locator in it was wrong, and the failure was a bare 15-second timeout
 * on a field that was plainly on screen. Ground locators in the accessibility
 * tree that `npx playwright-cli snapshot` writes, which is what a screen reader
 * and `getByRole` both read.
 */
export const signInLocators = {
  form: (page: Page): Locator => page.getByTestId('login-form'),

  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Email address' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Login' }),

  /** "Invalid email or password" — the only error this form reports. */
  error: (page: Page): Locator => page.getByTestId('login-error'),

  registerLink: (page: Page): Locator => page.getByTestId('register-link'),
  forgotPasswordLink: (page: Page): Locator => page.getByTestId('forgot-password-link'),

  /**
   * Federated sign-in. Present, and deliberately never driven: a test that
   * follows it leaves the application under test and starts driving Google's.
   */
  googleSignIn: (page: Page): Locator => page.getByRole('button', { name: 'Sign in with Google' }),
};

export const forgotPasswordLocators = {
  form: (page: Page): Locator => page.getByTestId('forgot-password-form'),
  email: (page: Page): Locator => page.getByRole('textbox', { name: 'Email address' }),
  submit: (page: Page): Locator => page.getByTestId('forgot-password-submit'),
};

/**
 * The registration form. Every field is required, and each renders its own
 * `<field>-error` element under it — which is what makes per-field validation
 * assertable rather than one summary banner.
 */
export const registrationLocators = {
  form: (page: Page): Locator => page.getByTestId('register-form'),

  firstName: (page: Page): Locator => page.getByTestId('first-name'),
  lastName: (page: Page): Locator => page.getByTestId('last-name'),
  dateOfBirth: (page: Page): Locator => page.getByTestId('dob'),
  street: (page: Page): Locator => page.getByTestId('street'),
  houseNumber: (page: Page): Locator => page.getByTestId('house_number'),
  postcode: (page: Page): Locator => page.getByTestId('postal_code'),
  city: (page: Page): Locator => page.getByTestId('city'),
  state: (page: Page): Locator => page.getByTestId('state'),
  country: (page: Page): Locator => page.getByTestId('country'),
  phone: (page: Page): Locator => page.getByTestId('phone'),
  email: (page: Page): Locator => page.getByTestId('email'),
  password: (page: Page): Locator => page.getByTestId('password'),
  submit: (page: Page): Locator => page.getByTestId('register-submit'),

  /** The message under one field: `first-name` → `first-name-error`. */
  fieldError: (page: Page, field: string): Locator => page.getByTestId(`${field}-error`),

  /** The hint the postcode lookup renders once a postcode resolves. */
  postcodeHint: (page: Page): Locator => page.getByTestId('postcode-lookup-hint'),
};
