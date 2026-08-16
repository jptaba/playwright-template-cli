import { expect, test } from '../../fixtures';

/**
 * TOOL-4-04 — the one spec that spans both, and is reported as `mixed`.
 *
 * The storefront is a client of the same API, so the two have to agree. This
 * is exactly the case §05 calls integration: a journey that crosses the UI and
 * the service, asserting the thing neither half can assert alone.
 */

test(
  'TOOL-4-04 · Searching the API returns the same products the storefront shows @api @catalogue',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-4-04' },
      { type: 'jira', description: 'TOOL-4' },
    ],
  },
  async ({ page, catalogue, shopApi, testData }) => {
    await catalogue.open(page);
    const onScreen = (await catalogue.search(page, testData.searchTerm)).sort();

    const fromApi = (await shopApi.search(testData.searchTerm)).data.map((p) => p.name).sort();

    expect(onScreen.length, 'the search found nothing to compare').toBeGreaterThan(0);
    expect(onScreen, 'the storefront and the API disagree about what matches').toEqual(fromApi);
  },
);
