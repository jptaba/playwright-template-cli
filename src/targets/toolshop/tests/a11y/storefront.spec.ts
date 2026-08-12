import { describe as describeScan } from '../../../../integrations/a11y/scanner';
import { expect, test } from '../../fixtures';

/**
 * L4 — accessibility, against the standard the profile declares (`wcag22aa`).
 *
 * WCAG conformance is cumulative, and the tag ladder says so: 2.2 AA means
 * every A and AA criterion from 2.0 and 2.1 as well. Testing only what 2.2
 * added would be a much smaller claim wearing the same name.
 *
 * The `a11y` fixture returns findings and asserts nothing, deliberately. "No
 * critical violations" and "none at all" are different products' answers, and
 * that call belongs here where a reviewer can see it. This suite makes the
 * strict one: every violation at the declared standard fails, and the two
 * known upstream defects are scoped waivers in the profile rather than
 * assertions somebody quietly loosened.
 *
 * These pages are scanned signed out because that is how a shopper first meets
 * them.
 */
test.describe('Signed out', () => {
  test.use({ role: '' });

  test(
    'TS-Y01 · The storefront listing meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9201' }] },
    async ({ page, a11y }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y02 · A product page meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9202' }] },
    async ({ page, a11y, catalog, product }) => {
      await catalog.open(page);
      const [first] = await catalog.readCards(page);
      expect(first).toBeDefined();
      await product.open(page, first!.name);

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y03 · The sign-in form meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9203' }] },
    async ({ page, a11y }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y04 · The registration form meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9204' }] },
    async ({ page, a11y }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y05 · The registration form still meets the standard once it is reporting errors @a11y',
    { annotation: [{ type: 'practitest', description: '9205' }] },
    async ({ page, a11y, registration }) => {
      await registration.open(page);
      // The interesting state, and the one nobody scans: a form in its error
      // state has to announce what is wrong, not just render it in red.
      await registration.submitEmpty(page);

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y06 · The forgotten-password form meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9206' }] },
    async ({ page, a11y }) => {
      await page.goto('/auth/forgot-password');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y07 · The contact form meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9207' }] },
    async ({ page, a11y }) => {
      await page.goto('/contact');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y08 · The contact form in its error state meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9208' }] },
    async ({ page, a11y, contact }) => {
      await contact.open(page);
      await contact.submitEmpty(page);

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y09 · Search results meet WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9209' }] },
    async ({ page, a11y, catalog }) => {
      await catalog.open(page);
      await catalog.search(page, 'Hammer');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y10 · The privacy policy meets WCAG 2.2 AA @a11y',
    { annotation: [{ type: 'practitest', description: '9210' }] },
    async ({ page, a11y }) => {
      await page.goto('/privacy');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y11 · The category filter panel meets WCAG 2.2 AA once expanded @a11y',
    { annotation: [{ type: 'practitest', description: '9211' }] },
    async ({ page, a11y, catalog }) => {
      await catalog.open(page);
      await catalog.filterByCategory(page, 'Hammer');

      const scan = await a11y.scan(page);

      expect(scan.violations, describeScan(scan)).toEqual([]);
    },
  );

  test(
    'TS-Y12 · Checks axe could not decide are reported rather than treated as passes @a11y',
    { annotation: [{ type: 'practitest', description: '9212' }] },
    async ({ page, a11y }, testInfo) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      /*
         `incomplete` is not a pass. Those are checks axe declined to decide —
         usually contrast over a background image — and a spec that ignored
         them would overstate its result. This deployment has them, so the
         honest thing is to surface the count and attach the detail for a human
         rather than to assert zero and go red every run for a reason nobody
         can action.
      */
      await testInfo.attach('checks-needing-human-review', {
        body: `${scan.incomplete} incomplete check(s) at ${scan.standard} on ${scan.url}`,
        contentType: 'text/plain',
      });
      expect(scan.passes, 'the scan actually ran').toBeGreaterThan(0);
      expect(
        scan.incomplete,
        'more undecidable checks than the baseline means somebody has to look',
      ).toBeLessThanOrEqual(3);
    },
  );

  test(
    'TS-Y13 · The known upstream exceptions are still exactly as small as when they were accepted @a11y',
    { annotation: [{ type: 'practitest', description: '9213' }] },
    async ({ page, a11y }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const scan = await a11y.scan(page);

      /*
         The point of counting waived nodes rather than dropping them: an
         exception the product owner accepted for one button must not quietly
         grow into ninety. If this number moves, the waiver needs revisiting —
         which is a conversation, not a silent pass.
      */
      const buttonName = scan.waived.find((entry) => entry.rule === 'button-name');
      expect(buttonName, 'the accepted exception is still being applied').toBeDefined();
      expect(buttonName!.nodes, 'the waiver still covers one button, not a page full').toBe(1);
    },
  );
});
