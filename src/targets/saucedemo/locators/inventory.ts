import type { Locator, Page } from '@playwright/test';

/** L1 — inventory ("Products") page. Grounded in a live snapshot. */
export const inventoryLocators = {
  title: (page: Page): Locator => page.getByTestId('title'),
  sortDropdown: (page: Page): Locator => page.getByRole('combobox'),

  /** Every product card on the page. `div[data-test="inventory-item"]`. */
  items: (page: Page): Locator => page.getByTestId('inventory-item'),

  /** A single product card, selected by its visible name. */
  itemByName: (page: Page, name: string): Locator =>
    page.getByTestId('inventory-item').filter({
      has: page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    }),

  itemName: (card: Locator): Locator => card.getByTestId('inventory-item-name'),
  itemPrice: (card: Locator): Locator => card.getByTestId('inventory-item-price'),
  addToCart: (card: Locator): Locator => card.getByRole('button', { name: 'Add to cart' }),
  removeFromCart: (card: Locator): Locator => card.getByRole('button', { name: 'Remove' }),

  /** All product names, in display order — for sort assertions. */
  allItemNames: (page: Page): Locator => page.getByTestId('inventory-item-name'),
  allItemPrices: (page: Page): Locator => page.getByTestId('inventory-item-price'),
};
