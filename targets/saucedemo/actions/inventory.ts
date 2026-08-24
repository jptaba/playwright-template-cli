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

  /**
   * Add one product, or several.
   *
   * Several rather than a loop in the spec, because this application's control
   * *toggles*: the same call on a product already in the cart removes it. A
   * spec that wants "everything, then nothing again" says so twice, and the
   * step titles read as the two intentions they are rather than as twelve
   * clicks.
   */
  async addToCart(page: Page, name: string | string[]): Promise<void> {
    const names = Array.isArray(name) ? name : [name];
    await test.step(`Add ${names.map((one) => `"${one}"`).join(', ')} to the cart`, async () => {
      for (const one of names) await inventoryLocators.addToCart(page, one).click();
    });
  },

  /**
   * Take products back out.
   *
   * Its own verb rather than calling `addToCart` twice: the control is
   * replaced rather than toggled, so a second add finds no button at all.
   */
  async removeFromCart(page: Page, name: string | string[]): Promise<void> {
    const names = Array.isArray(name) ? name : [name];
    await test.step(`Remove ${names.map((one) => `"${one}"`).join(', ')} from the cart`, async () => {
      for (const one of names) await inventoryLocators.removeFromCart(page, one).click();
    });
  },

  /**
   * Whether this product is in the cart, asked of the control it offers.
   *
   * The application answers by *replacing* Add with Remove, so this is the
   * application's own account of the cart rather than a count inferred from
   * the badge — which is what makes "adding it again is not possible" a claim
   * a spec can make at all.
   */
  async isInCart(page: Page, name: string): Promise<boolean> {
    return inventoryLocators.removeFromCart(page, name).isVisible();
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
