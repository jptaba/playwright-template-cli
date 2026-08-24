import { expect, test, type Page } from '@playwright/test';
import { accountLocators } from '../locators/accounts';

/** One transfer, as the application confirmed it. */
export interface TransferReceipt {
  /** Whether the application said it went through. */
  completed: boolean;
  /** The confirmation sentence, or the refusal, exactly as rendered. */
  message: string;
}

/**
 * L2 — accounts, and moving money between two of them.
 *
 * Composes L1, returns data, asserts nothing. Every verb here can describe a
 * *refused* transfer as well as a completed one, which is what lets one
 * vocabulary serve the happy-path, negative and boundary specs instead of
 * three near-copies.
 */
/** One line of an account's activity list, as the application renders it. */
export interface AccountActivity {
  /** The whole row, so a spec can say what it was looking for. */
  description: string;
  /** The amount, or null on a row that carries none. */
  amount: number | null;
}

export const banking = {
  /**
   * Open the overview and wait for the account rows to be there.
   *
   * **Waits for either outcome, and says which.** Waiting only for the rows
   * meant that an overview answering *"An internal error has occurred and has
   * been logged."* — which ParaBank does, its own server returning HTTP 500 —
   * failed as a bare fifteen-second timeout on `#accountTable`. Every spec in
   * this pack then reported a missing table while the application was saying
   * plainly, on screen, what was wrong; triage saw a locator timeout and could
   * not classify it, because the one sentence worth having never reached the
   * error text.
   *
   * The transfer verb already worked this way — complete *or* refused, and
   * report which. This is the same lesson one page earlier: a vocabulary must
   * be able to express every state the application has, and "the application
   * fell over" is one of them.
   */
  async openOverview(page: Page): Promise<void> {
    await test.step('Open the accounts overview', async () => {
      await page.goto('/parabank/overview.htm');

      const rows = accountLocators.rows(page).first();
      const error = accountLocators.error(page).first();
      await expect
        .poll(async () => (await rows.isVisible()) || (await error.isVisible()), {
          message: 'the overview showed neither an account nor an error',
        })
        .toBe(true);

      if (!(await rows.isVisible())) {
        const said = (await error.textContent())?.trim() ?? '';
        throw new Error(`The accounts overview did not load. The application said: "${said}"`);
      }
    });
  },

  /**
   * The account numbers this customer holds, in the order shown.
   *
   * `allTextContents()` on a locator that has been waited for, never a bare
   * `count()` — a table part-way through rendering has a truthful and useless
   * answer, and this list decides which accounts a transfer uses.
   */
  async accountNumbers(page: Page): Promise<string[]> {
    const rows = accountLocators.rows(page);
    await rows.first().waitFor({ state: 'visible' });
    const links = accountLocators.rowAccountLink(rows);
    return (await links.allTextContents()).map((text) => text.trim()).filter(Boolean);
  },

  /**
   * Move money between two accounts and return what the application said.
   *
   * **Waits for the pickers to fill before touching them.** They are populated
   * by script after load and hold no options in the served HTML, so selecting
   * an account too early selects nothing and the transfer quietly uses
   * whatever the browser defaulted to — a wrong answer that looks like a pass.
   */
  async transfer(
    page: Page,
    transfer: { amount: string; from: string; to: string },
  ): Promise<TransferReceipt> {
    return test.step(
      `Transfer ${transfer.amount} from account ${transfer.from} to ${transfer.to}`,
      async () => {
        await page.goto('/parabank/transfer.htm');

        // The fact, not the navigation: at least two options means the pickers
        // have been filled by the script rather than merely rendered empty.
        await expect
          .poll(async () => accountLocators.fromAccountOptions(page).count(), {
            message: 'the account pickers never filled, so there was nothing to transfer between',
          })
          .toBeGreaterThan(1);

        await accountLocators.amount(page).fill(transfer.amount);
        await accountLocators.fromAccount(page).selectOption(transfer.from);
        await accountLocators.toAccount(page).selectOption(transfer.to);
        await accountLocators.transferSubmit(page).click();

        const complete = accountLocators.transferComplete(page);
        const error = accountLocators.error(page);
        await expect
          .poll(
            async () =>
              (await complete.isVisible()) || (await error.isVisible()),
            { message: 'the transfer neither completed nor reported a refusal' },
          )
          .toBe(true);

        if (await complete.isVisible()) {
          return {
            completed: true,
            message: (await accountLocators.transferResult(page).textContent())?.trim() ?? '',
          };
        }
        return { completed: false, message: (await error.textContent())?.trim() ?? '' };
      },
    );
  },

  /**
   * What an account's activity page says happened to it.
   *
   * **The second surface this application offers.** A transfer's own
   * confirmation is the page that made the change agreeing with itself; the
   * activity list is the application asked afterwards, from somewhere else,
   * whether it happened — which is the difference between a rendered message
   * and a recorded fact.
   *
   * The period is set to All rather than left on its default of the current
   * month. A transfer made minutes ago is inside that month, so the default
   * works — right up until a run at one minute past midnight on the first,
   * which is exactly the kind of failure nobody reproduces.
   *
   * Returns every row. Callers filter: this demo is shared, and a verb that
   * decided which transaction mattered would be deciding it for specs that
   * disagree.
   */
  async activity(page: Page, account: string): Promise<AccountActivity[]> {
    return test.step(`Read the activity on account ${account}`, async () => {
      await banking.openOverview(page);
      await accountLocators
        .rowAccountLink(accountLocators.rows(page))
        .filter({ hasText: account })
        .first()
        .click();

      await accountLocators.activityPeriod(page).selectOption({ label: 'All' });
      /*
         The table re-renders on the filter, so anchor on something that waits
         before reading. `count()` does not wait, and a list read mid-render
         answers a truthful zero — which here would read as "the transfer was
         never recorded", the exact false accusation this verb exists to avoid
         making.
      */
      await accountLocators.activityTable(page).waitFor({ state: 'visible' });

      const rows = await accountLocators.activityRows(page).allTextContents();
      return rows
        .map((row) => row.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((row) => {
          const amount = /\$([\d,]+\.\d{2})/.exec(row)?.[1] ?? null;
          return {
            description: row,
            amount: amount === null ? null : Number(amount.replace(/,/g, '')),
          };
        });
    });
  },
};
