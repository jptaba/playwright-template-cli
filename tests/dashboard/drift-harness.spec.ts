import { expect, test } from './harness';
import { installDrift } from '../../src/support/drift/harness';

/**
 * The drift harness, exercised — §21 phase 7.
 *
 * "The healer needs drift to repair and the reference target never drifts, so
 * exercise it with route interception that rewrites accessible names and
 * removes test ids on a fork of it — a deterministic drift harness beats
 * waiting for the real application to break."
 *
 * It was built and then never called. 173 lines, no importers, from the first
 * commit — a documented phase exit satisfied by code nothing had ever run. The
 * failure mode of an unexercised harness is the one it exists to prevent: it
 * quietly does nothing, the healer is handed a page that never drifted, and
 * the result reads as "the healer works".
 *
 * So it is exercised here, against the authoring dashboard. That is not a
 * stand-in for an application under test — it is a real single-page
 * application, served over a loopback socket, with accessible names and
 * visible text that locators in this repository already depend on. Which
 * makes it the one page this suite can break on purpose without needing a
 * target onboarded, a credential, or a network.
 *
 * The assertions are on both halves, and the second is the one that matters:
 * the counters moved, **and** a locator that resolved before now does not.
 * A harness that reports work it did not do is worse than one that does
 * nothing.
 */

test('renaming an accessible name breaks the locator that depended on it', async ({
  dashboard,
}) => {
  const { page, reopen } = dashboard;

  // The theme control, found the way a screen reader finds it. This exact
  // locator is what tests/dashboard/theme.spec.ts is written against.
  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();

  const drift = await installDrift(page, {
    renameLabels: [{ from: 'Colour theme', to: 'Colour scheme' }],
  });
  // Init scripts apply from the next navigation, so drift is in place before
  // the page's own script runs rather than racing it.
  await reopen();

  const stats = await drift.stats();
  expect(stats.textsRenamed, 'the harness reported no work, so it never engaged').toBeGreaterThan(
    0,
  );

  await expect(page.getByRole('group', { name: 'Colour theme' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Colour scheme' })).toBeVisible();
});

test('rewriting visible text breaks a name locator, and leaves the element there', async ({
  dashboard,
}) => {
  const { page, reopen } = dashboard;

  const theme = page.getByRole('group', { name: 'Colour theme' });
  await expect(theme.getByRole('button')).toHaveText(['Light', 'Dark', 'Auto']);

  const drift = await installDrift(page, { renameText: [{ from: 'Light', to: 'Pale' }] });
  await reopen();

  expect((await drift.stats()).textsRenamed).toBeGreaterThan(0);

  /*
     The shape of failure this reproduces, and the reason it is worth having:
     the button is still on screen and still clickable. Only the name moved.
     That is what a real rename does, and it is why `getByRole` fails on it
     while a positional or CSS locator sails through.
  */
  await expect(theme.getByRole('button')).toHaveText(['Pale', 'Dark', 'Auto']);
  await expect(theme.getByRole('button', { name: 'Light' })).toHaveCount(0);
});

test('stripping the test-id attribute strips the locator with it', async ({ dashboard }) => {
  const { page } = dashboard;

  /*
     A page of our own rather than the dashboard, because the dashboard has no
     `data-testid` attributes to remove — it is built on roles and labels. A
     harness asserted against a page with nothing to strip would report zero
     and pass, which is exactly the false green this test exists to close.
  */
  const markup =
    '<button data-testid="submit-claim">Submit</button>' +
    '<span data-testid="claim-total">42.00</span>';

  const drift = await installDrift(page, { removeTestIds: true });
  await page.goto(`data:text/html,${encodeURIComponent(markup)}`);

  expect((await drift.stats()).testIdsRemoved).toBe(2);
  await expect(page.locator('[data-testid]')).toHaveCount(0);
  // The elements are untouched; only the hook a locator used is gone.
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
});

test('a harness given nothing to change reports nothing, rather than passing quietly', async ({
  dashboard,
}) => {
  const { page, reopen } = dashboard;

  const drift = await installDrift(page, {
    renameText: [{ from: 'a phrase this page does not contain', to: 'irrelevant' }],
  });
  await reopen();

  /*
     Zero is the honest answer here, and it is also what a harness that failed
     to install would report. That is precisely why every test above asserts
     the counter moved before asserting the locator broke: on its own, a broken
     locator could mean the page changed for some other reason, and on its own
     a zero could mean either "nothing to do" or "nothing ran".
  */
  expect(await drift.stats()).toMatchObject({ testIdsRemoved: 0, textsRenamed: 0 });
  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
});

test('delaying the document exercises timing rather than locators', async ({ dashboard }) => {
  const { page, reopen } = dashboard;

  /*
     The third mode, and the one that produces a different kind of failure:
     nothing is renamed and nothing is removed, so every locator still
     resolves — eventually. A suite that repairs itself by rewriting locators
     has nothing to rewrite here, which is the point of having it.
  */
  const drift = await installDrift(page, { delayMs: 400 });

  const started = Date.now();
  await reopen();
  const elapsed = Date.now() - started;

  const stats = await drift.stats();
  expect(stats.documentsDelayed).toBeGreaterThan(0);
  expect(stats.textsRenamed).toBe(0);
  expect(stats.testIdsRemoved).toBe(0);

  // Loose, because a timer may fire a shade early and this runs beside
  // everything else — a tight bound here would be a flake generator, which is
  // the same rule the performance budgets follow.
  expect(elapsed, `the reload took ${elapsed}ms and the delay was 400ms`).toBeGreaterThan(300);

  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
});
