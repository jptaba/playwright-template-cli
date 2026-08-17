import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the cart and the checkout form's first step.
 */
export const checkoutLocators = {
  // The cart icon is an <a> with no href, so the browser never exposes it
  // with an accessible "link" role — there is no role or label to match.
  cartLink: (page: Page): Locator => page.getByTestId('shopping-cart-link'),

  checkoutButton: (page: Page): Locator => page.getByRole('button', { name: 'Checkout' }),
  firstName: (page: Page): Locator => page.getByRole('textbox', { name: 'First Name' }),
  lastName: (page: Page): Locator => page.getByRole('textbox', { name: 'Last Name' }),
  postalCode: (page: Page): Locator => page.getByRole('textbox', { name: 'Zip/Postal Code' }),
  continueButton: (page: Page): Locator => page.getByRole('button', { name: 'Continue' }),

  /**
   * The validation banner step one renders. Its text changes with the field
   * it is complaining about, so there is no accessible name to filter on —
   * it is the only heading either checkout step renders, confirmed against
   * the running page rather than assumed.
   */
  error: (page: Page): Locator => page.getByRole('heading', { level: 3 }),
};
