import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the product listing.
 *
 * A card's title link and its image link share one accessible name (the
 * product name, twice) — the exact duplication backlog item 1 found when it
 * broke `signedInMarker` derivation here during onboarding. Every locator
 * below is scoped to the card it belongs to, so "the button in this card"
 * never answers for a different one.
 */
export const inventoryLocators = {
  items: (page: Page): Locator => page.getByTestId('inventory-item'),

  /** One card, by the name printed on it. */
  item: (page: Page, name: string): Locator =>
    inventoryLocators.items(page).filter({ hasText: name }),

  name: (page: Page): Locator => page.getByTestId('inventory-item-name'),

  addToCart: (page: Page, name: string): Locator =>
    inventoryLocators.item(page, name).getByRole('button', { name: 'Add to cart' }),

  cartBadge: (page: Page): Locator => page.getByTestId('shopping-cart-badge'),

  price: (page: Page): Locator => page.getByTestId('inventory-item-price'),

  // A native <select> with no <label> or aria-label exposes role="combobox"
  // with no accessible name — confirmed against the running page — and it is
  // the only combobox this page has.
  sort: (page: Page): Locator => page.getByRole('combobox'),
};
