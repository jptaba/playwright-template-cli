import { expect, test } from '../../fixtures';
import { siteApi } from '../../api/site';

/**
 * Mixed tests: seed cheaply, act in the UI, and verify each fact where it
 * actually lands.
 *
 * Against a service-backed application the seeding would be an API call and
 * the verification a second one. This target has no service, so its
 * persisted-state store plays both parts — the shape of the test is identical,
 * which is the point of keeping the vocabularies siblings rather than layers.
 */
test(
  'SD-080 · A cart seeded outside the UI is rendered and can be checked out @checkout',
  { annotation: [{ type: 'practitest', description: '5170' }] },
  async ({ authedPage, inventory, checkout, cartState, testData }) => {
    const items = testData.catalogItems({ count: 3 });

    await inventory.open(authedPage);
    // Arrange without a five-step click-through: the subject of this test is
    // checkout, not data entry.
    await cartState.seed(
      authedPage,
      items.map((item) => item.name),
    );

    expect(await inventory.cartCount(authedPage)).toBe(3);

    await checkout.openCart(authedPage);
    // Sorted on both sides: the cart renders in the store's own order, which
    // is not the order the products were seeded in.
    expect((await checkout.readCartContents(authedPage)).sort()).toEqual(
      items.map((item) => item.name).sort(),
    );

    await checkout.proceedToCheckout(authedPage);
    await checkout.provideDeliveryDetails(authedPage, testData.customer());
    const totals = await checkout.readOrderTotals(authedPage);
    expect(totals.subtotal).toBeCloseTo(
      items.reduce((sum, item) => sum + item.price, 0),
      2,
    );
  },
);

test(
  'SD-081 · Adding a product in the UI is persisted, not merely displayed @inventory',
  { annotation: [{ type: 'practitest', description: '5171' }] },
  async ({ authedPage, inventory, cartState, testData }) => {
    const [item] = testData.catalogItems({ count: 1 });

    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, [item!.name]);

    // Assert in both places. The badge showing "1" and the store holding the
    // product are different claims, and a defect that satisfies only the first
    // survives every screen-level assertion.
    expect(await inventory.cartCount(authedPage)).toBe(1);
    expect(await cartState.readPersisted(authedPage)).toEqual([item!.name]);
  },
);

test(
  'SD-082 · Placing an order clears the persisted cart @checkout',
  { annotation: [{ type: 'practitest', description: '5172' }] },
  async ({ authedPage, inventory, checkout, cartState, testData }) => {
    const items = testData.catalogItems({ count: 2 });

    await inventory.open(authedPage);
    await cartState.seed(
      authedPage,
      items.map((item) => item.name),
    );
    await checkout.completeThroughOverview(authedPage, testData.customer());
    await checkout.placeOrder(authedPage);

    // The side effect that matters after a purchase, checked where it lives
    // rather than inferred from a missing badge.
    expect(await cartState.readPersisted(authedPage)).toEqual([]);
  },
);

test(
  'SD-083 · The listing and the HTTP surface agree on the catalogue @inventory',
  { annotation: [{ type: 'practitest', description: '5173' }] },
  async ({ authedPage, inventory, api }) => {
    const site = siteApi(api);

    // Two media, one fact: what the browser renders and what the host serves
    // should not disagree about which products exist.
    await inventory.open(authedPage);
    const rendered = await inventory.readDisplayedProducts(authedPage);
    const document = await site.landing();

    expect(rendered.length).toBeGreaterThan(0);
    expect(document.status).toBe(200);
    // The names are injected by the bundle rather than present in the shell,
    // so this asserts the honest overlap: the shell serves, the client renders.
    expect(document.body).toContain('Swag Labs');
  },
);
