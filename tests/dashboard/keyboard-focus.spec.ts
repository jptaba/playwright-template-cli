import { anApplication, expect, test } from './harness';

/**
 * Where the keyboard goes when a button takes itself out of the tab order.
 *
 * Every long-running control on this page disables itself while it works, and
 * two of them stay disabled once they have succeeded. A focused element that
 * becomes disabled or hidden does not pass focus on — the browser drops it to
 * the document body, so the next Tab starts from the top of the page.
 *
 * Measured on the running dashboard before this was fixed: pressing "Add an
 * application" left focus on the body and **16 Tab presses** between the
 * operator and the field that had just appeared; reading the application left
 * **25**. Nothing looked broken at any point, which is why no test had an
 * opinion about it and why it survived a hundred runs.
 *
 * Preview looked like the counter-case — it is the one advance button that
 * never disables itself — and driving it showed that it is not. A successful
 * preview folds step 3, folding hides the button, and the keyboard goes the
 * same way for a different reason. Four controls, two mechanisms, one defect.
 */

/** What the browser reports as focused, as a stable string a test can read. */
async function focused(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
}

test.describe('a button that hides itself hands the keyboard on', () => {
  test.beforeEach(async ({ dashboard }) => {
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    await dashboard.reopen();
  });

  test('Add an application leaves the keyboard in the field it revealed', async ({ dashboard }) => {
    const { page } = dashboard;

    await page.locator('#addApp').focus();
    expect(await focused(page)).toBe('addApp');

    await page.keyboard.press('Enter');

    await expect(page.locator('#s1')).toBeVisible();
    expect(
      await focused(page),
      'the button is gone, so somewhere deliberate is the only honest place for the keyboard',
    ).toBe('name');
  });

  test('and the field it landed on can be seen', async ({ dashboard }) => {
    /*
       The half a plain focus() gets wrong. Step 1 was display:none a moment
       earlier, so the browser's own focus-scroll measures a layout that has
       not caught up and leaves the caret hundreds of pixels below the fold —
       focused, and invisible to the person typing into it.
    */
    const { page } = dashboard;
    await page.locator('#addApp').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#name')).toBeFocused();
    await expect(page.locator('#name')).toBeInViewport();
  });

  test('the wizard opening on its own does not move a page nobody has touched', async ({
    dashboard,
  }) => {
    /*
       `startAdding` also runs unasked — from a restored draft, and on a
       repository with no applications at all. Focusing a field on first paint
       would steal the keyboard from somebody who has not pressed anything.
    */
    dashboard.recorder.applications = [];
    await dashboard.reopen();

    await expect(dashboard.page.locator('#s1')).toBeVisible();
    expect(await focused(dashboard.page)).toBe('BODY');
  });
});

test.describe('a button that disables itself takes the keyboard back', () => {
  test('reading the application returns focus to the button that was pressed', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');

    await page.locator('#probe').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#s2')).toBeVisible();
    expect(
      await focused(page),
      'the button came back, so the keyboard comes back to it',
    ).toBe('probe');
  });

  test('but not from somebody who moved on while it was working', async ({ dashboard }) => {
    /*
       The condition that keeps this from being a nuisance. A request in flight
       is exactly when somebody carries on filling the form, and a page that
       yanked them back mid-sentence would be worse than the defect.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');

    await page.locator('#probe').focus();
    await page.keyboard.press('Enter');
    await page.locator('#env').focus();

    await expect(page.locator('#s2')).toBeVisible();
    expect(await focused(page)).toBe('env');
  });

  test('Preview folds the step its own button lives in, so it hands on too', async ({
    dashboard,
  }) => {
    /*
       Not a disabled button — a hidden one. A successful preview folds steps 1
       to 3, and step 3 is where Preview sits. Credentials are what somebody
       has to type next, so that is where the keyboard goes.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).toBeVisible();

    await page.locator('#preview').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#s4')).toBeVisible();
    await expect(page.locator('#preview'), 'the fold took it off the page').toBeHidden();
    expect(await focused(page)).toBe('s4');
  });
});

test('Create does not come back, so the keyboard goes to what it wrote', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await page.click('#preview');
  /*
     Wait for the plan, not for the click. Create is disabled until a preview
     comes back, so focusing it any earlier focuses nothing and the Enter that
     follows presses nothing — a test that would pass or fail on the network.
  */
  await expect(page.locator('#previewStatus')).toContainText('planned');
  await expect(page.locator('#create')).toBeEnabled();

  await page.locator('#create').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#result')).toContainText('file(s)');
  expect(
    await focused(page),
    'the panel holding the file list and the numbered next steps is what to read now',
  ).toBe('result');
});
