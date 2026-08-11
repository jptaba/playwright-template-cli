import { expect, test } from '../../fixtures';

/**
 * TRIAGE GROUND TRUTH — §21 phase 6.
 *
 * "The reference target earns its keep again here: `problem_user`,
 * `performance_glitch_user` and `error_user` produce failures whose true cause
 * is known in advance, so agreement can be measured against ground truth on
 * day one instead of waiting weeks for enough real failures with confirmed
 * verdicts."
 *
 * **These specs are meant to fail.** They do not run in the normal suite — the
 * `triage-fixture` project only exists when `TRIAGE_FIXTURE=true`, so a green
 * pipeline stays green. Run them deliberately to produce a failing
 * `run-result.json`, then measure the triage passes against the expected
 * category recorded next to each spec.
 *
 * Expected categories are stated here, in the fixture, so that measuring
 * agreement is a diff rather than a memory exercise.
 */
const GROUND_TRUTH = {
  '5901': 'application-defect', // problem_user: the checkout fields are cross-wired
  '5902': 'application-defect', // error_user: the sort control returns a wrong order
  '5903': 'timing-synchronisation', // performance_glitch_user: a deliberate delay
  '5904': 'network-infrastructure', // the environment is unreachable
} as const;

test.describe('known-cause failures', () => {
  test(
    'TF-5901 · problem_user cannot complete checkout @known-failure',
    { annotation: [{ type: 'practitest', description: '5901' }] },
    async ({ page, secrets, auth, inventory, checkout, testData }) => {
      const account = await secrets.account('problem');
      await auth.signIn(page, { username: account.username!, password: account.password! });

      const [item] = testData.catalogItems({ count: 1 });
      await inventory.addToCart(page, [item!.name]);
      await checkout.openCart(page);
      await checkout.proceedToCheckout(page);
      await checkout.provideDeliveryDetails(page, testData.customer());

      // Ground truth: an application defect, and a textbook one. The form
      // accepts every keystroke, but the last-name field writes into the
      // first-name field, so the step refuses with a message about a value
      // the tester demonstrably supplied. Nothing about the locators is wrong.
      expect(await checkout.readCheckoutError(page)).toBeNull();
    },
  );

  test(
    'TF-5902 · error_user cannot sort the product listing @known-failure',
    { annotation: [{ type: 'practitest', description: '5902' }] },
    async ({ page, secrets, auth, inventory }) => {
      const account = await secrets.account('error');
      await auth.signIn(page, { username: account.username!, password: account.password! });

      await inventory.sortBy(page, 'Price (high to low)');
      const displayed = await inventory.readDisplayedProducts(page);

      // Ground truth: an application defect. The control exists and accepts
      // the selection; the ordering it produces is wrong.
      expect(displayed).toEqual([...displayed].sort((a, b) => b.price - a.price));
    },
  );

  test(
    'TF-5903 · performance_glitch_user exceeds the interaction budget @known-failure',
    { annotation: [{ type: 'practitest', description: '5903' }] },
    async ({ page, secrets, auth, inventory }) => {
      const account = await secrets.account('performance_glitch');
      const budgetMs = 3_000;

      const startedAt = Date.now();
      await auth.signIn(page, { username: account.username!, password: account.password! });
      await expect(page.getByTestId('title')).toHaveText('Products');
      const elapsed = Date.now() - startedAt;

      await inventory.readDisplayedProducts(page);

      // Ground truth: timing. Everything works and every assertion about
      // *content* would pass — it simply arrives far too late to be usable.
      // Asserting the budget rather than racing a timeout keeps the failure
      // deterministic instead of dependent on how fast the runner is.
      expect(elapsed, `sign-in took ${elapsed}ms, budget ${budgetMs}ms`).toBeLessThan(budgetMs);
    },
  );

  test(
    'TF-5904 · the environment is unreachable @known-failure',
    { annotation: [{ type: 'practitest', description: '5904' }] },
    async ({ page, inventory }) => {
      // Ground truth: network. Deterministic rather than hoping an environment
      // is down when we happen to be measuring.
      await page.route('**/*', (route) => route.abort('connectionrefused'));

      await inventory.open(page);
    },
  );
});

export { GROUND_TRUTH };
