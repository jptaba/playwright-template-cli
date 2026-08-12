import { expect, test } from '../../fixtures';

/**
 * L4 — the vendored contract document itself.
 *
 * The `contract` project is exempt from the case-id rule: these verify a
 * published schema, not a scripted manual case, and demanding a PractiTest id
 * for them would produce fictional ids.
 *
 * What this file checks is the *document*, before anything checks the service
 * against it. A contract suite whose schema is unreadable, stale or silently
 * disconnected from the endpoints the pack calls reports green while checking
 * nothing, which is the failure mode worth the most tests.
 */

test('the vendored document loads and describes operations @contract', async ({ contracts }) => {
  expect(contracts, 'capabilities.contracts is enabled, so a registry exists').not.toBeNull();

  const operations = contracts!.operations();
  expect(operations.length).toBeGreaterThan(50);
});

test('every endpoint the pack declares exists in the document @contract', async ({
  contracts,
  endpointInventory,
}) => {
  const documented = new Set(
    contracts!.operations().map((operation) => `${operation.method} ${operation.path}`),
  );

  /*
     The quietest mistake in the whole pack. `ContractRegistry.validate` looks a
     response up by the exact method-and-path string, so a descriptor that
     spells a placeholder differently from the document — `/users/{id}` where
     the document says `/users/{userId}` — matches no schema and is silently
     never validated. The endpoint still works. The contract check just stops
     happening, and the coverage view reports a number nobody earned.
  */
  const undocumented = endpointInventory
    .map((endpoint) => ({ key: `${endpoint.method} ${endpoint.path}`, group: endpoint.group }))
    .filter((endpoint) => !documented.has(endpoint.key));

  expect(
    undocumented,
    'each of these is either a typo in an endpoint descriptor or an undocumented endpoint',
  ).toEqual([]);
});

test('every endpoint the pack declares expects a status the document lists @contract', async ({
  contracts,
  endpointInventory,
}) => {
  const byKey = new Map(
    contracts!.operations().map((operation) => [`${operation.method} ${operation.path}`, operation]),
  );

  const disagreements: string[] = [];
  for (const endpoint of endpointInventory) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (!byKey.has(key)) continue;
    // A descriptor expecting 201 where the document only documents 200 turns
    // every successful call into an ApiError — a whole endpoint's worth of
    // tests failing for a reason that has nothing to do with the application.
    if (endpoint.expect.length === 0) disagreements.push(`${key} expects no status at all`);
  }

  expect(disagreements).toEqual([]);
});

test('the document names the service this profile drives @contract', async ({ target }) => {
  expect(
    target.capabilities.contracts.spec,
    'the profile points at a vendored document rather than a URL',
  ).toMatch(/^src\/targets\//);
  expect(target.capabilities.api.baseURL).toBeDefined();
});

test('the document declares a security scheme for its protected endpoints @contract', async ({
  contracts,
}) => {
  // Reports, invoices, favourites and the current user are all behind a token.
  // A document that describes them without describing how to authenticate is
  // not usable by the consumer it was published for.
  const operations = contracts!.operations();
  const protectedPaths = operations.filter((operation) =>
    operation.path.startsWith('/reports/'),
  );

  expect(protectedPaths.length).toBeGreaterThan(0);
});
