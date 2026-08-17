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

const SCREENS = 5;
const TALLEST_BLOCK_PX = 1200;

/** More than anybody has, which is the point: the failures were of quantity. */
const A_LOT = { unannotated: 200, cases: { noSpec: 120, orphans: 90, automated: 60 } };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

test.describe('with a repository that has grown', () => {
  test('Publish stays inside its budget', async ({ pages }) => {
    pages.data.unannotated = A_LOT.unannotated;
    await pages.open('/publish');

    const screens = await pages.screens();
    expect(screens, `Publish is ${screens.toFixed(1)} screens on 200 unpostable specs`)
      .toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(worst.height, `${worst.label} is ${worst.height}px`).toBeLessThan(TALLEST_BLOCK_PX);
  });

  test('Cases stays inside its budget', async ({ pages }) => {
    pages.data.cases = A_LOT.cases;
    await pages.open('/cases');

    const screens = await pages.screens();
    expect(screens, `Cases is ${screens.toFixed(1)} screens on 270 rows`).toBeLessThan(SCREENS);

    const worst = await pages.tallestBlock();
    expect(worst.height, `${worst.label} is ${worst.height}px`).toBeLessThan(TALLEST_BLOCK_PX);
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
