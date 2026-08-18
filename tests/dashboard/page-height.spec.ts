import { expect, test } from './pages-harness';

/**
 * How tall a page is allowed to get on data nobody chose the size of.
 *
 * The same idea as the word budget in `tests/framework/page-copy.spec.ts`, for
 * the axis that actually broke. That one caps prose, which is authored here and
 * grows a paragraph at a time; this one caps **height on realistic data**,
 * which grows without anybody writing a line — a repository gains cases, a run
 * gains specs, and a page that read well on the day it was written is six
 * screens the following month.
 *
 * Measured against a real repository before this existed: Publish came to 7.8
 * screens and Cases to 7.3, and the worst single block on Publish was 3660px —
 * every unpostable spec title joined into one sentence. Every test passed,
 * because there was no browser test of either page at all.
 *
 * The budgets are deliberately loose. This is not a design rule about what
 * looks nice; it is the tripwire for a block with no bound, and a tight number
 * would be a rule nobody could keep and everybody would raise.
 */

/*
   Both numbers are tripwires for growth with no bound, not design rules.

   What they are sized against, measured before any of this was fixed: Cases at
   30.1 screens, Triage at 22.0, Publish at 12.7. Against that, the difference
   between five screens and six is noise — and a budget tight enough to force
   the *page* to change shape is one that gets raised by the first person it
   inconveniences, which is how a rule stops meaning anything. Triage carries
   five sections and ten work items and lands at 5.5; that is a fine page.
*/
const SCREENS = 6;
/*
   And no single block — a list, a paragraph, a container of cards — taller
   than this. In screens rather than pixels, because that is the unit the
   complaint is in: "I scrolled past four screens of one thing to reach the
   next".

   The number has to clear a container holding a *bounded* number of real work
   items. Triage's ten clusters are 3.4 screens and that is a fine block; the
   paragraph this whole exercise started with was 5.1.
*/
const TALLEST_BLOCK_SCREENS = 4.5;

/** More than anybody has, which is the point: the failures were of quantity. */
const A_LOT = {
  unannotated: 200,
  failures: 60,
  cases: { noSpec: 120, orphans: 90, automated: 60 },
  /* Eight roles against a pool of twenty. The profile decides this, not the page. */
  users: { roles: 8, poolSize: 20 },
  /* Twelve runs pressed this session, each holding the 25 failures the card shows. */
  runs: { count: 12, failuresEach: 25 },
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

test.describe('with a repository that has grown', () => {
  test('Publish stays inside its budget', async ({ pages }) => {
    pages.data.unannotated = A_LOT.unannotated;
    pages.data.failures = A_LOT.failures;
    await pages.open('/publish');

    const screens = await pages.screens();
    expect(screens, `Publish is ${screens.toFixed(1)} screens on 200 unpostable specs and 60 defects`)
      .toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(
      worst.height / 720,
      `${worst.label} is ${(worst.height / 720).toFixed(1)} screens tall on its own`,
    ).toBeLessThan(TALLEST_BLOCK_SCREENS);
  });

  test('Cases stays inside its budget', async ({ pages }) => {
    pages.data.cases = A_LOT.cases;
    await pages.open('/cases');

    const screens = await pages.screens();
    expect(screens, `Cases is ${screens.toFixed(1)} screens on 270 rows`).toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(
      worst.height / 720,
      `${worst.label} is ${(worst.height / 720).toFixed(1)} screens tall on its own`,
    ).toBeLessThan(TALLEST_BLOCK_SCREENS);
  });

  test('Triage stays inside its budget', async ({ pages }) => {
    /*
       A bad night, not a bad week: sixty failures each with their own message,
       so they cluster separately. Forty tests failing on one incident is one
       cluster, which is right and is not the shape that makes a page tall.
    */
    pages.data.failures = A_LOT.failures;
    await pages.open('/triage');

    const screens = await pages.screens();
    expect(screens, `Triage is ${screens.toFixed(1)} screens on 60 clusters`).toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(
      worst.height / 720,
      `${worst.label} is ${(worst.height / 720).toFixed(1)} screens tall on its own`,
    ).toBeLessThan(TALLEST_BLOCK_SCREENS);
  });

  test('Test users stays inside its budget', async ({ pages }) => {
    pages.data.users = A_LOT.users;
    await pages.open('/users');

    const screens = await pages.screens();
    expect(screens, `Test users is ${screens.toFixed(1)} screens on 160 accounts`)
      .toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(
      worst.height / 720,
      `${worst.label} is ${(worst.height / 720).toFixed(1)} screens tall on its own`,
    ).toBeLessThan(TALLEST_BLOCK_SCREENS);
  });

  test('Runs stays inside its budget', async ({ pages }) => {
    /*
       Nothing ever removes a run from the manager's map, so this page holds a
       card for every run started since the dashboard was opened. Twelve is a
       morning.
    */
    pages.data.runs = A_LOT.runs;
    await pages.open('/runs');

    const screens = await pages.screens();
    expect(screens, `Runs is ${screens.toFixed(1)} screens on 12 runs`).toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(
      worst.height / 720,
      `${worst.label} is ${(worst.height / 720).toFixed(1)} screens tall on its own`,
    ).toBeLessThan(TALLEST_BLOCK_SCREENS);
  });
});

test.describe('the unpostable specs on Publish', () => {
  test('are a count you can read and a list you can open', async ({ pages }) => {
    /*
       They were one text node: every title joined with "; " into a sentence
       that is not a sentence. The count is the fact somebody acts on and it was
       the first eight words of a paragraph five thousand pixels long.
    */
    pages.data.unannotated = 200;
    await pages.open('/publish');

    const skipped = pages.page.locator('#rSkipped');
    await expect(skipped).toContainText('200 spec(s) carry no case id');

    const disclosure = skipped.locator('details');
    await expect(disclosure.locator('summary')).toHaveText('Which 200 spec(s)');
    await expect(skipped.locator('.skipped-spec'), 'nothing is dropped').toHaveCount(200);
    await expect(skipped.locator('.skipped-spec').first()).toBeHidden();

    await disclosure.locator('summary').click();
    await expect(skipped.locator('.skipped-spec').first()).toBeVisible();
  });

  test('say nothing at all when every spec carries a case id', async ({ pages }) => {
    pages.data.unannotated = 0;
    await pages.open('/publish');
    await expect(pages.page.locator('#rSkipped')).toBeEmpty();
  });
});

test.describe('the lists on Cases', () => {
  test('scroll rather than push the section below them off the page', async ({ pages }) => {
    pages.data.cases = { noSpec: 120, orphans: 90, automated: 60 };
    await pages.open('/cases');

    for (const id of ['#uList', '#oList', '#aList']) {
      const scrolls = await pages.page.locator(id).evaluate((node) => ({
        capped: node.scrollHeight > node.clientHeight,
        rows: node.children.length,
      }));
      expect(scrolls.capped, `${id} holds ${scrolls.rows} rows and does not scroll`).toBe(true);
    }
  });

  test('a short answer is not put in a box built for a long one', async ({ pages }) => {
    /*
       The other half of the rule. A cap that always applies gives a one-row
       answer a scroll region and a fixed height, which reads as "there is more
       below" when there is not.
    */
    pages.data.cases = { noSpec: 2, orphans: 1, automated: 1 };
    await pages.open('/cases');

    await expect(pages.page.locator('#uList')).not.toHaveClass(/longlist/);
    await expect(pages.page.locator('#oList')).not.toHaveClass(/longlist/);
  });
});

test.describe('the accounts on Test users', () => {
  test('scroll rather than bury the form somebody came to use', async ({ pages }) => {
    /*
       Roles times pool size, which the profile decides and the page does not.
       Eight against twenty is 160 rows and was 14.1 screens, with the two
       fields for setting a password below all of them.
    */
    pages.data.users = { roles: 8, poolSize: 20 };
    await pages.open('/users');

    const list = pages.page.locator('#slots');
    await expect(list.locator('.slot'), 'nothing is dropped').toHaveCount(160);
    const capped = await list.evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(capped, '#slots holds 160 rows and does not scroll').toBe(true);
  });

  test('a profile with two accounts is not given a box built for a hundred', async ({ pages }) => {
    pages.data.users = { roles: 2, poolSize: 1 };
    await pages.open('/users');
    await expect(pages.page.locator('#slots')).not.toHaveClass(/longlist/);
  });
});

test.describe('a queue longer than a screen', () => {
  test('Triage shows the first ten and offers the rest', async ({ pages }) => {
    pages.data.failures = 60;
    await pages.open('/triage');

    const clusters = pages.page.locator('#tList .cluster');
    await expect(clusters, 'the count beside the heading is still the total').toHaveCount(60);
    await expect(pages.page.locator('#cCount')).toHaveText('60');
    expect(await clusters.filter({ visible: true }).count()).toBe(10);

    const more = pages.page.getByRole('button', { name: 'Show the other 50 cluster(s)' });
    await more.click();
    expect(await clusters.filter({ visible: true }).count()).toBe(60);
    await expect(more, 'and it withdraws itself once there is no more').toHaveCount(0);
  });

  test('every defect Publish would file is in the page, seen or not', async ({ pages }) => {
    /*
       The invariant that decides how this is built. Sending reads the checkbox
       of every defect in the preview, so a row left unrendered would throw on
       send — and a row rendered but never scrolled to still carries the
       recommendation the preview computed. What gets filed must not depend on
       how far anybody scrolled.
    */
    pages.data.failures = 60;
    await pages.open('/publish');

    const rows = pages.page.locator('#dList .defect');
    await expect(rows).toHaveCount(60);
    expect(await rows.filter({ visible: true }).count()).toBe(10);

    const boxes = await pages.page.locator('#dList input[type="checkbox"]').count();
    expect(boxes, 'a checkbox for every defect, whether or not it is on screen').toBe(60);
  });
});
