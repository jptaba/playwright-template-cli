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

/** A system user to create. Role and status are the application's own words. */
export interface NewUser {
  username: string;
  password: string;
  role: 'Admin' | 'ESS';
  status: 'Enabled' | 'Disabled';
}

/** What the add-user form did: saved, or refused with its reasons. */
export interface UserSaveResult {
  saved: boolean;
  /** The application's own messages, which is where its stated bounds arrive. */
  errors: string[];
}

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
         Wait for the *answer*, not the click — and the answer is not "a count
         exists".

         The first version polled until the application had reported a count or
         said it found nothing. Both are already true before the search runs:
         arriving on this page shows every user and a count of them. So the
         poll returned instantly and the table was read exactly as it was
         before the filter, which is the mistake this comment was written to
         warn about. Caught by a spec that created a user and searched for it:
         the count came back as 30, the whole list.

         The fact worth waiting for is that the rows *match* — every username
         on screen contains what was searched for, or the application says it
         found none.
      */
      await expect
        .poll(
          async () => {
            if ((await userLocators.noRecords(page).count()) > 0) return true;
            const shown = (await users.read(page)).usernames;
            return shown.length > 0 && shown.every((name) => name.includes(username));
          },
          { message: `the list never narrowed to rows matching "${username}"` },
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

  /**
   * Add a system user, and return what the form did about it.
   *
   * **Returns a refusal as readily as a success**, which is what lets one verb
   * serve the boundary spec and the audit spec instead of two near-copies —
   * the same discipline `parabank`'s transfer verb keeps one target over.
   *
   * The employee is *derived*, never transcribed: the field is an autocomplete
   * and the verb takes whatever the application offers for a single letter. A
   * written-down employee name is a hallucinated locator in another costume,
   * and it fails the day this demo reseeds.
   */
  async add(page: Page, user: NewUser): Promise<UserSaveResult> {
    return test.step(`Add the system user "${user.username}"`, async () => {
      await page.goto('/web/index.php/admin/saveSystemUser');
      await userLocators.save(page).waitFor({ state: 'visible' });

      const pickers = userLocators.pickers(page);
      await pickers.nth(0).click();
      await page.getByRole('option', { name: user.role, exact: true }).click();
      await pickers.nth(1).click();
      await page.getByRole('option', { name: user.status, exact: true }).click();

      /*
         Whatever this application has, rather than whoever it had last month —
         and **not the first thing the dropdown offers**, which is the trap
         here.

         The autocomplete renders an option reading *"Searching...."* while it
         fetches, so waiting for "an option is visible" and clicking it selects
         the placeholder. The field then keeps the single letter that was
         typed, the form refuses with a bare *"Invalid"* against Employee Name,
         and the spec reports a password rule that was never reached. Measured:
         the clicked option's text was `"Searching...."` and the field's value
         afterwards was `"a"`.

         So it waits for the *answer* rather than for a render, and then
         confirms the field holds the name it picked. Both are waits, not
         assertions about the application's behaviour.
      */
      await userLocators.employeeName(page).pressSequentially('a', { delay: 120 });
      const suggestions = userLocators.employeeSuggestions(page);
      await expect
        .poll(
          async () => {
            const offered = await suggestions.allTextContents();
            return offered.length > 0 && !offered.some((text) => /searching/i.test(text));
          },
          { message: 'the employee autocomplete never got past "Searching...."' },
        )
        .toBe(true);

      const employee = (await suggestions.first().textContent())?.trim() ?? '';
      await suggestions.first().click();
      await expect(userLocators.employeeName(page)).toHaveValue(employee);

      await userLocators.newUsername(page).fill(user.username);
      const passwords = userLocators.passwords(page);
      await expect(passwords, 'the form should have a password and a confirmation').toHaveCount(2);
      await passwords.nth(0).fill(user.password);
      await passwords.nth(1).fill(user.password);

      await userLocators.save(page).click();

      /*
         Saved or refused, and the verb waits for whichever arrives. A save
         leaves the form for the list; a refusal stays and puts a message under
         the field. Waiting only for the list would report a refused save as a
         timeout, which reads as the application being broken.
      */
      const errors = userLocators.fieldErrors(page);
      // `viewSystemUsers`, and the case matters: the form itself is at
      // `saveSystemUser`, so a case-insensitive match on the shorter word
      // would call every refusal a save.
      const onTheList = (): boolean => /viewSystemUsers/.test(page.url());
      await expect
        .poll(async () => onTheList() || (await errors.first().isVisible()), {
          message: 'the form neither saved nor said what was wrong',
        })
        .toBe(true);

      if (onTheList()) return { saved: true, errors: [] };
      return {
        saved: false,
        errors: (await errors.allTextContents()).map((message) => message.trim()),
      };
    });
  },

  /**
   * What the form said about **one** field, or null when it said nothing.
   *
   * `add` already returns every message the form produced, which is what a
   * boundary spec wants — it reads the application's own stated rule out of
   * them. This is for the narrower claim: *this field* was refused, and here is
   * what it was told. A spec asserting the username was rejected should not be
   * satisfied by a form complaining about the password.
   *
   * `isVisible()` rather than a wait, for the reason `signIn.isSignedIn`
   * records: this is asked after a *successful* save too, where the honest
   * answer is "nothing" and waiting fifteen seconds for it is a waste.
   */
  async fieldError(page: Page, field: string): Promise<string | null> {
    const message = userLocators.fieldErrorFor(page, field);
    if (!(await message.isVisible())) return null;
    return (await message.textContent())?.trim() ?? null;
  },

  /**
   * Remove a system user, by the name it was created with.
   *
   * Everything this suite creates gets cleaned up: this demo is shared, it
   * reseeds on its own schedule rather than ours, and a run that left a user
   * behind every time would slowly become the reason somebody else's spec
   * fails.
   *
   * **Establishes its own precondition, rather than trusting the caller to be
   * on the list** — the same lesson `read` records above, which this verb had
   * not learned. It went straight to `searchByUsername`, which fills the filter
   * and clicks Search; on any page that is not the list there is no Search
   * button, so cleanup died as a 15-second timeout attributed to the step that
   * was tidying up rather than to the state it was tidying up from. A spec
   * whose `add` was *refused* is left on the add-user form, which is exactly
   * when a negative case reaches its `finally` — so the one shape that could
   * not clean up was the one that most needed to.
   *
   * **Navigates only when it has to.** This runs in a `finally` on every spec
   * that creates a user, and an unconditional `goto` puts a full page load into
   * each of them against a shared demo that is already slow. Sampling whether
   * the Search control is on screen is immediate — it asks where the page is
   * now, rather than waiting for it to become somewhere — so the common case,
   * where the caller is already on the list, costs nothing.
   */
  async remove(page: Page, username: string): Promise<void> {
    await test.step(`Remove the system user "${username}"`, async () => {
      const onTheList = await userLocators
        .search(page)
        .isVisible()
        .catch(() => false);
      if (!onTheList) await users.open(page);

      await users.searchByUsername(page, username);
      const row = userLocators.rowFor(page, username);
      if ((await row.count()) === 0) return;

      await userLocators.deleteOn(row.first()).click();
      await userLocators.confirmDelete(page).click();

      // The fact, not the click: the row leaving is what says it is gone.
      await expect(userLocators.rowFor(page, username)).toHaveCount(0);
    });
  },
};
