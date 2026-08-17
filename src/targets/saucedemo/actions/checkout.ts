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

  /** The validation error the step reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = checkoutLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },
};
