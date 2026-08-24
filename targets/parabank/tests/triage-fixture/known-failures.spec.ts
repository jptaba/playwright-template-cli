import { expect, test } from '../../fixtures';

/**
 * Specs that are **meant to fail**, with causes known in advance — §21.
 *
 * Opt-in: the `triage-fixture` project exists only when `TRIAGE_FIXTURE=true`,
 * so a green pipeline stays green. `npm run triage:measure` runs them, triages
 * the result, and scores what the rules settled against the
 * `triage-ground-truth` annotation each spec carries.
 *
 * **Why these four are the same four as the other applications', and why that
 * is the point rather than a shortcut.** The `triage-fixture` project runs
 * with `role: ''`, so a fixture has one signed-out page and the framework's
 * own vocabulary to work with — which bounds the set of causes any target can
 * produce on demand. Running the identical set against a fifth, unlike
 * application is what turns "the rules work" into "the rules are
 * application-agnostic", which is the claim this repository actually makes.
 * A cause only ParaBank can produce would test ParaBank.
 *
 * **Nothing here signs in, and on this application that matters more than
 * usual.** The profile declares `sharedEnvironment: true`, and at the time of
 * writing ParaBank's own login endpoint was answering **HTTP 500** — a defect
 * of the application's, correctly reported by the live suite as
 * `application-defect` and deliberately left failing. A fixture must not be
 * built on that: a spec that depends on an application staying broken stops
 * reproducing the cause it claims the day somebody fixes it.
 */

test(
  'TF-PB-01 · A credential the store does not hold @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-PB-01' },
      /*
         `dependency` rather than `environment-config`, and the difference is
         what the category routes on: nobody on this side can fix it. The
         remedy is to write the credential into the store, which is a system
         this framework only talks to and somebody else owns.

         Index 99 rather than one copied out of the profile's pool: a
         transcribed number rots the day somebody grows the pool, and the
         failure being reproduced — a profile claiming more accounts than the
         store holds — is the same at any index nothing is written under.
      */
      { type: 'triage-ground-truth', description: 'dependency' },
    ],
  },
  async ({ secrets }) => {
    await secrets.account('customer', 99);
  },
);

test(
  'TF-PB-02 · A polled fact that never becomes true @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-PB-02' },
      /*
         Engineered, and deliberately so — the same shape toolshop's fixture
         uses and for the same reason. A fixture whose failure depends on a
         shared demo being slow today would stop reproducing the moment the
         demo got quicker.

         What it produces is the signal a real run produces when a verb waits
         for a fact that has not happened yet: Playwright renders a polled
         condition as *"waiting on the predicate"*, which says outright that a
         spec chose to wait for something and it did not arrive.
      */
      { type: 'triage-ground-truth', description: 'timing-synchronisation' },
    ],
  },
  async ({ page }) => {
    await page.goto('/parabank/index.htm');

    // The accounts overview belongs to a signed-in customer, so a signed-out
    // page will never show it however long anybody waits.
    await expect
      .poll(async () => page.getByRole('heading', { name: 'Accounts Overview' }).count(), {
        timeout: 2_000,
      })
      .toBeGreaterThan(0);
  },
);

test(
  'TF-PB-03 · A locator that matches several elements @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-PB-03' },
      /*
         A strict-mode violation, which is the only locator failure carrying no
         ambiguity: the elements are there and the locator names too many of
         them. A control that never appeared is a judgement call — either a
         renamed locator or a defect upstream — and this repository declines it
         on purpose.
      */
      { type: 'triage-ground-truth', description: 'locator-drift' },
    ],
  },
  async ({ page }) => {
    await page.goto('/parabank/index.htm');
    // Measured on the running page rather than assumed: the landing page
    // carries 33 links, so naming the role alone matches all of them.
    await page.getByRole('link').click({ timeout: 5_000 });
  },
);

test(
  'TF-PB-04 · A service that cannot be reached at all @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-PB-04' },
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
