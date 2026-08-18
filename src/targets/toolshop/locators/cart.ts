import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the cart.
 *
 * **The container is scoped to the total, and that is the whole point of this
 * file.** `getByRole('table')` is not "the cart" — it is whichever table is on
 * screen, and a product page has a *specifications* table on it. An action
 * that waits for "a table" after clicking through from a product finds the one
 * it was already looking at, decides the cart has arrived, and reads five rows
 * of specifications as cart lines. No error and no timeout: an empty cart and
 * a plausible total.
 *
 * The cart is the table that contains the total.
 */
const cartTable = (page: Page): Locator =>
  page.getByRole('table').filter({ has: page.getByRole('cell', { name: 'Total', exact: true }) });

export const cartLocators = {
  table: cartTable,

  /** Every line in the cart. Scoped, so a specifications row can never be one. */
  lines: (page: Page): Locator => cartTable(page).getByRole('row').filter({ has: page.getByRole('spinbutton') }),

  /**
   * One line, found by the quantity box that names its product.
   *
   * **Not `filter({ hasText: product })`**, which was a substring match on a
   * catalogue full of nesting names: "Pliers" is inside "Combination Pliers",
   * "Long Nose Pliers" and "Slip Joint Pliers". Asking for the Pliers line
   * would have matched three, and `empty()` removes line by line *by name*
   * against a shared account — so the first spec to hold two nesting products
   * would remove the wrong row and hand every later spec on that worker a
   * dirty cart.
   *
   * `exactly()` from `catalogue.ts` is the wrong instrument here and that is
   * worth saying, because it is the obvious one: a row's text is the name
   * *and* the quantity, price and line total, so anchoring the row text with
   * `^…$` matches nothing at all. The anchor that works is already in this
   * file — `Quantity for <product>` is a whole accessible name, and one
   * product's name is never a prefix-aligned substring of another's inside it.
   */
  line: (page: Page, product: string): Locator =>
    cartLocators.lines(page).filter({ has: cartLocators.quantity(page, product) }),

  /**
   * The quantity box on a line. Its accessible name carries the product.
   *
   * `exact` because `getByRole`'s name option is a substring match by default,
   * and this is now what `line` depends on to tell two nesting products apart.
   * It was safe before only because "Quantity for Pliers" happens not to be a
   * substring of "Quantity for Combination Pliers" — true, and luck rather
   * than construction, which is the thing this item was raised about.
   */
  quantity: (page: Page, product: string): Locator =>
    page.getByRole('spinbutton', { name: `Quantity for ${product}`, exact: true }),

  /**
   * The per-line remove control.
   *
   * CSS, with the justification the rule requires, because there is genuinely
   * nothing else: it is an icon-only `<a>` with no accessible name, no test id
   * and — having no `href` — no link role either. `getByRole('button')` was
   * the first attempt and matched nothing at all, which `empty()` then
   * swallowed and turned into a poll that spun until it timed out.
   *
   * Worth saying plainly: a control with no accessible name is a WCAG 4.1.2
   * failure, so this locator is documenting a defect in the application rather
   * than a gap in the framework. If it ever gains a name, delete this and use
   * it.
   */
  remove: (page: Page, product: string): Locator =>
    // locator-justification: icon-only anchor with no accessible name, no test id and no link role.
    cartLocators.line(page, product).locator('a').last(),

  /**
   * The order total, as the application renders it.
   *
   * The cell carrying an amount, not the last cell in the row. The total row
   * ends with an empty cell holding the remove column's spacing, so `.last()`
   * read "" and the spec reported the order total as 0 against a correct line
   * total of 28.30 — an arithmetic failure that was a locator failure.
   */
  total: (page: Page): Locator =>
    cartTable(page)
      .getByRole('row')
      .filter({ hasText: 'Total' })
      .getByRole('cell')
      .filter({ hasText: '$' })
      .last(),

  proceed: (page: Page): Locator => page.getByRole('button', { name: 'Proceed to checkout' }),

  /**
   * The checkout stepper, which is on the page whether or not the cart has
   * anything in it.
   *
   * **An empty cart renders no table at all**, so the table cannot be what
   * "the cart page has loaded" waits for — that version timed out for fifteen
   * seconds on a page that was fully rendered and simply empty. This is the
   * thing that is always there.
   */
  page: (page: Page): Locator => page.getByText('Billing Address', { exact: true }),

  /**
   * The count on the navigation's cart badge.
   *
   * Absent entirely when the cart is empty rather than showing zero, which is
   * why it is the *arrival* signal after adding and never the emptiness one.
   */
  navQuantity: (page: Page): Locator => page.getByTestId('cart-quantity'),
};
