import { expect, reopenSteps, test } from './harness';

/**
 * Step 5 — the one step that writes.
 *
 * Everything above it is reversible; this is not. So the properties worth
 * pinning are about **refusal**: that a preview which refused cannot be turned
 * into a write by pressing the next button, that nothing is overwritten, and
 * that what the operator was shown is what actually happened.
 */

async function readyToWrite(
  dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'],
  name = 'shop',
) {
  const { page } = dashboard;
  await reopenSteps(page);
  await page.fill('#name', name);
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await page.click('#preview');
  await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');
  /*
     The preview folds steps 1 to 3, and the tests below change a name or a
     layer to make the plan go stale — which is a control up there. Reopening
     is what an operator does with "Change this" before editing.
  */
  await reopenSteps(page);
}

test.describe('the preview', () => {
  test('lists what will be written', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyToWrite(dashboard);
    // Anchored on a waiting read first: `count()` answers for the DOM as it
    // is, and a truthful zero for a list still rendering reads as a defect.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await expect(page.locator('#plan li').first()).toBeVisible();
    expect(await page.locator('#plan li').count()).toBeGreaterThan(0);
    await expect(page.locator('#create')).toBeEnabled();
  });

  test('a plan that no longer matches the form is withdrawn, not left to disagree', async ({
    dashboard,
  }) => {
    /*
       Observed on a real onboarding: previewed six files, ticked the
       accessibility layer, pressed Create, and it wrote seven. Create re-reads
       the live form, which is right; the plan being allowed to sit there
       badged "Done for you" while describing something else is the defect.
    */
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await expect(page.locator('#plan')).toContainText('file(s) will be written');

    await page.check('#lA11y');

    await expect(page.locator('#plan')).toContainText('The shape changed after this was previewed');
    await expect(page.locator('#plan')).not.toContainText('file(s) will be written');
    await expect(page.locator('#create')).toBeDisabled();
  });

  test('previewing again after a change restores the write', async ({ dashboard }) => {
    // The recovery has to be one named button, or invalidating the plan just
    // moves the dead end somewhere else.
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await page.check('#lA11y');
    await expect(page.locator('#create')).toBeDisabled();

    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await expect(page.locator('#create')).toBeEnabled();
  });

  test('signing in does not invalidate a plan it cannot change', async ({ dashboard }) => {
    /*
       The marker and the gauntlet move when somebody signs in, and neither
       changes which files get written. A fingerprint covering the whole of
       options() would nag about a preview that is still entirely accurate.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    // Chosen before the preview, so the credential fields exist by the time
    // there is a plan to leave alone.
    await page.selectOption('#secrets', 'local');
    await page.click('#preview');
    await expect(page.locator('#s4')).not.toHaveAttribute('inert', '');

    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await expect(page.locator('#create')).toBeEnabled();
  });

  test('warns that the signed-in marker will be a guess, before writing one', async ({
    dashboard,
  }) => {
    /*
       Step 4 used to call signing in "optional, and worth it" while the banner
       promised setup:auth would pass unedited. Both cannot be true — skipping
       it writes a guessed marker that fails as a bare timeout minutes later,
       nowhere near the choice that caused it. Said at the preview, which is the
       last screen before the write, and not behind a confirmation: the cure for
       a wizard nobody reads is not another click.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.selectOption('#secrets', 'local');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');
    await expect(page.locator('#plan')).toContainText('too late');
  });

  test('withdraws that warning once a sign-in has actually been verified', async ({ dashboard }) => {
    /*
       Observed on a real onboarding: preview, then sign in, and step 5 still
       read "setup:auth will fail until it is corrected by hand" — while the
       file it went on to write held the derived marker and was correct. The
       write was right and the last screen before it was wrong about the write,
       which is the same defect as a plan that no longer matches the form.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.selectOption('#secrets', 'local');
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');

    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('Signed in.');

    await expect(page.locator('#plan')).not.toContainText('will be written as a guess');
    // The rest of the plan is untouched: this withdraws a warning, not a plan.
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await expect(page.locator('#create')).toBeEnabled();
  });

  test('keeps the warning when the guess has already been written', async ({ dashboard }) => {
    /*
       The other direction, and the one that would be a new lie. After the
       write there is nothing to take back: the files exist, the scaffold never
       overwrites, and the guess really is in locators/sign-in.ts. Clearing the
       warning here because a marker arrived would report a correct pack.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    // Before the preview, or choosing it withdraws the plan this test writes.
    await page.selectOption('#secrets', 'local');
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');

    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'a-password');
    await page.click('#verify');
    await expect(page.locator('#verifyStatus')).toContainText('This was not written to the pack.');

    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');
  });

  test('tells a Vault target the truth, which is a different instruction', async ({ dashboard }) => {
    /*
       This page cannot sign in for a Vault target — there is no credential to
       send — so pointing at a step 4 button it does not render would be worse
       than saying nothing. The marker still has to come from somewhere, and a
       snapshot of the signed-in page is where.
    */
    const { page } = dashboard;
    await readyToWrite(dashboard);

    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');
    await expect(page.locator('#plan')).toContainText('npm run explore');
    await expect(page.locator('#plan')).not.toContainText('too late');
  });

  test('a conflict refuses, and does not also list the files as outgoing', async ({ dashboard }) => {
    /*
       The contradiction somebody actually met: "nothing will be written",
       immediately followed by "13 file(s) will be written" naming the same
       thirteen. Both halves cannot be true and the reader has no way to tell
       which is.
    */
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['targets/shop/profile.ts', 'targets/shop/fixtures.ts'];
    await readyToWrite(dashboard);

    await expect(page.locator('#plan')).toContainText('already onboarded');
    await expect(page.locator('#plan')).not.toContainText('file(s) will be written');
    await expect(page.locator('#plan ul')).toHaveCount(0);
    await expect(page.locator('#create')).toBeDisabled();
  });

  test('a conflict says how to change the application instead', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['targets/shop/profile.ts'];
    await readyToWrite(dashboard);
    await expect(page.locator('#plan')).toContainText('target:remove');
  });

  test('changing the name after a conflict makes it writable again', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['targets/shop/profile.ts'];
    await readyToWrite(dashboard);
    await expect(page.locator('#create')).toBeDisabled();

    dashboard.recorder.conflicts = [];
    await page.fill('#name', 'shop-two');
    await page.click('#preview');

    await expect(page.locator('#create')).toBeEnabled();
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
  });

  test('a preview that then conflicts disables the button again', async ({ dashboard }) => {
    // The other direction, which is the one that matters: enabled once must
    // not stay enabled forever.
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await expect(page.locator('#create')).toBeEnabled();

    dashboard.recorder.conflicts = ['targets/shop/profile.ts'];
    await page.click('#preview');
    await expect(page.locator('#create')).toBeDisabled();
  });
});

test.describe('writing', () => {
  test('reports how many files, the doctor’s verdict and what to do next', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await page.click('#create');

    await expect(page.locator('#result')).toContainText('file(s).');
    await expect(page.locator('#result')).toContainText('target:doctor');
    await expect(page.locator('#result pre')).toContainText('1.');
  });

  test('carries the vendored contract document, so the capability has something to check', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const body = dashboard.recorder.created.at(-1)!;
    expect((body.contractDocument as Record<string, unknown>).filename).toBe('openapi.json');
  });

  test('sends the credentials but never gets them back', async ({ dashboard }) => {
    /*
       Every step waits for the one before it to have finished, rather than for
       the click that starts it to have been dispatched. Without the two
       explicit anchors this passed alone and failed under parallel load: a
       click returns as soon as it is delivered, and the handler behind it is
       still in flight.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');

    await page.selectOption('#secrets', 'local');
    await page.click('#preview');
    await expect(page.locator('#s4')).not.toHaveAttribute('inert', '');

    await page.fill('#cu-standard', 'shopper@shop.test');
    await page.fill('#cp-standard', 'the-secret-value');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');

    const body = dashboard.recorder.created.at(-1)!;
    expect((body.credentials as Record<string, { password: string }>)['standard']!.password).toBe(
      'the-secret-value',
    );
    expect(await page.content(), 'and it is nowhere on the page').not.toContain('the-secret-value');
  });

  test('a diagnostic from the doctor is shown with its fix', async ({ dashboard }) => {
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('profile, pack and credentials agree');
  });

  test('a failed write says why and lets it be tried again', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/create'] = 'Disk full.';
    await readyToWrite(dashboard);
    await page.click('#create');

    await expect(page.locator('#result')).toContainText('Disk full.');
    await expect(page.locator('#create')).toBeEnabled();
  });

  test('cannot be pressed twice into two writes', async ({ dashboard }) => {
    // Double-submit on the one irreversible button in the framework.
    const { page } = dashboard;
    await readyToWrite(dashboard);
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    await expect(page.locator('#create')).toBeDisabled();
    expect(dashboard.recorder.created).toHaveLength(1);
  });

  test('the server refuses a write that the page thought was fine', async ({ dashboard }) => {
    /*
       Belt and braces, and the braces are the ones that hold: the page's
       disabled button is a convenience, the server's conflict check is the
       guarantee. Previewed clean, then the files appear underneath.
    */
    const { page } = dashboard;
    await readyToWrite(dashboard);
    dashboard.recorder.conflicts = ['targets/shop/profile.ts'];
    await page.click('#create');

    await expect(page.locator('#result')).toContainText('Refusing to overwrite');
  });
});
