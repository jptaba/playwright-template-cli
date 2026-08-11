import { expect, test } from '../../fixtures';
import { installDrift } from '../../../../support/drift/harness';

/**
 * The drift harness, proven against the reference target — §21 phase 7.
 *
 * "The healer needs drift to repair and the reference target never drifts."
 * These specs induce drift deliberately and assert that it lands, so the
 * healer can be exercised on demand rather than by waiting for the real
 * application to break.
 *
 * They pass when drift is successfully induced — a harness that silently does
 * nothing would otherwise produce a "the healer works" result that means
 * nothing.
 */
test(
  'SD-090 · Removing the test-id attribute breaks a test-id locator @drift',
  { annotation: [{ type: 'practitest', description: '5190' }] },
  async ({ authedPage, target }) => {
    const drift = await installDrift(authedPage, {
      removeTestIds: true,
      testIdAttribute: target.testIdAttribute,
    });

    await authedPage.goto('/inventory.html');

    // The harness engaged, and the attribute the locators depend on is gone.
    expect((await drift.stats()).testIdsRemoved).toBeGreaterThan(0);
    await expect(authedPage.getByTestId('title')).toHaveCount(0);
  },
);

test(
  'SD-091 · Renaming an accessible name breaks a role locator @drift',
  { annotation: [{ type: 'practitest', description: '5191' }] },
  async ({ authedPage }) => {
    const drift = await installDrift(authedPage, {
      renameText: [{ from: 'Add to cart', to: 'Add item' }],
    });

    await authedPage.goto('/inventory.html');

    expect((await drift.stats()).textsRenamed).toBeGreaterThan(0);
    // The locator a spec would have used no longer resolves; the element is
    // still there under a different name — exactly the shape of real UI drift,
    // and exactly what a locator repair is for.
    await expect(authedPage.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
    await expect(authedPage.getByRole('button', { name: 'Add item' }).first()).toBeVisible();
  },
);
