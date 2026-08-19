import { expect, test, type Page } from '@playwright/test';
import { userLocators } from '../locators/users';

/**
 * L2 — searching the system user list.
 *
 * Read-only throughout, and that is a decision rather than a limitation. This
 * is a shared public demo whose users anybody can edit or delete, so a verb
 * that created one would be changing what every other reader sees — and a spec
 * asserting about a user it did not create would be asserting on data it does
 * not own.
 *
 * **The vocabulary can describe an empty result**, because the spec that
 * searches for nothing needs to say so. A reader that could only describe a
 * populated table would make the negative spec fail at the step confirming it
 * had worked, which is the mistake `actions/cart.ts` records one application
 * back.
 */

export interface UserSearch {
  /** What the application says it found, from its own counter. */
  total: number;
  /** The usernames on the page. One page of `total`, not all of it. */
  usernames: string[];
}

export const users = {
  /**
   * Open the list and wait for it to have arrived.
   *
   * Waits for the Search button rather than the navigation: this application
   * renders its shell immediately and fills the table from a request, so a
   * verb that returned on `goto` read an empty table on a page that was still
   * fetching.
   */
  async open(page: Page): Promise<void> {
    await test.step('Open the system user list', async () => {
      await page.goto('/web/index.php/admin/viewSystemUsers');
      await userLocators.search(page).waitFor({ state: 'visible' });
    });
  },

  /**
   * Filter by username and return what came back.
   *
   * Returns data and asserts nothing, so the same verb serves the spec that
   * expects a match and the one that expects none.
   */
  async searchByUsername(page: Page, username: string): Promise<UserSearch> {
    return test.step(`Search the user list for "${username}"`, async () => {
      await userLocators.username(page).fill(username);
      await userLocators.search(page).click();

      /*
         Wait for the *answer*, not the click. The filter posts and the table
         re-renders, so returning on the click read the table as it was before
         — the "wait for the fact" rule, and the fact here is that the
         application has said how many records it found, or that it found none.
      */
      await expect
        .poll(
          async () =>
            (await userLocators.recordCount(page).count()) > 0 ||
            (await userLocators.noRecords(page).count()) > 0,
          { message: 'the list neither reported a count nor said it found nothing' },
        )
        .toBe(true);

      return users.read(page);
    });
  },

  /**
   * What the list currently shows.
   *
   * **Establishes its own precondition rather than trusting the caller's.**
   * The first version assumed whoever called it had already waited, and it
   * read a table mid-re-render: the count element resolved and then went
   * stale between the two lines, failing inside the verb rather than at an
   * assertion. This is a public verb, callable at any moment, so it waits for
   * the list to be *saying something* — a count, or that it found nothing —
   * before reading either.
   */
  async read(page: Page): Promise<UserSearch> {
    /*
       Read the whole state in one attempt and retry the attempt, rather than
       waiting for a condition and then reading.

       The two-step version raced under parallel load: the poll saw a count
       element, the table re-rendered, and the `textContent` that followed
       timed out on a node that no longer existed — a failure inside the verb,
       reported against a spec that had done nothing wrong. Retrying the whole
       read means a re-render costs an attempt instead of the run.
    */
    let total: number | null = null;
    await expect
      .poll(
        async () => {
          if ((await userLocators.noRecords(page).count()) > 0) {
            total = 0;
            return true;
          }
          const label = await userLocators
            .recordCount(page)
            .first()
            .textContent({ timeout: 2_000 })
            .catch(() => null);
          const parsed = label ? Number(/\((\d+)\)/.exec(label)?.[1] ?? Number.NaN) : Number.NaN;
          if (Number.isNaN(parsed)) return false;
          total = parsed;
          return true;
        },
        { message: 'the user list is neither reporting a count nor saying it found nothing' },
      )
      .toBe(true);

    if (total === 0) return { total: 0, usernames: [] };

    /*
       The username is the second cell: the first is the row's checkbox. Read
       from the row rather than by a per-cell locator, because this table has
       no column headers a locator could anchor on.
    */
    const rows = await userLocators.rows(page).all();
    const usernames: string[] = [];
    for (const row of rows) {
      const cells = await userLocators.cells(row).allTextContents();
      const username = cells[1]?.trim();
      if (username) usernames.push(username);
    }
    return { total: total ?? 0, usernames };
  },

  /**
   * Clear the filters, so a later search is not narrowed by an earlier one.
   *
   * **Waits for the empty-state message to go, not merely for rows to
   * arrive.** Clearing a filter that found nothing re-renders the table while
   * "No Records Found" is still in the DOM, and `read()` checks that first —
   * so a verb that returned as soon as rows existed handed back a total of 0
   * for a list that plainly had five. The fact being waited for is "the list
   * is showing a count again", and that is both halves of it.
   */
  async reset(page: Page): Promise<void> {
    await test.step('Clear the filters', async () => {
      await userLocators.reset(page).click();
      await expect
        .poll(
          async () =>
            (await userLocators.recordCount(page).count()) > 0 &&
            (await userLocators.noRecords(page).count()) === 0,
          { message: 'the list never came back after clearing the filter' },
        )
        .toBe(true);
    });
  },
};
