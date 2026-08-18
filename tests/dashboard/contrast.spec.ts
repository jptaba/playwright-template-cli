import { expect, test } from './pages-harness';
import { contrastFindings, openEveryDisclosure } from './measure';

/**
 * Whether the tool is legible — the budget, on the pages this harness serves.
 *
 * The measurement is in `measure.ts` beside the one for line length, because
 * the onboarding page has its own harness and needs the same answer. What is
 * here is the list of pages, the two themes, and the assertion.
 */

/** The pages this harness serves, each given something to render. */
const PAGES = [
  ['/publish', { unannotated: 12, failures: 6 }],
  ['/triage', { failures: 6 }],
  ['/cases', { cases: { noSpec: 8, orphans: 4, automated: 4 } }],
  ['/users', { users: { roles: 2, poolSize: 2 } }],
  ['/runs', { runs: { count: 3, failuresEach: 2 } }],
  ['/stories', { stories: { count: 3, criteriaEach: 3, draftsEach: 2 } }],
] as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

for (const theme of ['light', 'dark'] as const) {
  for (const [path, data] of PAGES) {
    test(`${path} is legible in ${theme}`, async ({ pages }) => {
      /*
         The media query, set before the page loads, rather than stamping
         data-theme afterwards. Two reasons, and the second one cost an hour:

         Auto is the state most people are in — no stored choice, no attribute,
         the operating system deciding — and it is the state the palette's own
         comment warns about, because a colour defined only inside one of the
         theme blocks never applies there.

         And switching a live page reads mid-transition. `.theme button` has
         `transition: color .15s`, so a computed colour taken straight after
         the switch is the *old* one part-way to the new: this reported the
         theme control at 2.98:1 in dark and looked exactly like a real defect
         until the ancestor chain showed --muted already holding the right
         value. Loading in the theme has nothing to animate from.
      */
      await pages.page.emulateMedia({ colorScheme: theme });
      Object.assign(pages.data, data);
      await pages.open(path);
      // What is behind a disclosure is read by somebody too.
      await openEveryDisclosure(pages.page);

      const bad = await contrastFindings(pages.page);
      const report = bad
        .map((one) => `${one.label} — ${one.what} at ${one.ratio}:1, needs ${one.need}:1 "${one.sample}"`)
        .join('\n');
      expect(bad, `${bad.length} below AA in ${theme}:\n${report}`).toEqual([]);
    });
  }
}
