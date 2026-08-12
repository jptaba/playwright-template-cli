import { test, type Page } from '@playwright/test';
import { catalogLocators } from '../locators/catalog';
import { navigationLocators } from '../locators/navigation';
import { productLocators } from '../locators/product';
import { parsePrice } from './catalog';

export interface ProductDetail {
  name: string;
  price: number;
  description: string;
  specifications: { name: string; value: string }[];
}

/**
 * L2 — the product detail page.
 *
 * `open` navigates through the listing rather than to a `/product/<id>` URL,
 * for the same reason `catalog.readCards` reads ids off the page: the id in
 * that URL belongs to the application and changes when its data is reseeded.
 * Going through the listing is also what a shopper does, so the journey the
 * spec describes is the journey the test drives.
 */
export const product = {
  async open(page: Page, productName: string): Promise<void> {
    await test.step(`Open the ${productName} product page`, async () => {
      await catalogLocators.card(page, productName).first().click();
      await productLocators.addToCart(page).waitFor();
    });
  },

  /** Everything the detail page states about the product. */
  async readDetail(page: Page): Promise<ProductDetail> {
    return test.step('Read the product details', async () => {
      const rows = productLocators.specRows(page);
      const count = await rows.count();
      const specifications: { name: string; value: string }[] = [];
      for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        specifications.push({
          name: (await productLocators.specName(row).textContent())?.trim() ?? '',
          value: (await productLocators.specValue(row).textContent())?.trim() ?? '',
        });
      }

      return {
        name: (await productLocators.name(page).textContent())?.trim() ?? '',
        price: parsePrice((await productLocators.price(page).textContent()) ?? ''),
        description: (await productLocators.description(page).textContent())?.trim() ?? '',
        specifications,
      };
    });
  },

  /**
   * Put the open product in the cart and return the badge count afterwards.
   *
   * The badge is read *after* it changes rather than immediately: the cart is
   * written through the API, so the number lags the click by a round trip, and
   * reading it too early is the classic source of an off-by-one flake.
   */
  async addToCart(page: Page, quantity = 1): Promise<number> {
    return test.step(`Add ${quantity} to the cart`, async () => {
      const before = await currentCartCount(page);
      if (quantity > 1) {
        await productLocators.quantity(page).fill(String(quantity));
      }
      await productLocators.addToCart(page).click();
      await navigationLocators.cartQuantity(page).waitFor();
      return waitForCartCountAbove(page, before);
    });
  },

  /**
   * Save the open product to favourites, and return what the application
   * announced — "Product added to your favorites list." on success, or the
   * refusal when it is already there.
   *
   * Returns the message rather than asserting it: whether "already a
   * favourite" is a pass is the spec's call, and on a shared account it very
   * often is.
   */
  async addToFavourites(page: Page): Promise<string | null> {
    return test.step('Save the product to favourites', async () => {
      await productLocators.addToFavourites(page).click();
      const toast = navigationLocators.toast(page);
      await toast.waitFor().catch(() => undefined);
      if (!(await toast.isVisible())) return null;
      return (await toast.textContent())?.trim() ?? null;
    });
  },

  /** The quantity currently shown in the stepper on the detail page. */
  async readQuantity(page: Page): Promise<number> {
    return Number((await productLocators.quantity(page).inputValue()) || '0');
  },

  async increaseQuantity(page: Page, times = 1): Promise<void> {
    await test.step(`Raise the quantity by ${times}`, async () => {
      for (let index = 0; index < times; index += 1) {
        await productLocators.increaseQuantity(page).click();
      }
    });
  },

  async decreaseQuantity(page: Page, times = 1): Promise<void> {
    await test.step(`Lower the quantity by ${times}`, async () => {
      for (let index = 0; index < times; index += 1) {
        await productLocators.decreaseQuantity(page).click();
      }
    });
  },

  /** The message the application announces after an action, or null. */
  async readNotification(page: Page): Promise<string | null> {
    const toast = navigationLocators.toast(page);
    if (!(await toast.isVisible())) return null;
    return (await toast.textContent())?.trim() ?? null;
  },
};

async function currentCartCount(page: Page): Promise<number> {
  const badge = navigationLocators.cartQuantity(page);
  if (!(await badge.isVisible())) return 0;
  return Number((await badge.textContent())?.trim() ?? '0');
}

/**
 * Wait for the badge to move past a known value.
 *
 * A poll rather than a delay: the cart is written server-side, and "the number
 * went up" is an eventually-consistent fact. Expressed this way it fails as a
 * timeout with a readable message instead of producing an off-by-one result.
 */
async function waitForCartCountAbove(page: Page, previous: number): Promise<number> {
  const badge = navigationLocators.cartQuantity(page);
  await badge.filter({ hasNotText: String(previous) }).waitFor().catch(() => undefined);
  return Number((await badge.textContent())?.trim() ?? '0');
}
