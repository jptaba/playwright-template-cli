import { describe as describeScan } from '../../../../integrations/a11y/scanner';
import { expect, test } from '../../fixtures';

/**
 * L4 — accessibility behind the sign-in.
 *
 * Landing pages pass on almost every application. The dialogs, the tables, the
 * multi-step forms and the administrative screens are where the problems live,
 * and all of them are behind a session — which is why the `a11y` project takes
 * a `setup:auth` dependency and runs signed in by default.
 */

test(
  'TS-Y14 · The account overview meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9214' }] },
  async ({ authedPage, a11y, account }) => {
    await account.open(authedPage);

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y15 · The profile page meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9215' }] },
  async ({ authedPage, a11y, account }) => {
    await account.openProfile(authedPage);

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y16 · The favourites list meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9216' }] },
  async ({ authedPage, a11y, account }) => {
    await account.openFavourites(authedPage);

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y17 · The invoice table meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9217' }] },
  async ({ authedPage, a11y, account }) => {
    await account.openInvoices(authedPage);

    // A data table is the classic accessibility failure: headers that are not
    // headers, and a paginator that is a row of unlabelled links.
    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y18 · The messages page meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9218' }] },
  async ({ authedPage, a11y }) => {
    await authedPage.goto('/account/messages');
    await authedPage.waitForLoadState('networkidle');

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y19 · The account menu meets WCAG 2.2 AA once opened @a11y',
  { annotation: [{ type: 'practitest', description: '9219' }] },
  async ({ authedPage, a11y, account }) => {
    await account.open(authedPage);
    await account.openUserMenu(authedPage);

    // An open menu is a different accessibility problem from a closed one:
    // focus management, `aria-expanded`, and whether it can be dismissed.
    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y20 · The cart meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9220' }] },
  async ({ authedPage, a11y, catalog, product, checkout }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test(
  'TS-Y21 · The billing step of checkout meets WCAG 2.2 AA @a11y',
  { annotation: [{ type: 'practitest', description: '9221' }] },
  async ({ authedPage, a11y, catalog, product, checkout, testData }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);
    await checkout.proceedToPayment(authedPage, testData.billingAddress());

    const scan = await a11y.scan(authedPage);

    expect(scan.violations, describeScan(scan)).toEqual([]);
  },
);

test.describe('As an administrator', () => {
  test.use({ role: 'admin' });

  test(
    'TS-Y22 · The sales dashboard meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9222' }] },
    async ({ authedPage, a11y, admin }) => {
      await admin.openDashboard(authedPage);

      const scan = await a11y.scan(authedPage);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y23 · Product maintenance meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9223' }] },
    async ({ authedPage, a11y, admin }) => {
      await admin.openProducts(authedPage);

      const scan = await a11y.scan(authedPage);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y24 · Brand maintenance meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9224' }] },
    async ({ authedPage, a11y, admin }) => {
      await admin.openBrands(authedPage);

      const scan = await a11y.scan(authedPage);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y25 · Customer maintenance meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9225' }] },
    async ({ authedPage, a11y, admin }) => {
      await admin.openUsers(authedPage);

      const scan = await a11y.scan(authedPage);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );
});
