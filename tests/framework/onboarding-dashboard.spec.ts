import { expect, test } from '@playwright/test';
import {
  checkApiBaseURL,
  handleDashboardRequest,
  validateProbeTarget,
  type DashboardRequest,
  type DashboardService,
} from '../../src/support/onboarding/dashboard';
import {
  contractFilename,
  detectTestIdAttribute,
  looksLikeContractDocument,
  parseSignInFields,
  probeTarget,
  proposeSignedInMarker,
  verifySignIn,
  SIGN_IN_PATHS,
  type ProbePage,
} from '../../src/support/onboarding/probe';
import { dashboardPage } from '../../src/support/onboarding/dashboard-page';
import { planScaffold } from '../../src/support/onboarding/scaffold';
import {
  DRAFT_FIELDS,
  EMPTY_DRAFT,
  draftHasContent,
  sanitiseDraft,
} from '../../src/support/onboarding/draft';

/**
 * The onboarding dashboard, tested with no socket, no browser and no
 * filesystem — the same way every other adapter in this suite is tested.
 *
 * What is worth testing here is not "does the page render". It is the two
 * things that decide whether the dashboard is trustworthy: that it reads the
 * application correctly, and that it cannot be talked into writing something
 * it should not.
 */

// ---------------------------------------------------------------------------
// Reading the application
// ---------------------------------------------------------------------------

test.describe('detecting the test-id attribute', () => {
  test('picks the attribute the application actually uses', () => {
    expect(detectTestIdAttribute({ 'data-test': 98, 'data-testid': 0, 'data-qa': 0 })).toEqual({
      attribute: 'data-test',
      confident: true,
    });
  });

  test('is not confident when two attributes are in play', () => {
    // A migration in progress. Picking the wrong side of it makes every
    // getByTestId in the pack match nothing, silently.
    const detected = detectTestIdAttribute({ 'data-test': 40, 'data-testid': 30 });
    expect(detected.attribute).toBe('data-test');
    expect(detected.confident).toBe(false);
  });

  test('falls back to the Playwright default rather than guessing', () => {
    expect(detectTestIdAttribute({ 'data-test': 0, 'data-qa': 0 })).toEqual({
      attribute: 'data-testid',
      confident: false,
    });
  });
});

test.describe('reading the sign-in form', () => {
  /** The shape `locator.ariaSnapshot()` produces. */
  const snapshot = `
- heading "Login" [level=3]
- button "Sign in with Google"
- generic:
  - text: Email address *
  - textbox "Email address *"
  - textbox "Password *"
  - button
  - button "Login"
- link "Register your account"
`;

  test('takes the accessible names, which is what getByRole matches', () => {
    /*
       The names in this snapshot are the labels. The same form's placeholders
       read "Your email" and "Your password", and a pack written from those —
       which is what a DOM dump produces — fails as a bare timeout on a field
       plainly on screen. That happened, on a real target, to every locator in
       the file at once.
    */
    expect(parseSignInFields(snapshot)).toEqual({
      username: 'Email address *',
      password: 'Password *',
      submit: 'Login',
    });
  });

  test('steps over the unnamed show-password toggle to find the submit', () => {
    // The button between the password field and the submit is the visibility
    // toggle, and it has no accessible name — which is a real accessibility
    // defect, and also the reason "the next button" is the wrong rule.
    expect(parseSignInFields(snapshot)?.submit).toBe('Login');
  });

  test('returns null rather than guessing when there is no password field', () => {
    expect(parseSignInFields('- heading "Welcome"\n- link "Products"')).toBeNull();
  });
});

test.describe('finding the published contract', () => {
  test('accepts a document that declares its version, in either format', () => {
    expect(looksLikeContractDocument('{"openapi":"3.2.0","paths":{}}')).toEqual({
      ok: true,
      version: '3.2.0',
    });
    expect(looksLikeContractDocument('openapi: 3.0.1\npaths: {}')).toEqual({
      ok: true,
      version: '3.0.1',
    });
  });

  test('rejects the HTML viewer that lives at the same paths', () => {
    // `/api/documentation` serves Swagger UI on a great many services. It is
    // not a document, and vendoring it would produce a contract suite that
    // validates nothing while reporting coverage.
    expect(looksLikeContractDocument('<!doctype html><title>Swagger UI</title>').ok).toBe(false);
    expect(looksLikeContractDocument('{"data":[{"id":1}]}').ok).toBe(false);
  });

  test('names the vendored file by its format, not by its URL', () => {
    expect(contractFilename('https://api.example.com/docs?api-docs.json')).toBe('openapi.json');
    expect(contractFilename('https://api.example.com/openapi.yaml')).toBe('openapi.yaml');
  });
});

test('the sign-in form is looked for on the landing page, not only behind a route', async () => {
  /*
     ParaBank, and a great many banking and line-of-business applications, put
     the sign-in panel on the home page. The candidate list began at
     `/auth/login`, so the probe reported "no sign-in form found" for an
     application whose form it had already loaded and counted test-ids on —
     leaving the operator to write by hand the one thing the probe exists to
     read for them.
  */
  expect(SIGN_IN_PATHS[0]).toBe('/');

  const visited: string[] = [];
  const page: ProbePage = {
    goto: async (url) => {
      visited.push(url);
      return undefined;
    },
    evaluate: async () => ({ 'data-testid': 0 }),
    ariaSnapshot: async () =>
      '- textbox "Username"\n- textbox "Password"\n- button "Log In"',
    settle: async () => undefined,
    // Only the landing page has one, as on ParaBank.
    hasPasswordField: async () => visited[visited.length - 1] === 'https://bank.example/',
    waitForPasswordGone: async () => true,
    submitSignIn: async () => undefined,
    url: () => 'https://bank.example/',
  };

  const result = await probeTarget(page, async () => ({ status: 404, body: '' }), {
    baseURL: 'https://bank.example',
  });

  expect(result.signIn).toMatchObject({ path: '/', username: 'Username', submit: 'Log In' });
});

test('a form whose fields have no accessible names is a different finding', async () => {
  /*
     ParaBank again, and it is the commoner of the two failures. Its username
     and password inputs carry no id, no label, no aria-label and no
     placeholder — the visible "Username" is a sibling paragraph — so the
     accessibility tree is an unnamed textbox twice over.

     Reporting that as "no sign-in form found" sent the operator looking for a
     login page that was in front of them the whole time. The two need
     different answers: one means keep looking, the other means write the
     locators by hand and go and tell somebody their form is unlabelled.
  */
  const page: ProbePage = {
    goto: async () => undefined,
    evaluate: async () => ({ 'data-testid': 0 }),
    ariaSnapshot: async () =>
      '- paragraph: Username\n- textbox\n- paragraph: Password\n- textbox\n- button "Log In"',
    settle: async () => undefined,
    hasPasswordField: async () => true,
    waitForPasswordGone: async () => true,
    submitSignIn: async () => undefined,
    url: () => 'https://bank.example/',
  };

  const result = await probeTarget(page, async () => ({ status: 404, body: '' }), {
    baseURL: 'https://bank.example',
  });

  expect(result.signIn, 'a name guessed from the text beside a field is a dead locator').toBeNull();
  const note = result.notes.join(' ');
  expect(note).toContain('no accessible names');
  expect(note).not.toContain('No sign-in form found');
  expect(note, 'unlabelled inputs are the application\'s defect too').toContain('WCAG');
});

test('the probe reports what it could not establish instead of failing', async () => {
  const page: ProbePage = {
    goto: async () => undefined,
    evaluate: async () => ({ 'data-test': 0, 'data-testid': 0 }),
    ariaSnapshot: async () => '- heading "Home"',
    settle: async () => undefined,
    hasPasswordField: async () => false,
    waitForPasswordGone: async () => true,
    submitSignIn: async () => undefined,
    url: () => 'https://app.internal.corp/',
  };

  const result = await probeTarget(page, async () => ({ status: 404, body: '' }), {
    baseURL: 'https://app.internal.corp',
    signInPaths: ['/login'],
  });

  expect(result.signIn).toBeNull();
  expect(result.contract).toBeNull();
  expect(result.notes.join(' ')).toContain('No sign-in form found');
  // An application with no test-id attribute and no sign-in form is a normal
  // outcome. Refusing to scaffold it would be the wrong answer.
  expect(result.testIdAttribute).toBe('data-testid');
});

// ---------------------------------------------------------------------------
// Deriving the one locator that cannot be read from a page at rest
// ---------------------------------------------------------------------------

test.describe('the signed-in marker', () => {
  const signedOut = '- link "Home"\n- link "Contact"\n- link "Sign in"';
  const signedIn = '- link "Home"\n- link "Contact"\n- button "Jane Doe"\n- link "Sign out"';

  test('is whatever appeared once signed in', () => {
    /*
       Identity-specific with no hints given at all: "Jane Doe" is two
       capitalised words and no interface vocabulary, which is what a person's
       name looks like. Toolshop is why — its credential is
       `admin@practicesoftwaretesting.com` and its account menu says
       "John Doe", so matching against the login alone said "generic" about the
       marker least likely to survive a second role using it.
    */
    expect(proposeSignedInMarker(signedOut, signedIn)).toEqual({
      role: 'button',
      name: 'Jane Doe',
      identitySpecific: true,
    });
  });

  test('is never the sign-out control', () => {
    /*
       Sign-out is new on the signed-in page and would be an obvious pick. It is
       also the wrong one: `isSignedIn` is called after signing out too, and a
       marker that is the sign-out button reports a session that has just ended.
    */
    const onlySignOut = '- link "Home"\n- link "Sign out"';
    expect(proposeSignedInMarker(signedOut, onlySignOut)).toBeNull();
  });

  test('is null rather than wrong when nothing new appeared', () => {
    expect(proposeSignedInMarker(signedOut, signedOut)).toBeNull();
  });

  test('flags a marker that is the signed-in account’s own name', () => {
    /*
       The account menu on most applications renders the user's name, so one
       sign-in proposes it — and it works perfectly for the role it came from
       and fails for every other. That is not hypothetical: a marker of
       `button "Jane Doe"` established the customer's session on a real target
       and then reported that the administrator had not signed in.
    */
    const marked = proposeSignedInMarker(signedOut, signedIn, ['jane.doe@shop.example']);
    expect(marked).toEqual({ role: 'button', name: 'Jane Doe', identitySpecific: true });
  });

  test('prefers a role-agnostic control over the account’s own name', () => {
    const after = '- link "Home"\n- button "Jane Doe"\n- link "My account"';
    expect(proposeSignedInMarker(signedOut, after, ['jane.doe@shop.example'])).toEqual({
      role: 'link',
      name: 'My account',
      identitySpecific: false,
    });
  });

  test('prefers a duller control that resolves over a better one that cannot', () => {
    /*
       Saucedemo, and it is the ordinary case rather than an exotic one: every
       product renders an image link and a title link carrying the same
       accessible name. "Sauce Labs Backpack" is three capitalised words with no
       interface vocabulary, so it reads as an account menu and used to outrank
       the `button "Open Menu"` that appears exactly once and only when signed
       in. The pack was written with a locator that cannot resolve, and
       `setup:auth` died on a strict-mode violation after the page had said
       "Signed in."
    */
    const after = [
      '- link "Sauce Labs Backpack"',
      '- link "Sauce Labs Backpack"',
      '- button "Open Menu"',
      '- button "Add to cart"',
      '- button "Add to cart"',
    ].join('\n');

    expect(proposeSignedInMarker(signedOut, after)).toEqual({
      role: 'button',
      name: 'Open Menu',
      identitySpecific: false,
    });
  });

  test('says so when every candidate is duplicated, rather than writing a lie', () => {
    /*
       There is nothing good to choose here, and the honest answer is the best
       available one carrying the reason it will fail — not silence, and not
       null, which would throw away a marker a person can scope in one edit.
    */
    const after = '- link "Item"\n- link "Item"\n- button "Buy"\n- button "Buy"';
    const marker = proposeSignedInMarker(signedOut, after);

    expect(marker).toMatchObject({ ambiguous: true });
    expect(marker?.name).toBe('Buy');
  });

  test('does not flag a marker that appears once', () => {
    // The flag must stay off the ordinary path, or every generated file grows a
    // warning that means nothing.
    expect(proposeSignedInMarker(signedOut, signedIn)).not.toHaveProperty('ambiguous');
  });
});

test('verifying a sign-in tries exactly once, however it goes', async () => {
  /*
     The rule this exists to keep. Applications lock accounts after a few
     failed attempts, and the account this spends is the one the whole suite is
     about to sign in as — which is not hypothetical: it locked two accounts on
     a real target, permanently, and twenty-one unrelated specs went red.
  */
  let submissions = 0;
  const page: ProbePage = {
    goto: async () => undefined,
    evaluate: async () => ({}),
    ariaSnapshot: async () => '- link "Sign in"',
    settle: async () => undefined,
    hasPasswordField: async () => true,
    waitForPasswordGone: async () => false, // the form never left: it failed
    submitSignIn: async () => {
      submissions += 1;
    },
    url: () => 'https://app.internal.corp/login',
  };

  const result = await verifySignIn(page, {
    baseURL: 'https://app.internal.corp',
    signIn: { username: 'Email', password: 'Password', submit: 'Login', path: '/login' },
    credentials: { username: 'someone', password: 'wrong' },
  });

  expect(submissions).toBe(1);
  expect(result.ok).toBe(false);
  expect(result.detail).toContain('Not retried');
});

test('a verified marker is written into the generated locator', () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    signIn: {
      username: 'Email address *',
      password: 'Password *',
      submit: 'Login',
      path: '/auth/login',
      signedInMarker: { role: 'button', name: 'Jane Doe' },
    },
  });
  const locators = plan.files.find((file) => file.path.endsWith('locators/sign-in.ts'))!.contents;
  expect(locators).toContain("signedInMarker: (page: Page): Locator =>\n    page.getByRole('button', { name: 'Jane Doe' })");
  expect(locators).toContain('derived by signing in once');
});

test('a marker role the scaffold never proposes is not written into generated source', async () => {
  // The role goes straight into a `getByRole` call in code this repository
  // executes, so it is checked against a closed set rather than trusted.
  const response = await handleDashboardRequest(
    request({
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        signIn: {
          username: 'Email',
          password: 'Password',
          submit: 'Login',
          path: '/login',
          signedInMarker: { role: "button' }); process.exit(1); //", name: 'x' },
        },
      },
    }),
    routing,
  );
  expect(response.status).toBe(200);
  expect(response.body).not.toContain('process.exit');
});

// ---------------------------------------------------------------------------
// What the probe learns reaches the generated code
// ---------------------------------------------------------------------------

test('probed names are written into the locators, not left as placeholders', () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    signIn: {
      username: 'Email address *',
      password: 'Password *',
      submit: 'Login',
      path: '/auth/login',
    },
  });

  const locators = plan.files.find((file) => file.path.endsWith('locators/sign-in.ts'))!.contents;
  expect(locators).toContain("getByRole('textbox', { name: 'Email address *' })");
  expect(locators).toContain("getByRole('button', { name: 'Login' })");
  expect(locators).toContain('read off the running application');

  const actions = plan.files.find((file) => file.path.endsWith('actions/sign-in.ts'))!.contents;
  expect(actions, 'the form is on its own path, not the landing page').toContain(
    "page.goto('/auth/login')",
  );
});

test("an accessible name containing a quote does not break the file it is written into", () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    signIn: { username: "Owner's email", password: 'Password', submit: 'Go', path: '/login' },
  });
  const locators = plan.files.find((file) => file.path.endsWith('locators/sign-in.ts'))!.contents;
  expect(locators).toContain("name: 'Owner\\'s email'");
});

test('a vendored document lands in the pack and switches the capability on', () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    apiBaseURL: 'https://api.staging.acme.example',
    include: { api: true, contracts: true },
    contractDocument: { filename: 'openapi.json', contents: '{"openapi":"3.1.0"}' },
  });

  expect(plan.files.map((file) => file.path)).toContain(
    'src/targets/acme-shop/contracts/openapi.json',
  );
  const profile = plan.files.find((file) => file.path === 'config/targets/acme-shop.ts')!.contents;
  // The capability ships off only because the document has to be vendored
  // first. This is that having happened.
  expect(profile).toContain(
    "contracts: { enabled: true, spec: 'src/targets/acme-shop/contracts/openapi.json' }",
  );
});

test('without a document the capability still ships off, with its path declared', () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    apiBaseURL: 'https://api.staging.acme.example',
    include: { api: true, contracts: true },
  });
  const profile = plan.files.find((file) => file.path === 'config/targets/acme-shop.ts')!.contents;
  expect(profile).toContain('contracts: { enabled: false');
});

// ---------------------------------------------------------------------------
// More than one back end
// ---------------------------------------------------------------------------

test('extra services are written into the profile by name', () => {
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    apiBaseURL: 'https://api.staging.acme.example',
    apiServices: {
      billing: 'https://billing.staging.acme.example',
      search: 'https://search.staging.acme.example',
    },
    include: { api: true },
  });

  const profile = plan.files.find((file) => file.path === 'config/targets/acme-shop.ts')!.contents;
  expect(profile).toContain('services: {');
  expect(profile).toContain("billing: 'https://billing.staging.acme.example',");
  expect(profile).toContain("search: 'https://search.staging.acme.example',");
});

test('extra services are dropped when the api layer is not included', () => {
  // An `apis` entry nothing can reach is a URL that looks configured and is not.
  const plan = planScaffold({
    name: 'acme-shop',
    baseURL: 'https://staging.acme.example',
    apiServices: { billing: 'https://billing.staging.acme.example' },
  });
  const profile = plan.files.find((file) => file.path === 'config/targets/acme-shop.ts')!.contents;
  expect(profile).not.toContain('billing');
});

test('a blank service row is ignored rather than refused', async () => {
  // The operator clicked "add another" and changed their mind. Refusing to
  // plan over an empty field is how a form becomes annoying.
  const response = await handleDashboardRequest(
    request({
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        include: { api: true },
        apiBaseURL: 'https://api.staging.acme.example',
        apiServices: { '': '' },
      },
    }),
    routing,
  );
  expect(response.status).toBe(200);
});

test('a service name that is not an identifier is refused with a reason', async () => {
  // The name becomes an object key in generated source and `apis.<name>` in a
  // spec, so it is constrained rather than accepted as free text.
  for (const name of ['my service', 'bill-ing', "x'; process.exit(1); //"]) {
    const response = await handleDashboardRequest(
      request({
        body: {
          name: 'acme-shop',
          baseURL: 'https://staging.acme.example',
          include: { api: true },
          apiBaseURL: 'https://api.staging.acme.example',
          apiServices: { [name]: 'https://billing.staging.acme.example' },
        },
      }),
      routing,
    );
    expect(response.status, `${name} is refused`).toBe(400);
    expect(response.body).toContain('not a usable service name');
  }
});

test('a service without an absolute URL is refused', async () => {
  const response = await handleDashboardRequest(
    request({
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        include: { api: true },
        apiBaseURL: 'https://api.staging.acme.example',
        apiServices: { billing: '/billing' },
      },
    }),
    routing,
  );
  expect(response.status).toBe(400);
  expect(response.body).toContain('absolute http(s) base URL');
});

// ---------------------------------------------------------------------------
// What the dashboard refuses
// ---------------------------------------------------------------------------

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
      storageState: '.auth/demo.standard.json',
      marker: null,
      gauntlet: [],
      describes: [],
      unattended: { possible: true, reason: 'nothing stood in the way' },
    }),
    assistCancel: async () => undefined,
    updateProfile: () => ({
      source: '',
      applied: [{ field: 'apiBaseURL', from: 'old', to: 'new' }],
      unchanged: [],
      refused: [],
      warnings: [],
    }),
    probe: async () => ({
      testIdAttribute: 'data-test',
      testIdCounts: { 'data-test': 12 },
      signIn: null,
      contract: null,
      notes: [],
    }),
    verify: async () => ({
      ok: true,
      marker: { role: 'button', name: 'Account', identitySpecific: false },
      detail: 'Signed in.',
    }),
    existing: () => [],
    planRemoval: (target) => ({
      target,
      removeFiles: ['config/targets/' + target + '.ts'],
      removeDirectories: ['src/targets/' + target],
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

const routing = { token: 'the-token', service: service() };

test('a request from another origin cannot reach an endpoint that writes files', async () => {
  /*
     The server binds to loopback, which stops the network but not the browser:
     a page on any origin can POST to http://127.0.0.1:<port>. Both the Host
     check and the token are load-bearing, so both are tested.
  */
  expect((await handleDashboardRequest(request({ host: 'evil.example' }), routing)).status).toBe(403);
  expect((await handleDashboardRequest(request({ token: null }), routing)).status).toBe(403);
  expect((await handleDashboardRequest(request({ token: 'guessed' }), routing)).status).toBe(403);
});

test('probing refuses until somebody says this is a test environment', async () => {
  const response = await handleDashboardRequest(
    request({ path: '/api/probe', body: { baseURL: 'https://staging.acme.example' } }),
    routing,
  );
  expect(response.status).toBe(400);
  expect(response.body).toContain('test environment');
});

test('probing refuses a target that is not an http URL', async () => {
  for (const baseURL of ['file:///etc/passwd', 'not a url', 'ftp://files.example']) {
    const response = await handleDashboardRequest(
      request({
        path: '/api/probe',
        body: { baseURL, confirmedTestEnvironment: true },
      }),
      routing,
    );
    expect(response.status, `${baseURL} is refused`).toBe(400);
  }
  expect(validateProbeTarget('https://staging.acme.example')).toHaveProperty('url');
});

test('creating refuses to overwrite an existing pack', async () => {
  // Onboarding is additive. A scaffolder that can clobber a real target pack
  // is one nobody runs twice.
  const response = await handleDashboardRequest(
    request({ path: '/api/create' }),
    {
      token: 'the-token',
      service: service({ existing: () => ['config/targets/acme-shop.ts'] }),
    },
  );
  expect(response.status).toBe(409);
  expect(response.body).toContain('Refusing to overwrite');
});

test('a scaffold error reaches the page as a message, not as a 500', async () => {
  const response = await handleDashboardRequest(
    request({ body: { name: 'Acme Shop', baseURL: 'https://staging.acme.example' } }),
    routing,
  );
  expect(response.status).toBe(400);
  expect(response.body).toContain('not a usable target name');
});

test('credentials never appear in a response', async () => {
  let seenCredentials: Record<string, { username: string; password: string }> = {};
  const response = await handleDashboardRequest(
    request({
      path: '/api/create',
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        secretSource: 'local',
        roles: ['standard'],
        credentials: { standard: { username: 'demo@acme.example', password: 'hunter2' } },
      },
    }),
    {
      token: 'the-token',
      service: service({
        create: async (plan, _options, credentials) => {
          seenCredentials = credentials;
          return {
            written: plan.files.map((file) => file.path),
            skipped: [],
            credentialPaths: [...plan.credentialPaths],
            diagnostics: [],
            nextSteps: plan.nextSteps,
          };
        },
      }),
    },
  );

  // They reach the writer, and they are in nothing that comes back — the
  // response is echoed into a preview pane and possibly a screenshot.
  expect(seenCredentials.standard?.password).toBe('hunter2');
  expect(response.body).not.toContain('hunter2');
  expect(response.body).not.toContain('demo@acme.example');
});

test('the request body cannot set an option the dashboard does not offer', async () => {
  /*
     `planScaffold` renders its arguments into TypeScript that this repository
     then executes, so the body is read field by field rather than spread. This
     is the test that keeps it that way.
  */
  const response = await handleDashboardRequest(
    request({
      body: {
        name: 'acme-shop',
        baseURL: 'https://staging.acme.example',
        include: { api: true },
        apiBaseURL: 'https://api.staging.acme.example',
        somethingAddedLater: 'rm -rf /',
      },
    }),
    routing,
  );
  expect(response.status).toBe(200);
  expect(response.body).not.toContain('rm -rf');
});

// ---------------------------------------------------------------------------
// Removing a target — the one destructive route
// ---------------------------------------------------------------------------

test('planning a removal is safe to call and removes nothing', async () => {
  let removed = 0;
  const response = await handleDashboardRequest(
    request({ path: '/api/offboard/plan', body: { target: 'acme-shop' } }),
    { token: 'the-token', service: service({ remove: async (plan) => { removed += 1; return plan.removeFiles; } }) },
  );
  expect(response.status).toBe(200);
  expect(response.body).toContain('config/targets/acme-shop.ts');
  expect(removed, 'planning never deletes').toBe(0);
});

test('removing without the name typed back is refused', async () => {
  /*
     The pattern from deleting a repository, and here for the same reason: this
     is final for anything never committed, and a confirmation a stray click
     can satisfy is not a confirmation.
  */
  let removed = 0;
  const withCounter = service({
    remove: async (plan) => { removed += 1; return plan.removeFiles; },
  });

  for (const confirm of ['', 'yes', 'acme', 'ACME-SHOP', 'example-app', undefined]) {
    const response = await handleDashboardRequest(
      request({ path: '/api/offboard/remove', body: { target: 'acme-shop', confirm } }),
      { token: 'the-token', service: withCounter },
    );
    expect(response.status, `'${String(confirm)}' is refused`).toBe(400);
  }
  expect(removed).toBe(0);
});

test('removing with the name typed back goes ahead', async () => {
  let removed = 0;
  const response = await handleDashboardRequest(
    request({ path: '/api/offboard/remove', body: { target: 'acme-shop', confirm: 'acme-shop' } }),
    {
      token: 'the-token',
      service: service({ remove: async (plan) => { removed += 1; return plan.removeFiles; } }),
    },
  );
  expect(response.status).toBe(200);
  expect(removed).toBe(1);
});

test('a plan that refuses cannot be executed however it is confirmed', async () => {
  let removed = 0;
  const response = await handleDashboardRequest(
    request({ path: '/api/offboard/remove', body: { target: 'acme-shop', confirm: 'acme-shop' } }),
    {
      token: 'the-token',
      service: service({
        planRemoval: (target) => ({
          target,
          removeFiles: [],
          removeDirectories: [],
          removeSecretKeys: [],
          removeStorageStates: [],
          warnings: [],
          refusals: ['something is in the way'],
          alreadyGone: false,
        }),
        remove: async (plan) => { removed += 1; return plan.removeFiles; },
      }),
    },
  );
  expect(response.status).toBe(409);
  expect(removed).toBe(0);
});

test('the destructive route is behind the same token and host checks', async () => {
  for (const overrides of [{ host: 'evil.example' }, { token: 'guessed' }]) {
    const response = await handleDashboardRequest(
      request({ path: '/api/offboard/remove', body: { target: 'acme-shop', confirm: 'acme-shop' }, ...overrides }),
      routing,
    );
    expect(response.status).toBe(403);
  }
});

test('the page it serves is syntactically valid JavaScript', () => {
  /*
     A stray newline inside a string literal in the inline script once killed
     every handler on the page at parse time. Nothing said so: the server was
     fine, the markup rendered, the buttons were there, and clicking them did
     nothing at all. The only symptom was silence.

     `new Function` parses without executing, so this catches it for the cost
     of one test and no browser. The script references `document` and `fetch`,
     which is fine — nothing here runs it.
  */
  const page = dashboardPage('test-token');
  const script = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
  expect(script, 'the page has an inline script').toBeTruthy();
  expect(() => new Function(script!)).not.toThrow();
});

test('the session token reaches the page it is minted for', () => {
  expect(dashboardPage('abc123')).toContain('"abc123"');
});

test('GET / serves the page and nothing else answers a GET', async () => {
  const page = await handleDashboardRequest(
    request({ method: 'GET', path: '/', token: null, host: null }),
    routing,
  );
  expect(page.status).toBe(200);
  expect(page.contentType).toContain('text/html');

  const other = await handleDashboardRequest(
    request({ method: 'GET', path: '/api/create' }),
    routing,
  );
  expect(other.status).toBe(405);
});

// ---------------------------------------------------------------------------
// The draft: what the form is allowed to remember
// ---------------------------------------------------------------------------

test.describe('the onboarding draft', () => {
  test('never carries a credential, however it is offered one', () => {
    /*
       The rule the whole feature turns on. The form collects credentials in
       step 4, and a draft that remembered them would write a password to disk
       — which §11 forbids outright, and which a convenience feature is a
       particularly poor reason to do.

       An allow-list, not a deny-list: a field added to the form tomorrow is
       invisible to the draft until somebody says what it is, rather than being
       swept up by a rule that fails open the day a field is renamed.
    */
    const sanitised = sanitiseDraft({
      fields: {
        name: 'acme-shop',
        password: 'hunter2',
        'cred-standard-password': 'hunter2',
        'cred-standard-username': 'jane@acme.example',
        token: 'ghp_deadbeef',
      },
      flags: { confirmTest: true, somethingElse: true },
      services: [{ name: 'billing', url: 'https://billing.acme.example', primary: false }],
    });

    expect(sanitised.fields).toEqual({ name: 'acme-shop' });
    expect(JSON.stringify(sanitised), 'no credential survives in any position').not.toContain(
      'hunter2',
    );
    expect(JSON.stringify(sanitised)).not.toContain('ghp_deadbeef');
    expect(sanitised.flags).toEqual({ confirmTest: true });
    expect(sanitised.services).toEqual([
      { name: 'billing', url: 'https://billing.acme.example', primary: false },
    ]);
  });

  test('the sign-in field names are not credentials, and are kept', () => {
    // `uName`/`pName` hold the *accessible names* the probe read off the form
    // — "Email address *", "Password *" — which is why they are on the list
    // despite reading alarmingly next to a paragraph about secrets.
    const sanitised = sanitiseDraft({
      fields: { uName: 'Email address *', pName: 'Password *', sName: 'Login' },
    });
    expect(sanitised.fields.pName).toBe('Password *');
  });

  test('rubbish in any shape produces an empty draft rather than throwing', () => {
    for (const rubbish of [null, undefined, 'a string', 42, [], { fields: 'no' }]) {
      expect(sanitiseDraft(rubbish).fields).toEqual({});
    }
  });

  test('an empty draft is not worth restoring, and says so', () => {
    expect(draftHasContent(EMPTY_DRAFT)).toBe(false);
    expect(draftHasContent(sanitiseDraft({ fields: { name: 'acme' } }))).toBe(true);
  });

  test('every field the page saves is one the allow-list permits', () => {
    // The page keeps its own copy of the list, because it runs in a browser
    // and cannot import this one. They have to agree, and this is what says so.
    const page = dashboardPage('t');
    const inPage = /const DRAFT_FIELDS = \[([^\]]+)\]/.exec(page)?.[1] ?? '';
    const names = [...inPage.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(names.sort()).toEqual([...DRAFT_FIELDS].sort());
  });
});

test('the state route offers what has been onboarded and what was half-typed', async () => {
  const response = await handleDashboardRequest(
    request({ path: '/api/onboard/state', body: {} }),
    {
      token: 'the-token',
      service: service({
        onboarded: () => [
          {
            name: 'toolshop',
            baseURL: 'https://shop.example',
            environment: 'staging',
            testIdAttribute: 'data-test',
            roles: ['standard'],
            secretSource: 'local',
            a11yStandard: 'wcag22aa',
            apiBaseURL: 'https://api.shop.example',
            include: { api: true, db: false, contracts: true, a11y: true },
            onboardedAt: '2026-08-13T09:00:00.000Z',
            packFiles: 12,
          },
        ],
        readDraft: () => sanitiseDraft({ fields: { name: 'half-typed' } }),
      }),
    },
  );

  expect(response.status).toBe(200);
  const body = JSON.parse(response.body) as Record<string, unknown>;
  expect(body.applications).toHaveLength(1);
  expect(body.draft).toMatchObject({ fields: { name: 'half-typed' } });
});

test('a draft posted with a credential in it is stored without one', async () => {
  const stored: unknown[] = [];
  await handleDashboardRequest(
    request({
      path: '/api/onboard/draft',
      body: { draft: { fields: { name: 'acme', 'cred-standard-password': 'hunter2' } } },
    }),
    {
      token: 'the-token',
      service: service({ writeDraft: (draft) => void stored.push(draft) }),
    },
  );

  // Sanitised on the way in as well as out: the page is not a source of truth
  // about what may be written to disk.
  expect(JSON.stringify(stored)).not.toContain('hunter2');
  expect(stored[0]).toMatchObject({ fields: { name: 'acme' } });
});

test.describe('trapping a base URL that is not one', () => {
  test('the document URL is caught, because it is the one people paste', () => {
    /*
       The mistake somebody actually made. The OpenAPI document lives at
       `…/docs?api-docs.json`, so that is the URL on screen when you go looking
       for the API — and it ended up in a profile as the API base. Every
       request in the pack is then built onto a document, and the failures are
       404s from a path nobody can find in the service.
    */
    const caught = checkApiBaseURL('https://api.practicesoftwaretesting.com/docs?api-docs.json');
    expect(caught).toContain('query string');
    expect(caught, 'and it says what the base probably is').toContain(
      'https://api.practicesoftwaretesting.com',
    );

    expect(checkApiBaseURL('https://api.example.com/openapi.json')).toContain('a document');
    expect(checkApiBaseURL('https://api.example.com/api/documentation')).toContain(
      'documentation viewer',
    );
  });

  test('a service genuinely mounted under a path is left alone', () => {
    // Warnings, not refusals: `/api/v2` is a perfectly ordinary base URL, and
    // a check that complained about it would be turned off within a week.
    expect(checkApiBaseURL('https://api.example.com')).toBeNull();
    expect(checkApiBaseURL('https://api.example.com/api/v2')).toBeNull();
    expect(checkApiBaseURL('')).toBeNull();
  });

  test('the plan carries the warning, at the last moment before anything is written', async () => {
    const response = await handleDashboardRequest(
      request({
        path: '/api/plan',
        body: {
          name: 'demo',
          baseURL: 'https://demo.example',
          apiBaseURL: 'https://api.demo.example/docs?api-docs.json',
          include: { api: true },
        },
      }),
      routing,
    );

    const body = JSON.parse(response.body) as { warnings: string[] };
    expect(body.warnings.join(' ')).toContain('query string');
  });
});
