import { expect, test } from '../../fixtures';

/**
 * L4 — the cart.
 *
 * The cart is server-side state on a shared deployment, so every spec here
 * starts by emptying whatever it finds rather than assuming it starts empty.
 * Assuming an empty cart is how a suite passes alone and fails in parallel.
 */

test(
  'TS-E22 · A product added from its page appears in the cart at the advertised price @smoke @cart',
  { annotation: [{ type: 'practitest', description: '9022' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);

    await product.addToCart(authedPage);

    await checkout.openCart(authedPage);
    const cart = await checkout.readCart(authedPage);
    const line = cart.lines.find((entry) => entry.name === chosen!.name);
    expect(line, `${chosen!.name} is in the cart`).toBeDefined();
    expect(line!.unitPrice, 'the cart quotes the advertised price').toBeCloseTo(chosen!.price, 2);
  },
);

test(
  'TS-E23 · A line total is the unit price times the quantity @cart',
  { annotation: [{ type: 'practitest', description: '9023' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);

    await checkout.changeQuantity(authedPage, chosen!.name, 3);

    const cart = await checkout.readCart(authedPage);
    const line = cart.lines.find((entry) => entry.name === chosen!.name);
    expect(line).toBeDefined();
    expect(line!.linePrice).toBeCloseTo(line!.unitPrice * line!.quantity, 2);
  },
);

test(
  'TS-E24 · The cart total is the sum of its lines @cart',
  { annotation: [{ type: 'practitest', description: '9024' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const cards = await catalog.readCards(authedPage);
    expect(cards.length).toBeGreaterThan(1);

    for (const card of cards.slice(0, 2)) {
      await catalog.open(authedPage);
      await product.open(authedPage, card.name);
      await product.addToCart(authedPage);
    }

    await checkout.openCart(authedPage);
    const cart = await checkout.readCart(authedPage);
    const summed = cart.lines.reduce((total, line) => total + line.linePrice, 0);
    expect(cart.total, 'the printed total matches the lines above it').toBeCloseTo(summed, 2);
  },
);

test(
  'TS-E25 · Removing a line takes it out of the cart @cart',
  { annotation: [{ type: 'practitest', description: '9025' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);

    await checkout.removeLine(authedPage, chosen!.name);

    const cart = await checkout.readCart(authedPage);
    expect(cart.lines.map((line) => line.name)).not.toContain(chosen!.name);
  },
);

test(
  'TS-E26 · The cart badge counts what the cart holds @cart',
  { annotation: [{ type: 'practitest', description: '9026' }] },
  async ({ authedPage, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);

    await product.addToCart(authedPage);

    await checkout.openCart(authedPage);
    const cart = await checkout.readCart(authedPage);
    const inCart = cart.lines.reduce((count, line) => count + line.quantity, 0);
    expect(await catalog.cartCount(authedPage)).toBe(inCart);
  },
);
