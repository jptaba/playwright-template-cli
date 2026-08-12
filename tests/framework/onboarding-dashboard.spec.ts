import { expect, test } from '@playwright/test';
import {
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
  type ProbePage,
} from '../../src/support/onboarding/probe';
import { planScaffold } from '../../src/support/onboarding/scaffold';

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
    expect(proposeSignedInMarker(signedOut, signedIn)).toEqual({
      role: 'button',
      name: 'Jane Doe',
      identitySpecific: false,
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
// What the dashboard refuses
// ---------------------------------------------------------------------------

function service(overrides: Partial<DashboardService> = {}): DashboardService {
  return {
    page: () => '<!doctype html>',
    existingTargets: () => ['example-app'],
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
