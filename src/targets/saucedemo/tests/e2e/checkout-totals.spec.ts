import { expect, test } from '../../fixtures';

/**
 * GOLDEN EXAMPLE — a simple journey, and the shape the generator imitates.
 *
 * Read it aloud against the test case: add two items, check out, the totals
 * add up. A spec body should match a manual tester's steps one for one (§03).
 */
test(
  'SD-012 · Checkout totals include tax @smoke @checkout',
  {
    annotation: [
      { type: 'practitest', description: '5104' },
      { type: 'case', description: 'cases/saucedemo/SD-012.yaml' },
    ],
  },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });

    await inventory.open(authedPage);
    const added = await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );
    const totals = await checkout.completeThroughOverview(authedPage, testData.customer());

    const expectedSubtotal = added.reduce((sum, item) => sum + item.price, 0);
    expect(totals.subtotal).toBeCloseTo(expectedSubtotal, 2);
    expect(totals.tax).toBeCloseTo(expectedSubtotal * testData.taxRate, 2);
    expect(totals.total).toBeCloseTo(totals.subtotal + totals.tax, 2);
  },
);

test(
  'SD-013 · An order can be placed and is confirmed @checkout',
  { annotation: [{ type: 'practitest', description: '5105' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const [item] = testData.catalogItems({ count: 1 });

    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [item!.name]);
    await checkout.completeThroughOverview(authedPage, testData.customer());

    const confirmation = await checkout.placeOrder(authedPage);

    expect(confirmation.heading).toBe('Thank you for your order!');
    expect(confirmation.detail).toContain('dispatched');
  },
);
