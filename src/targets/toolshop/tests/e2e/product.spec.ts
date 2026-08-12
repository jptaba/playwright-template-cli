import { expect, test } from '../../fixtures';

/**
 * L4 — the product detail page.
 */

test(
  'TS-E18 · A product page states a description and a price @catalog',
  { annotation: [{ type: 'practitest', description: '9018' }] },
  async ({ authedPage, catalog, product }) => {
    await catalog.open(authedPage);
    const [first] = await catalog.readCards(authedPage);
    expect(first).toBeDefined();

    await product.open(authedPage, first!.name);

    const detail = await product.readDetail(authedPage);
    expect(detail.description.length, 'the page describes the product').toBeGreaterThan(20);
    expect(detail.price).toBeGreaterThan(0);
  },
);

test(
  'TS-E19 · A product page lists its specifications with a value for each @catalog',
  { annotation: [{ type: 'practitest', description: '9019' }] },
  async ({ authedPage, catalog, product }) => {
    await catalog.open(authedPage);
    const [first] = await catalog.readCards(authedPage);
    expect(first).toBeDefined();

    await product.open(authedPage, first!.name);

    const { specifications } = await product.readDetail(authedPage);
    expect(specifications.length).toBeGreaterThan(0);
    for (const specification of specifications) {
      expect(specification.name, 'every specification row is labelled').not.toBe('');
      expect(specification.value, `${specification.name} has a value`).not.toBe('');
    }
  },
);

test(
  'TS-E20 · The quantity stepper will not go below one @catalog',
  { annotation: [{ type: 'practitest', description: '9020' }] },
  async ({ authedPage, catalog, product }) => {
    await catalog.open(authedPage);
    const [first] = await catalog.readCards(authedPage);
    expect(first).toBeDefined();
    await product.open(authedPage, first!.name);

    // Three presses from a starting quantity of one: a stepper without a floor
    // reaches -2, and the cart then holds a negative line.
    await product.decreaseQuantity(authedPage, 3);

    expect(await product.readQuantity(authedPage)).toBe(1);
  },
);

test(
  'TS-E21 · Raising the quantity on the product page carries into the cart @cart',
  { annotation: [{ type: 'practitest', description: '9021' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [first] = await catalog.readCards(authedPage);
    expect(first).toBeDefined();
    await product.open(authedPage, first!.name);
    await product.increaseQuantity(authedPage, 2);

    await product.addToCart(authedPage);

    await checkout.openCart(authedPage);
    const cart = await checkout.readCart(authedPage);
    const line = cart.lines.find((entry) => entry.name === first!.name);
    expect(line, `${first!.name} is in the cart`).toBeDefined();
    expect(line!.quantity).toBe(3);
  },
);
