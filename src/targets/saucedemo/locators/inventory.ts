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

/**
 * An anchored match on a name, for `filter({ hasText })`.
 *
 * A local copy of toolshop's helper of the same name rather than a shared one:
 * one target may not import another's code, and a framework home for three
 * lines that only two packs want would be the premature abstraction the
 * conventions warn about. If a third target needs it, that is the second
 * caller that justifies moving it.
 */
const exactly = (text: string): RegExp =>
  new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

export const inventoryLocators = {
  items: (page: Page): Locator => page.getByTestId('inventory-item'),

  /**
   * One card, by the name printed on it — exactly that name.
   *
   * `hasText` with a string is a **substring** match. None of saucedemo's six
   * product names nests inside another, so the unanchored version was correct
   * — by luck rather than by construction, and only for as long as the
   * catalogue stays six items. The same shape on toolshop opened the wrong
   * product the day a spec chose by stock instead of by position.
   *
   * Scoped to the name element rather than the card, because a card's text is
   * the name *and* its description and price, which no `^…$` anchor matches.
   */
  item: (page: Page, name: string): Locator =>
    inventoryLocators
      .items(page)
      .filter({ has: page.getByTestId('inventory-item-name').filter({ hasText: exactly(name) }) }),

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
