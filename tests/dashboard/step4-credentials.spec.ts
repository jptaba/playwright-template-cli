import { expect, test } from './harness';

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
    await expect(status).toContainText('src/targets/shop/locators/sign-in.ts');
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
    */
    const { page } = dashboard;
    await readyForCredentials(dashboard, { store: 'vault' });

    await expect(page.locator('#verify')).toBeHidden();
    await expect(page.locator('#assist')).toBeHidden();
    await expect(page.locator('#credentials')).toContainText('not offered for a Vault target');
    await expect(page.locator('#credentials')).toContainText('npm run explore');
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
