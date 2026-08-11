import { test, type Page } from '@playwright/test';
import { inventoryLocators } from '../locators/inventory';
import { navLocators } from '../locators/nav';
import { parseMoney } from '../../../support/money';
import type { CatalogItem, SortOption } from '../data/catalog';

/** L2 — the product listing. */
export const inventory = {
  /** Go to the product listing and wait for it to be ready. */
  async open(page: Page): Promise<void> {
    await test.step('Open the product listing', async () => {
      await page.goto('/inventory.html');
      await inventoryLocators.title(page).waitFor();
    });
  },

  /** Every product currently displayed, in display order. */
  async readDisplayedProducts(page: Page): Promise<CatalogItem[]> {
    return test.step('Read the displayed products', async () => {
      const cards = inventoryLocators.items(page);
      const count = await cards.count();
      const products: CatalogItem[] = [];
      for (let index = 0; index < count; index++) {
        const card = cards.nth(index);
        const name = (await inventoryLocators.itemName(card).textContent())?.trim() ?? '';
        const price = parseMoney(await inventoryLocators.itemPrice(card).textContent());
        products.push({ name, price });
      }
      return products;
    });
  },

  /**
   * Add named products to the cart and return what was added, with the price
   * the store displayed at the time — so a totals assertion compares against
   * observed prices rather than a hard-coded number that drifts.
   */
  async addToCart(page: Page, names: readonly string[]): Promise<CatalogItem[]> {
    return test.step(`Add ${names.length} product(s) to the cart`, async () => {
      const added: CatalogItem[] = [];
      for (const name of names) {
        const card = inventoryLocators.itemByName(page, name);
        const price = parseMoney(await inventoryLocators.itemPrice(card).textContent());
        await inventoryLocators.addToCart(card).click();
        added.push({ name, price });
      }
      return added;
    });
  },

  /** Remove a named product from the cart, from the listing page. */
  async removeFromCart(page: Page, name: string): Promise<void> {
    await test.step(`Remove ${name} from the cart`, async () => {
      await inventoryLocators.removeFromCart(inventoryLocators.itemByName(page, name)).click();
    });
  },

  /** Reorder the listing using the store's own sort control. */
  async sortBy(page: Page, option: SortOption): Promise<void> {
    await test.step(`Sort the listing by ${option}`, async () => {
      await inventoryLocators.sortDropdown(page).selectOption({ label: option });
    });
  },

  /**
   * The number on the cart badge, or 0 when no badge is rendered — the store
   * removes the element entirely at zero rather than showing "0".
   */
  async cartCount(page: Page): Promise<number> {
    const badge = navLocators.cartBadge(page);
    if ((await badge.count()) === 0) return 0;
    const text = (await badge.textContent())?.trim();
    return text ? Number(text) : 0;
  },
};
