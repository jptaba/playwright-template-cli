import { expect, test } from '../../fixtures';

/**
 * The negative paths through checkout step one.
 *
 * Each case asserts the *stated reason* rather than merely that the step did
 * not advance — a form that refuses silently and a form that refuses with a
 * message are different products, and only one of them is usable.
 */
const requiredFields = [
  { omit: 'firstName' as const, caseId: '5130', expected: 'First Name is required' },
  { omit: 'lastName' as const, caseId: '5131', expected: 'Last Name is required' },
  { omit: 'postalCode' as const, caseId: '5132', expected: 'Postal Code is required' },
];

for (const { omit, caseId, expected } of requiredFields) {
  test(
    `SD-04x · Checkout refuses to continue without ${omit} @checkout`,
    { annotation: [{ type: 'practitest', description: caseId }] },
    async ({ authedPage, inventory, checkout, testData }) => {
      const [item] = testData.catalogItems({ count: 1 });
      await inventory.open(authedPage);
      await inventory.addToCart(authedPage, [item!.name]);

      await checkout.openCart(authedPage);
      await checkout.proceedToCheckout(authedPage);
      await checkout.provideDeliveryDetails(authedPage, { ...testData.customer(), [omit]: '' });

      expect(await checkout.readCheckoutError(authedPage)).toContain(expected);
    },
  );
}

test(
  'SD-043 · Checkout can be abandoned without losing the cart @checkout',
  { annotation: [{ type: 'practitest', description: '5133' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });
    await inventory.open(authedPage);
    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );

    await checkout.openCart(authedPage);
    await checkout.proceedToCheckout(authedPage);
    await checkout.cancelCheckout(authedPage);

    // Abandoning the form must not quietly empty the basket.
    expect(await checkout.readCartContents(authedPage)).toEqual(items.map((item) => item.name));
  },
);
