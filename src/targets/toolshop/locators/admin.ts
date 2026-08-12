import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the administrator area: product, brand, category, user and message
 * maintenance, and the sales dashboard.
 *
 * The row controls are the clearest argument in this pack for never writing an
 * internal identifier down. Products expose `product-edit-<ULID>` and
 * `product-delete-<ULID>`; brands expose `brand-<ULID>-edit` and
 * `brand-<ULID>-delete` — the same idea with the id in a different position,
 * on the same screen of the same application. Anything that transcribed either
 * shape would be wrong half the time and silently so. Rows are found by the
 * name a person reads instead, and the id is only ever read back off the page.
 */
export const adminLocators = {
  pageTitle: (page: Page): Locator => page.getByTestId('page-title'),

  // ---- products ------------------------------------------------------------
  productSearchQuery: (page: Page): Locator => page.getByTestId('product-search-query'),
  productSearchSubmit: (page: Page): Locator => page.getByTestId('product-search-submit'),
  productSearchReset: (page: Page): Locator => page.getByTestId('product-search-reset'),
  productAdd: (page: Page): Locator => page.getByTestId('product-add'),

  // ---- brands --------------------------------------------------------------
  brandSearchQuery: (page: Page): Locator => page.getByTestId('brand-search-query'),
  brandSearchSubmit: (page: Page): Locator => page.getByTestId('brand-search-submit'),
  brandAdd: (page: Page): Locator => page.getByTestId('brand-add'),

  /** A maintenance row, by the name printed in it. */
  row: (page: Page, name: string): Locator =>
    page.getByRole('row').filter({ hasText: name }),
  rowEdit: (row: Locator): Locator => row.getByRole('link', { name: 'Edit' }),
  rowDelete: (row: Locator): Locator => row.getByRole('button', { name: 'Delete' }),

  /**
   * Every maintenance row on the current page, identified by the `Edit` link
   * each carries rather than by "rows of a table" — several screens in this
   * application render a table, and an unscoped one answers for whichever
   * happens to be on screen.
   */
  rows: (page: Page): Locator =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Edit' }) }),

  // ---- the sales dashboard -------------------------------------------------
  latestOrders: (page: Page): Locator => page.getByRole('heading', { name: 'Latest orders' }),
};
