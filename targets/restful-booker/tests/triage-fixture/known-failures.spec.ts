import { expect, test } from '../../fixtures';

/**
 * Specs that are **meant to fail**, with causes known in advance — §21.
 *
 * Opt-in: the `triage-fixture` project exists only when `TRIAGE_FIXTURE=true`,
 * so a green pipeline stays green. `npm run triage:measure` runs them, triages
 * the result, and scores what the rules settled against the
 * `triage-ground-truth` annotation each spec carries.
 *
 * **Why a second fixture when saucedemo already has one.** saucedemo's four
 * specs settle exactly one rule — `transport-failure` — and the other six in
 * `rules.ts` have never been confirmed against a failure whose cause was known
 * in advance. Each spec below is chosen for the *category* it should produce
 * rather than for being an interesting failure.
 *
 * **Every spec here takes `page`, never `authedPage`.** The `triage-fixture`
 * project runs with `role: ''`, so `authedPage` throws *"requested with no
 * role"* before a spec reaches the failure it was written for. The first draft
 * of this file did exactly that: all four failed identically at the fixture,
 * the error text mentioned signing in, and every one was settled as
 * `environment-config`. The rules were right and the fixture was wrong —
 * which is precisely what the measurement is for, and it caught it on the
 * first run.
 *
 * So these use the public site, which needs no session at all.
 *
 * Every failure is engineered here. None is a defect in the application: this
 * is a public demo shared with strangers, and a fixture relying on it being
 * broken a particular way would stop reproducing the moment somebody fixed it.
 */

test(
  'TF-RB-01 · A locator that matches several elements @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-RB-01' },
      /*
         **A strict-mode violation, not a control that is missing**, and the
         difference is the whole reason this spec is shaped this way.

         The first draft clicked a button that does not exist, expecting
         `locator-drift`. That is a judgement call, not a known cause: a
         control that never appears is *either* a renamed locator *or* a
         defect upstream that stopped it rendering — this repository had
         already decided so in its other ground-truth fixture, and a rule
         written to answer it would send a real application defect to healing.

         Several matches carries no such ambiguity. The elements are there and
         the locator names too many of them, which can only be the locator.
      */
      { type: 'triage-ground-truth', description: 'locator-drift' },
    ],
  },
  async ({ page }) => {
    await page.goto('/');
    // The landing page has many links; naming the role alone matches them all.
    await page.getByRole('link').click({ timeout: 5_000 });
  },
);

test(
  'TF-RB-02 · An assertion about data this spec did not create @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-RB-02' },
      // The conventions' own cautionary tale, made to fail on purpose: a room
      // nobody created, asserted about as though the demo were ours.
      { type: 'triage-ground-truth', description: 'test-data' },
    ],
  },
  async ({ roomsApi }) => {
    const rooms = await roomsApi.all();

    expect(
      rooms.map((room) => room.roomName),
      'expected a room this spec never created — the demo is shared and its rooms change',
    ).toContain('room-that-nobody-created');
  },
);

test(
  'TF-RB-03 · A page that will not load because the address is wrong @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-RB-03' },
      // A dead port on loopback: the environment unreachable rather than
      // wrong. The one rule that already had ground truth, kept as a control.
      { type: 'triage-ground-truth', description: 'network-infrastructure' },
    ],
  },
  async ({ page }) => {
    await page.goto('http://127.0.0.1:9/', { timeout: 5_000 });
  },
);

test(
  'TF-RB-04 · A wait too short for a page that fetches @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-RB-04' },
      /*
         The landing page lists its rooms from a request, so anything that
         waits 1ms for one is asking before the answer exists. This is the
         timing failure the application genuinely produces when a verb forgets
         to wait — engineered so the rule that should recognise it has
         something to recognise.
      */
      { type: 'triage-ground-truth', description: 'timing-synchronisation' },
    ],
  },
  async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Rooms' }).waitFor({ state: 'visible', timeout: 1 });
  },
);
