import { expect, test } from '../../fixtures';

/**
 * TRIAGE GROUND TRUTH — see "The triage ground-truth fixture" in
 * `docs/CONVENTIONS.md`.
 *
 * **These specs are meant to fail.** They do not run in the normal suite —
 * the `triage-fixture` project only exists when `TRIAGE_FIXTURE=true`, so a
 * green pipeline stays green. Run them deliberately to produce a failing
 * `run-result.json`, then measure `npm run triage:rules`'s verdicts against
 * the categories recorded here.
 *
 * `problem_user`, `error_user` and `performance_glitch_user` are saucedemo's
 * own published demo accounts. Every failure below was reproduced against the
 * live application before being encoded here, not assumed from its login
 * page or its documentation — the defects are the application's, and two of
 * them do not behave the way their names imply:
 *
 *  - `error_user`'s sort defect is not a silently wrong order. Choosing any
 *    sort throws a JS `alert()` ("Sorting is broken!") and the listing never
 *    reorders at all.
 *  - `performance_glitch_user`'s sign-in delay is several seconds, not a
 *    barely-late response — timed live at ~7.6s against a 3s budget.
 */
export const GROUND_TRUTH = {
  '5901': 'application-defect', // problem_user: Last Name is rejected as missing even though it was supplied — the field is cross-wired
  '5902': 'application-defect', // error_user: sorting throws instead of reordering the listing
  '5903': 'timing-synchronisation', // performance_glitch_user: sign-in alone blows the interaction budget
  '5904': 'network-infrastructure', // the environment is unreachable
} as const;

test.describe('known-cause failures', () => {
  test(
    'TF-5901 · problem_user cannot complete checkout @known-failure',
    { annotation: [{ type: 'practitest', description: '5901' }] },
    async ({ page, secrets, signIn, inventory, checkout }) => {
      const account = await secrets.account('problem');
      await signIn.withCredentials(page, { username: account.username!, password: account.password! });

      await inventory.open(page);
      const [name] = await inventory.productNames(page);
      await inventory.addToCart(page, name!);

      await checkout.openCart(page);
      await checkout.proceedToCheckout(page);
      await checkout.provideDeliveryDetails(page, { firstName: 'Jane', lastName: 'Doe', postalCode: '12345' });

      // Ground truth: an application defect. Every field was filled, and the
      // form still refuses, naming a field that was demonstrably supplied —
      // the Last Name value is cross-wired into a different field internally.
      expect(await checkout.readError(page)).toBeNull();
    },
  );

  test(
    'TF-5902 · error_user cannot sort the product listing @known-failure',
    { annotation: [{ type: 'practitest', description: '5902' }] },
    async ({ page, secrets, signIn, inventory }) => {
      const account = await secrets.account('error');
      await signIn.withCredentials(page, { username: account.username!, password: account.password! });
      await inventory.open(page);

      // Ground truth: an application defect. Choosing "high to low" throws a
      // JS alert instead of reordering — dismissed here so the assertion
      // below can run, not to hide the defect it is dismissing.
      page.once('dialog', (dialog) => dialog.dismiss());
      await inventory.sortBy(page, 'Price (high to low)');
      const prices = (await inventory.displayedProducts(page)).map((item) => item.price);

      expect(prices).toEqual([...prices].sort((a, b) => b - a));
    },
  );

  test(
    'TF-5903 · performance_glitch_user exceeds the interaction budget @known-failure',
    { annotation: [{ type: 'practitest', description: '5903' }] },
    async ({ page, secrets, signIn, inventory }) => {
      const account = await secrets.account('performance_glitch');
      const budgetMs = 3_000;

      const startedAt = Date.now();
      await signIn.withCredentials(page, { username: account.username!, password: account.password! });
      await inventory.open(page);
      const elapsed = Date.now() - startedAt;

      // Ground truth: timing. Sign-in and the listing both eventually
      // succeed — every assertion about *content* would pass — they simply
      // arrive far too late to be usable.
      expect(elapsed, `sign-in and listing load took ${elapsed}ms, budget ${budgetMs}ms`).toBeLessThan(budgetMs);
    },
  );

  test(
    'TF-5904 · the environment is unreachable @known-failure',
    { annotation: [{ type: 'practitest', description: '5904' }] },
    async ({ page, inventory }) => {
      // Ground truth: network. Deterministic rather than hoping an
      // environment happens to be down while we are measuring.
      await page.route('**/*', (route) => route.abort('connectionrefused'));
      await inventory.open(page);
    },
  );
});
