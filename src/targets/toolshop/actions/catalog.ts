import { test, type Page } from '@playwright/test';
import { pollUntil } from '../../../support/poll';
import { catalogLocators } from '../locators/catalog';
import { navigationLocators } from '../locators/navigation';

export interface CatalogCard {
  name: string;
  price: number;
  /** The application's own id, read off the page — never written down. */
  id: string;
  outOfStock: boolean;
}

export type SortOrder =
  | 'Name (A - Z)'
  | 'Name (Z - A)'
  | 'Price (High - Low)'
  | 'Price (Low - High)';

/**
 * L2 — browsing the storefront.
 *
 * `readCards` is the reason this vocabulary exists at all. Every id in this
 * application is a ULID reseeded whenever the deployment is rebuilt, so a
 * suite that transcribed one would break on the next rebuild and would break
 * *silently*: a wrong-but-well-formed id addresses a real product, just not the
 * one the test meant. Reading ids off the rendered listing is the only version
 * of this that stays true.
 */
export const catalog = {
  async open(page: Page): Promise<void> {
    await test.step('Open the storefront', async () => {
      await page.goto('/');
      await catalogLocators.cards(page).first().waitFor();
    });
  },

  /** Every card on the current page of the listing, in the order shown. */
  async readCards(page: Page): Promise<CatalogCard[]> {
    return test.step('Read the products on the listing', async () => {
      const cards = catalogLocators.cards(page);
      await cards.first().waitFor();
      /*
         Wait for the grid to stop changing before reading it.

         `Locator.count()` does not auto-wait, and this grid renders
         progressively — so waiting for the first card and counting immediately
         catches a half-drawn listing. That produced a comparison between a
         partial read and a complete one, which fails as "these two lists of
         products differ" and sends whoever reads it looking for a sorting bug.

         Two equal samples is enough here because the grid is drawn in one
         Angular change-detection pass; the bound is what stops it hanging.
      */
      let previous = -1;
      const count = await pollUntil(() => cards.count(), {
        description: 'the product grid to stop changing size',
        timeoutMs: 15_000,
        // The poll's own interval is what spaces the two samples. A
        // `waitForTimeout` between them would be a fixed delay by another
        // name, and `no-hard-waits` is right to refuse it.
        intervalMs: 250,
        until: (seen) => {
          const settled = seen > 0 && seen === previous;
          previous = seen;
          return settled;
        },
      });

      const read: CatalogCard[] = [];
      for (let index = 0; index < count; index += 1) {
        const card = cards.nth(index);
        const testId = (await card.getAttribute('data-test')) ?? '';
        read.push({
          id: testId.replace(/^product-/, ''),
          name: (await catalogLocators.cardName(card).textContent())?.trim() ?? '',
          price: parsePrice((await catalogLocators.cardPrice(card).textContent()) ?? ''),
          outOfStock: await catalogLocators.cardOutOfStock(card).isVisible(),
        });
      }
      return read;
    });
  },

  /** Search the catalogue, and return what came back. */
  async search(page: Page, term: string): Promise<CatalogCard[]> {
    return test.step(`Search the catalogue for "${term}"`, async () => {
      await catalogLocators.searchQuery(page).fill(term);
      await catalogLocators.searchSubmit(page).click();
      // The grid re-renders in place; waiting on the network settling is what
      // makes the read below deterministic without a fixed delay.
      await page.waitForLoadState('networkidle');
      return this.readCards(page);
    });
  },

  async clearSearch(page: Page): Promise<void> {
    await test.step('Clear the search', async () => {
      await catalogLocators.searchReset(page).click();
      await page.waitForLoadState('networkidle');
    });
  },

  async sortBy(page: Page, order: SortOrder): Promise<CatalogCard[]> {
    return test.step(`Order the listing by ${order}`, async () => {
      await catalogLocators.sort(page).selectOption({ label: order });
      await page.waitForLoadState('networkidle');
      return this.readCards(page);
    });
  },

  async filterByCategory(page: Page, category: string): Promise<CatalogCard[]> {
    return test.step(`Narrow the listing to ${category}`, async () => {
      await catalogLocators.categoryFilter(page, category).check();
      await page.waitForLoadState('networkidle');
      return this.readCards(page);
    });
  },

  async filterByBrand(page: Page, brand: string): Promise<CatalogCard[]> {
    return test.step(`Narrow the listing to ${brand}`, async () => {
      await catalogLocators.brandFilter(page, brand).check();
      await page.waitForLoadState('networkidle');
      return this.readCards(page);
    });
  },

  async goToPage(page: Page, number: number): Promise<CatalogCard[]> {
    return test.step(`Move to page ${number} of the listing`, async () => {
      await catalogLocators.pageNumber(page, number).click();
      await page.waitForLoadState('networkidle');
      return this.readCards(page);
    });
  },

  /** How many items the cart badge reports, or 0 when it shows nothing. */
  async cartCount(page: Page): Promise<number> {
    const badge = navigationLocators.cartQuantity(page);
    if (!(await badge.isVisible())) return 0;
    return Number((await badge.textContent())?.trim() ?? '0');
  },
};

/** `"$14.15"` → `14.15`. Currency symbol and thousands separators removed. */
export function parsePrice(text: string): number {
  const cleaned = text.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  return Number.parseFloat(cleaned);
}
