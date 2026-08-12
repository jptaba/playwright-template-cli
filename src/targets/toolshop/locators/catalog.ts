import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the product listing: the grid, its filters, its sort and its paging.
 *
 * Two things about this page decide how everything below is written.
 *
 * **Test ids are reused per card.** `product-name` and `product-price` appear
 * once inside every card on the listing *and* once on the product detail page.
 * An unscoped `getByTestId('product-name')` matches nine elements on the
 * listing and one on the detail page, so it does not fail — it answers a
 * different question depending on where it is called. Everything per-card is
 * therefore scoped to its card.
 *
 * **Identifiers belong to the application.** A card's own test id is
 * `product-<ULID>`, and the category filters are `category-<ULID>`. Those ULIDs
 * are reseeded whenever the deployment is rebuilt, so nothing here writes one
 * down: cards are found by their accessible name, and an id is read off the
 * page when a caller needs one.
 */
export const catalogLocators = {
  /** Every product card on the current page of the listing. */
  cards: (page: Page): Locator => page.getByRole('link').and(page.getByTestId(/^product-/)),

  /** One card, by the product name a shopper reads. */
  card: (page: Page, productName: string): Locator =>
    page.getByRole('link', { name: new RegExp(`^${escapeForRegExp(productName)}\\b`) }),

  /** A card by the application's own id, when one has been read off the page. */
  cardById: (page: Page, productId: string): Locator => page.getByTestId(`product-${productId}`),

  // ---- inside a card -------------------------------------------------------
  cardName: (card: Locator): Locator => card.getByTestId('product-name'),
  cardPrice: (card: Locator): Locator => card.getByTestId('product-price'),
  cardOutOfStock: (card: Locator): Locator => card.getByTestId('out-of-stock'),
  cardCompare: (card: Locator): Locator => card.getByTestId('compare-btn'),
  cardCo2Rating: (card: Locator): Locator => card.getByTestId('co2-rating-badge'),

  // ---- filters -------------------------------------------------------------
  searchQuery: (page: Page): Locator => page.getByTestId('search-query'),
  searchSubmit: (page: Page): Locator => page.getByTestId('search-submit'),
  searchReset: (page: Page): Locator => page.getByTestId('search-reset'),
  sort: (page: Page): Locator => page.getByTestId('sort'),

  /**
   * A category or brand filter, by its visible label. The underlying test id
   * embeds a ULID, which is exactly the kind of internal identifier that must
   * never be transcribed — the accessible name is stable and the id is not.
   */
  categoryFilter: (page: Page, name: string): Locator =>
    page.getByRole('group', { name: 'Categories' }).getByRole('checkbox', { name, exact: true }),
  brandFilter: (page: Page, name: string): Locator =>
    page.getByRole('group', { name: 'Brands' }).getByRole('checkbox', { name, exact: true }),
  ecoFriendlyFilter: (page: Page): Locator => page.getByTestId('eco-friendly-filter'),

  /** The two handles of the price range slider. */
  priceSliderMin: (page: Page): Locator => page.getByRole('slider', { name: 'ngx-slider', exact: true }),
  priceSliderMax: (page: Page): Locator => page.getByRole('slider', { name: 'ngx-slider-max' }),

  // ---- paging --------------------------------------------------------------
  pagination: (page: Page): Locator => page.getByRole('navigation').last(),
  pageNumber: (page: Page, number: number): Locator =>
    page.getByRole('button', { name: `Page-${number}` }),
  nextPage: (page: Page): Locator => page.getByRole('button', { name: '»' }),
  previousPage: (page: Page): Locator => page.getByRole('button', { name: '«' }),
};

/** A product name may contain regex metacharacters — `Pliers (8")` does. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
