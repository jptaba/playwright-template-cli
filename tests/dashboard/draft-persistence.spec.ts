import { anApplication, expect, test } from './harness';

/**
 * What survives leaving the page.
 *
 * Every dashboard page is its own document, so clicking another tab is a full
 * navigation and everything in an input is gone. This is the feature that
 * stops that emptying a form somebody has spent five minutes on — and the one
 * thing it must never remember is the one thing step 4 collects.
 */

test('what is typed is kept, and comes back', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.fill('#env', 'uat');
  await page.check('#confirmTest');
  await expect(page.locator('#draftState')).toHaveText('kept as you type');
  // The save is debounced, so "a draft exists" is not the same fact as "this
  // value is in it". Waiting for the value is the fact the test is about.
  await expect.poll(() => dashboard.recorder.draft.flags.confirmTest).toBe(true);

  await dashboard.reopen();

  await expect(page.locator('#name')).toHaveValue('shop');
  await expect(page.locator('#baseURL')).toHaveValue('https://staging.shop.test');
  await expect(page.locator('#env')).toHaveValue('uat');
  await expect(page.locator('#confirmTest')).toBeChecked();
});

test('the service rows come back too, in order', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.locator('#services .service').first().locator('input').nth(1).fill('https://api.shop.test');
  await page.click('#addService');
  const second = page.locator('#services .service').last();
  await second.locator('input').first().fill('billing');
  await second.locator('input').nth(1).fill('https://billing.shop.test');
  await expect.poll(() => dashboard.recorder.draft.services.length).toBe(2);

  await dashboard.reopen();

  await expect(page.locator('#services .service')).toHaveCount(2);
  await expect(page.locator('#services .service').first().locator('input').nth(1)).toHaveValue(
    'https://api.shop.test',
  );
  await expect(page.locator('#services .service').last().locator('input').first()).toHaveValue(
    'billing',
  );
});

test('the accessible names read in step 2 are kept — they are not credentials', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await expect(page.locator('#uName')).toHaveValue('Email address *');
  await expect.poll(() => dashboard.recorder.draft.fields.uName).toBe('Email address *');

  await dashboard.reopen();
  await expect(page.locator('#uName')).toHaveValue('Email address *');
});

test('a half-typed new application wins over the most recently onboarded one', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
  await dashboard.reopen();

  await page.selectOption('#pick', '');
  await page.fill('#name', 'half-typed');
  await expect.poll(() => dashboard.recorder.draft.fields.name).toBe('half-typed');

  await dashboard.reopen();
  await expect(page.locator('#pick')).toHaveValue('');
  await expect(page.locator('#name')).toHaveValue('half-typed');
});

test('looking at an onboarded application and coming back does not lose the draft', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
  await dashboard.reopen();

  await page.selectOption('#pick', '');
  await page.fill('#name', 'half-typed');
  await page.fill('#baseURL', 'https://staging.half.test');
  await expect.poll(() => dashboard.recorder.draft.fields.baseURL).toBe('https://staging.half.test');

  await page.selectOption('#pick', 'shop-one');
  await expect(page.locator('#name')).toHaveValue('shop-one');

  await page.selectOption('#pick', '');
  await expect(page.locator('#name')).toHaveValue('half-typed');
  await expect(page.locator('#baseURL')).toHaveValue('https://staging.half.test');
});

test('a draft never holds a credential, whatever the page sends', async ({ dashboard }) => {
  // Enforced on the way in as well as on the way out: the page is not a source
  // of truth about what may be written to disk.
  const { page } = dashboard;
  const response = await page.evaluate(async () => {
    // `post` is the page's own helper: it carries the session token, so this
    // arrives exactly as the page's own calls do.
    const send = (window as unknown as { post: (path: string, body: unknown) => Promise<unknown> })
      .post;
    await send('/api/onboard/draft', {
      draft: {
        fields: { name: 'shop', password: 'hunter2', 'cp-standard': 'hunter2' },
        flags: {},
        services: [],
        savedAt: '',
      },
    });
    return true;
  });
  expect(response).toBe(true);

  const stored = JSON.stringify(dashboard.recorder.drafts.at(-1));
  expect(stored).toContain('shop');
  expect(stored).not.toContain('hunter2');
});

test('an empty form is not worth remembering, and does not claim to be', async ({ dashboard }) => {
  await expect(dashboard.page.locator('#draftState')).toHaveText('nothing in progress');
});

test('a very long value is truncated rather than stored whole', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.fill('#baseURL', `https://${'a'.repeat(5_000)}.test`);
  await expect.poll(() => dashboard.recorder.draft.fields.baseURL?.length ?? 0).toBeGreaterThan(0);

  expect(dashboard.recorder.draft.fields.baseURL!.length).toBeLessThanOrEqual(2_000);
});

test('more services than anyone has are capped rather than accepted', async ({ dashboard }) => {
  const { page } = dashboard;
  for (let i = 0; i < 14; i += 1) await page.click('#addService');
  await page.fill('#env', 'uat');
  await expect.poll(() => dashboard.recorder.draft.fields.env).toBe('uat');

  expect(dashboard.recorder.draft.services.length).toBeLessThanOrEqual(10);
});
