import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the product detail page.
 *
 * `product-name` is an `<h1>` here and an `<h5>` inside every listing card, on
 * the same test id. This file is only ever used on the detail page, where the
 * id is unambiguous; the listing's copy is scoped to its card in
 * `catalog.ts`.
 */
export const productLocators = {
  name: (page: Page): Locator => page.getByTestId('product-name'),
  price: (page: Page): Locator => page.getByTestId('unit-price'),
  description: (page: Page): Locator => page.getByTestId('product-description'),
  co2Rating: (page: Page): Locator => page.getByTestId('co2-rating-badge'),

  quantity: (page: Page): Locator => page.getByTestId('quantity'),
  increaseQuantity: (page: Page): Locator => page.getByRole('button', { name: 'Increase quantity' }),
  decreaseQuantity: (page: Page): Locator => page.getByRole('button', { name: 'Decrease quantity' }),

  addToCart: (page: Page): Locator => page.getByRole('button', { name: 'Add to cart' }),
  addToFavourites: (page: Page): Locator => page.getByRole('button', { name: 'Add to favourites' }),
  addToCompare: (page: Page): Locator => page.getByRole('button', { name: 'Compare' }),

  // ---- specifications table ------------------------------------------------
  specsTitle: (page: Page): Locator => page.getByTestId('specs-title'),
  specs: (page: Page): Locator => page.getByTestId('product-specs'),
  /** Rows are scoped to the table: `spec-row` means nothing on its own. */
  specRows: (page: Page): Locator => page.getByTestId('product-specs').getByTestId('spec-row'),
  specName: (row: Locator): Locator => row.getByTestId('spec-name'),
  specValue: (row: Locator): Locator => row.getByTestId('spec-value'),

  /** The "Related products" strip under the specifications. */
  relatedProducts: (page: Page): Locator =>
    page.getByRole('heading', { name: 'Related products' }),
};
