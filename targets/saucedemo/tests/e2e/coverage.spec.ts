import { expect, test } from '../../fixtures';

/**
 * SD-2 to SD-5 — the four coverage kinds beyond the happy path (§08 stage 3).
 *
 * Every claim below was read off the running application before it was
 * written down. Two of them are about behaviour this demo publishes on
 * purpose, which is what makes them safe as well as stable: `locked_out_user`
 * exists to be refused, and the listing's Add control is replaced rather than
 * repeated.
 */

test(
  'SD-3-01 · A product already in the cart offers to be removed, not added again @idempotency @cart',
  {
    annotation: [
      { type: 'practitest', description: 'SD-3-01' },
      { type: 'jira', description: 'SD-3' },
    ],
  },
  async ({ authedPage, inventory }) => {
    /*
       This application's idempotency guarantee, observed rather than assumed:
       adding a product replaces its Add control with Remove, so there is no
       second add to make. The claim worth pinning is the *count* — that a
       product in the cart contributes one, and the listing offers no way to
       make it two.

       Worth a spec because the failure is invisible in the cart's arithmetic.
       A badge that counted the same product twice would still show a plausible
       number, and every total computed from it would still add up.
    */
    await inventory.open(authedPage);
    const [product] = await inventory.productNames(authedPage);
    expect(product, 'the listing showed no products to add').toBeDefined();

    await inventory.addToCart(authedPage, product!);

    expect(await inventory.cartCount(authedPage)).toBe(1);
    /*
       Asked of the application rather than asserted about a button this spec
       names: `isInCart` reads the control the product now offers, and the
       control being *Remove* is the application saying there is no second add
       to make. The first draft called `addToCart` again and died as a
       fifteen-second timeout on a renamed button — which reads as a broken
       cart, and is the application working exactly as designed.
    */
    expect(await inventory.isInCart(authedPage, product!)).toBe(true);

    await inventory.removeFromCart(authedPage, product!);
    expect(await inventory.cartCount(authedPage), 'the cart would not let go').toBe(0);
    expect(await inventory.isInCart(authedPage, product!)).toBe(false);
  },
);

test(
  'SD-4-01 · What the summary charges for is what was put in the cart @audit @checkout',
  {
    annotation: [
      { type: 'practitest', description: 'SD-4-01' },
      { type: 'jira', description: 'SD-4' },
    ],
  },
  async ({ authedPage, inventory, checkout, testData }) => {
    /*
       The audit this application can support, and the limit is worth stating:
       there is no service to ask whether a change was recorded, so the second
       surface is the page that computes the money. A cart spec that read the
       cart back would only have proved the page agrees with itself.

       So the change is made on the listing and the claim is checked on the
       summary — different page, different rendering, same two products — and
       the item total is checked against the prices the *listing* showed, not
       against a number copied from the summary itself.
    */
    await inventory.open(authedPage);
    const displayed = await inventory.displayedProducts(authedPage);
    expect(displayed.length, 'two products are needed to total anything').toBeGreaterThan(1);

    const chosen = displayed.slice(0, 2);
    await inventory.addToCart(
      authedPage,
      chosen.map((item) => item.name),
    );

    await checkout.openCart(authedPage);
    await checkout.proceedToCheckout(authedPage);
    await checkout.provideDeliveryDetails(authedPage, testData.customer());

    const summary = await checkout.readSummary(authedPage);

    expect(summary.products.sort()).toEqual(chosen.map((item) => item.name).sort());
    expect(
      summary.itemTotal,
      'the summary charges for something other than what the listing priced',
    ).toBeCloseTo(
      chosen.reduce((sum, item) => sum + item.price, 0),
      2,
    );
  },
);

test(
  'SD-5-01 · The cart holds the whole catalogue and nothing beyond it @boundary @cart',
  {
    annotation: [
      { type: 'practitest', description: 'SD-5-01' },
      { type: 'jira', description: 'SD-5' },
    ],
  },
  async ({ authedPage, inventory }) => {
    /*
       The bound is the catalogue's own size, read from the listing rather than
       written down — a spec asserting "6" would fail the day somebody adds a
       seventh product, for a reason that has nothing to do with the cart.

       **Both ends, and the empty one is the half usually skipped.** Proving
       the cart reaches the catalogue says nothing about it letting go: a cart
       that could only ever grow would satisfy the first assertion perfectly,
       and the badge is *absent* at zero rather than showing one, which is the
       state a naive reader gets wrong.
    */
    await inventory.open(authedPage);
    const products = await inventory.productNames(authedPage);
    expect(products.length, 'an empty catalogue bounds nothing').toBeGreaterThan(0);

    await inventory.addToCart(authedPage, products);
    expect(
      await inventory.cartCount(authedPage),
      'the cart did not reach the size of the catalogue',
    ).toBe(products.length);

    // And back down, through the control the application actually offers.
    await inventory.removeFromCart(authedPage, products);
    expect(await inventory.cartCount(authedPage), 'the cart would not empty again').toBe(0);
  },
);
