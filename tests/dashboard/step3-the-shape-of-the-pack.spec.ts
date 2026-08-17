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

  /*
     `count()` is the one read in Playwright that does not wait — it answers
     for the DOM as it is at that instant. Called straight after a click that
     starts a round trip, it returns a truthful zero for a list that has not
     rendered, and the assertion then reads "expected > 6, received 0" and
     points at the application. Anchor on something that *does* wait first.
  */
  const planned = async (page: Parameters<Parameters<typeof test>[2]>[0]['dashboard']['page']) => {
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    return page.locator('#plan li').count();
  };

  test('each layer switched on adds files to the plan', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');
    const bare = await planned(page);

    await page.check('#lA11y');
    await page.check('#lDb');
    await page.click('#preview');

    await expect.poll(() => page.locator('#plan li').count()).toBeGreaterThan(bare);
  });

  test('previewing twice shows one list, not two', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');
    const first = await planned(page);
    await page.click('#preview');

    expect(await planned(page)).toBe(first);
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

test.describe("step 3's own sign that its button worked", () => {
  /*
     Preview's plan renders two sections down, in step 5, and step 3's own
     badge used to say "Needs your input" whether or not the preview had run —
     the section that owns the button gave no sign it did anything. This is
     that sign, pinned close to the button rather than only in the list below.
  */
  test('a successful preview says so next to its own button', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');

    await expect(page.locator('#previewStatus')).toContainText('file(s) planned');
    await expect(page.locator('#previewStatus')).toContainText('Write it');
    await expect(page.locator('#s3Badge')).toHaveText('Previewed');
    await expect(page.locator('#s3Badge')).toHaveClass(/auto/);
  });

  test('a change after previewing resets the sign along with the plan it invalidates', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.click('#preview');
    await expect(page.locator('#s3Badge')).toHaveText('Previewed');

    await page.check('#lA11y');

    await expect(page.locator('#s3Badge')).toHaveText('Needs your input');
    await expect(page.locator('#previewStatus')).toBeEmpty();
  });

  test('a refused preview leaves the badge saying input is still needed', async ({ dashboard }) => {
    const { page } = dashboard;
    await reachStep3(dashboard);
    await page.fill('#name', 'Acme Shop');
    await page.click('#preview');

    await expect(page.locator('#s3Badge')).toHaveText('Needs your input');
    await expect(page.locator('#previewStatus')).toContainText('not a usable target name');
  });
});

// ---------------------------------------------------------------------------
// The step rail
// ---------------------------------------------------------------------------

test.describe('where you are', () => {
  /*
     This page is two screens tall and gates each step on the one before it,
     and the only way to answer "which step am I on" was to scroll until a
     section stopped saying Locked.
  */
  const state = (dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard'], step: string) =>
    dashboard.page.locator(`#stepRail li[data-for="${step}"]`);

  test('starts with step 1 open and the rest locked', async ({ dashboard }) => {
    await expect(state(dashboard, 's1')).toHaveAttribute('data-state', 'open');
    for (const step of ['s2', 's3', 's4', 's5']) {
      await expect(state(dashboard, step)).toHaveAttribute('data-state', 'locked');
    }
  });

  test('moves as the steps unlock, and ticks what is behind', async ({ dashboard }) => {
    await reachStep3(dashboard);

    await expect(state(dashboard, 's1')).toHaveAttribute('data-state', 'done');
    await expect(state(dashboard, 's2')).toHaveAttribute('data-state', 'done');
    await expect(state(dashboard, 's3')).toHaveAttribute('data-state', 'open');
    await expect(state(dashboard, 's4')).toHaveAttribute('data-state', 'locked');
  });

  test('reaches the end once the preview has run', async ({ dashboard }) => {
    await reachStep3(dashboard);
    await dashboard.page.click('#preview');
    await expect(state(dashboard, 's5')).toHaveAttribute('data-state', 'open');
    await expect(state(dashboard, 's4')).toHaveAttribute('data-state', 'done');
  });

  test('each entry is a way back to its step', async ({ dashboard }) => {
    await reachStep3(dashboard);
    await dashboard.page.getByRole('link', { name: 'The application' }).click();
    await expect(dashboard.page.locator('#s1')).toBeInViewport();
  });
});
