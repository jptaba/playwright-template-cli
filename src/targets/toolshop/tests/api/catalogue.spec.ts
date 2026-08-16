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
