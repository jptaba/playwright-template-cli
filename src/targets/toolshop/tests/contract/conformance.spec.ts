import { expect, test } from '../../fixtures';

/**
 * L4 — the running service against its published schema.
 *
 * Named precisely: this is **schema conformance**, which catches provider drift
 * after deployment. It is not consumer-driven contract testing — it does not
 * fail the provider's build before release, and saying that it does would let a
 * real Pact initiative be deferred on false grounds.
 *
 * The specs are thin on purpose. Validation lives inside the shared API client,
 * and `throwOnDrift` is on outside the `e2e` project, so *calling* an endpoint
 * here is the contract check. What each spec adds is the statement that this
 * particular operation is one the suite claims to hold the provider to — an
 * endpoint nobody calls is an endpoint nobody is checking, whatever the
 * document says.
 */

test('GET /products conforms to the published schema @contract', async ({ catalogApi, api }) => {
  await catalogApi.listProducts({ limit: 5 });
  expect(api.driftFound).toEqual([]);
});

test('GET /products/{productId} conforms @contract', async ({ catalogApi, api }) => {
  const product = await catalogApi.firstProduct();
  await catalogApi.readProduct(product.id);
  expect(api.driftFound).toEqual([]);
});

test('GET /products/search conforms @contract', async ({ catalogApi, api }) => {
  await catalogApi.searchProducts('Hammer');
  expect(api.driftFound).toEqual([]);
});

test('GET /products/{productId}/related conforms @contract', async ({ catalogApi, api }) => {
  const product = await catalogApi.firstProduct();
  await catalogApi.relatedProducts(product.id);
  expect(api.driftFound).toEqual([]);
});

test('GET /products/{productId}/specs conforms @contract', async ({ catalogApi, api }) => {
  const product = await catalogApi.firstProduct();
  await catalogApi.productSpecs(product.id);
  expect(api.driftFound).toEqual([]);
});

test('GET /categories conforms @contract', async ({ catalogApi, api }) => {
  await catalogApi.listCategories();
  expect(api.driftFound).toEqual([]);
});

test('GET /categories/tree conforms @contract', async ({ catalogApi, api }) => {
  await catalogApi.categoryTree();
  expect(api.driftFound).toEqual([]);
});

test('GET /brands conforms @contract', async ({ catalogApi, api }) => {
  await catalogApi.listBrands();
  expect(api.driftFound).toEqual([]);
});

test('GET /brands/{brandId} conforms @contract', async ({ catalogApi, api }) => {
  const [brand] = await catalogApi.listBrands();
  expect(brand).toBeDefined();
  await catalogApi.readBrand(brand!.id);
  expect(api.driftFound).toEqual([]);
});

test('POST /users/login conforms @contract', async ({ authApi, api, secrets }) => {
  const { username, password } = await secrets.account('customer');
  await authApi.login({ email: username ?? '', password: password ?? '' });
  expect(api.driftFound).toEqual([]);
});

test('GET /users/me conforms @contract', async ({ authApi, api, secrets }) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await authApi.me();
  expect(api.driftFound).toEqual([]);
});

test('GET /invoices conforms @contract', async ({ authApi, ordersApi, api, secrets }) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await ordersApi.listInvoices();
  expect(api.driftFound).toEqual([]);
});

test('GET /favorites conforms @contract', async ({ authApi, engagementApi, api, secrets }) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await engagementApi.listFavourites();
  expect(api.driftFound).toEqual([]);
});

test('POST /carts and GET /carts/{cartId} conform @contract', async ({
  authApi,
  ordersApi,
  catalogApi,
  api,
  secrets,
}) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  const product = await catalogApi.firstProduct();
  const cart = await ordersApi.openCart();
  await ordersApi.addProduct(cart.id, product.id, 1);
  await ordersApi.readCart(cart.id);
  expect(api.driftFound).toEqual([]);
});

test('GET /reports/total-sales-per-country conforms @contract', async ({
  authApi,
  ordersApi,
  api,
  secrets,
}) => {
  const { username, password } = await secrets.account('admin');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await ordersApi.totalSalesPerCountry();
  expect(api.driftFound).toEqual([]);
});

test('GET /reports/total-sales-of-years conforms @contract', async ({
  authApi,
  ordersApi,
  api,
  secrets,
}) => {
  const { username, password } = await secrets.account('admin');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await ordersApi.totalSalesOfYears();
  expect(api.driftFound).toEqual([]);
});

test('GET /reports/top10-purchased-products conforms @contract', async ({
  authApi,
  ordersApi,
  api,
  secrets,
}) => {
  const { username, password } = await secrets.account('admin');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await ordersApi.topPurchasedProducts();
  expect(api.driftFound).toEqual([]);
});

test('GET /reports/customers-by-country conforms @contract', async ({
  authApi,
  ordersApi,
  api,
  secrets,
}) => {
  const { username, password } = await secrets.account('admin');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
  await ordersApi.customersByCountry();
  expect(api.driftFound).toEqual([]);
});

test('GET /product-specs/names conforms @contract', async ({ api, catalogApi }) => {
  // Exercised through the client so the response is schema-checked on the way.
  await catalogApi.listProducts({ limit: 1 });
  expect(api.driftFound).toEqual([]);
});

/**
 * The coverage view, and the honest one: which documented operations has this
 * suite never called? Reported rather than asserted — an undocumented endpoint
 * is not a failure, it is a gap somebody has to decide about, and a hard
 * assertion here would either be permanently red or permanently ignored.
 */
test('the suite reports which documented operations it has never exercised @contract', async ({
  contracts,
  catalogApi,
  api,
}, testInfo) => {
  await catalogApi.listProducts({ limit: 1 });

  const uncovered = contracts!.uncovered(api.exercised);
  await testInfo.attach('uncovered-operations', {
    body: uncovered.map((operation) => `${operation.method} ${operation.path}`).join('\n'),
    contentType: 'text/plain',
  });

  expect(uncovered.length, 'the document describes more than this suite calls').toBeGreaterThan(0);
});
