import { expect, test } from '../../fixtures';

/**
 * L4 — performance **budgets**, not load testing.
 *
 * Load testing stays refused: it needs different tooling and a dedicated
 * environment, and numbers from a shared runner against a shared public demo
 * are not actionable. A budget is a different claim — an assertion that a
 * journey the suite already drives finishes inside a stated ceiling — and it
 * costs one assertion on a test that was running anyway.
 *
 * The ceilings below are deliberately loose. A tight budget on a shared runner
 * against a shared host is a flake generator, and a flaky performance test
 * teaches a team to ignore performance tests.
 */

const LISTING_BUDGET_MS = 12_000;
const SEARCH_BUDGET_MS = 10_000;

test(
  'TS-E43 · The storefront listing renders inside its budget @performance',
  { annotation: [{ type: 'practitest', description: '9043' }] },
  async ({ authedPage, catalog }) => {
    const started = Date.now();

    await catalog.open(authedPage);
    const cards = await catalog.readCards(authedPage);

    const elapsed = Date.now() - started;
    // A budget met by an empty page is not a budget met.
    expect(cards.length, 'the listing actually rendered products').toBeGreaterThan(0);
    expect(
      elapsed,
      `the listing took ${elapsed}ms against a ${LISTING_BUDGET_MS}ms budget`,
    ).toBeLessThan(LISTING_BUDGET_MS);
  },
);

test(
  'TS-E44 · A catalogue search answers inside its budget @performance',
  { annotation: [{ type: 'practitest', description: '9044' }] },
  async ({ authedPage, catalog }) => {
    await catalog.open(authedPage);
    const started = Date.now();

    const found = await catalog.search(authedPage, 'Hammer');

    const elapsed = Date.now() - started;
    expect(found.length, 'the search actually returned products').toBeGreaterThan(0);
    expect(
      elapsed,
      `the search took ${elapsed}ms against a ${SEARCH_BUDGET_MS}ms budget`,
    ).toBeLessThan(SEARCH_BUDGET_MS);
  },
);
