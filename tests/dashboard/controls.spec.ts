import { expect, test } from './pages-harness';
import { contrastOf } from './measure';

/**
 * Whether a control answers the pointer, and stays readable when it does.
 *
 * Driven before this existed: the served stylesheet had five `:hover` rules —
 * the rail link, the wordmark, the application switcher, the theme control and
 * a disclosure summary — and **not one of them was on a button.** The rail
 * responded to the pointer and the thing that actually writes the target did
 * not, which reads as disabled next to controls that do.
 *
 * Both themes, because the mix that produces the hover colour moves toward
 * `--ink` on purpose: dark in light, light in dark, so one declaration is
 * meant to go the right direction in both. A test in one theme would be a test
 * of half the idea.
 *
 * Focus is deliberately not here. Run 29 drove every focusable element on the
 * page and found one rule already putting a 2px accent outline on all of them,
 * so there is nothing to hold that a test would not simply restate.
 */

/**
 * One of each variant, on the page it actually lives on.
 *
 * Checked rather than assumed, and the first version of this was wrong about
 * it: `#rSend` on Publish reads "Post results" and looks like the primary
 * action, and is styled `.destructive`. Publish has no plain primary button at
 * all — the pair live on Test users.
 */
const VARIANTS = [
  { what: 'the primary button', page: '/users' as const, find: '#save' },
  { what: 'a secondary button', page: '/users' as const, find: '#forget' },
  { what: 'the destructive button', page: '/publish' as const, find: '#rSend' },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

for (const theme of ['light', 'dark'] as const) {
  test(`every kind of button answers the pointer in ${theme}`, async ({ pages }) => {
    await pages.page.emulateMedia({ colorScheme: theme });

    for (const variant of VARIANTS) {
      pages.data.unannotated = 4;
      pages.data.users = { roles: 1, poolSize: 1 };
      await pages.open(variant.page);

      const button = pages.page.locator(variant.find);
      await expect(button, `${variant.what} is not on ${variant.page}`).toHaveCount(1);
      await expect(button, `${variant.what} is disabled, so this proves nothing`).toBeEnabled();

      const resting = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
      await button.hover();
      /*
         Web-first rather than a read straight after the hover: the button
         transitions over .12s, so the first value back is the resting one on
         its way somewhere. This is the same trap that made the contrast budget
         report a phantom failure last run.
      */
      await expect
        .poll(
          () => button.evaluate((node) => getComputedStyle(node).backgroundColor),
          { message: `${variant.what} does not react to the pointer in ${theme}` },
        )
        .not.toBe(resting);
    }
  });

  test(`a hovered button is still readable in ${theme}`, async ({ pages }) => {
    /*
       The half a hover state usually gets wrong. Darkening a fill is a
       one-line change and the label is somebody else's problem until it is
       grey on grey — and the contrast budget cannot see it, because it
       measures a page nobody is pointing at.
    */
    await pages.page.emulateMedia({ colorScheme: theme });
    pages.data.unannotated = 4;
    await pages.open('/publish');

    const button = pages.page.locator('#rSend');
    await button.hover();

    // Polled, so the .12s transition has somewhere to land before this decides.
    await expect
      .poll(() => contrastOf(button), {
        message: `the hovered button never reaches 4.5:1 in ${theme}`,
      })
      .toBeGreaterThanOrEqual(4.5);
  });
}

test('a disabled button does not pretend it can be pressed', async ({ pages }) => {
  /*
     A hover response on a control that will refuse is a promise it does not
     keep, and the reason it is refused belongs to the page. `#dSend` is the
     one: nothing is selected to file, so filing is not offered.
  */
  pages.data.unannotated = 4;
  await pages.open('/publish');

  const button = pages.page.locator('#dSend');
  await expect(button).toBeDisabled();

  const resting = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
  await button.hover({ force: true });
  const hovered = await button.evaluate((node) => getComputedStyle(node).backgroundColor);

  expect(hovered, 'a disabled button changed under the pointer').toBe(resting);
});
