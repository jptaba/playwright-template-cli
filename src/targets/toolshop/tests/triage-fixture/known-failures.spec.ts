import { expect, test } from '../../fixtures';

/**
 * Specs that are **meant to fail**, with causes known in advance — §21.
 *
 * Opt-in: the `triage-fixture` project exists only when `TRIAGE_FIXTURE=true`,
 * so a green pipeline stays green. `npm run triage:measure` runs them, triages
 * the result, and scores what the rules settled against the
 * `triage-ground-truth` annotation each spec carries.
 *
 * **Chosen for the categories, not for being interesting failures.** Two of
 * the four below settle something no fixture had settled before —
 * `dependency-failure`, which had never been confirmed against a failure whose
 * cause was known in advance, and the *polled* half of `short-wait`, which is
 * the high-confidence branch the other fixtures' short locator waits never
 * reach. The remaining two are controls, so a rule that holds on
 * `restful-booker` is shown to hold on an application with an API, a contract
 * and a shared account pool as well.
 *
 * **Every spec here takes `page`, never `authedPage`.** The `triage-fixture`
 * project runs with `role: ''`, so `authedPage` throws *"requested with no
 * role"* before a spec reaches the failure it was written for, and every
 * failure in the run settles as the same auth-shaped verdict.
 *
 * Every failure is engineered here, and none of them signs in. This is a
 * vendor demo shared with strangers that locks an account after three failed
 * attempts, and a fixture that spent that budget would take the rest of the
 * suite down with it.
 */

test(
  'TF-TS-01 · A credential the store does not hold @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-TS-01' },
      /*
         **`dependency`, not `environment-config`, and the distinction is what
         the category routes on.** Nobody on this side can fix it: the remedy
         is to write the credential into the store, which is a system this
         framework only talks to and somebody else owns. That is exactly what
         `dependency-failure` recommends — escalate, to the owner of that
         system — where `environment-config` would send it to whoever
         configured the run.

         Index 99 rather than a transcribed one past the profile's pool: a
         number copied out of `poolSize` today is a fact that rots the day
         somebody grows the pool, and the failure this reproduces — a profile
         claiming more accounts than the store holds — is the same at any
         index nothing is written under.
      */
      { type: 'triage-ground-truth', description: 'dependency' },
    ],
  },
  async ({ secrets }) => {
    await secrets.account('customer', 99);
  },
);

test(
  'TF-TS-02 · A polled fact that never becomes true @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-TS-02' },
      /*
         The high-confidence half of `short-wait`, and it is a different signal
         from a short locator timeout rather than the same one written down
         twice. Playwright renders a polled condition as *"waiting on the
         predicate"*, which says outright that a spec chose to wait for
         something and it did not arrive; a bare `Timeout 1ms exceeded` only
         says the number was small, which is why that branch is medium
         confidence and asks for a person.

         Engineered, and deliberately so: the predicate here cannot become
         true, because a fixture whose failure depends on a shared demo being
         slow today would stop reproducing the cause it claims. What it
         produces is the signal a real run produces when a verb waits for a
         fact that has not happened yet.
      */
      { type: 'triage-ground-truth', description: 'timing-synchronisation' },
    ],
  },
  async ({ page, catalogue, testData }) => {
    await catalogue.open(page);
    await catalogue.search(page, testData.termThatMatchesNothing);

    await expect
      .poll(async () => (await catalogue.productNames(page)).length, { timeout: 2_000 })
      .toBeGreaterThan(0);
  },
);

test(
  'TF-TS-03 · A locator that matches several elements @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-TS-03' },
      /*
         A strict-mode violation, which is the only locator failure that
         carries no ambiguity: the elements are there and the locator names
         too many of them. A control that was never absent is not drift, and
         this repository's other fixture already records why a rule must not
         answer that case.
      */
      { type: 'triage-ground-truth', description: 'locator-drift' },
    ],
  },
  async ({ page, catalogue }) => {
    await catalogue.open(page);
    // The storefront's product grid is many links; naming the role alone
    // matches every one of them.
    await page.getByRole('link').click({ timeout: 5_000 });
  },
);

test(
  'TF-TS-04 · A service that cannot be reached at all @known-failure',
  {
    annotation: [
      { type: 'practitest', description: 'TF-TS-04' },
      /*
         A loopback port with nothing listening: the environment unreachable
         rather than wrong. The rule that already had ground truth, kept as
         the control that says triage ran at all.

         **A port in the ephemeral range rather than a low one, and it is
         worth stating why.** Chromium refuses port 9 before it opens a
         socket, reporting `net::ERR_UNSAFE_PORT` — which matches the rule's
         pattern and produces the right category while describing something
         that is not a transport failure at all. Measured here rather than
         assumed: 49152 answers `net::ERR_CONNECTION_REFUSED`, which is the
         signal a real unreachable environment produces.
      */
      { type: 'triage-ground-truth', description: 'network-infrastructure' },
    ],
  },
  async ({ page }) => {
    await page.goto('http://127.0.0.1:49152/', { timeout: 5_000 });
  },
);
