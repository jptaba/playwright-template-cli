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

/**
 * Connecting to your own Vault — item 12.
 *
 * The owner's ask: somebody should be able to point the framework at their own
 * Vault by giving a URL and a data shape. Everything here is about that being
 * askable *and* provable before the pack is written against it — a Vault
 * target previously found out its mount was wrong from a setup:auth timeout
 * minutes later, on a locator that was never the problem.
 */
test.describe('your Vault', () => {
  async function atStep3(dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard']) {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    // Every test below is about a connection, and the server refuses one with
    // no address — correctly, which is its own test in `onboarding-routes`.
    await page.fill('#vaultAddr', 'https://vault.shop.test');
  }

  test('is shown for a Vault target and hidden for a local one', async ({ dashboard }) => {
    // A local target reads a file in this repository: no address, no mount, no
    // namespace. The page's problem was never too few fields.
    const { page } = dashboard;
    await atStep3(dashboard);

    await expect(page.locator('#vaultBox')).toBeVisible();
    await page.selectOption('#secrets', 'local');
    await expect(page.locator('#vaultBox')).toBeHidden();
    await page.selectOption('#secrets', 'vault');
    await expect(page.locator('#vaultBox')).toBeVisible();
  });

  test('offers no field that would hold a credential', async ({ dashboard }) => {
    /*
       The invariant the whole feature rests on. An address, a namespace and a
       mount are configuration; a token is a credential, and this page is built
       on the agent writing the reference while a person writes the value.
    */
    const { page } = dashboard;
    await atStep3(dashboard);

    const inputs = await page.locator('#vaultBox input').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).id),
    );
    expect(inputs).toEqual(['vaultAddr', 'vaultNamespace', 'vaultMount']);
    await expect(page.locator('#vaultBox input[type="password"]')).toHaveCount(0);
  });

  test('checks the path the profile will actually be written with', async ({ dashboard }) => {
    /*
       Proving a connection against one path and writing another would make the
       check worthless — the same defect as a preview that disagrees with what
       Create writes.
    */
    const { page } = dashboard;
    await atStep3(dashboard);
    await page.fill('#credentialRoot', 'secret/teams/qa');
    await page.fill('#accountType', 'contractors');
    await page.click('#vaultCheck');

    await expect(page.locator('#vaultStatus')).toContainText('Found it.');
    expect(dashboard.lastCall('/api/vault/check')!.path).toBe(
      'secret/teams/qa/contractors/standard/1',
    );

    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    await page.click('#create');
    await expect(page.locator('#result')).toContainText('file(s).');
    const created = dashboard.recorder.created.at(-1)!;
    expect(created.credentialRoot).toBe('secret/teams/qa');
    expect(created.accountType).toBe('contractors');
  });

  test('defaults the root from the target name without making it read-only', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await atStep3(dashboard);
    await page.click('#vaultCheck');
    expect(dashboard.lastCall('/api/vault/check')!.path).toBe('qa/shop/pools/workforce/standard/1');
  });

  test('reports the fields it found, and what the suite still needs exported', async ({
    dashboard,
  }) => {
    // The suite does not read this page — it resolves Vault from the
    // environment — so a connection proven here is worth nothing to setup:auth
    // unless the same values are exported.
    const { page } = dashboard;
    await atStep3(dashboard);
    await page.click('#vaultCheck');

    await expect(page.locator('#vaultStatus')).toContainText('username, password');
    await expect(page.locator('#vaultStatus pre')).toContainText('VAULT_ADDR=');
  });

  test('a credential that is there but wrongly named says so', async ({ dashboard }) => {
    /*
       The failure this check exists to catch, and the one "does the path
       exist" cannot see: present, resolvable, and carrying `user` where the
       secrets fixture reads `username`.
    */
    const { page } = dashboard;
    dashboard.recorder.vaultCheckResult = {
      ok: false,
      path: '',
      exists: true,
      fields: ['user', 'pass'],
      detail: 'The credential is there but has no username and password.',
      environment: [],
    };
    await atStep3(dashboard);
    await page.click('#vaultCheck');

    await expect(page.locator('#vaultStatus')).toContainText('Not usable yet.');
    await expect(page.locator('#vaultStatus')).toContainText('user, pass');
  });

  test('a local target checks too, and says which file answered', async ({ dashboard }) => {
    /*
       The reason this is not a Vault-only control. A local store needs no
       infrastructure, so this path is exercisable on any machine — which is
       what keeps the shared route, result shape and rendering honest for the
       Vault case, which mostly cannot be run here.

       `origin` is the local-only half: with two files and precedence between
       them, "it exists" is not the question somebody debugging has.
    */
    const { page } = dashboard;
    dashboard.recorder.vaultCheckResult = {
      ok: true,
      path: '',
      exists: true,
      fields: ['username', 'password'],
      origin: 'config/secrets.private.json',
      detail: 'The credential is there and carries username and password.',
      environment: [],
    };
    await atStep3(dashboard);
    await page.selectOption('#secrets', 'local');
    await page.click('#vaultCheck');

    await expect(page.locator('#vaultStatus')).toContainText('from config/secrets.private.json');
    expect(dashboard.lastCall('/api/vault/check')!.source).toBe('local');
  });

  test('changing the path shape withdraws a plan computed from the old one', async ({
    dashboard,
  }) => {
    // The credential paths are in the plan, so a preview taken before they
    // moved is describing something else.
    const { page } = dashboard;
    await atStep3(dashboard);
    await page.click('#preview');
    await expect(page.locator('#plan')).toContainText('file(s) will be written');

    await page.fill('#accountType', 'contractors');
    await expect(page.locator('#plan')).toContainText('The shape changed');
    await expect(page.locator('#create')).toBeDisabled();
  });
});
