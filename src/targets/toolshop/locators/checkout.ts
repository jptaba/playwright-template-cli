import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the cart and the four-step checkout wizard.
 *
 * The wizard is `CART 1 → SIGN IN 2 → BILLING ADDRESS 3 → PAYMENT 4`, all on
 * `/checkout`, advanced by `proceed-1`, `proceed-2`, `proceed-3` and confirmed
 * with `finish`. The step buttons are numbered rather than named, so they are
 * exposed here as one function taking the step it leaves.
 *
 * Every per-line locator is scoped to its row. `product-title`, `product-price`
 * and `line-price` repeat once per line in the cart, and an unscoped one would
 * silently answer for the first line whatever the caller meant.
 */
/**
 * The cart table, identified by the one thing only it has: a total cell.
 *
 * `getByRole('table')` on its own is not the cart. The product detail page
 * renders a specifications table, and a bare table locator matched *that* — so
 * `openCart` waited for "a table", found the specifications table it was
 * already looking at, decided the cart had arrived, and read five rows of
 * product specifications as though they were cart lines. No error, no timeout:
 * an empty cart and a plausible-looking total, and the spec failed three
 * assertions later on something unrelated.
 *
 * Scope a locator to the thing that makes it unambiguous, every time.
 */
const cartTable = (page: Page): Locator =>
  page.getByRole('table').filter({ has: page.getByTestId('cart-total') });

export const cartLocators = {
  /** The cart table. Everything per-line is scoped inside it. */
  table: cartTable,
  rows: (page: Page): Locator =>
    cartTable(page).getByRole('row').filter({ has: page.getByTestId('product-title') }),

  /** One cart line, by the product name printed in it. */
  row: (page: Page, productName: string): Locator =>
    cartTable(page)
      .getByRole('row')
      .filter({ has: page.getByTestId('product-title').filter({ hasText: productName }) }),

  rowTitle: (row: Locator): Locator => row.getByTestId('product-title'),
  rowQuantity: (row: Locator): Locator => row.getByTestId('product-quantity'),
  rowUnitPrice: (row: Locator): Locator => row.getByTestId('product-price'),
  rowLinePrice: (row: Locator): Locator => row.getByTestId('line-price'),
  /**
   * The remove control on a line. It is an unlabelled icon link, so there is
   * no accessible name to hang a role locator on — scoping to the row is what
   * makes it unambiguous.
   */
  // locator-justification: the remove control is an unlabelled icon anchor with no accessible name; scoped to its row it is exact.
  rowRemove: (row: Locator): Locator => row.locator('a'),

  total: (page: Page): Locator => page.getByTestId('cart-total'),
  continueShopping: (page: Page): Locator => page.getByTestId('continue-shopping'),
};

export const checkoutLocators = {
  /** The wizard's own step strip, used to assert where the journey has got to. */
  steps: (page: Page): Locator => page.getByRole('list').filter({ hasText: 'BILLING ADDRESS' }),
  step: (page: Page, name: string): Locator =>
    page.getByRole('link', { name: new RegExp(name, 'i') }),

  /** `proceed-1` leaves the cart, `proceed-2` the sign-in step, and so on. */
  proceedFrom: (page: Page, step: 1 | 2 | 3): Locator => page.getByTestId(`proceed-${step}`),

  // ---- step 3: billing address --------------------------------------------
  street: (page: Page): Locator => page.getByTestId('street'),
  houseNumber: (page: Page): Locator => page.getByTestId('house_number'),
  postcode: (page: Page): Locator => page.getByTestId('postal_code'),
  city: (page: Page): Locator => page.getByTestId('city'),
  state: (page: Page): Locator => page.getByTestId('state'),
  country: (page: Page): Locator => page.getByTestId('country'),

  // ---- step 4: payment -----------------------------------------------------
  paymentMethod: (page: Page): Locator => page.getByTestId('payment-method'),
  finish: (page: Page): Locator => page.getByRole('button', { name: 'Confirm' }),

  /**
   * The success panel the wizard renders after `Confirm`, carrying the invoice
   * number the order was filed under.
   */
  paymentSuccess: (page: Page): Locator => page.getByTestId('payment-success-message'),
  orderConfirmation: (page: Page): Locator => page.getByTestId('order-confirmation'),
};
