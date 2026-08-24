import { expect, test } from '../../fixtures';

/**
 * TOOL-4 — the catalogue API.
 *
 * Through the typed client, never `request.*`. Every response here is also
 * schema-checked against the vendored document on the way through, because the
 * contracts capability is on — so these specs assert *behaviour* and the
 * contract project asserts *shape*, without either doing the other's job.
 */

test(
  'TOOL-4-01 · The products endpoint returns a page of products with a total @smoke @api',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-4-01' },
      { type: 'jira', description: 'TOOL-4' },
    ],
  },
  async ({ shopApi }) => {
    const page = await shopApi.products();

    expect(page.data.length).toBeGreaterThan(0);
    expect(page.total, 'the reported total is smaller than the page it returned').toBeGreaterThanOrEqual(
      page.data.length,
    );
    expect(page.current_page).toBe(1);
  },
);

test(
  'TOOL-4-02 · Every product in the catalogue has a name and a price @api',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-4-02' },
      { type: 'jira', description: 'TOOL-4' },
    ],
  },
  async ({ shopApi }) => {
    const page = await shopApi.products();

    for (const product of page.data) {
      expect(product.name.trim(), `product ${product.id} has no name`).not.toBe('');
      expect(product.price, `product "${product.name}" is priced at ${product.price}`).toBeGreaterThan(0);
    }
  },
);

test(
  'TOOL-4-03 · The categories endpoint lists the categories the storefront filters by @api',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-4-03' },
      { type: 'jira', description: 'TOOL-4' },
    ],
  },
  async ({ shopApi }) => {
    const categories = await shopApi.categories();

    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.name.trim()).not.toBe('');
      expect(category.slug.trim()).not.toBe('');
    }
  },
);

test(
  'TOOL-4-05 · The catalogue pages to its stated last page, and answers past it @boundary @api',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-4-05' },
      { type: 'jira', description: 'TOOL-4' },
    ],
  },
  async ({ shopApi }) => {
    /*
       The bounds are the service's own, read from the envelope rather than
       written down: `per_page`, `last_page` and `total` come back with every
       page, so this asserts a range the application states about itself and
       cannot go stale when the catalogue grows.

       **Both halves, and the second is the one usually skipped.** Proving that
       a page past the end is handled says nothing about the range being right:
       a service that answered an empty page for *every* request would satisfy
       it perfectly. So the first page is asserted to be full, and the last one
       to reach the total.
    */
    const first = await shopApi.products(1);

    expect(first.current_page).toBe(1);
    expect(first.last_page, 'a catalogue that fits on one page tests no boundary')
      .toBeGreaterThan(1);
    expect(first.data, 'the first page of several should be a full one').toHaveLength(
      first.per_page,
    );
    expect(first.from).toBe(1);

    const last = await shopApi.products(first.last_page);

    expect(last.current_page).toBe(first.last_page);
    expect(last.data.length, 'the last page carried nothing').toBeGreaterThan(0);
    expect(last.data.length, 'the last page cannot hold more than a page').toBeLessThanOrEqual(
      first.per_page,
    );
    expect(last.to, 'the last page should reach the total, or products are unreachable').toBe(
      last.total,
    );

    /*
       One past the end. Measured before it was written: the service answers
       200 with an empty set and nulls the range, rather than refusing or
       clamping to the last page — so this asserts what it does rather than
       what a paginator might be expected to do.
    */
    const past = await shopApi.products(first.last_page + 1);

    expect(past.data, 'past the last page should be empty, not a repeat of it').toHaveLength(0);
    expect(past.total, 'the total is a property of the catalogue, not of the page').toBe(
      first.total,
    );
  },
);
