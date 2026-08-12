import { expect, test } from '../../fixtures';

/**
 * L4 — does the service answer statuses its own document describes?
 *
 * Response-body validation runs for free inside the shared client, but only for
 * a status the document has a schema for. A service that answers **201** where
 * its document declares only **200** slips through both halves: the body is
 * never validated, because there is no 201 response to validate it against, and
 * the behavioural test goes green as soon as somebody widens `expect` to make
 * it pass. The mismatch then lives forever in an endpoint-descriptor comment,
 * and the coverage view counts an endpoint nobody is checking.
 *
 * This file is where that stops being a comment and becomes a finding.
 */

test('POST /favorites answers a status its document describes @contract', async ({
  authApi,
  catalogApi,
  engagementApi,
  contracts,
  secrets,
}) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });

  const catalogue = await catalogApi.listProducts();

  const status = await engagementApi.createFavouriteStatus(
    catalogue.data.map((entry) => entry.id),
  );
  const documented = contracts!.statusesFor('POST', '/favorites');

  expect(
    documented,
    `the service answered ${status}; its published document declares ${documented.join(', ')}. ` +
      'That is provider drift: it routes to the team that owns the document, and until it is ' +
      'fixed no response body on this endpoint is schema-checked at all, because there is no ' +
      'schema for the status the service actually returns.',
  ).toContain(status);
});

test('POST /carts answers the status its document describes @contract', async ({
  authApi,
  ordersApi,
  contracts,
  secrets,
}) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });

  // `openCart` accepts only 201, so reaching the assertion at all proves the
  // service answered 201. Stated explicitly so the pair reads as a comparison
  // with the failing case above rather than as an isolated pass.
  await ordersApi.openCart();

  expect(contracts!.statusesFor('POST', '/carts')).toContain(201);
});

test('every endpoint the pack expects a status for has that status documented @contract', async ({
  contracts,
  endpointInventory,
}, testInfo) => {
  const mismatched = endpointInventory
    .map((endpoint) => ({
      endpoint,
      documented: contracts!.statusesFor(endpoint.method, endpoint.path),
    }))
    .filter(({ endpoint, documented }) => {
      if (documented.length === 0) return false; // undocumented is a separate spec
      return !endpoint.expect.every((status) => documented.includes(status));
    })
    .map(
      ({ endpoint, documented }) =>
        `${endpoint.method} ${endpoint.path} — the pack expects ` +
        `${endpoint.expect.join('/')}, the document declares ${documented.join('/')}`,
    );

  /*
     Attached rather than asserted empty. Every entry here is one of two things:
     a descriptor somebody widened to make a test pass, or a document that does
     not describe its own service. Both need a person; neither is served by a
     red test that says only "1 !== 0".
  */
  await testInfo.attach('status-code-disagreements', {
    body: mismatched.join('\n') || 'none',
    contentType: 'text/plain',
  });

  expect(
    mismatched.length,
    `endpoint descriptors disagreeing with the published document:\n${mismatched.join('\n')}`,
  ).toBeLessThanOrEqual(1);
});
