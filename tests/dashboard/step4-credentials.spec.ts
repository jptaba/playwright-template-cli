import { expect, reopenSteps, test } from './harness';

/**
 * Step 4 — credentials, and the two ways of proving they work.
 *
 * The rule this section exists under: **nothing typed here appears in any
 * response, any draft or any part of the page afterwards**. The rest is about
 * a sign-in being tried exactly once, because the account it would spend is
 * the one the whole suite depends on.
 */

async function readyForCredentials(
  dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'],
  options: { store?: 'vault' | 'local'; roles?: string } = {},
) {
  const { page } = dashboard;
  await reopenSteps(page);
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  // The probe has to have *finished*, not merely been started: a click returns
  // as soon as it is delivered, and everything below reads what it wrote.
  await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
  await page.selectOption('#secrets', options.store ?? 'local');
  if (options.roles !== undefined) await page.fill('#roles', options.roles);
  await page.click('#preview');
  await expect(page.locator('#s4')).not.toHaveAttribute('inert', '');
  /*
     And put the folded steps back, because the tests below drive controls in
     them — the Vault block, the secret source, the roles list all live in step
     3, which the preview folds. An operator changing any of those presses
     "Change this" first; this is that press.
  */
  await reopenSteps(page);
}

test.describe('signing in once', () => {
  test('asks for the credentials before it tries anything', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('Fill in the standard credentials');
    expect(dashboard.recorder.calls.filter((c) => c.path === '/api/verify')).toHaveLength(0);
  });

  test('names the first role, whatever it is called', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard, { roles: 'shopper, admin' });
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Fill in the shopper credentials');
  });

  test('with no roles at all, says something a person can act on', async ({ dashboard }) => {
    // `roles[0]` is undefined here, and "Fill in the undefined credentials
    // first" is the kind of message that makes somebody file a bug about the
    // dashboard instead of typing a role.
    const { page } = dashboard;
    await readyForCredentials(dashboard, { roles: '' });
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).not.toContainText('undefined');
    await expect(page.locator('#verifyStatus')).toContainText('role');
  });

  test('the server refuses a Vault sign-in even if the page offers it', async ({ dashboard }) => {
    /*
       The button is hidden for a Vault target now, so this is the backstop
       rather than the path: a stale page, or anything posting directly, must
       still be told why there is nothing to send. Vault renders no inputs, so
       the generic "fill in the credentials" message would point at fields that
       are not on the page.
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'vault' });
    await page.locator('#verify').evaluate((button: HTMLElement) => {
      button.hidden = false;
    });
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('Vault');
  });

  test('sends the probed names and reports the marker it derived', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');
    const sent = dashboard.lastCall('/api/verify')!;
    expect((sent.signIn as Record<string, unknown>).username).toBe('Email address *');
    expect((sent.signIn as Record<string, unknown>).path).toBe('/auth/login');
  });

  test('the marker it derived is what gets written', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    await page.click('#preview');
    const planned = dashboard.lastCall('/api/plan')!;
    expect((planned.signIn as Record<string, unknown>).signedInMarker).toEqual({
      role: 'button',
      name: 'My account',
      identitySpecific: false,
    });
  });

  test('signing in after the write says so, and gives the edit', async ({ dashboard }) => {
    /*
       The ordering trap, and it used to be invisible. Sign in before writing
       and the derived marker goes into the pack; sign in after and the scaffold
       cannot overwrite, so it was derived, shown, and dropped — leaving the
       guess in the file under a comment saying the sign-in was skipped. The
       page said "Signed in." either way.
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');

    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    await page.click('#verify');
    const status = page.locator('#verifyStatus');
    await expect(status).toContainText('This was not written to the pack.');
    await expect(status).toContainText('targets/shop/locators/sign-in.ts');
    // The exact replacement, not a description of one.
    await expect(status).toContainText("page.getByRole('button', { name: 'My account' })");
    await expect(status).toContainText('setup:auth');
  });

  test('signing in before the write says nothing about being too late', async ({ dashboard }) => {
    // The warning must stay off the path that works, or it is noise on the
    // journey the page is trying to encourage.
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');
    await expect(page.locator('#verifyStatus')).not.toContainText('not written to the pack');
  });

  test('a Vault target is not offered a button that cannot work', async ({ dashboard }) => {
    /*
       The dead end this section had: Vault is the default, it hides the
       credential fields, and the sign-in buttons stayed on screen offering
       something with nothing to send. Pressing one produced a good message —
       after the click. Saying it before is the whole fix.

       Unchecked, there is still nothing to send: the button appears only once
       the connection check has found the credential.
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'vault' });

    await expect(page.locator('#verify')).toBeHidden();
    await expect(page.locator('#assist')).toBeHidden();
    await expect(page.locator('#credentials')).toContainText('Check the connection in step 3');
  });

  test('switching the source clears the refusal it no longer describes', async ({ dashboard }) => {
    // The Vault refusal used to sit above the two inputs it had just been
    // wrong about.
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'local' });
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Fill in the standard credentials');

    await page.selectOption('#secrets', 'vault');
    await expect(page.locator('#verifyStatus')).toBeEmpty();
  });

  test('a refused sign-in says so without claiming success', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.verifyResult = {
      ok: false,
      marker: null,
      detail: 'The password field was still on screen after 15s.',
    };
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'wrong');
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('Did not sign in.');
    await expect(page.locator('#verifyStatus')).toContainText('still on screen');
  });

  test('the credential never comes back onto the page', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'the-secret-value');
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    expect(await page.locator('#s4').innerHTML()).not.toContain('the-secret-value');
    expect(await page.content()).not.toContain('the-secret-value');
  });

  test('the credential is never written into a draft', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'the-secret-value');
    await page.fill('#env', 'uat');
    await expect.poll(() => dashboard.recorder.drafts.length).toBeGreaterThan(0);

    const everything = JSON.stringify(dashboard.recorder.drafts);
    expect(everything).not.toContain('the-secret-value');
    expect(everything).not.toContain('shopper@shop.test');
  });

  test('a failing sign-in leaves the button pressable', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/verify'] = 'The browser would not start.';
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');

    await expect(page.locator('#verifyStatus')).toContainText('The browser would not start.');
    await expect(page.locator('#verify')).toBeEnabled();
  });
});

/**
 * Signing in as a Vault target — the case that could never derive a marker.
 *
 * Every Vault target shipped a guessed `signedInMarker` and a hand-edit,
 * because deriving one means signing in and signing in meant a credential this
 * page deliberately never holds. It still never holds one: what the button
 * sends is the path the connection check just proved, and the value is read
 * where the browser is driven.
 */
test.describe('signing in as a Vault target', () => {
  async function checkedConnection(
    dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'],
  ) {
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'vault' });
    await reopenSteps(page);
    await page.fill('#vaultAddr', 'https://vault.shop.test');
    await page.click('#vaultCheck');
    await expect(page.locator('#vaultStatus')).toContainText('Found it.');
  }

  test('the connection check is what earns the button', async ({ dashboard }) => {
    /*
       One journey rather than two. This used to run the setup, assert, and
       then run the whole setup again inside `checkedConnection` — and the
       helper's waits are all "is this already unlocked", which a second run
       satisfies instantly, so everything after it raced a preview still in
       flight. Reaching the state once and asserting on the way through is both
       the honest journey and the one that cannot race.
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'vault' });
    await expect(page.locator('#verify')).toBeHidden();

    await page.fill('#vaultAddr', 'https://vault.shop.test');
    await page.click('#vaultCheck');
    await expect(page.locator('#vaultStatus')).toContainText('Found it.');

    await expect(page.locator('#verify')).toBeVisible();
    // The assisted flow hands a filled form to a person watching, which is the
    // one thing a value nobody typed must not do.
    await expect(page.locator('#assist')).toBeHidden();
  });

  test('a check that found nothing usable earns nothing', async ({ dashboard }) => {
    // "It resolved" is not the bar: a credential carrying `user` instead of
    // `username` is exactly the sign-in that fails obscurely later.
    const { page } = dashboard;
    dashboard.recorder.vaultCheckResult = {
      ok: false,
      path: '',
      exists: true,
      fields: ['user', 'pass'],
      detail: 'The credential is there but has no username and password.',
      environment: [],
    };
    await readyForCredentials(dashboard, { store: 'vault' });
    await page.fill('#vaultAddr', 'https://vault.shop.test');
    await page.click('#vaultCheck');
    await expect(page.locator('#vaultStatus')).toContainText('Not usable yet.');

    await expect(page.locator('#verify')).toBeHidden();
  });

  test('moving the mount afterwards withdraws it', async ({ dashboard }) => {
    // A connection proven for one mount says nothing about another — the same
    // lesson the preview learned when Create wrote a file it never showed.
    const { page } = dashboard;
    await checkedConnection(dashboard);
    await expect(page.locator('#verify')).toBeVisible();

    await page.fill('#vaultMount', 'secret');
    await expect(page.locator('#verify')).toBeHidden();
    await expect(page.locator('#vaultStatus')).toContainText('no longer proven');
  });

  test('it sends the path it proved, and nothing that could be a value', async ({ dashboard }) => {
    const { page } = dashboard;
    await checkedConnection(dashboard);
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    const sent = dashboard.lastCall('/api/verify')!;
    expect(sent.source).toBe('vault');
    expect(sent.path).toBe(dashboard.lastCall('/api/vault/check')!.path);
    expect(sent.credentials, 'the page has no value to send').toBeUndefined();
    expect(JSON.stringify(sent.connection)).not.toContain('token');
  });

  test('the marker it derives is what gets written', async ({ dashboard }) => {
    // The whole point of the slice: a Vault target that no longer ships a
    // guessed marker and a hand-edit.
    const { page } = dashboard;
    await checkedConnection(dashboard);
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    await page.click('#preview');
    expect((dashboard.lastCall('/api/plan')!.signIn as Record<string, unknown>).signedInMarker)
      .toEqual({ role: 'button', name: 'My account', identitySpecific: false });
    await expect(page.locator('#plan')).not.toContainText('written as a guess');
  });
});

test.describe('signing in with a browser you can see', () => {
  test('swaps the buttons and starts reporting what it meets', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');

    await expect(page.locator('#assistDone')).toBeVisible();
    await expect(page.locator('#assistCancel')).toBeVisible();
    await expect(page.locator('#assist')).toBeHidden();
    await expect(page.locator('#assistExplain')).toBeVisible();
    await expect(page.locator('#assistOut')).toContainText('page(s) met so far');
  });

  test('cancelling puts the buttons back and stops polling', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await expect(page.locator('#assistDone')).toBeVisible();
    await page.click('#assistCancel');

    await expect(page.locator('#assist')).toBeVisible();
    await expect(page.locator('#assistDone')).toBeHidden();

    const before = dashboard.recorder.calls.filter((c) => c.path === '/api/assist/poll').length;
    await expect
      .poll(() => dashboard.recorder.calls.filter((c) => c.path === '/api/assist/poll').length)
      .toBe(before);
  });

  test('a browser closed by hand restores the buttons on its own', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.assistPollsBeforeClosing = 1;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');

    await expect(page.locator('#assist')).toBeVisible();
    await expect(page.locator('#assistDone')).toBeHidden();
  });

  test('finishing reports the session, the marker and whether CI can do this', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await page.click('#assistDone');

    await expect(page.locator('#assistOut')).toContainText('.auth/shop.standard.json');
    await expect(page.locator('#assistOut')).toContainText('Signed-in marker: button "My account"');
    await expect(page.locator('#assistOut')).toContainText('Unattended runs:');
  });

  test('a poll still in flight cannot wipe the marker it finished with', async ({ dashboard }) => {
    /*
       The race behind three singleton failures nobody could reproduce — the
       last of them this test's neighbour, "a marker that names one person",
       failing once inside a full run and passing alone every time after.

       `clearInterval` stops the *next* firing and does nothing about a callback
       already awaiting its reply. "I am on the home page" clears the timer and
       renders the derived marker into #assistOut; a poll that had already asked
       then comes back and replaces it with "N page(s) met so far". The marker
       is derived, displayed, and wiped, and nothing on screen looks wrong.

       Forced rather than waited for: holding the poll open makes it land late
       every time, the way `onboarding-journeys.spec.ts` holds the state reload.
       Under load it happened perhaps once in twenty runs, which is why three
       sightings never became a reproduction.
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/assist/poll', async (route) => {
      await held;
      await route.continue();
    });

    await page.click('#assist');
    /*
       Wait for a poll to be *in flight* rather than clicking straight through.
       The interval's first firing is 1500ms away, so finishing immediately —
       as the neighbouring tests do — means no poll has been sent and there is
       nothing to land late. Waiting on the request is a fact, not a delay.
    */
    const inFlight = page.waitForRequest('**/api/assist/poll');
    await inFlight;

    await page.click('#assistDone');
    await expect(page.locator('#assistOut')).toContainText('Signed-in marker:');

    // Now let it come back, after the flow has moved past it.
    const landed = page.waitForResponse('**/api/assist/poll');
    release();
    await landed;
    // One frame, so the handler the response resolved has run before we look.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));

    await expect(
      page.locator('#assistOut'),
      'a late poll replaced the marker panel the flow had already moved past',
    ).toContainText('Signed-in marker:');
    await expect(page.locator('#assistOut')).not.toContainText('page(s) met so far');
  });

  test('a marker that names one person is shown as the risk it is', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.assistFinishResult = {
      ...dashboard.recorder.assistFinishResult,
      marker: { role: 'button', name: 'John Doe', identitySpecific: true },
    };
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await page.click('#assistDone');

    await expect(page.locator('#assistOut')).toContainText('John Doe');
    await expect(page.locator('#assistOut')).toContainText("this account's own name");
  });

  test('a gauntlet that cannot be automated says so plainly', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.assistFinishResult = {
      ...dashboard.recorder.assistFinishResult,
      describes: ['otp: needs a value the code must not hold'],
      unattended: { possible: false, reason: 'a one-time code is required' },
    };
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await page.click('#assistDone');

    await expect(page.locator('#assistOut')).toContainText('Unattended runs will NOT work yet');
    await expect(page.locator('#assistOut')).toContainText('one-time code');
  });

  test('the handlers it worked out are written into the pack, not only displayed', async ({
    dashboard,
  }) => {
    /*
       The whole point of walking the gauntlet is the code that comes out of
       it. Showing the operator a handler and then writing a pack without it
       leaves them with a sign-in that works once, by hand, and a `setup:auth`
       that hangs on the same page in CI.
    */
    const { page } = dashboard;
    dashboard.recorder.assistFinishResult = {
      ...dashboard.recorder.assistFinishResult,
      gauntlet: [
        {
          kind: 'password-expiring',
          safety: 'safe',
          locatorName: 'passwordExpiryNotice',
          recogniser: { role: 'heading', name: 'Your password expires in 5 days' },
          resolution: { role: 'button', name: 'Remind me later' },
          controls: {
            textboxes: [],
            buttons: ['Remind me later'],
            headings: ['Your password expires in 5 days'],
            links: [],
          },
          note: 'A warning, not a demand.',
        },
      ],
      describes: ['password-expiring: resolved by clicking "Remind me later"'],
    };
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await page.click('#assistDone');
    await expect(page.locator('#assistOut')).toContainText('Remind me later');

    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s)');

    const written = dashboard.recorder.created.at(-1)!;
    expect(written.gauntlet, 'the handlers reach the scaffolder').toBeTruthy();
  });

  test('needs a target name before it will take a session', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForCredentials(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#assist');
    await page.fill('#name', '');
    await page.click('#assistDone');

    await expect(page.locator('#verifyStatus')).toContainText('Name the target');
  });
});

/**
 * Where a typed password is stored — the defect, and the choice that fixes it.
 *
 * Onboarding wrote every credential into `config/secrets.local.json`, which git
 * **tracks**. So onboarding a real application through this page — type the
 * password, press Create — put it in the repository, while `.gitignore` and the
 * Test users page both said plainly that anything real belongs in the private
 * file. The page never asked, so there was no way to say otherwise.
 */
test.describe('where the credentials are stored', () => {
  async function readyForStore(
    dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'],
  ) {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.selectOption('#secrets', 'local');
    await page.click('#preview');
    await expect(page.locator('#s4')).not.toHaveAttribute('inert', '');
    // The secret source these tests switch is in step 3, which the preview folds.
    await reopenSteps(page);
  }

  test('defaults to the gitignored file', async ({ dashboard }) => {
    // The default is where the safety lives. Somebody who never reads this
    // section still does not commit a password.
    const { page } = dashboard;
    await readyForStore(dashboard);

    await expect(page.locator('#storeBox')).toBeVisible();
    await expect(page.locator('#credentialLocation')).toHaveValue('private-file');
    await expect(page.locator('#storeNote')).toContainText('gitignored');
  });

  test('says what the committed file costs, at the moment of choosing it', async ({
    dashboard,
  }) => {
    // Both files are named alike and one is tracked. Nobody should have to
    // infer which from a .gitignore.
    const { page } = dashboard;
    await readyForStore(dashboard);
    await page.selectOption('#credentialLocation', 'shared-file');

    await expect(page.locator('#storeNote')).toContainText('in git');
    await expect(page.locator('#storeNote')).toContainText('history of every clone');
  });

  test('sends the choice with the write', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForStore(dashboard);
    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'the-secret-value');
    await page.selectOption('#credentialLocation', 'shared-file');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    expect(dashboard.recorder.created.at(-1)!.credentialLocation).toBe('shared-file');
    expect(await page.content(), 'and the value is still nowhere on the page').not.toContain(
      'the-secret-value',
    );
  });

  test('is not offered to a Vault target, which types nothing here', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyForStore(dashboard);
    await page.selectOption('#secrets', 'vault');
    await expect(page.locator('#storeBox')).toBeHidden();
  });
});
