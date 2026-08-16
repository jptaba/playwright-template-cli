import { expect, test } from '../../fixtures';

/**
 * TOOL-3 — the cart.
 *
 * **Serial, and that is not a preference.** The cart lives on the server
 * against the signed-in account, the account pool is static, and
 * `serverState` is declared true — so there is exactly one cart and every
 * worker signing in as `customer` is looking at it. Run in parallel, these two
 * specs empty each other's carts mid-assertion, and the failure lands on
 * whichever one lost the race: "expected 0 lines, received 1", pointing at an
 * application that is behaving perfectly.
 *
 * Partitioning by `run.workerIndex` is the other answer and needs a pool of
 * accounts to partition into. This deployment has one customer, shared with
 * everybody else using the demo, so serial is the honest choice here.
 *
 * Each spec also empties what it added in a `finally`, so a failure halfway
 * through does not hand the next one a cart with an item too many.
 */
test.describe.configure({ mode: 'serial' });

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
    const [first] = await catalogue.productNames(authedPage);
    await catalogue.openProduct(authedPage, first!);
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
    const [first] = await catalogue.productNames(authedPage);
    await catalogue.openProduct(authedPage, first!);

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
