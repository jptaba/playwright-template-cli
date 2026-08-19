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
    // Set up is a disclosure now and starts closed, so this opens it: the
    // claim being made is about the order and completeness of the rail, not
    // about what happens to be revealed on a Runs page.
    await rail.locator('details[data-nav-group="set-up"] > summary').click();
    await expect(rail.getByRole('link')).toHaveText([
      'Test framework',
      /Applications/,
      /Test users/,
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
    // Including the two behind the disclosure — "reachable" is the claim, and
    // a group that could not be opened at this width would break it.
    await p.locator('details[data-nav-group="set-up"] > summary').click();
    for (const link of DASHBOARD_PAGES) {
      await expect(p.getByRole('link', { name: new RegExp(link.label) })).toBeVisible();
    }
  });

  test('the bar does not overflow the viewport at phone width', async ({ page: p }) => {
    /*
       560px is where the rail moves. 375px is where .topbar-end itself needs
       to wrap: the application switcher and the theme control are two flex
       items inside it with no wrap of their own, so .topbar wrapping onto a
       second row was not enough — that second row still had to fit both of
       them side by side, and at a real phone width it could not.
    */
    await p.setViewportSize({ width: 375, height: 812 });
    const scrollWidth = await p.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await p.evaluate(() => document.documentElement.clientWidth);
    expect(
      scrollWidth,
      `${scrollWidth}px of content in a ${clientWidth}px window`,
    ).toBeLessThanOrEqual(clientWidth);
  });

  test('the switcher and the theme control stack there rather than collide', async ({ page: p }) => {
    await p.setViewportSize({ width: 375, height: 812 });
    const ctx = (await p.locator('.ctx').boundingBox())!;
    const theme = (await p.locator('.theme').boundingBox())!;
    expect(theme.y).toBeGreaterThanOrEqual(ctx.y + ctx.height - 1);
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

// ---------------------------------------------------------------------------
// Notes that stay out of the way
// ---------------------------------------------------------------------------

test.describe('the disclosures', () => {
  /*
     Every page carried its reasoning inline and it had grown into an essay —
     onboarding's step 2 opened with 108 words above the three fields it was
     describing. The reasoning is worth keeping: it is why a rule exists, and
     somebody meeting a refusal wants it. It is now opt-in.
  */
  const withNotes = renderPage(
    {
      title: 'Notes',
      eyebrow: 'Notes',
      heading: 'A page with a note on it',
      lede: 'Short.',
      body:
        '<section><p class="explain">Do the thing.</p>' +
        '<details class="more"><summary>Why the thing works this way</summary>' +
        '<div class="body"><p>Because of the reason.</p></div></details></section>',
    },
    { token: 't', pages: DASHBOARD_PAGES, current: '/runs' },
  );

  test.beforeEach(async ({ page: p }) => {
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.setContent(withNotes);
  });

  test('cost one line until somebody wants them', async ({ page: p }) => {
    await expect(p.getByText('Why the thing works this way')).toBeVisible();
    await expect(p.getByText('Because of the reason.')).toBeHidden();
  });

  test('open on a click and stay open', async ({ page: p }) => {
    await p.getByText('Why the thing works this way').click();
    await expect(p.getByText('Because of the reason.')).toBeVisible();
  });

  test('open from the keyboard, because a details element is a real control', async ({ page: p }) => {
    // The reason this is `details` rather than a div and a click handler: it
    // is focusable, operable and announced without a line of JavaScript.
    await p.keyboard.press('Tab'); // skip link
    await p.getByText('Why the thing works this way').focus();
    await p.keyboard.press('Enter');
    await expect(p.getByText('Because of the reason.')).toBeVisible();
  });

  test('never push the instruction off the top of the section', async ({ page: p }) => {
    // The instruction is what somebody came for; the note is optional. Closed
    // or open, the instruction stays first.
    const instruction = (await p.getByText('Do the thing.').boundingBox())!;
    const summary = (await p.getByText('Why the thing works this way').boundingBox())!;
    expect(instruction.y).toBeLessThan(summary.y);
  });
});

test.describe('the set-up group', () => {
  /*
     `tests/framework/` asserts the markup; only a browser can say whether the
     links are actually off the screen, whether a keyboard reaches the
     disclosure, and whether opening it survives a navigation. The persistence
     is script, and script that is never run is a comment.
  */
  const setUp = (p: import('@playwright/test').Page) =>
    p.locator('details[data-nav-group="set-up"]');

  test('keeps its two pages off the screen until it is asked', async ({ page: p }) => {
    const labels = await p.locator('nav.rail a:visible .nav-label').allTextContents();

    expect(labels).toEqual(['Stories', 'Cases', 'Runs', 'Triage', 'Publish']);
    // Off the screen, not out of the document: the group is one click away and
    // its own heading is still on screen saying so, which is the difference
    // between this and a hamburger.
    await expect(setUp(p).getByText('Set up', { exact: true })).toBeVisible();
  });

  test('a click reveals both of them', async ({ page: p }) => {
    await setUp(p).getByText('Set up').click();

    const labels = await p.locator('nav.rail a:visible .nav-label').allTextContents();
    expect(labels).toEqual([
      'Applications',
      'Test users',
      'Stories',
      'Cases',
      'Runs',
      'Triage',
      'Publish',
    ]);
  });

  test('a keyboard opens it too, which a div and a click handler would not', async ({ page: p }) => {
    await setUp(p).locator('summary').focus();
    await p.keyboard.press('Enter');

    await expect(p.getByRole('link', { name: /Applications/ })).toBeVisible();
  });

  /*
     `setContent` leaves the page on `about:blank`, where Chromium refuses
     `localStorage` outright — the script swallows that by design, so a
     persistence test written against it would pass for the wrong reason and
     then fail. These two serve the same markup over a real origin instead,
     the way the theme tests do, so a reload is a reload.
  */
  const served = async (p: import('@playwright/test').Page, options = {}) => {
    await p.route('http://shell.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: page(options) }),
    );
    await p.goto('http://shell.test/');
  };

  test('opening it is remembered on the next page', async ({ page: p }) => {
    /*
       Somebody who opens Set up to add an application and then check its
       credentials should not have to open it again on the way. Only the
       opening is stored — a person who never opens it never sees it open.
    */
    await served(p);
    await setUp(p).getByText('Set up', { exact: true }).click();
    await p.reload();

    await expect(setUp(p)).toHaveJSProperty('open', true);
  });

  test('and closing it again is forgotten rather than stored as a preference', async ({
    page: p,
  }) => {
    await served(p);
    await setUp(p).getByText('Set up', { exact: true }).click();
    await setUp(p).getByText('Set up', { exact: true }).click();
    await p.reload();

    await expect(setUp(p)).toHaveJSProperty('open', false);
  });

  test('the group holding the current page is open, so the rail says where you are', async ({
    page: p,
  }) => {
    await p.setContent(page({ current: '/users' }));

    await expect(setUp(p)).toHaveJSProperty('open', true);
    await expect(p.getByRole('link', { name: /Test users/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
