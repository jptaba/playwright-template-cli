import type { Locator, Page } from '@playwright/test';

/** L1 — the cart page. */
export const cartLocators = {
  list: (page: Page): Locator => page.getByTestId('cart-list'),
  items: (page: Page): Locator => page.getByTestId('inventory-item'),
  itemByName: (page: Page, name: string): Locator =>
    page.getByTestId('inventory-item').filter({
      has: page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    }),
  itemQuantity: (card: Locator): Locator => card.getByTestId('item-quantity'),
  checkout: (page: Page): Locator => page.getByTestId('checkout'),
  continueShopping: (page: Page): Locator => page.getByTestId('continue-shopping'),
};
