import { expect, test } from '../../fixtures';

/**
 * L4 — carts, favourites and asynchronous document rendering over HTTP.
 *
 * Everything created here is registered with the shared client and deleted in
 * fixture teardown, through the same authenticated client that created it.
 * That matters on a shared public deployment: orphaned test data is somebody
 * else's flaky test tomorrow.
 */

test.beforeEach(async ({ authApi, secrets }) => {
  const { username, password } = await secrets.account('customer');
  await authApi.signInAs({ email: username ?? '', password: password ?? '' });
});

test(
  'TS-A21 · A cart opened over the API can be read back @api @cart',
  { annotation: [{ type: 'practitest', description: '9121' }] },
  async ({ ordersApi, catalogApi }) => {
    const product = await catalogApi.firstProduct();
    const cart = await ordersApi.openCart();

    await ordersApi.addProduct(cart.id, product.id, 2);

    const contents = await ordersApi.readCart(cart.id);
    const line = contents.cart_items.find((item) => item.product_id === product.id);
    expect(line, 'the product is in the cart').toBeDefined();
    expect(line!.quantity).toBe(2);
  },
);

test(
  'TS-A22 · Changing a cart line’s quantity is reflected when it is read back @api @cart',
  { annotation: [{ type: 'practitest', description: '9122' }] },
  async ({ ordersApi, catalogApi }) => {
    const product = await catalogApi.firstProduct();
    const cart = await ordersApi.openCart();
    await ordersApi.addProduct(cart.id, product.id, 1);

    await ordersApi.changeQuantity(cart.id, product.id, 5);

    const contents = await ordersApi.readCart(cart.id);
    expect(contents.cart_items.find((item) => item.product_id === product.id)?.quantity).toBe(5);
  },
);

test(
  'TS-A23 · Removing a product empties it out of the cart @api @cart',
  { annotation: [{ type: 'practitest', description: '9123' }] },
  async ({ ordersApi, catalogApi }) => {
    const product = await catalogApi.firstProduct();
    const cart = await ordersApi.openCart();
    await ordersApi.addProduct(cart.id, product.id, 1);

    await ordersApi.removeProduct(cart.id, product.id);

    const contents = await ordersApi.readCart(cart.id);
    expect(contents.cart_items.map((item) => item.product_id)).not.toContain(product.id);
  },
);

test(
  'TS-A24 · A favourite added over the API appears in the favourites list @api',
  { annotation: [{ type: 'practitest', description: '9124' }] },
  async ({ engagementApi, catalogApi, run }) => {
    // Derived, not assumed: the account is shared and long-lived, and the first
    // product in the catalogue is very often already in its favourites. The
    // worker index partitions the free products so parallel workers signing in
    // as the same customer cannot pick the same one.
    const catalogue = await catalogApi.listProducts({ limit: 20 });
    const productId = await engagementApi.unfavouritedProductId(
      catalogue.data.map((entry) => entry.id),
      run.workerIndex,
    );

    await engagementApi.addFavourite(productId);

    const favourites = await engagementApi.listFavourites();
    expect(favourites.map((entry) => entry.product?.id ?? entry.product_id)).toContain(productId);
  },
);

test(
  'TS-A25 · The same product cannot be favourited twice @api',
  { annotation: [{ type: 'practitest', description: '9125' }] },
  async ({ engagementApi, catalogApi, run }) => {
    const catalogue = await catalogApi.listProducts({ limit: 20 });
    // A different slice from TS-A24's, for the same reason.
    const productId = await engagementApi.unfavouritedProductId(
      catalogue.data.map((entry) => entry.id).reverse(),
      run.workerIndex,
    );
    await engagementApi.ensureNotFavourited(productId);
    await engagementApi.addFavourite(productId);

    const status = await engagementApi.addDuplicateFavourite(productId);

    expect([409, 422], 'the duplicate is refused rather than silently accepted').toContain(status);
  },
);

test(
  'TS-A26 · An invoice PDF becomes available without the suite ever sleeping @api',
  { annotation: [{ type: 'practitest', description: '9126' }] },
  async ({ ordersApi }) => {
    const invoices = await ordersApi.listInvoices();
    const invoice = invoices.data[0];
    test.skip(!invoice, 'this account has no invoice to render');

    /*
       Rendering is asynchronous and the service publishes a status endpoint
       saying whether it has finished. `expect.poll` is the only acceptable
       answer to eventual consistency here: it fails as a clear assertion with
       the last value it saw, rather than as a hung test or a guessed sleep
       that is too short on a slow day and wasted time on a fast one.
    */
    await expect
      .poll(async () => ordersApi.pdfStatus(invoice!.invoice_number), {
        message: `the PDF for invoice ${invoice!.invoice_number} never finished rendering`,
        timeout: 30_000,
      })
      .toBeDefined();

    const contentType = await ordersApi.downloadPdfContentType(invoice!.invoice_number);
    expect(contentType).toContain('pdf');
  },
);

test(
  'TS-A27 · A brand created over the API is readable and then cleaned up @api',
  { annotation: [{ type: 'practitest', description: '9127' }] },
  async ({ authApi, catalogApi, secrets, testData }) => {
    const { username, password } = await secrets.account('admin');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });
    const name = testData.brandName();

    const created = await catalogApi.createBrand({ name, slug: name.toLowerCase() });

    expect(created.id).not.toBe('');
    const read = await catalogApi.readBrand(created.id);
    expect(read.name).toBe(name);
    // Deletion happens in the `api` fixture's teardown, through this same
    // authenticated client — `DELETE /brands/{brandId}` needs a token.
  },
);
