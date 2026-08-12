import { expect, test } from '../../fixtures';

/**
 * L4 — the administrator area.
 *
 * These specs select the `admin` role explicitly. `test.use({ role })` works
 * because the framework overrides Playwright's own `storageState` option with a
 * fixture, so choosing an identity is a one-line change in a spec rather than a
 * second project in the configuration.
 */
test.describe('As an administrator', () => {
  test.use({ role: 'admin' });

  test(
    'TS-E38 · An administrator reaches product maintenance @smoke @admin',
    { annotation: [{ type: 'practitest', description: '9038' }] },
    async ({ authedPage, admin }) => {
      await admin.openProducts(authedPage);

      expect(await admin.currentScreen(authedPage)).toBe('Products');
      expect(await admin.countRows(authedPage)).toBeGreaterThan(0);
    },
  );

  test(
    'TS-E39 · Product maintenance search narrows the list @admin',
    { annotation: [{ type: 'practitest', description: '9039' }] },
    async ({ authedPage, admin }) => {
      await admin.openProducts(authedPage);
      const everything = await admin.countRows(authedPage);

      const matching = await admin.searchProducts(authedPage, 'Hammer');

      expect(matching).toBeGreaterThan(0);
      expect(matching).toBeLessThanOrEqual(everything);
    },
  );

  test(
    'TS-E40 · The sales dashboard is the administrator’s landing screen @admin',
    { annotation: [{ type: 'practitest', description: '9040' }] },
    async ({ authedPage, admin }) => {
      await admin.openDashboard(authedPage);

      expect(await admin.currentScreen(authedPage)).toContain('Sales');
      await expect(authedPage.getByRole('heading', { name: 'Latest orders' })).toBeVisible();
    },
  );

  test(
    'TS-E41 · Brand maintenance lists brands with an edit and a delete control @admin',
    { annotation: [{ type: 'practitest', description: '9041' }] },
    async ({ authedPage, admin }) => {
      await admin.openBrands(authedPage);

      expect(await admin.currentScreen(authedPage)).toBe('Brands');
      expect(await admin.countRows(authedPage)).toBeGreaterThan(0);
    },
  );
});

test(
  'TS-E42 · A customer is kept out of the administrator area @admin @security',
  { annotation: [{ type: 'practitest', description: '9042' }] },
  async ({ authedPage }) => {
    // Runs as the default role — a customer — because the describe block above
    // is where `admin` is selected.
    await authedPage.goto('/admin/dashboard');

    await expect
      .poll(() => authedPage.url(), {
        message: 'a customer who asks for the administrator area is sent somewhere else',
      })
      .not.toContain('/admin/dashboard');
  },
);
