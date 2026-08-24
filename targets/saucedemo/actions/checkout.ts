import { test, type Page } from '@playwright/test';
import { checkoutLocators } from '../locators/checkout';

export interface DeliveryDetails {
  firstName: string;
  lastName: string;
  postalCode: string;
}

/**
 * L2 — the cart and the first step of checkout.
 *
 * Composes locators, returns data, asserts nothing.
 */
export const checkout = {
  async openCart(page: Page): Promise<void> {
    await test.step('Open the cart', async () => {
      await checkoutLocators.cartLink(page).click();
    });
  },

  async proceedToCheckout(page: Page): Promise<void> {
    await test.step('Proceed to checkout', async () => {
      await checkoutLocators.checkoutButton(page).click();
    });
  },

  async provideDeliveryDetails(page: Page, details: DeliveryDetails): Promise<void> {
    await test.step('Provide delivery details', async () => {
      await checkoutLocators.firstName(page).fill(details.firstName);
      await checkoutLocators.lastName(page).fill(details.lastName);
      await checkoutLocators.postalCode(page).fill(details.postalCode);
      await checkoutLocators.continueButton(page).click();
    });
  },

  /**
   * What the order summary says was bought, and what it charges for it.
   *
   * The summary is the nearest thing this application has to a second surface:
   * there is no service to ask whether a change was recorded, so the audit a
   * spec can make here is that the page which *computes the money* agrees with
   * what was put in the cart on a different page.
   *
   * Waits on the first row rather than counting straight away — `count()` does
   * not wait, and a summary read mid-render answers a truthful zero.
   */
  async readSummary(page: Page): Promise<{ products: string[]; itemTotal: number }> {
    return test.step('Read the order summary', async () => {
      await checkoutLocators.summaryItems(page).first().waitFor();
      const products = (await checkoutLocators.summaryItems(page).allTextContents()).map((name) =>
        name.trim(),
      );
      const label = (await checkoutLocators.itemTotal(page).textContent())?.trim() ?? '';
      // "Item total: $39.98" — the number is the only part worth returning, and
      // parsing it here keeps every spec from re-deriving the same slice.
      const itemTotal = Number(label.replace(/[^0-9.]/g, ''));
      return { products, itemTotal };
    });
  },

  /** The validation error the step reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = checkoutLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },
};
