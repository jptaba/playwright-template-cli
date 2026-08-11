import type { Locator, Page } from '@playwright/test';

/** L1 — the cart page. */
export const cartLocators = {
  list: (page: Page): Locator => page.getByTestId('cart-list'),

  /**
   * Scoped to the cart list on purpose. This application reuses
   * `inventory-item` for cards on the product listing *and* rows in the cart,
   * so an unscoped locator answers the wrong question — silently, and with a
   * plausible-looking result — whenever it is used on the wrong page.
   */
  items: (page: Page): Locator => cartLocators.list(page).getByTestId('inventory-item'),
  itemByName: (page: Page, name: string): Locator =>
    cartLocators.items(page).filter({
      has: page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    }),
  itemQuantity: (card: Locator): Locator => card.getByTestId('item-quantity'),
  removeFromCart: (card: Locator): Locator => card.getByRole('button', { name: 'Remove' }),
  checkout: (page: Page): Locator => page.getByTestId('checkout'),
  continueShopping: (page: Page): Locator => page.getByTestId('continue-shopping'),
};
