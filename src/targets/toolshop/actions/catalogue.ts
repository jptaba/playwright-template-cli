import { expect, test, type Page } from '@playwright/test';
import { catalogueLocators, productLocators } from '../locators/catalogue';

/**
 * L2 — browsing and searching the catalogue.
 *
 * Composes locators, returns data, asserts nothing. What comes back is what a
 * spec makes its claim about.
 */
export const catalogue = {
  async open(page: Page): Promise<void> {
    await test.step('Open the product catalogue', async () => {
      await page.goto('/');
      /*
         The grid *settled*, not "a card exists".

         `count()` does not wait, so a listing part-way through rendering has a
         truthful and useless count — and `search()` captures that count to
         decide later whether the results changed. Anchoring on the first card
         left a window where the number was 3 of an eventual 9, which makes the
         comparison after the search meaningless and fails somewhere else
         entirely.
      */
      await catalogueLocators.cards(page).first().waitFor({ state: 'visible' });
      let settled = -1;
      await expect
        .poll(
          async () => {
            const now = await catalogueLocators.cards(page).count();
            const stable = now > 0 && now === settled;
            settled = now;
            return stable;
          },
          { message: 'the product listing never stopped changing' },
        )
        .toBe(true);
    });
  },

  /**
   * The names on the listing, in the order shown.
   *
   * `allTextContents()` on a locator that has been waited for — never a bare
   * `count()`, which answers for the DOM as it is at that instant.
   */
  async productNames(page: Page): Promise<string[]> {
    const names = await catalogueLocators.cards(page).allTextContents();
    return names.map((name) => name.trim());
  },

  /** Whether the search reported that nothing matched. */
  async foundNothing(page: Page): Promise<boolean> {
    return catalogueLocators.noResults(page).isVisible();
  },

  /**
   * Search, and return what came back.
   *
   * Waits for the *answer* rather than for the network: either a card or the
   * "no results" caption is on screen when this returns, so a caller counting
   * results cannot read a listing mid-render. `networkidle` returned while the
   * previous results were still on screen.
   */
  async search(page: Page, term: string): Promise<string[]> {
    return test.step(`Search the catalogue for "${term}"`, async () => {
      const before = await catalogueLocators.cards(page).count();
      await catalogueLocators.search(page).fill(term);
      await catalogueLocators.searchSubmit(page).click();

      /*
         Two waits, and both are needed.

         The caption first: it does not exist until a search has answered.
         "A card is on screen" was the first attempt and is already true
         *before* the search runs, so it returned instantly and read the
         unfiltered listing — the spec then reported that searching for
         "pliers" returned "Bolt Cutters", which reads as an application defect
         and is not one.

         Then the grid, because the caption updates about 800ms before it does.
         Measured, not assumed: at +300ms the caption said "zzzqqqxxx" and nine
         unrelated products were still on screen. The grid has answered when
         either nothing matched, or the number of cards has changed from what
         was there before — never simply "there are cards", which is the same
         mistake one level down.
      */
      await expect(catalogueLocators.searchedFor(page)).toHaveText(term);
      await expect
        .poll(
          async () => {
            if (await catalogueLocators.noResults(page).isVisible()) return true;
            const now = await catalogueLocators.cards(page).count();
            return now > 0 && now !== before;
          },
          {
            message:
              'the listing never changed after the search. A term that returns exactly as many ' +
              'products as were already on screen would look like this.',
          },
        )
        .toBe(true);

      return catalogue.productNames(page);
    });
  },

  /** Open one product by the name printed on its card. */
  async openProduct(page: Page, name: string): Promise<void> {
    await test.step(`Open "${name}"`, async () => {
      await catalogueLocators.card(page, name).first().click();
      await expect(productLocators.name(page)).toHaveText(name);
    });
  },

  /** What the product page says about itself. */
  async readProduct(page: Page): Promise<{ name: string; price: number }> {
    const name = (await productLocators.name(page).textContent())?.trim() ?? '';
    const price = (await productLocators.price(page).textContent())?.trim() ?? '';
    return { name, price: Number(price.replace(/[^0-9.]/g, '')) };
  },
};
