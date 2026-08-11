import { expect, test } from '../../fixtures';

/**
 * Cart behaviour: the state that has to survive navigation, and the state that
 * has to be discardable. On this target the cart lives in localStorage, which
 * is why the profile declares `serverState: false` and no cross-test cleanup
 * is written for it.
 */
test(
  'SD-050 · The cart survives navigating back to the listing @smoke @checkout',
  { annotation: [{ type: 'practitest', description: '5140' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });

    await inventory.open(authedPage);
    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );

    await checkout.openCart(authedPage);
    await checkout.continueShopping(authedPage);
    await checkout.openCart(authedPage);

    expect(await checkout.readCartContents(authedPage)).toEqual(items.map((item) => item.name));
  },
);

test(
  'SD-051 · A product can be removed from the cart page @checkout',
  { annotation: [{ type: 'practitest', description: '5141' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });
    const [removed, kept] = items;

    await inventory.open(authedPage);
    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );
    await checkout.openCart(authedPage);

    await checkout.removeFromCart(authedPage, removed!.name);

    expect(await checkout.readCartContents(authedPage)).toEqual([kept!.name]);
    expect(await inventory.cartCount(authedPage)).toBe(1);
  },
);

test(
  'SD-052 · A product can be removed from the listing @inventory',
  { annotation: [{ type: 'practitest', description: '5142' }] },
  async ({ authedPage, inventory, testData }) => {
    const [item] = testData.catalogItems({ count: 1 });

    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [item!.name]);
    expect(await inventory.cartCount(authedPage)).toBe(1);

    await inventory.removeFromCart(authedPage, item!.name);

    // The badge is removed entirely at zero rather than showing "0".
    expect(await inventory.cartCount(authedPage)).toBe(0);
  },
);

test(
  'SD-053 · Resetting the application state empties the cart @inventory',
  { annotation: [{ type: 'practitest', description: '5143' }] },
  async ({ authedPage, inventory, auth, testData }) => {
    const items = testData.catalogItems({ count: 3 });

    await inventory.open(authedPage);
    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );
    expect(await inventory.cartCount(authedPage)).toBe(3);

    // Through the application's own menu action — state cleared behind the
    // application's back produces failures three tests later that look like
    // something else entirely.
    await auth.resetApplicationState(authedPage);

    expect(await inventory.cartCount(authedPage)).toBe(0);
  },
);

test(
  'SD-054 · Every catalogue product is listed with a price @inventory',
  { annotation: [{ type: 'practitest', description: '5144' }] },
  async ({ authedPage, inventory, testData }) => {
    await inventory.open(authedPage);

    const displayed = await inventory.readDisplayedProducts(authedPage);
    const expected = testData.catalogItems({ count: 6 });

    // The catalogue is stated in the target pack rather than scraped, so this
    // asserts the store against a known answer rather than against itself.
    expect(displayed).toHaveLength(expected.length);
    expect([...displayed].sort((a, b) => a.price - b.price)).toEqual(expected);
    expect(displayed.every((item) => item.price > 0)).toBe(true);
  },
);
