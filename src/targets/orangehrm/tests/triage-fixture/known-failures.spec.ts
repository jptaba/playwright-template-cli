import { expect, test } from '../../fixtures';

/**
 * Specs that are **meant to fail**, with causes known in advance — §21.
 *
 * Opt-in: the `triage-fixture` project exists only when `TRIAGE_FIXTURE=true`,
 * so a green pipeline stays green. `npm run triage:measure` runs them, triages
 * the result, and scores what the rules settled against the
 * `triage-ground-truth` annotation each spec carries.
 *
 * **The same four causes the other applications' fixtures produce, on purpose.**
 * The `triage-fixture` project runs with `role: ''`, so a fixture has one
 * signed-out page and the framework's own vocabulary — which bounds what any
 * target can produce on demand. Running the identical set against an unlike
 * application is what turns "the rules work" into "the rules are
 * application-agnostic", which is the claim this repository makes. A cause
 * only OrangeHRM could produce would be testing OrangeHRM.
 *
 * **This one is a single-page application, which changes one thing.** Nothing
 * on the login page exists at `domcontentloaded` — measured, not assumed: the
 * accessibility tree reports **0 links** at that point and 5 once the form has
 * rendered. So every spec below waits for a control the application actually
 * renders before it does the thing it is here to fail at, or it would fail for
 * the wrong reason and measure nothing.
 */

/** The form is client-rendered, so nothing is on the page until it arrives. */
const openSignIn = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/web/index.php/auth/login');
  await page.getByRole('button', { name: /login/i }).waitFor({ timeout: 30_000 });
};

test(
  'TF-OH-01 · A credential the store does not hold @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-OH-01' },
      /*
         `dependency` rather than `environment-config`: nobody on this side can
         fix it. The remedy is to write the credential into the store, which is
         a system this framework only talks to and somebody else owns.

         Index 99 rather than one copied out of the profile's pool — a
         transcribed number rots the day somebody grows it, and the failure is
         the same at any index nothing is written under.
      */
      { type: 'triage-ground-truth', description: 'dependency' },
    ],
  },
  async ({ secrets }) => {
    await secrets.account('admin', 99);
  },
);

test(
  'TF-OH-02 · A polled fact that never becomes true @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-OH-02' },
      /*
         Engineered, and stated as such — the same shape the other fixtures
         use. A failure that depended on this demo being slow today would stop
         reproducing the moment it got quicker, and a ground-truth spec that
         intermittently passes measures nothing.

         The signal is the one a real run produces when a verb waits for a fact
         that has not happened: Playwright renders a polled condition as
         *"waiting on the predicate"*.
      */
      { type: 'triage-ground-truth', description: 'timing-synchronisation' },
    ],
  },
  async ({ page }) => {
    await openSignIn(page);

    // The dashboard belongs to a signed-in administrator, so a signed-out page
    // will never show it however long anybody waits.
    await expect
      .poll(async () => page.getByRole('heading', { name: 'Dashboard' }).count(), {
        timeout: 2_000,
      })
      .toBeGreaterThan(0);
  },
);

test(
  'TF-OH-03 · A locator that matches several elements @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-OH-03' },
      /*
         A strict-mode violation, the only locator failure that carries no
         ambiguity: the elements are there and the locator names too many of
         them. A control that never appeared is a judgement call this
         repository declines on purpose.
      */
      { type: 'triage-ground-truth', description: 'locator-drift' },
    ],
  },
  async ({ page }) => {
    await openSignIn(page);
    // Measured on the rendered page: five links once the form has arrived,
    // so naming the role alone matches all of them.
    await page.getByRole('link').click({ timeout: 5_000 });
  },
);

test(
  'TF-OH-04 · A service that cannot be reached at all @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-OH-04' },
      /*
         A loopback port with nothing listening: the environment unreachable
         rather than wrong, and the control that says triage ran at all.

         An ephemeral port rather than a low one. Chromium refuses port 9
         before it opens a socket, reporting `net::ERR_UNSAFE_PORT`, which
         matches the rule's pattern while describing something that is not a
         transport failure. 49152 answers `net::ERR_CONNECTION_REFUSED`, which
         is what a genuinely unreachable environment produces.
      */
      { type: 'triage-ground-truth', description: 'network-infrastructure' },
    ],
  },
  async ({ page }) => {
    await page.goto('http://127.0.0.1:49152/', { timeout: 5_000 });
  },
);
