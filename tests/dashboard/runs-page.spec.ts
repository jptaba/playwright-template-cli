import { expect, test } from './pages-harness';

/**
 * Items 71 and 72 — what the Runs page will and will not tell you.
 *
 * Both were found by driving the dashboard. `/runs` would start a run against
 * an application somebody had **parked** — reason and review date recorded in
 * its profile — with nothing on the page mentioning it, and the page called
 * Runs could not show a run that had finished, though the history already
 * filled dropdowns on two other pages.
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

test.describe('a parked application', () => {
  test('says so on the page that would start a run against it', async ({ pages }) => {
    pages.data.health = {
      errors: 0,
      warnings: 3,
      parked: {
        reason: 'ParaBank answers HTTP 500 on its own login and accounts pages',
        reviewBy: '2026-09-19',
      },
    };
    await pages.open('/runs');

    const notice = pages.page.locator('#rParked');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('parked');
    // The reason and the date, because "parked" alone is not actionable.
    await expect(notice).toContainText('answers HTTP 500');
    await expect(notice).toContainText('2026-09-19');
  });

  test('is still allowed to run, because selecting it is a deliberate act', async ({ pages }) => {
    /*
       `suites:live --target=` runs a parked application when it is named on
       the command line, and says so. Selecting it in the switcher is that same
       act. What was wrong was the silence, not the running — and a tool that
       refused would send somebody to the command line to check whether the
       vendor had recovered.
    */
    pages.data.health = {
      errors: 0,
      warnings: 1,
      parked: { reason: 'the vendor is down', reviewBy: '2026-12-01' },
    };
    await pages.open('/runs');

    await expect(pages.page.locator('#rParked')).toBeVisible();
    await expect(pages.page.locator('#rStart')).toBeEnabled();
  });

  test('an application that is not parked says nothing', async ({ pages }) => {
    // A healthy application costs no pixels.
    await pages.open('/runs');
    await expect(pages.page.locator('#rParked')).toBeHidden();
  });
});

test.describe('finished runs', () => {
  test('the page called Runs can show you a run', async ({ pages }) => {
    pages.data.history = { count: 3, failing: 0 };
    await pages.open('/runs');

    await expect(pages.page.locator('#rHistory')).toBeVisible();
    await expect(pages.page.locator('#rHistoryList li')).toHaveCount(3);
  });

  test('most recent first', async ({ pages }) => {
    pages.data.history = { count: 3, failing: 0 };
    await pages.open('/runs');

    const first = pages.page.locator('#rHistoryList li').first();
    // The fake numbers them oldest-first; the page orders them.
    await expect(first).toContainText('run-03');
  });

  test('a run that failed offers triage; one that passed does not', async ({ pages }) => {
    /*
       "Why it failed" beside a run that passed is an invitation to a page with
       nothing to show, which reads as the tool being confused about its own
       results.
    */
    pages.data.history = { count: 2, failing: 1 };
    await pages.open('/runs');

    const rows = pages.page.locator('#rHistoryList li');
    // Newest first, and the fake fails the earliest-indexed ones.
    await expect(rows.filter({ hasText: 'Why it failed' })).toHaveCount(1);
    // Every run can be published, failed or not.
    await expect(rows.filter({ hasText: 'Publish it' })).toHaveCount(2);
  });

  test('no runs yet means no section at all', async ({ pages }) => {
    // Rather than an empty box explaining that it is empty.
    await pages.open('/runs');
    await expect(pages.page.locator('#rHistory')).toBeHidden();
  });

  test('a long history does not push the page sideways', async ({ pages }) => {
    // The budget every page here is held to: wide content scrolls inside its
    // own container, and the body never scrolls horizontally.
    pages.data.history = { count: 12, failing: 6 };
    await pages.open('/runs');

    const wide = await pages.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(wide).toBe(false);
  });
});
