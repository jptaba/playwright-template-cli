import { test, type Page } from '@playwright/test';
import { cartLocators } from '../locators/cart';
import { checkoutLocators } from '../locators/checkout';
import { navLocators } from '../locators/nav';
import { parseMoney } from '../../../support/money';
import type { Customer, OrderTotals } from '../data/catalog';

export interface OrderConfirmation {
  heading: string;
  detail: string;
}

/** L2 — cart and the three checkout steps. */
export const checkout = {
  /** Open the cart from the header badge. */
  async openCart(page: Page): Promise<void> {
    await test.step('Open the cart', async () => {
      await navLocators.cartLink(page).click();
      await cartLocators.list(page).waitFor();
    });
  },

  /** Product names currently in the cart, in display order. */
  async readCartContents(page: Page): Promise<string[]> {
    return test.step('Read the cart contents', async () => {
      const names = await cartLocators
        .items(page)
        .getByTestId('inventory-item-name')
        .allTextContents();
      return names.map((name) => name.trim());
    });
  },

  /** Remove a named product from the cart page itself. */
  async removeFromCart(page: Page, name: string): Promise<void> {
    await test.step(`Remove ${name} from the cart`, async () => {
      await cartLocators.removeFromCart(cartLocators.itemByName(page, name)).click();
    });
  },

  /** Return to the product listing, keeping the cart as it is. */
  async continueShopping(page: Page): Promise<void> {
    await test.step('Return to the product listing', async () => {
      await cartLocators.continueShopping(page).click();
    });
  },

  /** Leave the cart and start the checkout flow. */
  async proceedToCheckout(page: Page): Promise<void> {
    await test.step('Start checkout', async () => {
      await cartLocators.checkout(page).click();
    });
  },

  /** Fill checkout step one and continue to the order overview. */
  async provideDeliveryDetails(page: Page, customer: Customer): Promise<void> {
    await test.step('Provide delivery details', async () => {
      await checkoutLocators.firstName(page).fill(customer.firstName);
      await checkoutLocators.lastName(page).fill(customer.lastName);
      await checkoutLocators.postalCode(page).fill(customer.postalCode);
      await checkoutLocators.continue(page).click();
    });
  },

  /** Abandon checkout step one and return to the cart. */
  async cancelCheckout(page: Page): Promise<void> {
    await test.step('Abandon checkout', async () => {
      await checkoutLocators.cancel(page).click();
    });
  },

  /** The checkout error banner text, or null when the step reported no error. */
  async readCheckoutError(page: Page): Promise<string | null> {
    const banner = checkoutLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },

  /** The three figures on the overview step, as numbers. */
  async readOrderTotals(page: Page): Promise<OrderTotals> {
    return test.step('Read the order totals', async () => ({
      subtotal: parseMoney(await checkoutLocators.subtotalLabel(page).textContent()),
      tax: parseMoney(await checkoutLocators.taxLabel(page).textContent()),
      total: parseMoney(await checkoutLocators.totalLabel(page).textContent()),
    }));
  },

  /**
   * Cart → delivery details → overview, stopping before the order is placed.
   * The composite exists because five specs need the same four steps to reach
   * the one screen they are actually about.
   */
  async completeThroughOverview(page: Page, customer: Customer): Promise<OrderTotals> {
    return test.step('Check out as far as the order overview', async () => {
      await checkout.openCart(page);
      await checkout.proceedToCheckout(page);
      await checkout.provideDeliveryDetails(page, customer);
      return checkout.readOrderTotals(page);
    });
  },

  /** Confirm the order and return the confirmation the store displayed. */
  async placeOrder(page: Page): Promise<OrderConfirmation> {
    return test.step('Place the order', async () => {
      await checkoutLocators.finish(page).click();
      return {
        heading: (await checkoutLocators.completeHeader(page).textContent())?.trim() ?? '',
        detail: (await checkoutLocators.completeText(page).textContent())?.trim() ?? '',
      };
    });
  },
};
