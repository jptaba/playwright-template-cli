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

  /* --- Adding a system user ------------------------------------------ */

  /**
   * The Employee Name autocomplete.
   *
   * By placeholder, which is the one thing on this form that *is* an
   * accessible name — every other field's label is unassociated, and this one
   * carries `Type for hints...` on the input itself. Read off the running page
   * after a probe that spent three attempts typing into the sidebar's Search
   * box instead: the add-user form has five textboxes and the first belongs to
   * the navigation.
   */
  employeeName: (page: Page): Locator => page.getByPlaceholder('Type for hints...'),

  /** Suggestions the autocomplete offers. They arrive in a real listbox. */
  employeeSuggestions: (page: Page): Locator => page.getByRole('option'),

  /** The new user's login name — its own group, not the filter of the same name. */
  newUsername: (page: Page): Locator =>
    // locator-justification: labels carry no `for` and inputs no `id`, so the group is the only handle.
    inputGroup(page, 'Username').locator('input'),

  /**
   * Password and its confirmation, in document order.
   *
   * By type rather than by group: both groups contain the word "Password", so
   * a `hasText` filter matches the confirmation twice. The order is the
   * application's own and is asserted by the verb before either is filled.
   */
  // locator-justification: both groups say "Password", so the group is not a handle here.
  passwords: (page: Page): Locator => page.locator('input[type="password"]'),

  /**
   * The two pickers, in document order: User Role, then Status.
   *
   * Neither is a `<select>` — this application draws its own — so there is no
   * combobox role to match and no accessible name to filter on.
   */
  // locator-justification: a div-based picker with no role and no accessible name.
  pickers: (page: Page): Locator => page.locator('.oxd-select-text'),

  save: (page: Page): Locator => page.getByRole('button', { name: 'Save' }),

  /**
   * What the form said was wrong, field by field.
   *
   * The bound this application states about itself — *"Should have at least 7
   * characters"* — arrives here, so a boundary spec reads the rule from the
   * application rather than writing it down.
   */
  // locator-justification: the message has no role and is the only handle on it.
  fieldErrors: (page: Page): Locator => page.locator('.oxd-input-field-error-message'),

  /**
   * The message against **one** field, rather than all of them.
   *
   * `fieldErrors` answers "what did the form object to", which is the right
   * question for a boundary spec reading the application's stated rule. It is
   * the wrong question for a spec claiming *this field* was refused: with two
   * fields in error it returns both, and a spec asserting the username was
   * rejected would pass on a form complaining only about the password.
   *
   * Scoped through the same input group the field itself resolves by, because
   * this application associates neither label nor message with its input — the
   * group is the only thing that puts the three together.
   */
  fieldErrorFor: (page: Page, label: string): Locator =>
    // locator-justification: the message has no role and is not associated with its field.
    inputGroup(page, label).locator('.oxd-input-field-error-message'),

  /** The row for one username, so it can be acted on. */
  rowFor: (page: Page, username: string): Locator =>
    userLocators.rows(page).filter({ hasText: username }),

  /**
   * The delete control on a row, and the dialog it opens.
   *
   * The button carries no text — it is an icon — so it is found by position
   * within its own row rather than by name. Scoped to the row on purpose: an
   * unscoped icon locator deletes whichever user is first.
   */
  // locator-justification: an icon button with no accessible name.
  deleteOn: (row: Locator): Locator => row.locator('.oxd-icon-button').first(),

  confirmDelete: (page: Page): Locator => page.getByRole('button', { name: /Yes, Delete/i }),
};
