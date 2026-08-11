import { expect, test } from '../../fixtures';
import type { CatalogItem, SortOption } from '../../data/catalog';

/**
 * GOLDEN EXAMPLE — the data-driven shape.
 *
 * One case, four orderings. The parameters carry their own PractiTest id so a
 * failure names the ordering that broke rather than "the sorting test".
 */
const orderings: Array<{
  option: SortOption;
  caseId: string;
  ordered: (items: CatalogItem[]) => CatalogItem[];
}> = [
  {
    option: 'Name (A to Z)',
    caseId: '5110',
    ordered: (items) => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    option: 'Name (Z to A)',
    caseId: '5111',
    ordered: (items) => [...items].sort((a, b) => b.name.localeCompare(a.name)),
  },
  {
    option: 'Price (low to high)',
    caseId: '5112',
    ordered: (items) => [...items].sort((a, b) => a.price - b.price),
  },
  {
    option: 'Price (high to low)',
    caseId: '5113',
    ordered: (items) => [...items].sort((a, b) => b.price - a.price),
  },
];

for (const { option, caseId, ordered } of orderings) {
  test(
    `SD-02x · Products are listed in order for "${option}" @inventory`,
    { annotation: [{ type: 'practitest', description: caseId }] },
    async ({ authedPage, inventory }) => {
      await inventory.open(authedPage);

      await inventory.sortBy(authedPage, option);
      const displayed = await inventory.readDisplayedProducts(authedPage);

      expect(displayed).toEqual(ordered(displayed));
    },
  );
}

test(
  'SD-030 · The cart badge counts the products added @smoke @inventory',
  { annotation: [{ type: 'practitest', description: '5120' }] },
  async ({ authedPage, inventory, testData }) => {
    const items = testData.catalogItems({ count: 3 });

    await inventory.open(authedPage);
    expect(await inventory.cartCount(authedPage)).toBe(0);

    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );

    expect(await inventory.cartCount(authedPage)).toBe(items.length);
  },
);
