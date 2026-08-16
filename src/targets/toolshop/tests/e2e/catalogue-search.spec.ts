import { expect, test } from '../../fixtures';

/**
 * TOOL-1 — searching the catalogue.
 *
 * Read aloud, each of these matches the case it names step for step.
 */

test(
  'TOOL-1-01 · Searching for a tool shows only the products that match it @smoke @catalogue',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-1-01' },
      { type: 'jira', description: 'TOOL-1' },
    ],
  },
  async ({ page, catalogue, testData }) => {
    await catalogue.open(page);
    const everything = await catalogue.productNames(page);

    const matches = await catalogue.search(page, testData.searchTerm);

    expect(matches.length, 'the search found nothing to check').toBeGreaterThan(0);
    for (const name of matches) {
      expect(name.toLowerCase()).toContain(testData.searchTerm.toLowerCase());
    }
    /*
       Narrower than the unfiltered listing, rather than "exactly four". The
       catalogue is shared with everybody else using this demo and nothing here
       created it — an exact count passes until somebody adds a fifth pair of
       pliers, and then fails for a reason unrelated to what this proves.
    */
    expect(matches.length).toBeLessThan(everything.length);
  },
);

test(
  'TOOL-1-02 · A search that matches nothing says so rather than showing an empty page @catalogue',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-1-02' },
      { type: 'jira', description: 'TOOL-1' },
    ],
  },
  async ({ page, catalogue, testData }) => {
    await catalogue.open(page);

    const matches = await catalogue.search(page, testData.termThatMatchesNothing);

    expect(matches).toEqual([]);
    await expect(page.getByTestId('no-results')).toHaveText('There are no products found.');
  },
);
