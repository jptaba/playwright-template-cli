import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the accounts overview, and moving money between two of them.
 *
 * Read off the running application on 2026-08-18. ParaBank carries no test-id
 * attribute of any kind — nought occurrences of `data-test`, `data-testid`,
 * `data-qa` or `data-cy` — and most of these controls have no accessible name
 * either, so this file is mostly CSS with the justification the rule requires.
 * Where a control *does* have a name, the name is used.
 */
export const accountLocators = {
  /**
   * The accounts overview table.
   *
   * Scoped by id rather than `getByRole('table')`, for the reason this
   * repository has already been bitten by on another target: "whichever table
   * is on screen" reads the wrong rows with a plausible result rather than
   * failing.
   */
  // locator-justification: the table has no caption and no accessible name
  table: (page: Page): Locator => page.locator('#accountTable'),

  /**
   * One row per account. Filtered to rows holding an account link, because the
   * table's last row is a totals row with no account in it — counting rows
   * without this reports one account too many, which is the kind of quietly
   * wrong answer that survives a green suite.
   */
  rows: (page: Page): Locator =>
    accountLocators.table(page).getByRole('row').filter({ has: page.getByRole('link') }),

  /**
   * The account-number link in a row. Its text is the account id.
   *
   * By role, not by href. The first draft matched `a[href*="activity.htm"]`,
   * which is a raw selector needing a justification it does not deserve — the
   * link is the only one in a row, and `getByRole` is what the priority order
   * asks for. Worth noting because the lint rule is what forced the better
   * locator: the justification comment was the easy way out and the rule
   * declining to accept a misplaced one sent me back to the right answer.
   */
  rowAccountLink: (row: Locator): Locator => row.getByRole('link'),

  /* --- Transfer Funds ------------------------------------------------ */

  // locator-justification: the field's `name` is the literal "input"; id is the handle
  amount: (page: Page): Locator => page.locator('#amount'),

  /**
   * The two account pickers.
   *
   * **Both are populated by script after the page loads**, and that is the
   * fact a caller has to wait on. Fetched as static HTML they hold zero
   * options — measured, not assumed — so anything selecting an account before
   * they fill selects nothing and the transfer quietly uses a default.
   */
  // locator-justification: the select has an id and no accessible name
  fromAccount: (page: Page): Locator => page.locator('#fromAccountId'),

  // locator-justification: the select has an id and no accessible name
  toAccount: (page: Page): Locator => page.locator('#toAccountId'),

  /** Every option in the "from" picker — the thing to wait for, see above. */
  // locator-justification: options carry no role or name until they are filled
  fromAccountOptions: (page: Page): Locator => page.locator('#fromAccountId option'),

  transferSubmit: (page: Page): Locator => page.getByRole('button', { name: 'Transfer' }),

  /**
   * The confirmation. The page keeps its "Transfer Funds" heading and swaps
   * the panel body, so the heading is *not* the marker — waiting on it would
   * return instantly, before the transfer had happened.
   */
  transferComplete: (page: Page): Locator =>
    page.getByRole('heading', { name: 'Transfer Complete!' }),

  // locator-justification: the confirmation panel is a bare div with no role
  transferResult: (page: Page): Locator => page.locator('#showResult'),

  /**
   * The error the transfer form is *currently* reporting.
   *
   * **`:visible` is load-bearing, not tidiness.** The page pre-renders every
   * message it might ever need — "The amount cannot be empty.", "Please enter
   * a valid amount." and "An internal error has occurred…" are all in the
   * markup from the first paint, hidden. So `p.error` matches three elements
   * on a page reporting nothing at all, and asking whether it is visible is a
   * strict-mode violation rather than an answer. Measured, by tripping it.
   *
   * The general shape, worth carrying to the next application: where a form
   * pre-renders its errors, *the presence of an error element is not the
   * presence of an error*, and a locator that does not say so turns a passing
   * transfer into a crash inside the verb.
   */
  // locator-justification: three <p class="error"> exist at once; see above
  error: (page: Page): Locator => page.locator('#rightPanel p.error:visible'),

  /* --- Account activity ---------------------------------------------- */

  /**
   * The transactions table on an account's activity page.
   *
   * Scoped by id for the same reason the overview is: this page renders
   * **three** tables — the account's details, the period filter, and the
   * transactions — and `getByRole('table')` on it is whichever one the DOM
   * offers first. Counted on the running page rather than assumed.
   */
  // locator-justification: the table has no caption and no accessible name
  activityTable: (page: Page): Locator => page.locator('#transactionTable'),

  /**
   * One row per transaction.
   *
   * Filtered to rows holding a link, exactly as the overview's rows are: the
   * header carries none, and a transaction's description is the link to its
   * detail. `getByRole('row')` inside the scoped table rather than a raw
   * `tbody tr` — the lint rule refused the CSS and was right to, because the
   * role is available here and a justification would have been an excuse.
   */
  activityRows: (page: Page): Locator =>
    accountLocators
      .activityTable(page)
      .getByRole('row')
      .filter({ has: page.getByRole('link') }),

  /**
   * The period filter, which defaults to the current month.
   *
   * A transfer made minutes ago is inside that month, so the default is
   * usually enough — and "usually" is what makes a spec fail at midnight on
   * the first of a month. The verb sets it to All.
   */
  // locator-justification: the select has an id and no accessible name
  activityPeriod: (page: Page): Locator => page.locator('#month'),
};
