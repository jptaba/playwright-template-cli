import type { Locator, Page } from '@playwright/test';

/** L1 — the three checkout steps: information, overview, complete. */
export const checkoutLocators = {
  // Step one — "Checkout: Your Information"
  firstName: (page: Page): Locator => page.getByTestId('firstName'),
  lastName: (page: Page): Locator => page.getByTestId('lastName'),
  postalCode: (page: Page): Locator => page.getByTestId('postalCode'),
  continue: (page: Page): Locator => page.getByTestId('continue'),
  cancel: (page: Page): Locator => page.getByTestId('cancel'),
  error: (page: Page): Locator => page.getByTestId('error'),

  // Step two — "Checkout: Overview"
  subtotalLabel: (page: Page): Locator => page.getByTestId('subtotal-label'),
  taxLabel: (page: Page): Locator => page.getByTestId('tax-label'),
  totalLabel: (page: Page): Locator => page.getByTestId('total-label'),
  finish: (page: Page): Locator => page.getByTestId('finish'),

  // Step three — "Checkout: Complete!"
  completeHeader: (page: Page): Locator => page.getByTestId('complete-header'),
  completeText: (page: Page): Locator => page.getByTestId('complete-text'),
  backToProducts: (page: Page): Locator => page.getByTestId('back-to-products'),
};
