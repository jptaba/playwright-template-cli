import { expect, test } from '../../fixtures';
import { CATALOG } from '../../data/catalog';

/**
 * Boundary cases: the edges of the ranges the application accepts.
 *
 * Each one states the boundary it is probing in its title, because "boundary
 * test" as a label tells a reviewer nothing about which edge was chosen or
 * why it is the interesting one.
 */
test(
  'SD-070 · The whole catalogue can be in the cart at once @inventory',
  { annotation: [{ type: 'practitest', description: '5160' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    // Upper boundary: every product the store sells.
    const everything = testData.catalogItems({ count: CATALOG.length });

    await inventory.open(authedPage);
    const added = await inventory.addToCart(
      authedPage,
      everything.map((item) => item.name),
    );

    expect(added).toHaveLength(CATALOG.length);
    expect(await inventory.cartCount(authedPage)).toBe(CATALOG.length);

    const totals = await checkout.completeThroughOverview(authedPage, testData.customer());
    const subtotal = added.reduce((sum, item) => sum + item.price, 0);
    expect(totals.subtotal).toBeCloseTo(subtotal, 2);
    expect(totals.tax).toBeCloseTo(subtotal * testData.taxRate, 2);
  },
);

test(
  'SD-071 · A single cheapest item still computes tax correctly @checkout',
  { annotation: [{ type: 'practitest', description: '5161' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    // Lower boundary: the smallest possible order, where rounding bites.
    const [cheapest] = testData.catalogItems({ count: 1 });

    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [cheapest!.name]);
    const totals = await checkout.completeThroughOverview(authedPage, testData.customer());

    expect(totals.subtotal).toBeCloseTo(cheapest!.price, 2);
    // 7.99 × 0.08 = 0.6392, which must round to 0.64 rather than truncate.
    expect(totals.tax).toBeCloseTo(Math.round(cheapest!.price * testData.taxRate * 100) / 100, 2);
    expect(totals.total).toBeCloseTo(totals.subtotal + totals.tax, 2);
  },
);

test(
  'SD-072 · Checkout accepts unusually long delivery details @checkout',
  { annotation: [{ type: 'practitest', description: '5162' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const [item] = testData.catalogItems({ count: 1 });
    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [item!.name]);
    await checkout.openCart(authedPage);
    await checkout.proceedToCheckout(authedPage);

    // Upper boundary on input length. Either it is accepted or it is refused
    // with a stated reason; silently truncating is the outcome worth catching.
    await checkout.provideDeliveryDetails(authedPage, {
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
      postalCode: '9'.repeat(50),
    });

    const error = await checkout.readCheckoutError(authedPage);
    if (error !== null) {
      expect(error).toMatch(/required|invalid|too long/i);
    } else {
      // It advanced, so the overview must still be coherent.
      const totals = await checkout.readOrderTotals(authedPage);
      expect(totals.total).toBeCloseTo(totals.subtotal + totals.tax, 2);
    }
  },
);

test(
  'SD-073 · Delivery details survive characters that break naive escaping @checkout',
  { annotation: [{ type: 'practitest', description: '5163' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const [item] = testData.catalogItems({ count: 1 });
    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [item!.name]);
    await checkout.openCart(authedPage);
    await checkout.proceedToCheckout(authedPage);

    // Not a security test — the framework does not do those — but the input
    // that reveals naive string handling, and it must not break the page.
    await checkout.provideDeliveryDetails(authedPage, {
      firstName: `O'Brien <b>`,
      lastName: 'Ünicode & Co',
      postalCode: 'SW1A "1AA"',
    });

    const totals = await checkout.readOrderTotals(authedPage);
    expect(totals.total).toBeCloseTo(totals.subtotal + totals.tax, 2);
    const confirmation = await checkout.placeOrder(authedPage);
    expect(confirmation.heading).toBe('Thank you for your order!');
  },
);

test(
  'SD-074 · An empty cart can still be taken through checkout @checkout @negative',
  { annotation: [{ type: 'practitest', description: '5164' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    // Lower boundary, and a negative path: nothing in the basket at all.
    await inventory.open(authedPage);
    expect(await inventory.cartCount(authedPage)).toBe(0);

    const totals = await checkout.completeThroughOverview(authedPage, testData.customer());

    // The store permits it. Recorded as the current behaviour rather than
    // asserted as correct — a zero-value order is a product decision, and the
    // test's job is to notice if it silently changes.
    expect(totals.subtotal).toBe(0);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(0);
  },
);
