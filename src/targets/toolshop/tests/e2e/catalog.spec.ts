import { expect, test } from '../../fixtures';

/**
 * L4 — browsing the storefront.
 *
 * Every assertion here is about a *relationship* in the data rather than about
 * a value: "the prices ascend", not "the first product costs $9.17". This
 * deployment is shared and reseeded, and the products, prices and brands in it
 * change without notice — a suite that pinned them would be red every morning
 * for reasons that are nobody's defect.
 */

test(
  'TS-E10 · The storefront lists products with a name and a price @smoke @catalog',
  { annotation: [{ type: 'practitest', description: '9010' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);

    const cards = await catalog.readCards(authedPage);

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.name, 'every card names its product').not.toBe('');
      expect(card.price, `${card.name} shows a usable price`).toBeGreaterThan(0);
      expect(card.id, `${card.name} carries the application's own id`).not.toBe('');
    }
  },
);

test(
  'TS-E11 · Searching narrows the listing to matching products @catalog',
  { annotation: [{ type: 'practitest', description: '9011' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);
    const everything = await catalog.readCards(authedPage);

    const found = await catalog.search(authedPage, 'Pliers');

    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(everything.length + 1);
    for (const card of found) {
      expect(card.name.toLowerCase()).toContain('pliers');
    }
  },
);

test(
  'TS-E12 · Clearing the search restores the full listing @catalog',
  { annotation: [{ type: 'practitest', description: '9012' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);
    const before = await catalog.readCards(authedPage);
    await catalog.search(authedPage, 'Pliers');

    await catalog.clearSearch(authedPage);

    /*
       Polled rather than read once. The grid repopulates progressively after
       the reset, so a single read can catch it part-drawn — and the failure
       then reads as "these two lists of products differ", which sends whoever
       triages it looking for a sorting or filtering defect that is not there.
       `expect.poll` is the framework's answer to an eventually-consistent fact,
       and it fails as a clear assertion carrying the last value it saw.
    */
    await expect
      .poll(async () => (await catalog.readCards(authedPage)).map((card) => card.name), {
        message: 'the listing never returned to its unfiltered contents',
      })
      .toEqual(before.map((card) => card.name));
  },
);

test(
  'TS-E13 · Sorting by price low to high orders the listing by price @catalog',
  { annotation: [{ type: 'practitest', description: '9013' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);

    const sorted = await catalog.sortBy(authedPage, 'Price (Low - High)');

    const prices = sorted.map((card) => card.price);
    expect(prices, 'prices ascend down the page').toEqual([...prices].sort((a, b) => a - b));
  },
);

test(
  'TS-E14 · Sorting by name Z to A reverses the alphabetical order @catalog',
  { annotation: [{ type: 'practitest', description: '9014' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);

    const descending = await catalog.sortBy(authedPage, 'Name (Z - A)');

    const names = descending.map((card) => card.name);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  },
);

test(
  'TS-E15 · A category filter narrows the listing @catalog',
  { annotation: [{ type: 'practitest', description: '9015' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);
    const everything = await catalog.readCards(authedPage);

    const hammers = await catalog.filterByCategory(authedPage, 'Hammer');

    expect(hammers.length).toBeGreaterThan(0);
    expect(hammers.length).toBeLessThanOrEqual(everything.length);
  },
);

test(
  'TS-E16 · Paging moves to a different page of products @catalog',
  { annotation: [{ type: 'practitest', description: '9016' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);
    const first = await catalog.readCards(authedPage);

    const second = await catalog.goToPage(authedPage, 2);

    expect(second.length).toBeGreaterThan(0);
    expect(
      second.map((card) => card.id),
      'page two shows different products from page one',
    ).not.toEqual(first.map((card) => card.id));
  },
);

test(
  'TS-E17 · Every listed price is repeated on the product’s own page @catalog',
  { annotation: [{ type: 'practitest', description: '9017' }] },
  async ({ authedPage, catalog, product }) => {
    await catalog.open(authedPage);
    const cards = await catalog.readCards(authedPage);
    const first = cards[0];
    expect(first, 'the listing had at least one product to open').toBeDefined();

    await product.open(authedPage, first!.name);

    const detail = await product.readDetail(authedPage);
    expect(detail.name).toBe(first!.name);
    expect(detail.price, 'the detail page quotes the listing price').toBeCloseTo(first!.price, 2);
  },
);
