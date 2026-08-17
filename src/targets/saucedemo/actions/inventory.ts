import { test, type Page } from '@playwright/test';
import { inventoryLocators } from '../locators/inventory';

/**
 * L2 — browsing the listing and adding to the cart.
 *
 * Composes locators, returns data, asserts nothing.
 */
export const inventory = {
  async open(page: Page): Promise<void> {
    await test.step('Open the product listing', async () => {
      /*
         `/` always renders the login form here, session or not — this
         application does not auto-redirect a signed-in visitor away from it.
         `/inventory.html` is itself a client-side route behind a GitHub
         Pages 404 redirect, so the first card appearing is the fact worth
         waiting for, not the navigation.
      */
      await page.goto('/inventory.html');
      await inventoryLocators.items(page).first().waitFor({ state: 'visible' });
    });
  },

  /** The names on the listing, in the order shown. */
  async productNames(page: Page): Promise<string[]> {
    const names = await inventoryLocators.name(page).allTextContents();
    return names.map((name) => name.trim());
  },

  async addToCart(page: Page, name: string): Promise<void> {
    await test.step(`Add "${name}" to the cart`, async () => {
      await inventoryLocators.addToCart(page, name).click();
    });
  },

  /** The number on the cart badge, or 0 when the cart is empty. */
  async cartCount(page: Page): Promise<number> {
    const badge = inventoryLocators.cartBadge(page);
    if (!(await badge.isVisible())) return 0;
    return Number((await badge.textContent())?.trim() ?? '0');
  },

  async sortBy(page: Page, label: string): Promise<void> {
    await test.step(`Sort by "${label}"`, async () => {
      await inventoryLocators.sort(page).selectOption({ label });
    });
  },

  /** Name and price for every card, in the order shown. */
  async displayedProducts(page: Page): Promise<{ name: string; price: number }[]> {
    const names = await inventoryLocators.name(page).allTextContents();
    const prices = await inventoryLocators.price(page).allTextContents();
    return names.map((name, index) => ({
      name: name.trim(),
      price: Number(prices[index]!.replace('$', '')),
    }));
  },
};
