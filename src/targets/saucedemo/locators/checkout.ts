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
   * The order summary, step two — and every locator below is scoped to it.
   *
   * `inventory-item-name` and `inventory-item-price` are the **same test ids
   * the product listing uses**. They are unambiguous here only because the
   * listing is not on this page, which is exactly the accident the conventions
   * warn about: an unscoped locator does not fail when a page reuses an id, it
   * answers the wrong question with a plausible result. Scoped to the summary
   * container, they stay right wherever they are called from.
   */
  summary: (page: Page): Locator => page.getByTestId('checkout-summary-container'),
  summaryItems: (page: Page): Locator =>
    checkoutLocators.summary(page).getByTestId('inventory-item-name'),
  summaryPrices: (page: Page): Locator =>
    checkoutLocators.summary(page).getByTestId('inventory-item-price'),
  /** "Item total: $39.98" — the label carries the number, so the verb parses it. */
  itemTotal: (page: Page): Locator => checkoutLocators.summary(page).getByTestId('subtotal-label'),

  /**
   * The validation banner step one renders. Its text changes with the field
   * it is complaining about, so there is no accessible name to filter on —
   * it is the only heading either checkout step renders, confirmed against
   * the running page rather than assumed.
   */
  error: (page: Page): Locator => page.getByRole('heading', { level: 3 }),
};
