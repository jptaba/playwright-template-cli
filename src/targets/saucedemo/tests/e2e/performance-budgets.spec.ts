import { expect, test } from '../../fixtures';
import { siteApi } from '../../api/site';

/**
 * Performance **budgets**, not load testing.
 *
 * §05 refuses load and performance testing outright: it needs different
 * tooling and a dedicated environment, and bolting it onto a functional suite
 * produces numbers nobody can act on from a shared runner under unknown
 * contention.
 *
 * What is in scope, and cheap, is a budget: an assertion that a journey the
 * suite already drives completes inside a stated ceiling. It catches the
 * order-of-magnitude regression — the one a user would notice — and it costs
 * one assertion on a test that was running anyway.
 *
 * The budgets are deliberately loose. A tight budget on a shared runner is a
 * flake generator, and a flaky performance test teaches a team to ignore
 * performance tests.
 */
const BUDGETS = {
  documentMs: 3_000,
  listingMs: 6_000,
  checkoutMs: 12_000,
};

test(
  'SD-110 · The sign-in document arrives inside its budget @performance',
  { annotation: [{ type: 'practitest', description: '5210' }] },
  async ({ api }) => {
    const site = siteApi(api);

    const startedAt = Date.now();
    const landing = await site.landing();
    const elapsed = Date.now() - startedAt;

    expect(landing.status).toBe(200);
    expect(
      elapsed,
      `the document took ${elapsed}ms against a ${BUDGETS.documentMs}ms budget`,
    ).toBeLessThan(BUDGETS.documentMs);
  },
);

test(
  'SD-111 · The product listing is usable inside its budget @performance',
  { annotation: [{ type: 'practitest', description: '5211' }] },
  async ({ authedPage, inventory }) => {
    const startedAt = Date.now();
    await inventory.open(authedPage);
    const products = await inventory.readDisplayedProducts(authedPage);
    const elapsed = Date.now() - startedAt;

    // "Usable" means the products are actually there, not merely that some
    // load event fired — a budget met by an empty page is not a budget met.
    expect(products.length).toBeGreaterThan(0);
    expect(
      elapsed,
      `the listing took ${elapsed}ms against a ${BUDGETS.listingMs}ms budget`,
    ).toBeLessThan(BUDGETS.listingMs);
  },
);

test(
  'SD-112 · A whole purchase completes inside its budget @performance',
  { annotation: [{ type: 'practitest', description: '5212' }] },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });

    const startedAt = Date.now();
    await inventory.open(authedPage);
    await inventory.addToCart(
      authedPage,
      items.map((item) => item.name),
    );
    await checkout.completeThroughOverview(authedPage, testData.customer());
    const confirmation = await checkout.placeOrder(authedPage);
    const elapsed = Date.now() - startedAt;

    expect(confirmation.heading).toBe('Thank you for your order!');
    expect(
      elapsed,
      `the purchase took ${elapsed}ms against a ${BUDGETS.checkoutMs}ms budget`,
    ).toBeLessThan(BUDGETS.checkoutMs);
  },
);

test(
  'SD-113 · Assets are not pathologically large @performance @api',
  { annotation: [{ type: 'practitest', description: '5213' }] },
  async ({ api }) => {
    const site = siteApi(api);
    const landing = await site.landing();

    const references = [...landing.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
      .map((match) => match[1]!)
      .slice(0, 4);

    for (const reference of references) {
      const asset = await site.asset(reference);
      // A page-weight regression usually arrives as one asset growing by an
      // order of magnitude, which a ceiling this loose still catches.
      expect(asset.bytes, `${reference} is ${asset.bytes} bytes`).toBeLessThan(5_000_000);
    }
  },
);
