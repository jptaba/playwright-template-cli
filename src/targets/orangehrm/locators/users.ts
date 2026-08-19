import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the Admin ▸ User Management list.
 *
 * **This application labels its fields without associating them.** Every
 * filter sits in an `.oxd-input-group` next to a `<label>`, and the label
 * carries no `for` and the input no `id` — so the accessible name is empty and
 * `getByLabel('Username')` matches nothing. Read off the running page rather
 * than assumed: the input's `labelledBy` is only discoverable by walking up to
 * the group.
 *
 * That is the application's defect — a form field a screen reader cannot name
 * is a WCAG 1.3.1/4.1.2 failure — and it is why the filters resolve by group
 * with the justification the rule requires rather than by role and name.
 */
const inputGroup = (page: Page, label: string): Locator =>
  // locator-justification: labels carry no `for` and inputs no `id`, so the group is the only handle.
  page.locator('.oxd-input-group').filter({ hasText: label });

export const userLocators = {
  /** The Username filter. Scoped to its own group so it cannot be the search box in the top bar. */
  username: (page: Page): Locator =>
    // locator-justification: the only input inside the Username group, which has no accessible name.
    inputGroup(page, 'Username').locator('input'),

  search: (page: Page): Locator => page.getByRole('button', { name: 'Search' }),
  reset: (page: Page): Locator => page.getByRole('button', { name: 'Reset' }),

  /**
   * The result rows.
   *
   * `.oxd-table-card` rather than `getByRole('row')`: the header is a row too,
   * and counting it would make an empty result read as one record.
   */
  // locator-justification: the header is also a row, and only the cards are results.
  rows: (page: Page): Locator => page.locator('.oxd-table-card'),

  /**
   * The application's own count, which is the number to assert against.
   *
   * It renders as "(4) Records Found". Reading the count the application
   * publishes rather than counting rows means a paginated result is still
   * described correctly — the rows on screen are one page of it.
   */
  recordCount: (page: Page): Locator => page.getByText(/\(\d+\) Records? Found/),

  /**
   * The cells of one row.
   *
   * Here rather than in the action, because the lint rule refused a raw
   * selector there and was right to: a selector in an action is a locator
   * living in the wrong layer, where nobody looks for it when the page moves.
   *
   * `role="cell"` rather than `<td>` — this table is built from divs, so the
   * role is the only thing that makes a cell a cell.
   */
  cells: (row: Locator): Locator => row.getByRole('cell'),

  /** What it says when a filter matches nothing. The empty state is a state. */
  noRecords: (page: Page): Locator => page.getByText('No Records Found'),
};
