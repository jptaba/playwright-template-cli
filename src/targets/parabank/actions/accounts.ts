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
export const banking = {
  /** Open the overview and wait for the account rows to be there. */
  async openOverview(page: Page): Promise<void> {
    await test.step('Open the accounts overview', async () => {
      await page.goto('/parabank/overview.htm');
      await accountLocators.rows(page).first().waitFor({ state: 'visible' });
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
};
