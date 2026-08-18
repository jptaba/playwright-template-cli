import { expect, test } from './pages-harness';
import { openEveryDisclosure, widestProse } from './measure';

/**
 * How wide a line of prose is allowed to run.
 *
 * The third budget on this page, and the same idea as the other two.
 * `page-copy.spec.ts` caps how much is written; `page-height.spec.ts` caps how
 * tall that gets on data nobody chose the size of; this one caps how wide a
 * sentence is read at, which is the axis neither of them touches and the one
 * nobody notices, because a paragraph that is too wide looks like a paragraph.
 *
 * Measured before it existed, at 1280 x 720: Triage's disclosure paragraphs at
 * 125 characters a line and Publish's unpostable-specs note at 125, each
 * sitting directly below an explain paragraph at 76. Two elements in the whole
 * stylesheet had a measure and everything else ran the width of the column.
 */

/*
   Loose on purpose, like the other two. Set for reading is somewhere around
   75; this is the tripwire for a block with none at all, and against 125 the
   difference between 90 and 80 is noise. A budget tight enough to argue with
   is one that gets raised by the first person it inconveniences.
*/
const CHARACTERS = 90;

/** The same quantities the height budget uses: more than anybody has. */
const A_LOT = {
  unannotated: 200,
  failures: 60,
  cases: { noSpec: 120, orphans: 90, automated: 60 },
  users: { roles: 8, poolSize: 20 },
  runs: { count: 20, failuresEach: 25 },
  stories: { count: 40, criteriaEach: 6, draftsEach: 4 },
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

for (const [path, data] of [
  ['/publish', { unannotated: A_LOT.unannotated, failures: A_LOT.failures }],
  ['/triage', { failures: A_LOT.failures }],
  ['/cases', { cases: A_LOT.cases }],
  ['/users', { users: A_LOT.users }],
  ['/runs', { runs: A_LOT.runs }],
  ['/stories', { stories: A_LOT.stories }],
] as const) {
  test(`${path} reads at a measure`, async ({ pages }) => {
    Object.assign(pages.data, data);
    await pages.open(path);
    /*
       Including what is behind a disclosure. Triage's widest paragraphs were
       all inside one, which is why nobody had seen them — a rule that only
       covers what is open on load misses the half of the writing that is not.
    */
    await openEveryDisclosure(pages.page);

    const worst = await widestProse(pages.page);
    expect(worst.chars, `${worst.label} reads at ${worst.chars} characters a line: "${worst.text}…"`)
      .toBeLessThan(CHARACTERS);
  });
}

test('a narrow window is not made narrower still', async ({ pages }) => {
  /*
     The other half of a measure, and the way one usually goes wrong: a cap
     stated in pixels wins on a phone too and leaves a strip of text up one
     edge of a page that had no width to spare. In ch it only ever binds where
     the column is wider than the measure — which 900px still is, so the number
     here has to be a window that is genuinely narrow.
  */
  await pages.page.setViewportSize({ width: 420, height: 720 });
  pages.data.unannotated = 200;
  await pages.open('/publish');
  await openEveryDisclosure(pages.page);

  const filled = await pages.page.evaluate(() => {
    const note = document.querySelector('#rSkipped .note')!;
    const column = note.closest('section')!;
    return note.getBoundingClientRect().width / column.getBoundingClientRect().width;
  });
  expect(filled, 'the note uses the column it has when the column is narrow').toBeGreaterThan(0.8);
});
