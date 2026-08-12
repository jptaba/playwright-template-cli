import { test, type Page } from '@playwright/test';
import { adminLocators } from '../locators/admin';

/**
 * L2 — the administrator's maintenance screens.
 *
 * Rows are addressed by the name a person reads, never by the id in their test
 * attribute. The attributes on these screens are the strongest argument in the
 * pack for that rule: products expose `product-edit-<id>` while brands expose
 * `brand-<id>-edit` — the same idea with the id in a different place, in the
 * same application, on adjacent screens.
 */
export const admin = {
  async openDashboard(page: Page): Promise<void> {
    await test.step('Open the sales dashboard', async () => {
      await page.goto('/admin/dashboard');
      await adminLocators.pageTitle(page).waitFor();
    });
  },

  /**
   * Every `open*` below waits for the **first maintenance row**, not for the
   * search box or the heading.
   *
   * `Locator.count()` does not auto-wait — it answers for the DOM as it is at
   * that instant. The search box renders before the rows do, so an action that
   * waited only for the box handed back a page whose table was still empty, and
   * `countRows()` truthfully reported zero. The assertion then read "expected
   * > 0, received 0", which points at the application rather than at the race.
   *
   * An action that returns a count has to leave the page in a state that count
   * can be trusted in.
   */
  async openProducts(page: Page): Promise<void> {
    await test.step('Open product maintenance', async () => {
      await page.goto('/admin/products');
      await adminLocators.productSearchQuery(page).waitFor();
      await adminLocators.rows(page).first().waitFor();
    });
  },

  async openBrands(page: Page): Promise<void> {
    await test.step('Open brand maintenance', async () => {
      await page.goto('/admin/brands');
      await adminLocators.brandSearchQuery(page).waitFor();
      await adminLocators.rows(page).first().waitFor();
    });
  },

  async openUsers(page: Page): Promise<void> {
    await test.step('Open customer maintenance', async () => {
      await page.goto('/admin/users');
      await adminLocators.pageTitle(page).waitFor();
      await adminLocators.rows(page).first().waitFor();
    });
  },

  /** The heading of whichever maintenance screen is showing. */
  async currentScreen(page: Page): Promise<string> {
    return (await adminLocators.pageTitle(page).textContent())?.trim() ?? '';
  },

  async searchProducts(page: Page, term: string): Promise<number> {
    return test.step(`Search product maintenance for "${term}"`, async () => {
      await adminLocators.productSearchQuery(page).fill(term);
      await adminLocators.productSearchSubmit(page).click();
      await page.waitForLoadState('networkidle');
      return adminLocators.rows(page).count();
    });
  },

  async searchBrands(page: Page, term: string): Promise<number> {
    return test.step(`Search brand maintenance for "${term}"`, async () => {
      await adminLocators.brandSearchQuery(page).fill(term);
      await adminLocators.brandSearchSubmit(page).click();
      await page.waitForLoadState('networkidle');
      return adminLocators.rows(page).count();
    });
  },

  /** Whether a maintenance row exists for a named record. */
  async hasRow(page: Page, name: string): Promise<boolean> {
    return (await adminLocators.row(page, name).count()) > 0;
  },

  /** How many rows the current maintenance page lists. */
  async countRows(page: Page): Promise<number> {
    return adminLocators.rows(page).count();
  },
};
