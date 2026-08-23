import { expect, test } from '@playwright/test';
import {
  handleDashboardRequest,
  landingPath,
  type DashboardRequest,
  type DashboardService,
} from '../../src/support/onboarding/dashboard';
import { EMPTY_DRAFT, type OnboardedApp } from '../../src/support/onboarding/draft';
import type { GauntletStep } from '../../src/support/onboarding/gauntlet';

/**
 * Every onboarding route, from the other side of the socket.
 *
 * `tests/dashboard/` drives the page in a browser and covers what the operator
 * sees. This covers what the server will accept — which is a different
 * question with a different answer, because the page is not the only thing
 * that can reach these routes. Anything a browser on any origin could POST at
 * a loopback port has to be refused here rather than in the DOM.
 *
 * The rule that shapes most of it: **the request body is rendered into
 * TypeScript source this repository then executes.** Nothing is spread; every
 * field is read deliberately and checked.
 */

function service(overrides: Partial<DashboardService> = {}): DashboardService {
  return {
    page: () => '<!doctype html>',
    existingTargets: () => ['example-app'],
    onboarded: () => [],
    readDraft: () => ({ ...EMPTY_DRAFT }),
    writeDraft: () => undefined,
    assistStart: async () => ({ started: true, detail: 'open' }),
    assistPoll: async () => ({ open: true, observed: 0, looksSignedIn: false, summary: [] }),
    assistFinish: async () => ({
      ok: true,
      detail: 'done',
      storageState: null,
      marker: null,
      gauntlet: [],
      describes: [],
      unattended: { possible: true, reason: 'nothing stood in the way' },
    }),
    assistCancel: async () => undefined,
    updateProfile: () => ({ source: '', applied: [], unchanged: [], refused: [], warnings: [] }),
    probe: async () => ({
      testIdAttribute: 'data-test',
      testIdCounts: { 'data-test': 12 },
      signIn: null,
      contract: null,
      notes: [],
    }),
    verify: async () => ({ ok: true, marker: null, detail: 'Signed in.' }),
    existing: () => [],
    storedVaultConnection: () => null,
    checkVault: async ({ path }) => ({
      ok: true,
      path,
      exists: true,
      fields: ['username', 'password'],
      detail: 'The credential is there and carries username and password.',
      environment: [],
    }),
    planRemoval: (target) => ({
      target,
      removeFiles: [`config/targets/${target}.ts`],
      removeDirectories: [`src/targets/${target}`],
      removeSecretKeys: [],
      removeStorageStates: [],
      warnings: [],
      refusals: [],
      alreadyGone: false,
    }),
    remove: async (plan) => plan.removeFiles,
    create: async (plan) => ({
      written: plan.files.map((file) => file.path),
      skipped: [],
      credentialPaths: [...plan.credentialPaths],
      diagnostics: [],
      nextSteps: plan.nextSteps,
    }),
    ...overrides,
  };
}

function request(overrides: Partial<DashboardRequest> = {}): DashboardRequest {
  return {
    method: 'POST',
    path: '/api/plan',
    body: { name: 'acme-shop', baseURL: 'https://staging.acme.example' },
    token: 'the-token',
    host: '127.0.0.1:5599',
    ...overrides,
  };
}

const send = (overrides: Partial<DashboardRequest>, over: Partial<DashboardService> = {}) =>
  handleDashboardRequest(request(overrides), { token: 'the-token', service: service(over) });

/** One application on disk. Only the count matters to anything below. */
const anOnboardedApp = (): OnboardedApp => ({
  name: 'toolshop',
  baseURL: 'https://shop.example',
  environment: 'staging',
  testIdAttribute: 'data-test',
  roles: ['standard'],
  secretSource: 'local',
  a11yStandard: 'wcag22aa',
  apiBaseURL: null,
  include: { api: false, db: false, contracts: false, a11y: true },
  onboardedAt: '2026-08-13T09:00:00.000Z',
  packFiles: 12,
});

// ---------------------------------------------------------------------------
// The route table itself
// ---------------------------------------------------------------------------

test.describe('routing', () => {
  test('a path nothing serves is a 404, not a 500', async () => {
    const response = await send({ path: '/api/nope' });
    expect(response.status).toBe(404);
  });

  test('the right path with the wrong method says which it was', async () => {
    // A 404 here would send somebody looking for a typo in a path that is fine.
    const response = await send({ method: 'GET', path: '/api/plan' });
    expect(response.status).toBe(405);
    expect(response.body).toContain('/api/plan');
  });

  test('every writing route needs both the loopback host and the token', async () => {
    const writes = [
      '/api/plan',
      '/api/create',
      '/api/onboard/draft',
      '/api/onboard/update',
      '/api/offboard/remove',
      '/api/assist/start',
    ];
    for (const path of writes) {
      expect((await send({ path, host: 'evil.example' })).status, path).toBe(403);
      expect((await send({ path, token: 'guessed' })).status, path).toBe(403);
      expect((await send({ path, token: null })).status, path).toBe(403);
    }
  });

  test('where the front door goes depends on whether anything is configured', () => {
    /*
       Onboarding was the landing page, so the screen everybody met every day
       for the life of a repository was the one they use once per application
       and never again. With nothing configured it is still right: there is
       genuinely nothing else to do, and landing on an empty Runs page would be
       the opposite mistake.

       Tested as a function rather than through the socket because that is what
       it is — a product decision with two branches, worth being able to read.
    */
    expect(landingPath(0)).toBe('/onboard');
    expect(landingPath(1)).toBe('/runs');
    expect(landingPath(7)).toBe('/runs');
  });

  test('/ sends a configured repository on to the page it actually uses', async () => {
    const response = await send(
      { method: 'GET', path: '/' },
      { onboarded: () => [anOnboardedApp()] },
    );
    expect(response.status).toBe(303);
    expect(response.headers?.Location).toBe('/runs');
  });

  test('/ serves onboarding itself when there is nothing else to do', async () => {
    // Not a redirect to /onboard: one hop rather than two, and /onboard is
    // what `/` would have served anyway.
    const response = await send({ method: 'GET', path: '/' }, { onboarded: () => [] });
    expect(response.status).toBe(200);
    expect(response.body).toContain('<!doctype html>');
  });

  test('/onboard is always itself, however many applications exist', async () => {
    // The redirect is a default, not a lock. A link to the wizard has to keep
    // working, or "add another application" becomes unreachable.
    const response = await send(
      { method: 'GET', path: '/onboard' },
      { onboarded: () => [anOnboardedApp()] },
    );
    expect(response.status).toBe(200);
  });

  test('a body that is not an object is handled as an empty one', async () => {
    // Nothing here may throw on shape alone; a 500 tells an attacker more than
    // a refusal does, and tells the operator less.
    const response = await send({ path: '/api/onboard/draft', body: null });
    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Assisted sign-in
// ---------------------------------------------------------------------------

test.describe('the assisted sign-in routes', () => {
  test('starting needs a base URL it is willing to drive', async () => {
    const response = await send({
      path: '/api/assist/start',
      body: { baseURL: 'not-a-url', signIn: { username: 'u', password: 'p' }, credentials: {} },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('is not a URL');
  });

  test('starting needs the two names the probe read', async () => {
    const response = await send({
      path: '/api/assist/start',
      body: { baseURL: 'https://staging.acme.example', signIn: { username: 'u' } },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('two field names');
  });

  test('starting needs a credential, and says which step it is in', async () => {
    const response = await send({
      path: '/api/assist/start',
      body: {
        baseURL: 'https://staging.acme.example',
        signIn: { username: 'u', password: 'p' },
        credentials: { username: 'someone' },
      },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('credentials');
  });

  test('finishing needs the target the session belongs to', async () => {
    const response = await send({ path: '/api/assist/finish', body: {} });
    expect(response.status).toBe(400);
    expect(response.body).toContain('Name the target');
  });

  test('finishing defaults the role rather than refusing', async () => {
    let asked: { target: string; role: string } | null = null;
    const response = await send(
      { path: '/api/assist/finish', body: { target: 'acme-shop' } },
      {
        assistFinish: async (input) => {
          asked = input;
          return {
            ok: true,
            detail: 'done',
            storageState: null,
            marker: null,
            gauntlet: [],
            describes: [],
            unattended: { possible: true, reason: '' },
          };
        },
      },
    );
    expect(response.status).toBe(200);
    expect(asked!.role).toBe('standard');
  });
});

// ---------------------------------------------------------------------------
// The interstitial handlers, on their way into generated source
// ---------------------------------------------------------------------------

test.describe('the gauntlet a plan carries', () => {
  const aStep = (overrides: Partial<GauntletStep> = {}) => ({
    kind: 'password-expiring',
    safety: 'safe',
    locatorName: 'passwordExpiryNotice',
    recogniser: { role: 'heading', name: 'Your password expires in 5 days' },
    resolution: { role: 'button', name: 'Remind me later' },
    controls: { textboxes: [], buttons: ['Remind me later'], headings: [], links: [] },
    note: 'A warning, not a demand.',
    ...overrides,
  });

  const planWith = async (gauntlet: unknown) => {
    let written = '';
    await send(
      {
        path: '/api/create',
        body: {
          name: 'acme-shop',
          baseURL: 'https://staging.acme.example',
          signIn: { username: 'Email', password: 'Password', submit: 'Login', path: '/login' },
          gauntlet,
        },
      },
      {
        create: async (plan) => {
          written = plan.files
            .filter((file) => file.path.includes('sign-in'))
            .map((file) => file.contents)
            .join('\n');
          return {
            written: [],
            skipped: [],
            credentialPaths: [],
            diagnostics: [],
            nextSteps: [],
          };
        },
      },
    );
    return written;
  };

  test('reaches the generated pack, so a sign-in that needed it still works', async () => {
    const source = await planWith([aStep()]);
    expect(source).toContain('gauntletLocators');
    expect(source).toContain('passwordExpiryNotice');
    expect(source).toContain('Remind me later');
    expect(source).toContain('clearGauntlet');
  });

  test('a kind the generator does not know is dropped, not written', async () => {
    // Every field of this ends up in TypeScript that this repository executes.
    const source = await planWith([aStep({ kind: 'arbitrary' as GauntletStep['kind'] })]);
    expect(source).not.toContain('gauntletLocators');
  });

  test('a locator name that is not an identifier is dropped', async () => {
    const source = await planWith([aStep({ locatorName: 'notice; process.exit(1); //' })]);
    expect(source).not.toContain('process.exit');
  });

  test('a role outside the ones getByRole is given is dropped', async () => {
    const source = await planWith([
      aStep({ recogniser: { role: "button'); rm(-rf", name: 'x' } }),
    ]);
    expect(source).not.toContain('rm(-rf');
  });

  test('an accessible name carrying a quote is escaped, not left to break the file', async () => {
    const source = await planWith([
      aStep({ recogniser: { role: 'heading', name: "Don't forget your password" } }),
    ]);
    expect(source).toContain("Don\\'t forget");
  });

  test('nothing observed writes no gauntlet at all', async () => {
    const source = await planWith([]);
    expect(source).not.toContain('gauntletLocators');
    expect(source, 'and the ordinary sign-in is untouched').toContain('signInLocators');
  });

  test('a gauntlet that is not a list is ignored rather than thrown over', async () => {
    expect(await planWith('yes please')).not.toContain('gauntletLocators');
    expect(await planWith({ kind: 'otp' })).not.toContain('gauntletLocators');
  });
});

// ---------------------------------------------------------------------------
// Correcting a profile that already exists
// ---------------------------------------------------------------------------

test.describe('updating an onboarded profile', () => {
  test('refuses a target this repository does not have', async () => {
    const response = await send({
      path: '/api/onboard/update',
      body: { target: 'not-here', edits: {} },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('not an application in this repository');
  });

  test('refuses a document URL where a base URL belongs, on the way back in too', async () => {
    const response = await send({
      path: '/api/onboard/update',
      body: {
        target: 'example-app',
        edits: { apiBaseURL: 'https://api.acme.example/docs?api-docs.json' },
      },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('query string');
  });

  test('reports what moved, what did not and what it would not touch', async () => {
    const response = await send(
      { path: '/api/onboard/update', body: { target: 'example-app', edits: { environment: 'uat' } } },
      {
        updateProfile: () => ({
          source: '',
          applied: [{ field: 'environment', from: 'staging', to: 'uat' }],
          unchanged: ['baseURL'],
          refused: [{ field: 'roles', reason: 'the profile builds them somewhere this cannot read' }],
          warnings: ['the host allowlist no longer covers the base URL'],
        }),
      },
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.applied).toHaveLength(1);
    expect(body.unchanged).toEqual(['baseURL']);
    expect(body.refused).toHaveLength(1);
    expect(body.warnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Doing the same thing twice
// ---------------------------------------------------------------------------

test.describe('idempotency', () => {
  test('planning the same options twice plans the same files', async () => {
    const body = {
      name: 'acme-shop',
      baseURL: 'https://staging.acme.example',
      roles: ['standard', 'admin'],
      include: { a11y: true },
    };
    const first = await send({ path: '/api/plan', body });
    const second = await send({ path: '/api/plan', body });
    expect(JSON.parse(second.body)).toEqual(JSON.parse(first.body));
  });

  test('planning is safe to call as often as anybody likes: it writes nothing', async () => {
    let writes = 0;
    for (let i = 0; i < 3; i += 1) {
      await send({ path: '/api/plan' }, { create: async () => (writes += 1) as never });
    }
    expect(writes).toBe(0);
  });

  test('a second create is refused once the first one landed', async () => {
    const written = ['config/targets/acme-shop.ts'];
    const response = await send(
      { path: '/api/create' },
      { existing: (paths) => paths.filter((path) => written.includes(path)) },
    );
    expect(response.status).toBe(409);
    expect(response.body).toContain('Refusing to overwrite');
  });

  test('planning a removal twice is the same answer, and removes nothing twice', async () => {
    let removals = 0;
    const over = {
      remove: async () => {
        removals += 1;
        return [];
      },
    };
    const first = await send({ path: '/api/offboard/plan', body: { target: 'example-app' } }, over);
    const second = await send({ path: '/api/offboard/plan', body: { target: 'example-app' } }, over);
    expect(second.body).toBe(first.body);
    expect(removals).toBe(0);
  });

  test('removing something already gone is a 409 that says so', async () => {
    const response = await send(
      { path: '/api/offboard/remove', body: { target: 'ghost', confirm: 'ghost' } },
      {
        planRemoval: (target) => ({
          target,
          removeFiles: [],
          removeDirectories: [],
          removeSecretKeys: [],
          removeStorageStates: [],
          warnings: [],
          refusals: [],
          alreadyGone: true,
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(response.body).toContain("Nothing named 'ghost'");
  });
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

test.describe('boundaries on the target name', () => {
  const refused = async (name: string) => {
    const response = await send({
      path: '/api/plan',
      body: { name, baseURL: 'https://staging.acme.example' },
    });
    return response.status === 400 ? 'refused' : 'accepted';
  };

  test('a name that would escape the targets directory is refused', async () => {
    // It becomes a directory, a TARGET value and part of a filename.
    expect(await refused('../../etc/passwd')).toBe('refused');
    expect(await refused('a/b')).toBe('refused');
    expect(await refused('..')).toBe('refused');
  });

  test('shapes that are not the convention are refused with the rule', async () => {
    for (const name of ['Acme-Shop', 'acme shop', 'acme_shop', '-acme', 'acme-', '9lives', '']) {
      expect(await refused(name), name).toBe('refused');
    }
  });

  test('the convention itself is accepted', async () => {
    for (const name of ['a', 'acme', 'acme-shop', 'acme-shop-2', 'a1-b2']) {
      expect(await refused(name), name).toBe('accepted');
    }
  });

  test('a name longer than any filesystem wants is still only a name check', async () => {
    // Documenting the boundary rather than asserting a limit that is not there:
    // if one is ever added, this is where it will be noticed.
    expect(await refused('a'.repeat(300))).toBe('accepted');
  });
});

test.describe('boundaries on what a plan may set', () => {
  test('an option the dashboard does not offer cannot be set by asking', async () => {
    const response = await send({
      path: '/api/plan',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        hostAllowlist: ['anything.example'],
        secretSource: 'somewhere-else',
      },
    });
    expect(response.status).toBe(200);
    // `secretSource` is constrained to the two values the profile understands;
    // anything else falls back rather than being written through.
    expect(response.body).not.toContain('somewhere-else');
  });

  test('a marker role outside the three the scaffold proposes is not written', async () => {
    const response = await send({
      path: '/api/create',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        signIn: {
          username: 'Email',
          password: 'Password',
          submit: 'Login',
          path: '/login',
          signedInMarker: { role: 'generic', name: 'x' },
        },
      },
    });
    expect(response.status).toBe(200);
  });

  test('creating with a credential does not then tell you to add one', async () => {
    /*
       Item 60, at the route where it was actually seen. The credential goes
       to the gitignored file — the default — and the panel afterwards used to
       say "Add credentials for standard to config/secrets.local.json", naming
       the tracked file about a value it had just written somewhere else.
    */
    const response = await send({
      path: '/api/create',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        secretSource: 'local',
        credentials: { standard: { username: 'someone', password: 'a-password' } },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Add credentials');
    expect(response.body).not.toContain('secrets.local.json');
  });

  test('previewing before anything is typed names the file the page is offering', async () => {
    // The preview has no credential yet, so the instruction stands — it just
    // has to name where the page would put one.
    const response = await send({
      path: '/api/plan',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        secretSource: 'local',
        credentialLocation: 'private-file',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('secrets.private.json');
  });

  test('a credential location the page cannot write to does not break the preview', async () => {
    // An unrecognised id would reach `describeLocation`, which throws. A
    // mistyped radio value must not turn a preview into a 500.
    const response = await send({
      path: '/api/plan',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        secretSource: 'local',
        credentialLocation: 'somewhere-else',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('secrets.private.json');
  });

  test('an empty role list falls back rather than writing a profile with none', async () => {
    const response = await send({
      path: '/api/plan',
      body: { name: 'acme-shop', baseURL: 'https://staging.acme.example', roles: ['', '  '] },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('standard');
  });
});

/**
 * The Vault connection check — item 12.
 *
 * The owner's ask was that somebody be able to point the framework at their
 * own Vault by giving a URL and a data shape. The whole safety of that rests
 * on one line: authentication is not part of what you may state here, because
 * the token comes from the environment. These are that line.
 */
test.describe('checking a Vault connection', () => {
  const connection = { address: 'https://vault.acme.example', kvMount: 'kv' };
  const root = 'qa/acme-shop/pools';
  const at = 'qa/acme-shop/pools/workforce/standard/1';

  test('resolves one path and reports the field names it holds', async () => {
    const response = await send({
      path: '/api/vault/check',
      body: { connection, path: at, root },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain(at);
    expect(response.body).toContain('username');
  });

  test('a local source is checkable with no connection at all', async () => {
    /*
       The reason this route is not Vault-only. A local store is two files in
       this repository — no address, no mount, no namespace — so it can be
       exercised on any machine, which means the shared route, result shape and
       rendering are proven by a code path that actually runs rather than one
       that is only reasoned about.
    */
    const response = await send({
      path: '/api/vault/check',
      body: { source: 'local', path: at, root },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain(at);
  });

  for (const field of ['token', 'secretId', 'secret_id', 'password', 'jwt']) {
    test(`refuses a connection carrying a ${field}`, async () => {
      /*
         The door this page exists to keep shut. A Vault credential in a
         request body is a credential in a browser, on the one page whose
         design is that the agent writes the reference and a person writes the
         value — and it would be the habit, not this one request, that did the
         damage.
      */
      const response = await send({
        path: '/api/vault/check',
        body: { connection: { ...connection, [field]: 'a-secret-value' }, path: at, root },
      });
      expect(response.status).toBe(400);
      expect(response.body).toContain('does not take a Vault credential');
      expect(response.body, 'and it is not echoed back').not.toContain('a-secret-value');
    });
  }

  test('an address with no scheme is refused, without naming an example host', async () => {
    const response = await send({
      path: '/api/vault/check',
      body: { connection: { address: 'vault.acme.example' }, path: at, root },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('Include the scheme');
  });

  test('a scheme it cannot reach is refused', async () => {
    const response = await send({
      path: '/api/vault/check',
      body: { connection: { address: 'file:///etc/passwd' }, path: at, root },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('not a scheme this can reach');
  });

  test('each missing piece is its own refusal', async () => {
    // Three different mistakes. A message naming the wrong one sends somebody
    // to check a field that was fine.
    const noPath = await send({ path: '/api/vault/check', body: { connection, root } });
    expect(noPath.status).toBe(400);
    expect(noPath.body).toContain('needs a path to resolve');

    const noRoot = await send({ path: '/api/vault/check', body: { connection, path: at } });
    expect(noRoot.status).toBe(400);
    expect(noRoot.body).toContain('credential root');

    const noAddress = await send({
      path: '/api/vault/check',
      body: { connection: {}, path: at, root },
    });
    expect(noAddress.status).toBe(400);
    expect(noAddress.body).toContain('needs its address');
  });
});

/**
 * Signing in as a Vault target, which used to be impossible.
 *
 * Deriving `signedInMarker` means signing in, and signing in meant a credential
 * this page never holds — so every Vault target shipped a guess and a
 * hand-edit. What crosses the socket now is a *reference*: an address, a mount
 * and a path, which are configuration. The value is read where the browser is
 * driven, and the rule that keeps this honest is unchanged — nothing in this
 * body may be a secret.
 */
test.describe('signing in from Vault', () => {
  const connection = { address: 'https://vault.acme.example', kvMount: 'kv' };
  const at = 'qa/acme-shop/pools/workforce/standard/1';
  const signIn = { username: 'Email', password: 'Password', submit: 'Login', path: '/login' };
  const body = {
    baseURL: 'https://staging.acme.example',
    signIn,
    source: 'vault',
    connection,
    path: at,
  };

  test('passes the path to resolve rather than anything to send', async () => {
    let asked: unknown;
    const response = await send(
      { path: '/api/verify', body },
      {
        verify: async (input) => {
          asked = input.credentials;
          return { ok: true, marker: null, detail: 'Signed in.' };
        },
      },
    );
    expect(response.status).toBe(200);
    expect(asked).toEqual({ fromVault: { connection, path: at } });
  });

  test('a connection carrying a credential is refused here too', async () => {
    /*
       Both routes read the connection through the same reader, so the door
       cannot be shut on one and left open on the other — which is exactly what
       a second hand-written copy of this check would eventually do.
    */
    const response = await send({
      path: '/api/verify',
      body: { ...body, connection: { ...connection, token: 'a-secret-value' } },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('does not take a Vault credential');
    expect(response.body, 'and it is not echoed back').not.toContain('a-secret-value');
  });

  test('each missing piece names itself', async () => {
    const noAddress = await send({
      path: '/api/verify',
      body: { ...body, connection: {} },
    });
    expect(noAddress.status).toBe(400);
    expect(noAddress.body).toContain('needs its address');

    const noPath = await send({ path: '/api/verify', body: { ...body, path: '' } });
    expect(noPath.status).toBe(400);
    expect(noPath.body).toContain('the path the credential is at');
  });

  test('a local sign-in still has to carry both values', async () => {
    const response = await send({
      path: '/api/verify',
      body: { baseURL: body.baseURL, signIn, credentials: { username: 'someone' } },
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('needs a username and a password');
  });
});

/**
 * Where a typed credential is written — the defect this pair pins.
 *
 * Onboarding wrote every credential into `config/secrets.local.json`, which git
 * tracks, while `.gitignore` and the Test users page both said anything real
 * belongs in the private file. The page never asked, so there was no way to
 * say otherwise.
 */
test.describe('where a credential gets written', () => {
  const body = {
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    secretSource: 'local',
    credentials: { standard: { username: 'someone', password: 'a-password' } },
  };

  test('defaults to the gitignored file when nothing says otherwise', async () => {
    // The default carries the safety here. Anyone who does not read the
    // section still does not commit a password.
    let chosen: string | null = null;
    const response = await send(
      { path: '/api/create', body },
      {
        create: async (plan, _options, _credentials, location) => {
          chosen = location;
          return {
            written: plan.files.map((file) => file.path),
            skipped: [],
            credentialPaths: [...plan.credentialPaths],
            diagnostics: [],
            nextSteps: plan.nextSteps,
          };
        },
      },
    );
    expect(response.status).toBe(200);
    expect(chosen).toBe('private-file');
  });

  test('the tracked file is available, but only by asking for it', async () => {
    let chosen: string | null = null;
    const response = await send(
      { path: '/api/create', body: { ...body, credentialLocation: 'shared-file' } },
      {
        create: async (plan, _options, _credentials, location) => {
          chosen = location;
          return {
            written: [],
            skipped: [],
            credentialPaths: [...plan.credentialPaths],
            diagnostics: [],
            nextSteps: [],
          };
        },
      },
    );
    expect(response.status).toBe(200);
    expect(chosen).toBe('shared-file');
  });

  test('somewhere this page cannot write is refused rather than ignored', async () => {
    for (const location of ['vault', 'environment', 'anywhere-else']) {
      const response = await send({
        path: '/api/create',
        body: { ...body, credentialLocation: location },
      });
      expect(response.status, location).toBe(400);
      expect(response.body).toContain('not somewhere this page can write');
    }
  });
});

test.describe('the credential path shape reaches the write', () => {
  test('a root and account type stated on the form are what get planned', async () => {
    /*
       The page shows a path and checks the Vault against it. If the write then
       used a different one, the check would have proven something about a path
       nothing reads — the same class of defect as a preview that disagrees
       with what Create writes.
    */
    const response = await send({
      path: '/api/plan',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        credentialRoot: 'secret/teams/qa',
        accountType: 'contractors',
        roles: ['standard'],
      },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('secret/teams/qa/contractors/standard/1');
  });

  test('saying nothing writes what the scaffolder always wrote', async () => {
    const response = await send({
      path: '/api/plan',
      body: { name: 'acme-shop', baseURL: 'https://staging.acme.example', roles: ['standard'] },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('qa/acme-shop/pools/workforce/standard/1');
  });
});
