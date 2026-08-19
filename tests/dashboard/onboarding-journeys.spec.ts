import { anApplication, expect, probeFound, test } from './harness';

/**
 * Whole journeys through onboarding, rather than one control at a time.
 *
 * The per-step specs beside this one each hold one thing still and push one
 * thing. That finds a control that misbehaves and cannot find the defects that
 * only exist *between* steps: a value read in step 1 that never reaches the
 * file written in step 5, a step that unlocks and then silently un-unlocks, an
 * edit that leaves the form in a state the next step cannot use.
 *
 * So these run start to finish and assert the chain, including the journey the
 * per-step specs never take: **editing an application that already exists and
 * then carrying on**.
 */

/** The whole of steps 1–3, as somebody actually does them. */
async function readAndPreview(
  dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'],
  name = 'shop',
) {
  const { page } = dashboard;
  await page.fill('#name', name);
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');

  await page.selectOption('#secrets', 'local');
  await page.click('#preview');
  await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');
}

// ---------------------------------------------------------------------------
// The journey the whole page exists for
// ---------------------------------------------------------------------------

test('a new application, read to written, and what was read is what is written', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  await readAndPreview(dashboard, 'acme-shop');

  await page.fill('#cu-standard', 'shopper@shop.test');
  await page.fill('#cp-standard', 'a-password');
  await page.click('#verify');
  await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

  await page.click('#create');
  await expect(page.locator('#result')).toContainText('file(s).');

  /*
     The chain, end to end. Each of these was read off the running application
     in step 1 and has survived four more steps to reach the scaffolder — which
     is the entire claim this page makes.
  */
  const written = dashboard.recorder.created.at(-1)!;
  expect(written.name).toBe('acme-shop');
  expect(written.testIdAttribute).toBe('data-test');
  const signIn = written.signIn as Record<string, unknown>;
  expect(signIn.username).toBe('Email address *');
  expect(signIn.password).toBe('Password *');
  expect(signIn.submit).toBe('Login');
  expect(signIn.path).toBe('/auth/login');
  expect(signIn.signedInMarker, 'derived by signing in, not readable at rest').toEqual({
    role: 'button',
    name: 'My account',
    identitySpecific: false,
  });
  expect((written.contractDocument as Record<string, unknown>).filename).toBe('openapi.json');
  expect(written.credentials, 'and the credential went with it').toHaveProperty('standard');
});

test('the same journey with the read skipped writes placeholders, and says so', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  await page.fill('#name', 'acme-shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.click('#skipProbe');
  await page.click('#preview');
  await page.click('#create');
  await expect(page.locator('#result')).toContainText('file(s).');

  const written = dashboard.recorder.created.at(-1)!;
  expect(written.signIn, 'nothing was read, so nothing is claimed').toBeUndefined();
  expect(written.contractDocument).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Editing one that already exists, and carrying on
// ---------------------------------------------------------------------------

test.describe('editing an existing application', () => {
  test.beforeEach(async ({ dashboard }) => {
    dashboard.recorder.applications = [
      anApplication({ name: 'shop-one', environment: 'staging' }),
      anApplication({ name: 'shop-two', onboardedAt: '2026-07-01T09:00:00.000Z' }),
    ];
    await dashboard.reopen();
  });

  test('edit, save, and the page is still on it and still usable', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-two');
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://two.shop.test');
    await page.fill('#env', 'uat');
    await page.click('#saveApp');

    await expect(page.locator('#editOut')).toContainText('baseURL');
    await expect(page.locator('#pick'), 'not bounced to another application').toHaveValue('shop-two');
    // Back to a view, not left mid-edit with the buttons still swapped.
    await expect(page.locator('#editApp')).toBeVisible();
    await expect(page.locator('#saveApp')).toBeHidden();
    await expect(page.locator('#baseURL')).toBeDisabled();
  });

  test('editing twice in a row sends the second edit, not the first again', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#env', 'uat');
    await page.click('#saveApp');
    await expect(page.locator('#editOut')).toContainText('baseURL');

    await page.click('#editApp');
    await page.fill('#env', 'perf');
    await page.click('#saveApp');
    await expect(page.locator('#editOut')).toContainText('baseURL');

    const sent = dashboard.recorder.updates.map(
      (body) => (body.edits as Record<string, unknown>).environment,
    );
    expect(sent).toEqual(['uat', 'perf']);
  });

  test('after editing, a new application can still be onboarded from the same page', async ({
    dashboard,
  }) => {
    /*
       The journey the per-step specs never take. Editing disables the whole
       form and swaps three buttons; if any of that is left behind, the next
       thing somebody does — onboard a different application — starts from a
       form that is half read-only and a step 1 that cannot be pressed.
    */
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://edited.shop.test');
    await page.click('#saveApp');
    await expect(page.locator('#editOut')).toContainText('baseURL');

    await page.selectOption('#pick', '');
    await expect(page.locator('#name')).toBeEnabled();
    await expect(page.locator('#probe')).toBeEnabled();
    await expect(page.locator('#create')).toBeEnabled();

    await readAndPreview(dashboard, 'a-third-shop');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const written = dashboard.recorder.created.at(-1)!;
    expect(written.name).toBe('a-third-shop');
    expect(written.baseURL, "not the edited application's URL").toBe('https://staging.shop.test');
  });

  test('cancelling an edit leaves the form no worse than before it', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#baseURL', 'https://abandoned.test');
    await page.click('#cancelEdit');

    await page.selectOption('#pick', '');
    await readAndPreview(dashboard, 'after-a-cancel');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.updates, 'a cancelled edit writes nothing').toEqual([]);
  });

  test('an edit refused mid-journey does not strand the form', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page
      .locator('#services .service')
      .first()
      .locator('input')
      .nth(1)
      .fill('https://api.shop.test/docs?api-docs.json');
    await page.click('#saveApp');
    await expect(page.locator('#pickStatus')).toContainText('query string');

    // Correct it and save again, without reloading anything.
    await page.locator('#services .service').first().locator('input').nth(1).fill('https://api.shop.test');
    await page.click('#saveApp');
    await expect(page.locator('#editOut')).toContainText('baseURL');
  });

  test('onboarding a name that is already taken is refused, and renaming recovers', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['config/targets/shop-one.ts'];

    await page.selectOption('#pick', '');
    await page.click('#addApp');
    await readAndPreview(dashboard, 'shop-one');
    await expect(page.locator('#plan')).toContainText('already onboarded');
    await expect(page.locator('#create')).toBeDisabled();

    dashboard.recorder.conflicts = [];
    await page.fill('#name', 'shop-three');
    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created.at(-1)!.name).toBe('shop-three');
  });
});

// ---------------------------------------------------------------------------
// Doing it twice
// ---------------------------------------------------------------------------

test.describe('idempotency', () => {
  test('reading, previewing and reading again converges rather than accumulating', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await readAndPreview(dashboard, 'acme-shop');
    const first = await page.locator('#plan li').count();

    await page.click('#probe');
    await expect(page.locator('#findings')).toContainText('found at /auth/login');
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('file(s) will be written');

    expect(await page.locator('#plan li').count(), 'the same plan, not twice the plan').toBe(first);
    /*
       Three: test ids, the sign-in form, the published document. The first
       read added a fourth — the note saying it had set the API base URL from
       the document's origin — and the second does not, because that field is
       no longer empty. Proposing a value only into an empty field is the
       difference between a suggestion and overwriting what somebody typed.
    */
    await expect(page.locator('#findings > div')).toHaveCount(3);
    await expect(page.locator('#services .service')).toHaveCount(1);
  });

  test('the whole journey run twice sends the same body both times', async ({ dashboard }) => {
    const { page } = dashboard;
    await readAndPreview(dashboard, 'acme-shop');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    await dashboard.reopen();
    await readAndPreview(dashboard, 'acme-shop');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const [one, two] = dashboard.recorder.created;
    expect(two).toEqual(one);
  });

  test('a journey interrupted by a reload picks up where it left off', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#uName')).toHaveValue('Email address *');
    await expect.poll(() => dashboard.recorder.draft.fields.uName).toBe('Email address *');

    await dashboard.reopen();

    /*
       Everything read survives, and the sections it fills open with it.

       They used to re-lock, on the reasoning that unlocking is a claim about
       what has been done in *this* visit. The draft makes that claim already —
       it puts step 2's readings back into step 2's fields — and re-locking left
       them visible and unusable: the only ways on were to re-run the 12-to-18
       second probe, or "Skip and fill in by hand", which calls
       clearWhatWasRead() and blanks the very answers that had just been
       restored. A draft that keeps answers the page will not let you use is
       keeping them for nothing.
    */
    await expect(page.locator('#name')).toHaveValue('acme-shop');
    await expect(page.locator('#uName')).toHaveValue('Email address *');
    await expect(page.locator('#confirmTest')).toBeChecked();
    await expect(page.locator('#s2')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');

    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    const written = dashboard.recorder.created.at(-1)!;
    expect(written.name).toBe('acme-shop');
    // The point of restoring them: they reach the pack. Skipping used to blank
    // these and write placeholders instead, silently.
    expect((written.signIn as Record<string, unknown>).username).toBe('Email address *');
  });

  test('a reload cannot leave contracts on with no document to check', async ({ dashboard }) => {
    /*
       The published document is fetched by the read and is far too big to keep
       in a draft, so a reload restores the Contracts tick without it. Writing
       that gives a contract project with nothing to validate against —
       target:doctor catches it afterwards, which is a worse place to find out.
    */
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.check('#lContracts');
    await expect.poll(() => dashboard.recorder.draft.flags.lContracts).toBe(true);

    await dashboard.reopen();
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('no published API document is held');
    await expect(page.locator('#plan')).toContainText('Read the application again');
  });
});

// ---------------------------------------------------------------------------
// When something goes wrong halfway
// ---------------------------------------------------------------------------

test.describe('recovering mid-journey', () => {
  test('a browser that will not start is explained, and the journey resumes', async ({
    dashboard,
  }) => {
    /*
       The failure people actually hit: 0xC0000142, the Windows desktop heap
       being momentarily full. It is transient by nature, so what matters is
       that the page says something actionable and stays usable — not that it
       never happens.
    */
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/probe'] =
      'The browser started and then died before it finished loading (Windows exit code ' +
      '0xC0000142). Close some browser windows and try again.';

    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#s1status')).toContainText('0xC0000142');
    await expect(page.locator('#s1status')).toContainText('Close some browser windows');
    await expect(page.locator('#probe'), 'and it can be tried again').toBeEnabled();
    await expect(page.locator('#s2'), 'having unlocked nothing').toHaveAttribute('inert', '');

    delete dashboard.recorder.failWith['/api/probe'];
    await page.click('#probe');
    await expect(page.locator('#s2')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#uName')).toHaveValue('Email address *');
  });

  test('an assisted sign-in that cannot reach the application says which field is wrong', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/assist/start'] =
      'The browser opened but could not reach https://staging.shop.test/nope: ' +
      'net::ERR_ABORTED. It has been closed again. Check the base URL in step 1 and the ' +
      'sign-in path in step 2.';

    await readAndPreview(dashboard, 'acme-shop');
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');

    await expect(page.locator('#verifyStatus')).toContainText('It has been closed again');
    await expect(page.locator('#verifyStatus')).toContainText('sign-in path in step 2');
    // The buttons must not swap: there is no browser to finish with.
    await expect(page.locator('#assist')).toBeVisible();
    await expect(page.locator('#assistDone')).toBeHidden();
  });

  test('a failed write can be retried without redoing the journey', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/create'] = 'EBUSY: resource busy or locked';
    await readAndPreview(dashboard, 'acme-shop');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('EBUSY');

    delete dashboard.recorder.failWith['/api/create'];
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created, 'the first attempt wrote nothing').toHaveLength(2);
  });

  test('a read that finds less than the last one does not write the last one’s answers', async ({
    dashboard,
  }) => {
    // Pointed at the wrong host, read it, corrected the host, read it again.
    const { page } = dashboard;
    await readAndPreview(dashboard, 'acme-shop');

    dashboard.recorder.probeResult = { ...probeFound(), signIn: null, contract: null, notes: [] };
    await page.fill('#baseURL', 'https://other.shop.test');
    await page.click('#probe');
    await expect(page.locator('#findings')).toContainText('not found');

    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const written = dashboard.recorder.created.at(-1)!;
    expect(written.signIn, 'the first host’s form is not this host’s form').toBeUndefined();
    expect(written.contractDocument).toBeUndefined();
    expect(written.baseURL).toBe('https://other.shop.test');
  });
});

// ---------------------------------------------------------------------------
// Boundaries, walked rather than poked
// ---------------------------------------------------------------------------

test.describe('boundaries', () => {
  test('one role and many roles both reach the end', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.selectOption('#secrets', 'local');
    await page.fill('#roles', 'standard, admin, auditor, support, readonly');
    await page.click('#preview');

    for (const role of ['standard', 'admin', 'auditor', 'support', 'readonly']) {
      await expect(page.locator(`#cu-${role}`)).toBeVisible();
    }
    await page.fill('#cu-admin', 'admin@shop.test');
    await page.fill('#cp-admin', 'a-password');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const written = dashboard.recorder.created.at(-1)!;
    expect(written.roles).toHaveLength(5);
    expect(
      Object.keys(written.credentials as Record<string, unknown>),
      'only the role that was filled in',
    ).toEqual(['admin']);
  });

  test('the shortest usable name works, and so does a long one', async ({ dashboard }) => {
    const { page } = dashboard;
    for (const name of ['a', 'a-very-long-but-entirely-legitimate-application-name-here']) {
      await dashboard.reopen();
      await page.fill('#name', name);
      await page.fill('#baseURL', 'https://staging.shop.test');
      await page.click('#skipProbe');
      await page.click('#preview');
      await expect(page.locator('#plan'), name).toContainText('file(s) will be written');
    }
  });

  test('a base URL mounted under a path survives to the profile', async ({ dashboard }) => {
    // Normal, and the thing a naive URL join silently drops.
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://host.test/parabank');
    await page.click('#skipProbe');
    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created.at(-1)!.baseURL).toBe('https://host.test/parabank');
  });

  test('every optional layer on at once still writes', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.locator('#services .service').first().locator('input').nth(1).fill('https://api.shop.test');
    await page.click('#skipProbe');
    for (const layer of ['#lApi', '#lDb', '#lContracts', '#lA11y']) await page.check(layer);
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('file(s) will be written');

    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created.at(-1)!.include).toEqual({
      api: true,
      db: true,
      contracts: true,
      a11y: true,
    });
  });

  test('no optional layers at all is the smallest pack, and is still valid', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await page.fill('#name', 'acme-shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created.at(-1)!.include).toEqual({
      api: false,
      db: false,
      contracts: false,
      a11y: false,
    });
  });
});

// ---------------------------------------------------------------------------
// A reply that arrives after somebody has moved on
// ---------------------------------------------------------------------------

test.describe('a slow save landing late', () => {
  test('does not replace what is being typed by the time it lands', async ({ dashboard }) => {
    /*
       Found by walking the whole journey rather than a step at a time.

       Saving an edit reloads the state and re-renders the form from what comes
       back. Do that while its operator has already moved on to a new
       application, and the reload lands *afterwards* and puts the previous
       draft back over the name they have just typed. Nothing on screen looks
       wrong at any point — and the file that gets written carries the wrong
       name.
    */
    const { page } = dashboard;
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    dashboard.recorder.draft = {
      fields: { name: 'a-half-typed-name' },
      flags: {},
      services: [],
      savedAt: '2026-08-16T10:00:00.000Z',
    };
    await dashboard.reopen();

    // Hold the reload open, so it is guaranteed to land late.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/onboard/state', async (route) => {
      await held;
      await route.continue();
    });

    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#env', 'uat');
    await page.click('#saveApp');

    // Move on and start a different application while the save is in flight.
    await page.selectOption('#pick', '');
    await page.fill('#name', 'what-i-am-typing-now');
    release();

    await expect(
      page.locator('#name'),
      'the reload must not put the old draft back over this',
    ).toHaveValue('what-i-am-typing-now');

    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#preview');
    // The plan has to have landed: `create` reads the same form, but clicking
    // it while the preview is still in flight leaves step 5 inert and the
    // click queued behind it.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    expect(dashboard.recorder.created.at(-1)!.name).toBe('what-i-am-typing-now');
  });

  test('still refreshes the list of applications, which is what it was for', async ({
    dashboard,
  }) => {
    // Ignoring the whole reply would be the lazy fix and would leave a target
    // that has just been created missing from the picker.
    const { page } = dashboard;
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    await dashboard.reopen();
    await expect(page.locator('#pick option')).toHaveCount(2);

    await page.selectOption('#pick', 'shop-one');
    await page.click('#editApp');
    await page.fill('#env', 'uat');
    dashboard.recorder.applications = [
      anApplication({ name: 'shop-one' }),
      anApplication({ name: 'shop-two' }),
    ];
    await page.click('#saveApp');
    await expect(page.locator('#editOut')).toContainText('baseURL');

    await expect(page.locator('#pick option')).toHaveCount(3);
  });
});
