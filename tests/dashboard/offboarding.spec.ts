import { anApplication, expect, test } from './harness';

/**
 * "Remove an application" — the one destructive thing on the page.
 *
 * It is built the other way round from everything above it: it plans and
 * reports before it removes, it says how much of what would go git has never
 * seen, and it does nothing until the target's own name has been typed back.
 * Every test here is about that refusal holding.
 */

/** The panel is collapsed on purpose, so opening it is part of reaching it. */
async function openThePanel(dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard']) {
  await dashboard.page.getByText('Remove an application').click();
  await expect(dashboard.page.locator('#offTarget')).toBeVisible();
}

function plan(dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'], overrides = {}) {
  dashboard.recorder.removalPlan = {
    target: 'shop-one',
    removeFiles: ['config/targets/shop-one.ts', 'targets/shop-one/fixtures.ts'],
    removeDirectories: ['targets/shop-one'],
    removeSecretKeys: ['shop-one/standard/1'],
    removeStorageStates: ['.auth/shop-one.standard.json'],
    clearDraft: false,
    warnings: [],
    refusals: [],
    alreadyGone: false,
    ...overrides,
  };
}

test.describe('planning a removal', () => {
  test('shows everything that would go, and removes nothing', async ({ dashboard }) => {
    const { page } = dashboard;
    plan(dashboard);
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'shop-one');
    await page.click('#offPlan');

    await expect(page.locator('#offPlanOut')).toContainText('2 file(s)');
    await expect(page.locator('#offPlanOut')).toContainText('1 credential entr(ies)');
    await expect(page.locator('#offPlanOut')).toContainText('1 stored session(s)');
    await expect(page.locator('#offPlanOut')).toContainText('config/targets/shop-one.ts');
    expect(dashboard.recorder.calls.filter((c) => c.path === '/api/offboard/remove')).toHaveLength(0);
  });

  test('shows the warnings, which are what git cannot bring back', async ({ dashboard }) => {
    const { page } = dashboard;
    plan(dashboard, { warnings: ['4 of these files have never been committed.'] });
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'shop-one');
    await page.click('#offPlan');
    await expect(page.locator('#offPlanOut')).toContainText('never been committed');
  });

  test('a target with nothing left at all says so, and offers no confirmation', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    plan(dashboard, {
      target: 'ghost',
      alreadyGone: true,
      removeFiles: [],
      // Genuinely nothing: no credential, no session, no draft.
      removeSecretKeys: [],
      removeStorageStates: [],
      clearDraft: false,
    });
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'ghost');
    await page.click('#offPlan');

    await expect(page.locator('#offPlanOut')).toContainText('Nothing named "ghost" is onboarded');
    await expect(page.locator('#offConfirmBox')).toBeHidden();
  });

  test('a pack that is gone does not mean the credentials are', async ({ dashboard }) => {
    /*
       Item 16's rule, which the page did not follow. `alreadyGone` means the
       profile and the pack are gone; credentials, sessions and the onboarding
       draft outlive both. The page used to print "Nothing named X is
       onboarded" and return, discarding all three — so somebody who removed a
       pack by hand, or offboarded twice, was told there was nothing to do
       while a real password sat in config/secrets.private.json.

       Found by driving the dashboard, which is the only place it was visible:
       the CLI has been right about this since item 16.
    */
    const { page } = dashboard;
    plan(dashboard, {
      target: 'ghost',
      alreadyGone: true,
      removeFiles: [],
      removeSecretKeys: ['qa/ghost/pools/workforce/standard/1'],
      removeStorageStates: ['.auth/ghost.standard.json'],
      clearDraft: true,
    });
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'ghost');
    await page.click('#offPlan');

    const out = page.locator('#offPlanOut');
    await expect(out).toContainText('credential entr(ies)');
    await expect(out).toContainText('stored session(s)');
    await expect(out).toContainText('the onboarding draft');
    await expect(out).not.toContainText('nothing it owned is left');
    // And it must be possible to actually remove them.
    await expect(page.locator('#offConfirmBox')).toBeVisible();
  });

  test('a refusal offers no confirmation either', async ({ dashboard }) => {
    const { page } = dashboard;
    plan(dashboard, { refusals: ['shop-one has uncommitted changes in its pack.'] });
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'shop-one');
    await page.click('#offPlan');

    await expect(page.locator('#offPlanOut')).toContainText('uncommitted changes');
    await expect(page.locator('#offConfirmBox')).toBeHidden();
  });

  test('planning again after a refusal hides a confirmation left from before', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    plan(dashboard);
    await openThePanel(dashboard);
    await page.fill('#offTarget', 'shop-one');
    await page.click('#offPlan');
    await expect(page.locator('#offConfirmBox')).toBeVisible();

    plan(dashboard, { refusals: ['it changed underneath you'] });
    await page.click('#offPlan');
    await expect(page.locator('#offConfirmBox')).toBeHidden();
  });
});

test.describe('the confirmation', () => {
  test.beforeEach(async ({ dashboard }) => {
    plan(dashboard);
    await openThePanel(dashboard);
    await dashboard.page.fill('#offTarget', 'shop-one');
    await dashboard.page.click('#offPlan');
    await expect(dashboard.page.locator('#offConfirmBox')).toBeVisible();
  });

  test('starts disabled and empty', async ({ dashboard }) => {
    await expect(dashboard.page.locator('#offRemove')).toBeDisabled();
    await expect(dashboard.page.locator('#offConfirm')).toHaveValue('');
    await expect(dashboard.page.locator('#offName')).toHaveText('shop-one');
  });

  test('a nearly-right name does not satisfy it', async ({ dashboard }) => {
    const { page } = dashboard;
    for (const wrong of ['shop', 'shop-two', 'Shop-One', 'shop-one-']) {
      await page.fill('#offConfirm', wrong);
      await expect(page.locator('#offRemove'), `'${wrong}' is not the name`).toBeDisabled();
    }
  });

  test('the exact name enables it, padding and all', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#offConfirm', '  shop-one  ');
    await expect(page.locator('#offRemove')).toBeEnabled();
  });

  test('emptying it again disables it', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#offConfirm', 'shop-one');
    await expect(page.locator('#offRemove')).toBeEnabled();
    await page.fill('#offConfirm', '');
    await expect(page.locator('#offRemove')).toBeDisabled();
  });

  test('removing reports what went and what to do next', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#offConfirm', 'shop-one');
    await page.click('#offRemove');

    await expect(page.locator('#offResult')).toContainText('Removed 2 item(s)');
    await expect(page.locator('#offResult pre')).toContainText('catalog:build');
    await expect(page.locator('#offConfirmBox')).toBeHidden();
  });

  test('a failed removal says why and stays confirmable', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/offboard/remove'] = 'Permission denied.';
    await page.fill('#offConfirm', 'shop-one');
    await page.click('#offRemove');

    await expect(page.locator('#offResult')).toContainText('Permission denied.');
    await expect(page.locator('#offRemove')).toBeEnabled();
  });
});

test.describe('after a removal', () => {
  test('the application is gone from the picker as well as from disk', async ({ dashboard }) => {
    /*
       Leaving it in the dropdown invites the next click, which shows a profile
       that is not there any more — and the values on screen are then a
       description of something that has been deleted.
    */
    const { page } = dashboard;
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    plan(dashboard);
    await dashboard.reopen();
    await expect(page.locator('#pick option')).toHaveCount(2);

    await openThePanel(dashboard);
    await page.fill('#offTarget', 'shop-one');
    await page.click('#offPlan');
    await page.fill('#offConfirm', 'shop-one');
    dashboard.recorder.applications = [];
    await page.click('#offRemove');
    await expect(page.locator('#offResult')).toContainText('Removed');

    await expect(page.locator('#pick option')).toHaveCount(1);
  });
});
