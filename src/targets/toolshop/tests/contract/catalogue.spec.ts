import { expect, test } from '../../fixtures';

/**
 * The catalogue service against its published schema (§05).
 *
 * These specs assert **shape**, and the API specs next door assert
 * **behaviour** — neither doing the other's job. The mechanism is the shared
 * client: in the `contract` project it is built with `throwOnDrift: true`, so
 * any response that no longer validates against the vendored, pinned document
 * fails the call itself. A spec here therefore proves conformance by *making
 * the call at all*, and its assertions exist to prove the call was worth
 * making.
 *
 * **That last part is the whole design of this file.** A schema check over an
 * empty collection is very nearly worthless: `[]` validates against almost any
 * array schema, so a suite that hit an empty catalogue would report a green
 * contract run having exercised none of the item shape. Every spec below
 * asserts that the response actually carried the thing whose shape is under
 * test.
 *
 * Exempt from `require-case-id` by design: these verify a published schema
 * rather than a scripted test case, so there is no PractiTest id to carry.
 */

/**
 * What this suite drives, as the document names it.
 *
 * Written down here — unusually for a spec — because in a contract test the
 * path *is* the subject under test rather than an implementation detail, and
 * because it lets the last spec report honestly on how much of an 87-operation
 * document this suite actually covers. It is not a host, and nothing resolves
 * against it: the base URL still comes from the profile.
 */
const VALIDATED = [
  'GET /products',
  'GET /products/{productId}',
  'GET /products/search',
  'GET /products/{productId}/related',
  'GET /categories',
];

test('The product listing conforms, and carries products for its item schema to be tested against', async ({
  shopApi,
}) => {
  const page = await shopApi.products();

  // An empty page would validate against the envelope and prove nothing about
  // a product, which is most of what this document describes.
  expect(page.data.length, 'an empty catalogue exercises none of the product schema').toBeGreaterThan(0);
  expect(page.total).toBeGreaterThanOrEqual(page.data.length);
});

test('A single product conforms, read by an id the application gave us', async ({ shopApi }) => {
  // Derived, never transcribed. A written-down id is a hallucinated locator in
  // another costume: it fails silently the day the demo is reseeded.
  const [first] = (await shopApi.products()).data;
  expect(first, 'the catalogue returned no product to read').toBeDefined();

  const product = await shopApi.product(first!.id);

  expect(product.id).toBe(first!.id);
  expect(product.name.trim()).not.toBe('');
});

test('Related products conform, which is the array-of-items shape rather than the page envelope', async ({
  shopApi,
}) => {
  const [first] = (await shopApi.products()).data;
  expect(first, 'the catalogue returned no product to relate to').toBeDefined();

  const related = await shopApi.related(first!.id);

  /*
     Deliberately not asserted to be non-empty: a product legitimately having
     no related products is the service's answer, not a defect, and an
     assertion here would fail on the catalogue rather than on the contract.
     The shape is still checked by the call — this endpoint answers a bare
     array where its neighbours answer the page envelope, which is exactly the
     kind of difference a contract suite exists to hold still.
  */
  expect(Array.isArray(related)).toBe(true);
});

test('A search that matches nothing still conforms, which is where an envelope usually breaks', async ({
  shopApi,
  testData,
}) => {
  /*
     This spec found real drift the day it was written: the document types the
     envelope's `from` and `to` as integers and the service answers null when
     nothing matches. It is the vendor's demo and the vendor's document, so it
     is accepted as a **contract waiver in the profile**, with a reason and a
     review date `target:doctor` enforces — not deleted, and not left failing.

     The spec therefore passes, and the next one asserts that the exception is
     still exactly two properties wide.
  */
  const page = await shopApi.search(testData.termThatMatchesNothing);

  // Asserting the emptiness is what proves the empty branch was the branch
  // taken, rather than a search that quietly matched something.
  expect(page.data).toHaveLength(0);
  expect(page.total).toBe(0);
});

test('The accepted drift is still exactly the two properties the profile waived', async ({
  shopApi,
  contracts,
  testData,
}) => {
  /*
     The counterweight to the waiver, and the reason a waiver beats deleting
     the spec. `waived()` records what it suppressed, so an exception granted
     for two properties cannot quietly become nine: if the service starts
     answering null somewhere else on this endpoint, that failure is not
     covered and still throws — and if it stops answering null here at all,
     this assertion fails and the waiver should go.
  */
  await shopApi.search(testData.termThatMatchesNothing);

  const waived = contracts!.waived();
  expect(waived.map((drift) => drift.at).sort()).toEqual(['/from', '/to']);
  expect(new Set(waived.map((drift) => drift.endpoint))).toEqual(
    new Set(['GET /products/search']),
  );
});

test('The categories listing conforms, and carries categories', async ({ shopApi }) => {
  const categories = await shopApi.categories();

  expect(categories.length, 'an empty list exercises none of the category schema').toBeGreaterThan(0);
});

test('This suite says how much of the published document it actually validates', async ({
  contracts,
}) => {
  expect(contracts, 'the contracts capability is on but no document was loaded').not.toBeNull();

  const documented = contracts!.operations();
  const validated = new Set(VALIDATED);

  // A typo in the list above would silently reduce coverage while looking like
  // an endpoint, so every entry has to exist in the document.
  const published = new Set(documented.map((operation) => `${operation.method} ${operation.path}`));
  for (const endpoint of VALIDATED) {
    expect(published.has(endpoint), `${endpoint} is not in the published document`).toBe(true);
  }

  /*
     Reported, not asserted against a threshold. A contract suite covering 5 of
     87 operations is the honest current state, and a failing assertion here
     would only ever be silenced by lowering the number. Attaching it puts the
     gap in the run report, where the next person to extend this file can see
     what is missing rather than assuming the capability is covered.
  */
  const uncovered = contracts!.uncovered(validated);
  await test.info().attach('contract-coverage', {
    contentType: 'text/plain',
    body:
      `${validated.size} of ${documented.length} documented operation(s) validated by this suite.\n\n` +
      `Not validated:\n${uncovered.map((o) => `  ${o.method} ${o.path}`).join('\n')}\n`,
  });

  expect(uncovered.length).toBeLessThan(documented.length);
});
