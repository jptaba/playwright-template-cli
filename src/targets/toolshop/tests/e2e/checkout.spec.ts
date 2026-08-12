import { expect, test } from '../../fixtures';

/**
 * L4 — the four-step checkout wizard.
 */

test(
  'TS-E27 · Checkout offers the payment methods this deployment supports @checkout',
  { annotation: [{ type: 'practitest', description: '9027' }] },
  async ({ authedPage, catalog, product, checkout, testData }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);

    await checkout.proceedToPayment(authedPage, testData.billingAddress());

    expect(await checkout.readPaymentMethods(authedPage)).toEqual([
      'Bank Transfer',
      'Cash on Delivery',
      'Credit Card',
      'Buy Now Pay Later',
      'Gift Card',
    ]);
  },
);

test(
  'TS-E28 · An order paid on delivery is confirmed @smoke @checkout',
  { annotation: [{ type: 'practitest', description: '9028' }] },
  async ({ authedPage, catalog, product, checkout, testData }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);
    await checkout.proceedToPayment(authedPage, testData.billingAddress());

    const confirmation = await checkout.payWith(authedPage, 'Cash on Delivery');

    expect(confirmation, 'the wizard confirms the order').not.toBeNull();
  },
);

test(
  'TS-E29 · The cart survives the trip to the billing step @checkout',
  { annotation: [{ type: 'practitest', description: '9029' }] },
  async ({ authedPage, catalog, product, checkout, testData }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);
    const before = await checkout.readCart(authedPage);

    await checkout.proceedToPayment(authedPage, testData.billingAddress());

    // The badge is the only view of the cart the payment step still shows, and
    // a wizard that loses the basket between steps is a real defect class.
    const inCart = before.lines.reduce((count, line) => count + line.quantity, 0);
    expect(await catalog.cartCount(authedPage)).toBe(inCart);
  },
);
