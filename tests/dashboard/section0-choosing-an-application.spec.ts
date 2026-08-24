import { anApplication, expect, test } from './harness';

/**
 * "Which application" — the section above step 1.
 *
 * It does three jobs that pull against each other: it shows what is already
 * onboarded, it lets one be corrected, and it must not lose a half-typed new
 * one. Most of the defects here are the same shape — **a value from the
 * previous state left on screen** — and none of them announce themselves,
 * because a form field holding the wrong string looks exactly like a form
 * field holding the right one.
 */

test.describe('the picker, with nothing onboarded yet', () => {
  test('offers only a new application, and the form is usable', async ({ dashboard }) => {
    const { page } = dashboard;
    await expect(page.locator('#pick option')).toHaveCount(1);
    await expect(page.locator('#pick')).toHaveValue('');
    await expect(page.locator('#name')).toBeEnabled();
    await expect(page.locator('#editApp')).toBeHidden();
    await expect(page.locator('#draftState')).toHaveText('nothing in progress');
  });

  test('starts the wizard without being asked, because it is the only job here', async ({
    dashboard,
  }) => {
    /*
       The mirror of the rule below. With nothing configured there is nothing
       else this page can do, and a button in front of the only useful control
       on an otherwise empty page is ceremony — the same judgement `landingPath`
       makes when it sends `/` here rather than to Runs.
    */
    const { page } = dashboard;
    await expect(page.locator('#s1')).toBeVisible();
    await expect(page.locator('#addApp')).toBeHidden();
  });
});

test.describe('the picker, with applications onboarded', () => {
  test.beforeEach(async ({ dashboard }) => {
    dashboard.recorder.applications = [
      anApplication({ name: 'shop-two', environment: 'uat', onboardedAt: '2026-08-05T10:00:00.000Z' }),
      anApplication({ name: 'shop-one' }),
    ];
    await dashboard.reopen();
  });

  test('does not open the wizard at somebody who came to look at a list', async ({ dashboard }) => {
    /*
       Adding an application happens once and then never again, and this page
       used to greet every visit with its five-step form already running. The
       daily reader met a half-filled wizard for a job they were not doing.

       It is behind a button now — and the button is a real one rather than a
       disclosure, because starting a wizard is an action.
    */
    const { page } = dashboard;
    await expect(page.locator('#s1')).toBeHidden();
    await expect(page.locator('#addApp')).toBeVisible();

    await page.click('#addApp');
    await expect(page.locator('#s1')).toBeVisible();
    await expect(page.locator('#addApp')).toBeHidden();
    await expect(page.locator('#name')).toBeEnabled();
  });

  test('an application picked to be looked at shows its settings, wizard or not', async ({
    dashboard,
  }) => {
    /*
       Step 1 holds the name, the environment and the base URL — the three
       settings somebody picking an application is most likely to have come to
       check. Closing it by default must not take those away.
    */
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    await expect(page.locator('#s1')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('shop-one');
    await expect(page.locator('#name')).toBeDisabled();
    await expect(page.locator('#addApp')).toBeHidden();
  });

  test('opens on a new application, whatever is already onboarded', async ({ dashboard }) => {
    /*
       It used to open on the most recently onboarded one, so `npm run onboard`
       greeted a returning user with a *different* application, read-only,
       every step locked, and a note telling them to press "Change its
       settings". The page opened on the one thing it is not for.
    */
    const { page } = dashboard;
    await expect(page.locator('#pick')).toHaveValue('');
    await expect(page.locator('#name')).toBeEnabled();
    await expect(page.locator('#probe')).toBeEnabled();
    await expect(page.locator('#pickStatus')).toBeEmpty();
  });

  test('shows what a chosen profile says, once one is chosen', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-two');
    await expect(page.locator('#env')).toHaveValue('uat');
    await expect(page.locator('#baseURL')).toHaveValue('https://one.shop.test');
    await expect(page.locator('#pickStatus')).toContainText('read-only');
  });

  test('shows it, rather than pretending it can be typed over', async ({ dashboard }) => {
    // Enabled fields that discard what you write are worse than disabled ones.
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-two');
    await expect(page.locator('#name')).toBeDisabled();
    await expect(page.locator('#baseURL')).toBeDisabled();
    await expect(page.locator('#lApi')).toBeDisabled();
    await expect(page.locator('#probe')).toBeDisabled();
    await expect(page.locator('#addService')).toBeDisabled();
    await expect(page.locator('#create')).toBeDisabled();
  });

  test('switching between two applications leaves nothing of the first behind', async ({
    dashboard,
  }) => {
    /*
       The combination that produces a mixture: one application declares an API
       and an accessibility standard, the next declares neither. Every field
       `showApplication` does not write keeps the previous application's value
       and reads as though it belonged to this one.
    */
    const { page } = dashboard;
    dashboard.recorder.applications[1] = anApplication({
      name: 'shop-one',
      apiBaseURL: null,
      a11yStandard: null,
      roles: ['standard'],
      include: { api: false, db: false, contracts: false, a11y: false },
    });
    await dashboard.reopen();

    await page.selectOption('#pick', 'shop-two');
    await expect(page.locator('#a11y')).toHaveValue('wcag22aa');

    await page.selectOption('#pick', 'shop-one');
    await expect(page.locator('#a11y'), 'no standard declared, so the field is empty').toHaveValue('');
    await expect(page.locator('#roles')).toHaveValue('standard');
    await expect(page.locator('#lApi')).not.toBeChecked();
    await expect(page.locator('#services input').nth(1)).toHaveValue('');
  });

  test('an onboarded application does not inherit the sign-in names typed for another', async ({
    dashboard,
  }) => {
    /*
       Step 2 holds accessible names read off a *different* application. They
       are not part of a profile, so nothing overwrites them — and they are
       what the pack's sign-in locators would be built from.
    */
    const { page } = dashboard;
    await page.selectOption('#pick', '');
    await page.click('#addApp');
    // Step 2 is inert until step 1 has run, and a `fill` on an inert field
    // silently does nothing — so unlocking it is part of the setup, not a
    // convenience.
    await page.click('#skipProbe');
    await page.fill('#uName', 'Email address *');
    await page.fill('#pName', 'Password *');
    await page.fill('#sName', 'Login');
    await page.fill('#signInPath', '/auth/login');

    await page.selectOption('#pick', 'shop-two');

    await expect(page.locator('#uName')).toHaveValue('');
    await expect(page.locator('#pName')).toHaveValue('');
    await expect(page.locator('#sName')).toHaveValue('');
    await expect(page.locator('#signInPath')).toHaveValue('/');
  });

  test('selecting the same application twice renders the same thing', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    const first = await page.locator('#services').innerHTML();
    await page.selectOption('#pick', 'shop-two');
    await page.selectOption('#pick', 'shop-one');
    expect(await page.locator('#services').innerHTML(), 'no rows accumulate').toBe(first);
  });

  test('going back to a new application re-enables everything', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', '');
    await expect(page.locator('#name')).toBeEnabled();
    await expect(page.locator('#probe')).toBeEnabled();
    await expect(page.locator('#create')).toBeEnabled();
    await expect(page.locator('#editApp')).toBeHidden();
    await expect(page.locator('#pickStatus')).toBeEmpty();
  });
});

test.describe('arriving already knowing which application — the health chip', () => {
  /*
     The chip in the top bar promises to route to "the page that fixes the
     finding" (item 75). For most findings that page already reads the
     application the bar is scoped to — but /onboard keeps its own picker,
     defaulted to blank on every plain visit so `npm run onboard` never
     greets a returning user with a different application (item 6). Without
     this, the chip's own promise was false for every finding it sends here:
     clicking it landed on a blank "add one" form, not the application whose
     finding was being read.
  */
  test.beforeEach(async ({ dashboard }) => {
    dashboard.recorder.applications = [
      anApplication({ name: 'shop-two', environment: 'uat', baseURL: 'https://two.shop.test' }),
      anApplication({ name: 'shop-one' }),
    ];
  });

  test('a link naming an application opens straight on its settings', async ({ dashboard }) => {
    await dashboard.reopen('target=shop-two');
    const { page } = dashboard;
    await expect(page.locator('#pick')).toHaveValue('shop-two');
    await expect(page.locator('#baseURL')).toHaveValue('https://two.shop.test');
  });

  test('the query string is spent, not kept — a plain reload must still open blank', async ({
    dashboard,
  }) => {
    await dashboard.reopen('target=shop-two');
    const { page } = dashboard;
    expect(page.url()).not.toContain('target=');

    // item 6: a visit this page cannot tell apart from `npm run onboard`
    // itself must still default to "add one", not whatever was last shown.
    await dashboard.reopen();
    await expect(page.locator('#pick')).toHaveValue('');
  });

  test('a name that names nothing falls back to the ordinary default', async ({ dashboard }) => {
    await dashboard.reopen('target=no-such-application');
    await expect(dashboard.page.locator('#pick')).toHaveValue('');
  });
});

test.describe('editing an onboarded application', () => {
  test.beforeEach(async ({ dashboard }) => {
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    await dashboard.reopen();
    // Chosen explicitly: the picker opens on a new application now, so editing
    // an existing one starts by saying which.
    await dashboard.page.selectOption('#pick', 'shop-one');
  });

  test('is explicit, so nothing changes by wandering through the form', async ({ dashboard }) => {
    const { page } = dashboard;
    await expect(page.locator('#editApp')).toBeVisible();
    await expect(page.locator('#saveApp')).toBeHidden();

    await page.click('#editApp');
    await expect(page.locator('#baseURL')).toBeEnabled();
    await expect(page.locator('#saveApp')).toBeVisible();
    await expect(page.locator('#cancelEdit')).toBeVisible();
    await expect(page.locator('#editApp')).toBeHidden();
  });

  test('never offers to rename, because renaming is not what this does', async ({ dashboard }) => {
    /*
       `updateProfile` is keyed on the target that was picked. A name field
       that accepts a new value and then writes it nowhere is a change somebody
       believes they made.
    */
    const { page } = dashboard;
    await page.click('#editApp');
    await expect(page.locator('#name')).toBeDisabled();
  });

  test('sends the values, and reports what moved', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://two.shop.test');
    await page.click('#saveApp');

    await expect(page.locator('#editOut')).toContainText('baseURL');
    const sent = dashboard.lastCall('/api/onboard/update')!;
    expect(sent.target).toBe('shop-one');
    expect((sent.edits as Record<string, unknown>).baseURL).toBe('https://two.shop.test');
  });

  test('stays on the application that was just saved', async ({ dashboard }) => {
    /*
       Saving reloads, and the reload re-picks the default. Landing on a
       different application — or on the empty form — after pressing Save reads
       as "it did not work", and the next thing anybody does is press it again.
    */
    const { page } = dashboard;
    dashboard.recorder.applications = [
      anApplication({ name: 'shop-two', onboardedAt: '2026-08-05T10:00:00.000Z' }),
      anApplication({ name: 'shop-one' }),
    ];
    await dashboard.reopen();

    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://two.shop.test');
    await page.click('#saveApp');

    await expect(page.locator('#editOut')).toContainText('baseURL');
    await expect(page.locator('#pick')).toHaveValue('shop-one');
  });

  test('cancelling puts back what the profile says', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://typed-then-abandoned.test');
    await page.click('#cancelEdit');

    await expect(page.locator('#baseURL')).toHaveValue('https://one.shop.test');
    await expect(page.locator('#baseURL')).toBeDisabled();
    await expect(page.locator('#saveApp')).toBeHidden();
    await expect(page.locator('#editApp')).toBeVisible();
  });

  test('a refused edit says why and leaves the button usable', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.click('#editApp');
    // The mistake the check exists for: a documentation URL where a base URL goes.
    await page
      .locator('#services .service')
      .first()
      .locator('input')
      .nth(1)
      .fill('https://api.shop.test/docs?api-docs.json');
    await page.click('#saveApp');

    await expect(page.locator('#pickStatus')).toContainText('query string');
    await expect(page.locator('#saveApp')).toBeEnabled();
  });

  test('editing writes no draft, because an onboarded application is not one', async ({
    dashboard,
  }) => {
    /*
       A draft carrying an onboarded application's values would come back the
       next time somebody opened the page for a *new* one, pre-filled with
       another application's base URL. Asserted by making a draft happen
       afterwards and reading what is in it, rather than by waiting out the
       debounce and hoping.
    */
    const { page } = dashboard;
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://from-the-edit.test');

    await page.selectOption('#pick', '');
    await page.fill('#name', 'a-new-one');
    await expect.poll(() => dashboard.recorder.drafts.length).toBeGreaterThan(0);

    for (const saved of dashboard.recorder.drafts) {
      expect(Object.values(saved.fields)).not.toContain('https://from-the-edit.test');
    }
  });
});
