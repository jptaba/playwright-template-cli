import { expect, test } from './harness';

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
  await page.fill('#name', name);
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await page.click('#preview');
  await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');
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
    await readyToWrite(dashboard);
    await expect(page.locator('#plan')).toContainText('signedInMarker will be written as a guess');
    await expect(page.locator('#plan')).toContainText('too late');
  });

  test('a conflict refuses, and does not also list the files as outgoing', async ({ dashboard }) => {
    /*
       The contradiction somebody actually met: "nothing will be written",
       immediately followed by "13 file(s) will be written" naming the same
       thirteen. Both halves cannot be true and the reader has no way to tell
       which is.
    */
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['config/targets/shop.ts', 'src/targets/shop/fixtures.ts'];
    await readyToWrite(dashboard);

    await expect(page.locator('#plan')).toContainText('already onboarded');
    await expect(page.locator('#plan')).not.toContainText('file(s) will be written');
    await expect(page.locator('#plan ul')).toHaveCount(0);
    await expect(page.locator('#create')).toBeDisabled();
  });

  test('a conflict says how to change the application instead', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['config/targets/shop.ts'];
    await readyToWrite(dashboard);
    await expect(page.locator('#plan')).toContainText('target:remove');
  });

  test('changing the name after a conflict makes it writable again', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.conflicts = ['config/targets/shop.ts'];
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

    dashboard.recorder.conflicts = ['config/targets/shop.ts'];
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
    dashboard.recorder.conflicts = ['config/targets/shop.ts'];
    await page.click('#create');

    await expect(page.locator('#result')).toContainText('Refusing to overwrite');
  });
});
