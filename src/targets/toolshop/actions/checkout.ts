import { test, type Page } from '@playwright/test';
import { cartLocators, checkoutLocators } from '../locators/checkout';
import { navigationLocators } from '../locators/navigation';
import { parsePrice } from './catalog';

export interface CartLine {
  name: string;
  quantity: number;
  unitPrice: number;
  linePrice: number;
}

export interface CartContents {
  lines: CartLine[];
  total: number;
}

export interface BillingAddress {
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
}

export type PaymentMethod =
  | 'Bank Transfer'
  | 'Cash on Delivery'
  | 'Credit Card'
  | 'Buy Now Pay Later'
  | 'Gift Card';

/**
 * L2 — the cart and the four-step checkout wizard.
 *
 * Every per-line read is scoped to its row inside `cart.ts`. The first version
 * of this vocabulary on another target read the whole page instead and
 * returned the product catalogue where the cart was meant to be — no error, no
 * timeout, just a plausible wrong answer. Scoping is the only defence, because
 * the failure mode is a passing test.
 */
export const checkout = {
  async openCart(page: Page): Promise<void> {
    await test.step('Open the cart', async () => {
      await navigationLocators.cart(page).click();
      // Wait for the cart's own total, not for "a table": the page this click
      // starts from has a table of its own, and waiting for that one is how the
      // read below ended up describing product specifications as cart lines.
      await cartLocators.total(page).waitFor();
    });
  },

  /**
   * Everything the cart currently holds, read line by line.
   *
   * An empty cart is a legitimate state and reads as `{ lines: [], total: 0 }`.
   * The first version could only describe a cart with something in it: when a
   * spec removed the last line, the total cell it read stopped existing and the
   * read timed out — so the spec about emptying the cart failed at the step
   * that was supposed to confirm it had worked. A vocabulary that cannot
   * express a state the application has is a vocabulary every spec reaching
   * that state has to work around.
   */
  async readCart(page: Page): Promise<CartContents> {
    return test.step('Read the cart contents', async () => {
      const totalCell = cartLocators.total(page);
      if ((await totalCell.count()) === 0) return { lines: [], total: 0 };

      const rows = cartLocators.rows(page);
      const count = await rows.count();

      const lines: CartLine[] = [];
      for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        lines.push({
          name: (await cartLocators.rowTitle(row).textContent())?.trim() ?? '',
          quantity: Number((await cartLocators.rowQuantity(row).inputValue()) || '0'),
          unitPrice: parsePrice((await cartLocators.rowUnitPrice(row).textContent()) ?? ''),
          linePrice: parsePrice((await cartLocators.rowLinePrice(row).textContent()) ?? ''),
        });
      }

      return {
        lines,
        total: parsePrice((await cartLocators.total(page).textContent()) ?? ''),
      };
    });
  },

  async changeQuantity(page: Page, productName: string, quantity: number): Promise<void> {
    await test.step(`Order ${quantity} of ${productName}`, async () => {
      const row = cartLocators.row(page, productName);
      await cartLocators.rowQuantity(row).fill(String(quantity));
      await cartLocators.rowQuantity(row).press('Tab');
      await page.waitForLoadState('networkidle');
    });
  },

  async removeLine(page: Page, productName: string): Promise<void> {
    await test.step(`Take ${productName} out of the cart`, async () => {
      const row = cartLocators.row(page, productName);
      await cartLocators.rowRemove(row).click();
      /*
         Wait for the row to go, not for the network to settle.

         `networkidle` returned while the table still held the old row, so the
         read that followed reported the product as present and the spec failed
         claiming the removal had not worked. Waiting on the fact — this row is
         gone — is both the correct synchronisation and the one that fails with
         a message about the right thing.
      */
      await row.waitFor({ state: 'detached' });
    });
  },

  /**
   * Advance the wizard as far as the billing step, filling the address on the
   * way. Stops short of paying, so a spec can inspect what the order is about
   * to become before committing to it.
   */
  async proceedToPayment(page: Page, address: BillingAddress): Promise<void> {
    await test.step('Check out as far as the payment step', async () => {
      await checkoutLocators.proceedFrom(page, 1).click();
      await checkoutLocators.proceedFrom(page, 2).click();
      await checkoutLocators.country(page).waitFor();

      /*
         Country first, then the postcode.

         Filling the postcode and house number starts an address lookup, and
         while it is in flight the country select is disabled. Setting country
         last meant waiting fifteen seconds for a control that was disabled by
         the field filled two lines earlier — and the failure reads as "element
         never became enabled", which points at the select rather than at the
         lookup that owns it.
      */
      /*
         Checked before selecting, so a label that is not in the list fails as
         "the country list has no 'Netherlands'" rather than as a fifteen-second
         timeout blaming the select for not being enabled.
      */
      const countries = await checkoutLocators.country(page).getByRole('option').allTextContents();
      if (!countries.some((option) => option.trim() === address.country)) {
        throw new Error(
          `The country list has no option "${address.country}". It uses the UN naming style, so ` +
            `the value is usually "${address.country} (the)". Nearest matches: ` +
            `${countries.filter((o) => o.includes(address.country.split(' ')[0] ?? '')).join(', ') || '(none)'}.`,
        );
      }
      await checkoutLocators.country(page).selectOption({ label: address.country });
      await checkoutLocators.postcode(page).fill(address.postcode);
      await checkoutLocators.houseNumber(page).fill(address.houseNumber);
      await checkoutLocators.street(page).fill(address.street);
      await checkoutLocators.city(page).fill(address.city);
      await checkoutLocators.state(page).fill(address.state);

      await checkoutLocators.proceedFrom(page, 3).click();
      await checkoutLocators.paymentMethod(page).waitFor();
    });
  },

  /** The payment methods this deployment offers, as a shopper sees them. */
  async readPaymentMethods(page: Page): Promise<string[]> {
    return test.step('Read the payment methods on offer', async () => {
      const options = await checkoutLocators.paymentMethod(page).getByRole('option').allTextContents();
      return options.map((option) => option.trim()).filter((option) => !option.startsWith('Choose'));
    });
  },

  /**
   * Pay, and return whatever the confirmation panel said.
   *
   * Returns the text rather than asserting on it: "the order was confirmed"
   * and "the confirmation quotes an invoice number" are different claims, and
   * which of them a spec makes belongs in the spec.
   */
  async payWith(page: Page, method: PaymentMethod): Promise<string | null> {
    return test.step(`Pay by ${method}`, async () => {
      await checkoutLocators.paymentMethod(page).selectOption({ label: method });
      await checkoutLocators.finish(page).click();
      const confirmation = checkoutLocators.paymentSuccess(page);
      await confirmation.waitFor().catch(() => undefined);
      if (!(await confirmation.isVisible())) return null;
      return (await confirmation.textContent())?.trim() ?? null;
    });
  },

  /** Which wizard step is on screen, by the heading it renders. */
  async currentStep(page: Page): Promise<string> {
    const headings = await page.getByRole('heading', { level: 3 }).allTextContents();
    return headings[0]?.trim() ?? '';
  },
};
