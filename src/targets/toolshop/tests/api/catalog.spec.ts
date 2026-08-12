import { expect, test } from '../../fixtures';

/**
 * L4 — the catalogue over HTTP.
 *
 * The `api` project runs with no browser at all, which is most of the
 * wall-clock time in a naive mixed suite. Every response passing through the
 * shared client is also validated against the vendored OpenAPI document on the
 * way, so each of these is a schema check as well as a behavioural one.
 */

test(
  'TS-A01 · The product list answers a paginated page of products @smoke @api',
  { annotation: [{ type: 'practitest', description: '9101' }] },
  async ({ catalogApi }) => {
    const page = await catalogApi.listProducts({ limit: 5 });

    expect(page.current_page).toBe(1);
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThanOrEqual(page.data.length);
  },
);

test(
  'TS-A02 · A product read by id is the product the list advertised @api',
  { annotation: [{ type: 'practitest', description: '9102' }] },
  async ({ catalogApi }) => {
    const listed = await catalogApi.firstProduct();

    const read = await catalogApi.readProduct(listed.id);

    expect(read.id).toBe(listed.id);
    expect(read.name).toBe(listed.name);
    expect(read.price).toBeCloseTo(listed.price, 2);
  },
);

test(
  'TS-A03 · A product that does not exist is refused with 404 and a message @api',
  { annotation: [{ type: 'practitest', description: '9103' }] },
  async ({ catalogApi }) => {
    const { status, body } = await catalogApi.readMissingProduct('01ZZZZZZZZZZZZZZZZZZZZZZZZ');

    expect(status).toBe(404);
    expect(body).toHaveProperty('message');
  },
);

test(
  'TS-A04 · Product search returns only products matching the term @api',
  { annotation: [{ type: 'practitest', description: '9104' }] },
  async ({ catalogApi }) => {
    const found = await catalogApi.searchProducts('Hammer');

    expect(found.data.length).toBeGreaterThan(0);
    for (const product of found.data) {
      expect(
        `${product.name} ${product.description}`.toLowerCase(),
        `${product.name} matches the search term somewhere`,
      ).toContain('hammer');
    }
  },
);

test(
  'TS-A05 · Every product carries a price above zero @api',
  { annotation: [{ type: 'practitest', description: '9105' }] },
  async ({ catalogApi }) => {
    const page = await catalogApi.listProducts({ limit: 20 });

    for (const product of page.data) {
      expect(product.price, `${product.name} is priced`).toBeGreaterThan(0);
      expect(product.name, 'every product is named').not.toBe('');
    }
  },
);

test(
  'TS-A06 · The category list gives every category a slug @api',
  { annotation: [{ type: 'practitest', description: '9106' }] },
  async ({ catalogApi }) => {
    const categories = await catalogApi.listCategories();

    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.slug, `${category.name} has a slug`).not.toBe('');
    }
  },
);

test(
  'TS-A07 · The category tree nests every child under its declared parent @api',
  { annotation: [{ type: 'practitest', description: '9107' }] },
  async ({ catalogApi }) => {
    const flat = await catalogApi.listCategories();
    const tree = await catalogApi.categoryTree();

    const roots = flat.filter((category) => category.parent_id === null);
    expect(tree.length, 'the tree has one entry per top-level category').toBe(roots.length);
    for (const branch of tree) {
      for (const child of branch.sub_categories ?? []) {
        expect(child.parent_id, `${child.name} is nested under its own parent`).toBe(branch.id);
      }
    }
  },
);

test(
  'TS-A08 · The brand list gives every brand a name and a slug @api',
  { annotation: [{ type: 'practitest', description: '9108' }] },
  async ({ catalogApi }) => {
    const brands = await catalogApi.listBrands();

    expect(brands.length).toBeGreaterThan(0);
    for (const brand of brands) {
      expect(brand.name).not.toBe('');
      expect(brand.slug).not.toBe('');
    }
  },
);

test(
  'TS-A09 · A brand read by id is the brand the list advertised @api',
  { annotation: [{ type: 'practitest', description: '9109' }] },
  async ({ catalogApi }) => {
    const [listed] = await catalogApi.listBrands();
    expect(listed).toBeDefined();

    const read = await catalogApi.readBrand(listed!.id);

    expect(read).toMatchObject({ id: listed!.id, name: listed!.name });
  },
);

test(
  'TS-A10 · A product’s specifications each carry a name and a value @api',
  { annotation: [{ type: 'practitest', description: '9110' }] },
  async ({ catalogApi }) => {
    const product = await catalogApi.firstProduct();

    const specifications = await catalogApi.productSpecs(product.id);

    expect(specifications.length).toBeGreaterThan(0);
    for (const specification of specifications) {
      expect(specification.name).not.toBe('');
      expect(String(specification.value)).not.toBe('');
    }
  },
);

test(
  'TS-A11 · Related products never include the product they relate to @api',
  { annotation: [{ type: 'practitest', description: '9111' }] },
  async ({ catalogApi }) => {
    const product = await catalogApi.firstProduct();

    const related = await catalogApi.relatedProducts(product.id);

    expect(related.map((entry) => entry.id)).not.toContain(product.id);
  },
);

test(
  'TS-A12 · The product list declares JSON and a cache policy @api',
  { annotation: [{ type: 'practitest', description: '9112' }] },
  async ({ catalogApi }) => {
    const { status, headers } = await catalogApi.listProductsTransport();

    /*
       A large class of real contract lives only in headers — content type,
       cache directives, `Location` on a redirect, rate-limit budgets — and a
       client that discarded them could not express this assertion at all.
    */
    expect(status).toBe(200);
    expect(headers['content-type']).toContain('application/json');
    expect(
      headers['cache-control'],
      'a public catalogue states how long it may be cached',
    ).toBeDefined();
  },
);
