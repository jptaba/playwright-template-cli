import { expect, test } from '../../fixtures';

/**
 * TOOL-3 — the cart.
 *
 * The cart lives on the server against the signed-in account and
 * `serverState` is declared true, so a cart belongs to an *account* rather
 * than to a test. These ran serially at first, because with one customer
 * account they emptied each other's carts mid-assertion and the failure —
 * "expected 0 lines, received 1" — landed on whichever spec lost the race,
 * pointing at an application behaving perfectly.
 *
 * They are parallel again because the profile declares three customer
 * accounts and the framework partitions workers across them. Serial was the
 * right answer to a one-account pool and the wrong answer to this one.
 *
 * Each spec still empties what it added in a `finally`: a worker keeps its
 * account for the whole run, so the *next spec on this worker* inherits
 * whatever this one leaves behind.
 */

test(
  'TOOL-3-01 · The cart multiplies unit price by quantity, and totals the lines @smoke @cart',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-3-01' },
      { type: 'jira', description: 'TOOL-3' },
    ],
  },
  async ({ authedPage, catalogue, cart }) => {
    await cart.open(authedPage);
    await cart.empty(authedPage);

    await catalogue.open(authedPage);
    /*
       Addable, not simply first. Stock is shared mutable state here and an
       out-of-stock product renders "Add to cart" disabled, so taking the first
       card fails as a timeout on a disabled button and reads as a broken cart.
    */
    const addable = await catalogue.addableProductNames(authedPage);
    expect(addable.length, 'nothing on the listing is in stock, so there is nothing to add')
      .toBeGreaterThan(0);
    await catalogue.openProduct(authedPage, addable[0]!);
    const product = await catalogue.readProduct(authedPage);

    try {
      await cart.addOpenProduct(authedPage, 2);
      await cart.open(authedPage);

      const lines = await cart.lines(authedPage);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.product).toBe(product.name);
      expect(lines[0]!.quantity).toBe(2);
      expect(lines[0]!.total, 'the line total is not price × quantity').toBeCloseTo(
        product.price * 2,
        2,
      );

      const total = await cart.total(authedPage);
      expect(total, 'the order total is not the sum of the lines').toBeCloseTo(
        lines.reduce((sum, line) => sum + line.total, 0),
        2,
      );
    } finally {
      await cart.empty(authedPage);
    }
  },
);

test(
  'TOOL-3-02 · A product removed from the cart is gone from it @cart',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-3-02' },
      { type: 'jira', description: 'TOOL-3' },
    ],
  },
  async ({ authedPage, catalogue, cart }) => {
    await cart.open(authedPage);
    await cart.empty(authedPage);

    await catalogue.open(authedPage);
    const addable = await catalogue.addableProductNames(authedPage);
    expect(addable.length, 'nothing on the listing is in stock, so there is nothing to add')
      .toBeGreaterThan(0);
    await catalogue.openProduct(authedPage, addable[0]!);

    let added = '';
    try {
      added = await cart.addOpenProduct(authedPage);
      await cart.open(authedPage);
      expect(await cart.lines(authedPage)).toHaveLength(1);

      await cart.remove(authedPage, added);

      /*
         The vocabulary can describe an empty cart, which is the whole reason
         this assertion can be written at all. A reader that could only
         describe a non-empty cart made the equivalent spec on a previous
         target fail at the step confirming it had worked.
      */
      expect(await cart.lines(authedPage), 'the cart still holds the removed product').toEqual([]);
    } finally {
      await cart.empty(authedPage);
    }
  },
);

test(
  'TOOL-3-03 · Adding the same product twice is one line of two, not two lines @idempotency @cart',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-3-03' },
      { type: 'jira', description: 'TOOL-3' },
    ],
  },
  async ({ authedPage, catalogue, cart }) => {
    /*
       The idempotency claim this application actually makes, confirmed
       against the running storefront before it was written down: adding a
       product that is already in the cart raises its quantity rather than
       appending a second row. Badge 1, then 2; one row; quantity "2".

       It is worth a spec because the failure is silent in both directions. A
       second row with quantity 1 totals the same money as one row with
       quantity 2, so every assertion about the order total still passes while
       the cart has stopped meaning what it says — and a checkout built on the
       row count would then ship two of something somebody asked for once.
    */
    await cart.open(authedPage);
    await cart.empty(authedPage);

    await catalogue.open(authedPage);
    // Addable, not simply first: an out-of-stock product renders the button
    // disabled, and taking the first card fails as a timeout that reads as a
    // broken cart.
    const addable = await catalogue.addableProductNames(authedPage);
    expect(addable.length, 'nothing on the listing is in stock, so there is nothing to add')
      .toBeGreaterThan(0);
    await catalogue.openProduct(authedPage, addable[0]!);
    const product = await catalogue.readProduct(authedPage);

    try {
      await cart.addOpenProduct(authedPage);
      await cart.addOpenProduct(authedPage);
      await cart.open(authedPage);

      const lines = await cart.lines(authedPage);

      expect(lines, 'the same product twice should be one line, not two').toHaveLength(1);
      expect(lines[0]!.product).toBe(product.name);
      expect(lines[0]!.quantity, 'the second add did not raise the quantity').toBe(2);
      /*
         And the money, because the row count alone does not settle it: a
         cart that merged the rows and kept quantity 1 would satisfy every
         assertion above while quietly losing what somebody asked for.
      */
      expect(lines[0]!.total).toBeCloseTo(product.price * 2, 2);
    } finally {
      await cart.empty(authedPage);
    }
  },
);
