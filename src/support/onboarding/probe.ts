/**
 * Reading an application well enough to scaffold it — §08.
 *
 * `npm run target:new` writes a starting shape and tells you that every
 * locator in it is a guess. That is honest, and it is also most of the work
 * onboarding actually costs: the guesses have to be replaced from a snapshot
 * before a single spec can run, and the first attempt is usually wrong. The
 * sign-in vocabulary for the third target was written from a DOM dump that
 * reported `placeholder` text, so every locator in it addressed a field whose
 * accessible name was something else, and the failure was a bare timeout on a
 * control plainly on screen.
 *
 * So the framework reads the application instead. Everything here answers a
 * question a person would otherwise have to answer by hand:
 *
 *   - which attribute does `getByTestId` read on this application?
 *   - what are the *accessible names* of the sign-in fields?
 *   - does this service publish an OpenAPI document, and where?
 *
 * The analysis is pure and unit-tested; only the collection touches a browser.
 * That split is the same one `summarise`/`runAxe` uses, for the same reason.
 */

/** The `data-*` attributes applications actually use for test hooks. */
export const TEST_ID_CANDIDATES = [
  'data-test',
  'data-testid',
  'data-test-id',
  'data-qa',
  'data-cy',
  'data-automation-id',
] as const;

export interface ProbedSignIn {
  /** Accessible name of the username or email field. */
  username: string;
  /** Accessible name of the password field. */
  password: string;
  /** Accessible name of the control that submits the form. */
  submit: string;
  /** Path the form was found on, relative to the base URL. */
  path: string;
}

export interface ProbeResult {
  /** The attribute `getByTestId` should read, and why it was chosen. */
  testIdAttribute: string;
  testIdCounts: Record<string, number>;
  /** Accessible names for the sign-in form, when one was found. */
  signIn: ProbedSignIn | null;
  /** Where the published API document was found, and its contents. */
  contract: { url: string; filename: string; contents: string } | null;
  /** Whatever could not be established, in words a person can act on. */
  notes: string[];
}

/**
 * Which test-id attribute this application uses.
 *
 * The winner is whichever appears on the most elements, because applications
 * that have migrated carry a handful of the old attribute for years. Ties and
 * empty pages fall back to Playwright's own default rather than guessing:
 * a wrong answer here is worse than no answer, since every `getByTestId` in
 * the pack then silently matches nothing.
 */
export function detectTestIdAttribute(
  counts: Record<string, number>,
  fallback = 'data-testid',
): { attribute: string; confident: boolean } {
  const ranked = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const [best, runnerUp] = ranked;
  if (!best) return { attribute: fallback, confident: false };
  // A near-tie means a migration in progress, and picking the wrong side of it
  // is exactly the silent failure this is here to prevent.
  const confident = !runnerUp || best[1] >= runnerUp[1] * 2;
  return { attribute: best[0], confident };
}

/** Paths a sign-in form lives on, in the order worth trying. */
export const SIGN_IN_PATHS = [
  /*
     The landing page first, and it is not an afterthought: banking demos,
     intranet portals and plenty of line-of-business applications put the
     sign-in form in a panel on the home page rather than behind a route.
     This list began at `/auth/login` and the probe reported "no sign-in form
     found" for an application whose form it had already loaded, counted
     test-ids on, and navigated away from — the one thing the probe exists to
     save you from typing by hand.
  */
  '/',
  '/auth/login',
  '/login',
  '/signin',
  '/sign-in',
  '/account/login',
  '/users/sign_in',
  '/session/new',
];

/**
 * Read the sign-in fields out of an accessibility snapshot.
 *
 * The snapshot is what `getByRole` and a screen reader both see, which is the
 * whole point: names taken from anywhere else — placeholder, id, label markup —
 * are names `getByRole` will not match.
 *
 * The password field anchors the parse. It is the one control on the page that
 * is unambiguous, and the username field is the textbox above it in document
 * order on every sign-in form worth the name.
 */
export function parseSignInFields(ariaSnapshot: string): Omit<ProbedSignIn, 'path'> | null {
  const controls: { role: string; name: string }[] = [];
  for (const line of ariaSnapshot.split('\n')) {
    const match = /-\s+(textbox|button|link)\s+"([^"]*)"/.exec(line);
    if (match?.[1] && match[2] !== undefined) {
      controls.push({ role: match[1], name: match[2] });
    }
  }

  const passwordAt = controls.findIndex(
    (control) => control.role === 'textbox' && /password|passcode|wachtwoord/i.test(control.name),
  );
  if (passwordAt === -1) return null;

  const username = [...controls.slice(0, passwordAt)]
    .reverse()
    .find((control) => control.role === 'textbox');
  if (!username) return null;

  /*
     The submit control is the first button after the password field whose name
     reads like a submit — not simply "the next button", because a
     show/hide-password toggle sits between the two on a great many forms and
     is usually unnamed.
  */
  const submit = controls
    .slice(passwordAt + 1)
    .find(
      (control) =>
        control.role === 'button' &&
        control.name.trim() !== '' &&
        !/show|hide|reveal|toggle/i.test(control.name),
    );

  return {
    username: username.name,
    password: controls[passwordAt]!.name,
    submit: submit?.name ?? 'Sign in',
  };
}

/**
 * Propose a `signedInMarker` by diffing the page before and after a sign-in.
 *
 * The one locator in the scaffold that cannot be read from a page at rest: it
 * is by definition the thing that is only there once somebody is signed in. So
 * it is not read, it is *derived* — whatever control appeared, that was not
 * there before.
 *
 * Named controls only, and the sign-out control is excluded on purpose. Both
 * are good markers, but the scaffolded `isSignedIn` is called after signing out
 * too, and a marker that is itself the sign-out button reports a session that
 * has just ended. Preference goes to a control whose name looks like an
 * identity — an account menu carrying the user's own name is the marker most
 * applications actually have.
 */
export function proposeSignedInMarker(
  before: string,
  after: string,
  identityHints: readonly string[] = [],
): { role: string; name: string; identitySpecific: boolean } | null {
  const controls = (snapshot: string): { role: string; name: string }[] => {
    const found: { role: string; name: string }[] = [];
    for (const line of snapshot.split('\n')) {
      const match = /-\s+(button|link|menuitem)\s+"([^"]+)"/.exec(line);
      if (match?.[1] && match[2]) found.push({ role: match[1], name: match[2] });
    }
    return found;
  };

  const was = new Set(controls(before).map((control) => `${control.role}|${control.name}`));
  const appeared = controls(after).filter(
    (control) =>
      !was.has(`${control.role}|${control.name}`) &&
      !/sign\s*out|log\s*out|logout|signout/i.test(control.name),
  );
  if (appeared.length === 0) return null;

  /*
     A marker that is the signed-in person's own name is not a marker.

     The account menu on most applications renders the user's name, so diffing
     one sign-in proposes it — and it works perfectly for the role it was
     derived from and fails for every other. That is exactly what happened
     here: a marker of `button "Jane Doe"` established the customer's session
     and then reported that the administrator had not signed in.

     Identity-shaped candidates are ranked last and flagged, rather than
     dropped: on a single-role target it is still the right answer, and saying
     so is more useful than silently choosing something worse.

     The hints are derived from the credential, so this catches the common case
     — an account menu labelled from the email address — and misses the case
     where the display name has nothing to do with the login (`customer@…`
     rendering as "Jane Doe"). That miss is why the generated file also carries
     the warning, and why `setup:auth` checks the session it establishes names
     somebody: a second role failing there is the backstop.
  */
  const hints = identityHints
    .flatMap((hint) => [hint, hint.split('@')[0] ?? '', ...(hint.split('@')[0] ?? '').split(/[._-]/)])
    .map((hint) => hint.trim().toLowerCase())
    .filter((hint) => hint.length > 2);

  const identityShaped = (name: string): boolean =>
    hints.some((hint) => name.toLowerCase().includes(hint) || hint.includes(name.toLowerCase()));

  // A `button` is a likelier account menu than a `link`, which is likelier to
  // be a navigation item that happens to be new.
  const ranked = [...appeared].sort(
    (a, b) =>
      Number(identityShaped(a.name)) - Number(identityShaped(b.name)) ||
      Number(b.role === 'button') - Number(a.role === 'button'),
  );
  const chosen = ranked[0];
  if (!chosen) return null;
  return { ...chosen, identitySpecific: identityShaped(chosen.name) };
}

/** Paths a published OpenAPI document is served from, in order of likelihood. */
export const CONTRACT_PATHS = [
  '/openapi.json',
  '/swagger.json',
  '/api-docs',
  '/api/documentation',
  '/docs?api-docs.json',
  '/v3/api-docs',
  '/swagger/v1/swagger.json',
  '/openapi.yaml',
];

/**
 * Whether a response body is a usable API description.
 *
 * Checked by parsing rather than by content type: a great many services serve
 * a perfectly good document as `text/plain`, and a great many serve an HTML
 * documentation *viewer* as `application/json`-adjacent. The question is
 * whether it declares `openapi` or `swagger` at the root.
 */
export function looksLikeContractDocument(body: string): { ok: boolean; version?: string } {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { openapi?: string; swagger?: string };
      const version = parsed.openapi ?? parsed.swagger;
      return version ? { ok: true, version } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  const yamlVersion = /^(openapi|swagger)\s*:\s*["']?([\d.]+)/m.exec(trimmed);
  return yamlVersion ? { ok: true, version: yamlVersion[2] } : { ok: false };
}

/** `https://api.example.com/openapi.json` → `openapi.json`, always safe. */
export function contractFilename(url: string): string {
  const extension = /\.ya?ml(\?|$)/i.test(url) ? 'yaml' : 'json';
  return `openapi.${extension}`;
}

// ---------------------------------------------------------------------------
// Collection. Everything above is pure; everything below touches the world.
// ---------------------------------------------------------------------------

/**
 * The slice of a Playwright page this module needs. Injected, so it is fakeable.
 *
 * `settle` and `hasPasswordField` are here because the first version of this
 * probe did not have them, and it was confidently wrong about a real
 * application. It navigated with `domcontentloaded` and read immediately, so on
 * a single-page application it counted the markup that exists before the
 * framework boots: one test-id attribute instead of ninety-eight, and no
 * sign-in form on a page that plainly has one. Both answers were reported
 * without complaint. A probe that reads too early does not fail — it lies.
 */
export interface ProbePage {
  goto(url: string): Promise<unknown>;
  evaluate(script: string): Promise<unknown>;
  ariaSnapshot(): Promise<string>;
  /** Wait for the application to finish rendering. Bounded, and never throws. */
  settle(): Promise<void>;
  /** Whether a password field appears within the timeout. The sign-in anchor. */
  hasPasswordField(timeoutMs: number): Promise<boolean>;
  /**
   * Whether the password field goes away within the timeout — the signal that
   * a sign-in was accepted.
   *
   * Asking "is the form still there?" is the same question asked the wrong way
   * round, and it answers too early: on a single-page application the login
   * form is still in the DOM while the router is moving, so a check straight
   * after the click reports a refusal for a credential that worked. Waiting
   * for the form to *leave* is the fact, and it fails as a timeout rather than
   * as a wrong verdict.
   */
  waitForPasswordGone(timeoutMs: number): Promise<boolean>;
  /** Fill the two fields and submit, using the names the probe read. */
  submitSignIn(fields: ProbedSignIn, credentials: SignInCredentials): Promise<void>;
  url(): string;
}

export interface SignInCredentials {
  username: string;
  password: string;
}

export interface SignInVerification {
  ok: boolean;
  /**
   * The control that appeared once signed in, when one could be derived.
   *
   * `identitySpecific` means its name is the signed-in person's — a marker
   * that will establish this role's session and report every other role as
   * signed out. On a single-role target that is fine; on any other it has to
   * be generalised by hand, and the dashboard says so rather than leaving it
   * to be discovered by `setup:auth` failing for the second role.
   */
  marker: { role: string; name: string; identitySpecific: boolean } | null;
  /** What happened, in words that belong in the dashboard rather than a log. */
  detail: string;
}

/**
 * Sign in once, and report whether the probed locators actually work.
 *
 * The only part of onboarding that writes anything to the application, and it
 * is opt-in for that reason. **Exactly one attempt.** Applications lock
 * accounts after a few failures, and a verifier that retried would spend the
 * budget of the account the whole suite is about to depend on — which is not a
 * hypothetical: it happened to a real target, twice, and locked it permanently.
 *
 * What it buys is the last locator nobody can read from a page at rest, and a
 * `setup:auth` that is known to pass before Playwright is ever run.
 */
export async function verifySignIn(
  page: ProbePage,
  options: { baseURL: string; signIn: ProbedSignIn; credentials: SignInCredentials },
): Promise<SignInVerification> {
  const base = options.baseURL.replace(/\/+$/, '');
  await page.goto(`${base}${options.signIn.path}`);
  await page.settle();
  const before = await page.ariaSnapshot();

  try {
    await page.submitSignIn(options.signIn, options.credentials);
  } catch (error) {
    return {
      ok: false,
      marker: null,
      detail:
        'The sign-in form could not be filled with the names that were read from it: ' +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const accepted = await page.waitForPasswordGone(15_000);
  await page.settle();
  const after = await page.ariaSnapshot();

  if (!accepted) {
    return {
      ok: false,
      marker: null,
      detail:
        'The form is still on screen after submitting, so the credential was refused or the ' +
        'submit control was not the one that submits. Not retried: repeated failures lock ' +
        'accounts, and the account this would spend is the one the suite signs in as.',
    };
  }

  const marker = proposeSignedInMarker(before, after, [options.credentials.username]);
  return marker
    ? {
        ok: true,
        marker,
        detail: marker.identitySpecific
          ? `Signed in. The only new control is the ${marker.role} "${marker.name}", which is ` +
            'this account’s own name — it will establish this role’s session and report every ' +
            'other role as signed out. Generalise it before adding a second role.'
          : `Signed in. The ${marker.role} "${marker.name}" appeared, and is proposed as the signed-in marker.`,
      }
    : {
        ok: true,
        marker: null,
        detail:
          'Signed in, but nothing new and named appeared to use as a signed-in marker. ' +
          'Fill it in by hand from a snapshot of the signed-in page.',
      };
}

export type ProbeFetch = (url: string) => Promise<{ status: number; body: string }>;

/**
 * Counts every candidate test-id attribute on the current page.
 *
 * Passed as a **string** rather than as a function. tsx compiles this file with
 * esbuild's `keepNames`, which rewrites inline functions to call a `__name`
 * helper that does not exist inside the page — so `page.evaluate(() => …)` in
 * any file run under tsx fails with `ReferenceError: __name is not defined`.
 * Framework code that runs from `tools/` has to remember that; specs, which
 * run under Playwright's own loader, do not.
 */
const COUNT_TEST_IDS = `(function () {
  var attributes = ${JSON.stringify(TEST_ID_CANDIDATES)};
  var counts = {};
  for (var i = 0; i < attributes.length; i++) {
    counts[attributes[i]] = document.querySelectorAll('[' + attributes[i] + ']').length;
  }
  return counts;
})()`;

export interface ProbeOptions {
  baseURL: string;
  /** Where the service API lives, when it is not the same host. */
  apiBaseURL?: string;
  signInPaths?: readonly string[];
  /** How long to give each candidate route to render a password field. */
  signInTimeoutMs?: number;
}

/**
 * Drive a real page and a real service, and report what they say.
 *
 * Never throws for "not found": a target with no API, or with a sign-in form
 * this cannot recognise, is a normal outcome that leaves a note behind. The
 * dashboard shows the notes and lets a person fill the gap, which is a much
 * better failure than refusing to scaffold anything.
 */
export async function probeTarget(
  page: ProbePage,
  fetchUrl: ProbeFetch,
  options: ProbeOptions,
): Promise<ProbeResult> {
  const notes: string[] = [];
  const base = options.baseURL.replace(/\/+$/, '');
  const signInTimeoutMs = options.signInTimeoutMs ?? 4_000;

  await page.goto(base);
  await page.settle();
  const counts = (await page.evaluate(COUNT_TEST_IDS)) as Record<string, number>;
  const detected = detectTestIdAttribute(counts);
  if (!detected.confident) {
    notes.push(
      Object.values(counts).some((count) => count > 0)
        ? `Two test-id attributes are in use (${Object.entries(counts)
            .filter(([, n]) => n > 0)
            .map(([name, n]) => `${name}: ${n}`)
            .join(', ')}). Picked the commonest; check it is the one being maintained.`
        : 'No test-id attribute found on the landing page. Left at the Playwright default — ' +
          'the pack will rely on roles and labels, which is the better order anyway.',
    );
  }

  // ---- the sign-in form -------------------------------------------------
  let signIn: ProbedSignIn | null = null;
  /** Where a password field was seen but the fields could not be named. */
  let unnamedFormAt: string | null = null;
  for (const path of options.signInPaths ?? SIGN_IN_PATHS) {
    try {
      await page.goto(`${base}${path}`);
      /*
         Wait for the password field before snapshotting. It is the anchor the
         parser needs, so waiting for it is both the correct synchronisation
         and the cheapest way to tell "this route has no sign-in form" from
         "the application has not drawn it yet" — which are indistinguishable
         to a snapshot taken a moment too early.
      */
      if (!(await page.hasPasswordField(signInTimeoutMs))) continue;
      const fields = parseSignInFields(await page.ariaSnapshot());
      if (fields) {
        signIn = { ...fields, path };
        break;
      }
      unnamedFormAt ??= path;
    } catch {
      // A path that does not exist is not an error; it is the next candidate.
    }
  }
  if (!signIn && unnamedFormAt) {
    /*
       A different finding from "there is no sign-in form", and it needs a
       different answer from the person reading it.

       ParaBank is the case that produced this message: its username and
       password inputs carry no id, no label, no aria-label and no
       placeholder, and the visible "Username" text is a sibling paragraph. So
       the accessibility tree is `- textbox` twice, with no name to read. The
       probe was right to refuse — a name invented from the neighbouring text
       would produce exactly the hallucinated locator §Locators warns about —
       but reporting it as "no sign-in form anywhere" sends the operator
       looking for a login page that was in front of them.

       It is also a genuine defect in the application: an input a screen
       reader cannot name fails WCAG 1.3.1 and 4.1.2, and it is worth saying
       so to whoever owns it.
    */
    notes.push(
      `A sign-in form is on ${unnamedFormAt}, but its fields have no accessible names — the ` +
        'accessibility tree shows an unnamed textbox where a screen reader needs a label. ' +
        'Nothing can be derived from that, and a name guessed from the text beside the field is ' +
        'a locator that will not match. Write the locators by hand from `npm run explore`, with ' +
        'a `// locator-justification:` comment where CSS is the only option — and raise the ' +
        'missing labels with whoever owns the application: they fail WCAG 1.3.1 and 4.1.2.',
    );
  } else if (!signIn) {
    notes.push(
      `No sign-in form found on any of ${(options.signInPaths ?? SIGN_IN_PATHS).join(', ')}. ` +
        'The scaffolded locators stay as placeholders — explore the application and replace them.',
    );
  }

  // ---- the published contract -------------------------------------------
  let contract: ProbeResult['contract'] = null;
  const apiBase = (options.apiBaseURL ?? base).replace(/\/+$/, '');
  for (const path of CONTRACT_PATHS) {
    const url = `${apiBase}${path}`;
    try {
      const response = await fetchUrl(url);
      if (response.status !== 200) continue;
      const looks = looksLikeContractDocument(response.body);
      if (!looks.ok) continue;
      contract = { url, filename: contractFilename(url), contents: response.body };
      break;
    } catch {
      // Same again: an unreachable candidate is just not the one.
    }
  }
  if (!contract && options.apiBaseURL) {
    notes.push(
      `No OpenAPI document found under ${apiBase}. The contracts capability stays off; vendor ` +
        'the published document by hand and switch it on, or leave it off and say so.',
    );
  }

  return {
    testIdAttribute: detected.attribute,
    testIdCounts: counts,
    signIn,
    contract,
    notes,
  };
}
