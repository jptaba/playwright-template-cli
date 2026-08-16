import { expect, test } from '@playwright/test';
import { DASHBOARD_PAGES, renderPage } from '../../src/support/ui/shell';

/**
 * The app shell, in a browser that can actually scroll.
 *
 * `tests/framework/` asserts the rules are in the stylesheet, which is worth
 * doing and proves nothing about whether they work: `position: sticky` is
 * silently inert under an ancestor with the wrong `overflow`, a bar with a
 * transparent background sticks perfectly while text scrolls through it, and a
 * grid column that collapses takes the navigation off the screen. All three
 * look correct in the source and wrong on the screen.
 */

const page = (options: Partial<Parameters<typeof renderPage>[1]> = {}) =>
  renderPage(
    {
      title: 'Runs',
      eyebrow: 'Results',
      heading: 'What happened',
      lede: 'The last run and the ones before it.',
      body: Array.from(
        { length: 40 },
        (_, i) =>
          `<section id="s${i}"><h2>Section ${i}</h2><p>${'content '.repeat(40)}</p></section>`,
      ).join('\n'),
    },
    {
      token: 't',
      pages: DASHBOARD_PAGES,
      current: '/runs',
      target: { name: 'acme-shop', environment: 'staging' },
      badges: { '/triage': { count: 4, tone: 'attention', label: '4 failure groups waiting' } },
      ...options,
    },
  );

test.beforeEach(async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width: 1440, height: 900 });
  await browserPage.setContent(page());
});

test.describe('the rail', () => {
  test('lists every destination, grouped, in pipeline order', async ({ page: p }) => {
    const rail = p.getByRole('navigation', { name: 'Dashboard sections' });
    await expect(rail.getByRole('link')).toHaveText([
      'Test framework',
      /Applications/,
      /Stories/,
      /Cases/,
      /Runs/,
      /Triage/,
      /Publish/,
    ]);
    await expect(rail.getByText('Set up', { exact: true })).toBeVisible();
    await expect(rail.getByText('Execute', { exact: true })).toBeVisible();
  });

  test('stays on screen at the bottom of a long page', async ({ page: p }) => {
    const rail = p.getByRole('navigation', { name: 'Dashboard sections' });
    await expect(rail).toBeInViewport();

    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(rail).toBeInViewport();
    await expect(p.getByRole('link', { name: /Triage/ })).toBeInViewport();
  });

  test('shows what is waiting, from anywhere', async ({ page: p }) => {
    // The whole reason the rail earns its width: four failures nobody has
    // looked at, visible from the page that is not Triage.
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(p.getByLabel('4 failure groups waiting')).toBeInViewport();
  });

  test('marks where you are', async ({ page: p }) => {
    await expect(p.getByRole('link', { name: /Runs/ })).toHaveAttribute('aria-current', 'page');
  });

  test('does not overlap the page it sits beside', async ({ page: p }) => {
    // A fixed-position rail over a full-width column is the classic way this
    // goes wrong: it looks right until the first long word.
    const rail = (await p.getByRole('navigation', { name: 'Dashboard sections' }).boundingBox())!;
    const content = (await p.locator('#content').boundingBox())!;
    expect(content.x).toBeGreaterThanOrEqual(rail.x + rail.width);
  });
});

test.describe('the context bar', () => {
  test('names the application, and stays put', async ({ page: p }) => {
    const bar = p.locator('.topbar');
    await expect(bar).toContainText('acme-shop');
    await expect(bar).toContainText('staging');

    const before = (await bar.boundingBox())!;
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBeLessThanOrEqual(
      Math.round(before.y) + 1,
    );
  });

  test('is opaque enough that content cannot be read through it', async ({ page: p }) => {
    const background = await p
      .locator('.topbar')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(background).not.toBe('transparent');
  });
});

test('a section jumped to lands below the bar, not behind it', async ({ page: p }) => {
  const heading = p.getByRole('heading', { name: 'Section 30' });
  await heading.evaluate((node) => node.scrollIntoView());

  const bar = (await p.locator('.topbar').boundingBox())!;
  const box = (await heading.boundingBox())!;
  expect(box.y, 'the heading you asked for is under the bar').toBeGreaterThanOrEqual(
    bar.y + bar.height,
  );
});

test('the skip link takes a keyboard past the rail', async ({ page: p }) => {
  await p.keyboard.press('Tab');
  const skip = p.getByRole('link', { name: 'Skip to the page' });
  await expect(skip, 'the first stop, and visible once focused').toBeInViewport();
  await expect(skip).toBeFocused();
});

test.describe('narrow windows', () => {
  test('the rail moves above the page rather than disappearing', async ({ page: p }) => {
    /*
       Hiding desktop navigation behind a hamburger is the one thing the
       guidance is unambiguous about. Moving it is a different act — but a
       16rem column out of a 40rem window is chrome winning an argument it
       should lose.
    */
    await p.setViewportSize({ width: 560, height: 900 });
    const rail = p.getByRole('navigation', { name: 'Dashboard sections' });
    await expect(rail).toBeVisible();

    const railBox = (await rail.boundingBox())!;
    const content = (await p.locator('#content').boundingBox())!;
    expect(content.y, 'above, not beside').toBeGreaterThanOrEqual(railBox.y);
    expect(railBox.width).toBeGreaterThan(400);
  });

  test('every destination is still reachable there', async ({ page: p }) => {
    await p.setViewportSize({ width: 560, height: 900 });
    for (const link of DASHBOARD_PAGES) {
      await expect(p.getByRole('link', { name: new RegExp(link.label) })).toBeVisible();
    }
  });
});

test('a window too short for chrome gives the room back', async ({ page: p }) => {
  await p.setViewportSize({ width: 1440, height: 380 });
  const bar = p.locator('.topbar');
  const before = (await bar.boundingBox())!;

  await p.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(async () => (await bar.boundingBox())?.y ?? 0).toBeLessThan(before.y);
});

test('with nothing selected, the bar says so rather than saying nothing', async ({ page: p }) => {
  await p.setContent(page({ target: { name: null } }));
  await expect(p.locator('.topbar')).toContainText('none selected');
});
