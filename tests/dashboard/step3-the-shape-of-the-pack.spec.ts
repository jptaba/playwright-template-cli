import { expect, test } from './harness';

/**
 * Step 3 — roles, where credentials come from, and which optional layers ship.
 *
 * Every value here decides something about a file that gets written, and two
 * of them decide how many *other* fields appear: the roles list drives the
 * credential inputs in step 4, and the secret source decides whether there are
 * any. That coupling is where the defects live.
 */

async function reachStep3(dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard']) {
  const { page } = dashboard;
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.click('#skipProbe');
}

test.describe('roles', () => {
  test('each role gets a credential pair when the store is a local file', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await page.fill('#roles', 'standard, admin');

    await expect(page.locator('#cu-standard')).toBeVisible();
    await expect(page.locator('#cp-standard')).toBeVisible();
    await expect(page.locator('#cu-admin')).toBeVisible();
    await expect(page.locator('#cp-admin')).toBeVisible();
  });

  test('the password field is a password field', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await expect(page.locator('#cp-standard')).toHaveAttribute('type', 'password');
  });

  test('Vault offers no inputs, and says who fills them instead', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'vault');

    await expect(page.locator('#cu-standard')).toHaveCount(0);
    await expect(page.locator('#credentials')).toContainText('Vault holds these');
  });

  test('switching store back and forth does not leave stale inputs', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await expect(page.locator('#cu-standard')).toBeVisible();
    await page.selectOption('#secrets', 'vault');
    await expect(page.locator('#cu-standard')).toHaveCount(0);
    await page.selectOption('#secrets', 'local');
    await expect(page.locator('#cu-standard')).toHaveCount(1);
  });

  test('a role removed from the list takes its inputs with it', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await page.fill('#roles', 'standard, admin');
    await expect(page.locator('#cu-admin')).toBeVisible();

    await page.fill('#roles', 'standard');
    await expect(page.locator('#cu-admin')).toHaveCount(0);
  });

  test('the same role twice does not produce two fields with one id', async ({ dashboard }) => {
    /*
       Duplicate ids are not a cosmetic problem here. `$('cu-standard')`
       returns the first, so the second is a field somebody types into that is
       read by nothing — and the credential they entered is silently the one
       from the box above.
    */
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await page.fill('#roles', 'standard, standard');

    await expect(page.locator('#credentials input[id="cu-standard"]')).toHaveCount(1);
  });

  test('an empty roles list still plans, against the default role', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.fill('#roles', '');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('file(s) will be written');
  });

  test('roles are trimmed, so " admin " is the same role as "admin"', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.fill('#roles', '  standard ,  admin  ');
    await page.click('#preview');

    expect(dashboard.lastCall('/api/plan')!.roles).toEqual(['standard', 'admin']);
  });
});

test.describe('the optional layers', () => {
  test('are all off until something switches them on', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    for (const id of ['#lApi', '#lDb', '#lContracts', '#lA11y']) {
      await expect(page.locator(id)).not.toBeChecked();
    }
  });

  test('the api layer without a service URL is refused with what to do', async ({ dashboard }) => {
    // A profile with the API capability on and no base URL is dead on arrival:
    // every spec taking `api` fails at construction.
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.check('#lApi');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('needs a service base URL');
  });

  test('each layer switched on adds files to the plan', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');
    const bare = await page.locator('#plan li').count();

    await page.check('#lA11y');
    await page.check('#lDb');
    await page.click('#preview');

    expect(await page.locator('#plan li').count()).toBeGreaterThan(bare);
  });

  test('previewing twice shows one list, not two', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');
    const first = await page.locator('#plan li').count();
    await page.click('#preview');

    expect(await page.locator('#plan li').count()).toBe(first);
    await expect(page.locator('#plan ul')).toHaveCount(1);
  });
});

test.describe('previewing', () => {
  test('unlocks steps 4 and 5', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await expect(page.locator('#s4')).toHaveAttribute('inert', '');
    await page.click('#preview');

    await expect(page.locator('#s4')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');
  });

  test('a name that is not a usable target name is refused with the rule', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.fill('#name', 'Acme Shop');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('lower-case words joined by hyphens');
    await expect(page.locator('#s5'), 'and unlocks nothing').toHaveAttribute('inert', '');
  });

  test('an empty name is refused before anything is planned', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.fill('#name', '');
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('not a usable target name');
  });

  test('warns about a document URL where a base URL belongs', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page
      .locator('#services .service')
      .first()
      .locator('input')
      .nth(1)
      .fill('https://api.shop.test/openapi.json');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('points at a document rather than');
    await expect(page.locator('#plan'), 'a warning, not a refusal').toContainText(
      'file(s) will be written',
    );
  });

  test('a failing preview says so and leaves step 5 locked', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/plan'] = 'Something went wrong upstream.';
    await reachStep3(dashboard);
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('Something went wrong upstream.');
    await expect(page.locator('#s5')).toHaveAttribute('inert', '');
  });
});
