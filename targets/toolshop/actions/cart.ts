import { expect, test, type Page } from '@playwright/test';
import { cartLocators } from '../locators/cart';
import { productLocators } from '../locators/catalogue';

/** One line of the cart, as the application renders it. */
export interface CartLine {
  product: string;
  quantity: number;
  total: number;
}

/**
 * L2 — the cart.
 *
 * **This vocabulary can describe an empty cart, and that is deliberate.** The
 * first version could only describe a cart with something in it, which made
 * the spec that empties the cart fail at the step confirming it had worked —
 * the verb had no way to say "nothing", so it timed out waiting for a row.
 */
export const cart = {
  /** Add whatever product page is open. Returns the name that was added. */
  async addOpenProduct(page: Page, quantity = 1): Promise<string> {
    const name = (await productLocators.name(page).textContent())?.trim() ?? '';
    return test.step(`Add ${quantity} × "${name}" to the cart`, async () => {
      /*
         Read through `count()` first: the badge is *absent* on an empty cart
         rather than showing zero, and `textContent()` on an element that is
         not there waits fifteen seconds and then throws.
      */
      const before = (await cartLocators.navQuantity(page).count())
        ? Number((await cartLocators.navQuantity(page).textContent())?.trim() || '0')
        : 0;
      for (let i = 1; i < quantity; i += 1) await productLocators.increaseQuantity(page).click();
      await productLocators.addToCart(page).click();

      /*
         Wait for the badge, because a click is not an addition.
         `addToCart` posts to the server, and returning as soon as the click
         was delivered let the next step navigate away and cancel the request
         in flight — the cart page then showed nothing and the spec reported
         "expected 1 line, received 0", which reads as an application defect.
      */
      await expect
        .poll(
          async () => {
            if (!(await cartLocators.navQuantity(page).count())) return before;
            return Number((await cartLocators.navQuantity(page).textContent())?.trim() || '0');
          },
          { message: 'the cart badge never went up, so the product was not added' },
        )
        .toBeGreaterThan(before);
      return name;
    });
  },

  async open(page: Page): Promise<void> {
    await test.step('Open the cart', async () => {
      await page.goto('/checkout');
      /*
         Two facts, and the cart has arrived when either is true.

         Waiting for the table alone timed out for fifteen seconds on a cart
         that was simply empty — an empty cart renders no table at all. Waiting
         for the stepper alone was the correction and it was too weak in the
         other direction: the stepper is static markup that renders
         immediately, while the table comes from a request, so a cart with
         something in it read as empty and the spec reported "expected 1 line,
         received 0".

         The settled states are "the table is here" and "the badge says the
         cart is empty". Anything else is still loading.
      */
      await cartLocators.page(page).waitFor({ state: 'visible' });
      await expect
        .poll(
          async () =>
            (await cartLocators.table(page).count()) > 0 ||
            (await cartLocators.navQuantity(page).count()) === 0,
          { message: 'the cart page never settled into either holding items or being empty' },
        )
        .toBe(true);
    });
  },

  /**
   * Whether the cart holds nothing.
   *
   * Safe to read straight after `open()` because that waited for the page. A
   * `count()` on its own does not wait, and this is the one place that is the
   * right behaviour: "is there a table" is a question about a page that has
   * already settled.
   */
  async isEmpty(page: Page): Promise<boolean> {
    return (await cartLocators.table(page).count()) === 0;
  },

  /**
   * Every line in the cart, or an empty list.
   *
   * Anchored on the table first, which waits. `count()` on its own answers for
   * the DOM at that instant and would report a truthful zero for a cart that
   * has not finished rendering — and the assertion then reads "expected 1,
   * received 0", which points at the application.
   */
  async lines(page: Page): Promise<CartLine[]> {
    /*
       An empty cart is a state this vocabulary can describe, and that is not a
       nicety: the spec that empties the cart asserts on the result, and a
       reader that could only describe a *non-empty* cart made the equivalent
       spec on a previous target fail at the step confirming it had worked.
    */
    if (await cart.isEmpty(page)) return [];

    const rows = cartLocators.lines(page);
    const count = await rows.count();

    const lines: CartLine[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const cells = await row.getByRole('cell').allTextContents();
      lines.push({
        product: (cells[0] ?? '').trim(),
        quantity: Number(await cartLocators.quantity(page, (cells[0] ?? '').trim()).inputValue()),
        total: Number((cells[3] ?? '').replace(/[^0-9.]/g, '')),
      });
    }
    return lines;
  },

  /** What the application says the order comes to. */
  async total(page: Page): Promise<number> {
    const shown = (await cartLocators.total(page).textContent())?.trim() ?? '';
    return Number(shown.replace(/[^0-9.]/g, ''));
  },

  /**
   * Take a product back out, and wait for it to be gone.
   *
   * `waitFor({ state: 'detached' })` rather than a network wait: `networkidle`
   * returned while the removed row was still in the table, and the step is
   * about the row leaving.
   */
  async remove(page: Page, product: string): Promise<void> {
    await test.step(`Remove "${product}" from the cart`, async () => {
      const line = cartLocators.line(page, product);
      await cartLocators.remove(page, product).click();
      await line.waitFor({ state: 'detached' });
    });
  },

  /**
   * Leave the cart as it was found — empty.
   *
   * The account pool is static and `serverState` is true, so the cart belongs
   * to an identity every other worker also signs in as. A spec that adds
   * without removing hands the next one a cart with an item too many, and the
   * failure lands on whichever spec lost the race.
   */
  async empty(page: Page): Promise<void> {
    await test.step('Leave the cart empty', async () => {
      /*
         Not swallowed. The first version wrapped this in `.catch(() => …)`,
         and when the remove locator matched nothing the failure vanished and
         the poll below spun until it timed out with "the cart still had lines
         in it" — a message about the application, describing a broken locator.
      */
      for (const line of await cart.lines(page)) {
        await cart.remove(page, line.product);
      }
      await expect
        .poll(async () => (await cart.lines(page)).length, {
          message: 'the cart still had lines in it after emptying',
        })
        .toBe(0);
    });
  },
};
