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
      /*
         With the list, so the bar renders the real control rather than the
         read-only label. Without it, `applicationSwitcher` takes its early
         branch and the bar is a short piece of text — narrow enough that the
         phone-width overflow budget below could not fail. Item 75 added a
         third child to `.ctx`, overflowed 375px on the running page, and this
         suite stayed green.
      */
      target: {
        name: 'acme-shop',
        environment: 'staging',
        available: ['acme-shop', 'orangehrm', 'parabank', 'restful-booker', 'toolshop'],
      },
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
    /*
       Five, in pipeline order. Applications and Test users are in the top bar
       since item 75 — onboarding and recovery are not steady-state
       destinations, and they were holding the first two slots of the list
       somebody opens daily.
    */
    await expect(rail.getByRole('link')).toHaveText([
      'Testbench',
      /Stories/,
      /Cases/,
      /Runs/,
      /Triage/,
      /Publish/,
    ]);
    await expect(rail.getByText('Author', { exact: true })).toBeVisible();
    await expect(rail.getByText('Execute', { exact: true })).toBeVisible();
    await expect(rail.getByText('Report', { exact: true })).toBeVisible();
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
    /*
       All seven, five in the rail and two in the bar — "reachable" is the
       claim. Hiding the bar's pair below 60rem to save space made Applications
       and Test users unreachable on a phone, and this caught it.
    */
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

test.describe('set up, beside the switcher rather than in the rail', () => {
  /*
     Item 75. Applications and Test users are onboarding and recovery: one is
     used once per application, the other when a login breaks. They held the
     first two slots of a list of five things somebody opens daily, behind a
     disclosure that shipped closed — which was the recognition, not the fix.

     They are in the top bar now, beside the application switcher they are
     about: one configures the thing the switcher selects, the other holds its
     logins.

     What this replaces is the disclosure's own suite — that it opened on
     click, on keyboard, remembered across a navigation and opened itself for
     the current page. All of it described a control that no longer exists.
     The claims worth keeping are below: the rail is the steady state, both
     pages are still reachable, and the one you are on still says so.
  */
  test('the rail is the steady state, and only that', async ({ page: p }) => {
    const labels = await p.locator('nav.rail a:visible .nav-label').allTextContents();

    expect(labels).toEqual(['Stories', 'Cases', 'Runs', 'Triage', 'Publish']);
  });

  test('the rail no longer mentions set up at all', async ({ page: p }) => {
    // Not collapsed — absent. A heading for a group with nothing under it is
    // the shape this replaced.
    await expect(p.locator('nav.rail').getByText('Set up', { exact: true })).toHaveCount(0);
    await expect(p.locator('nav.rail a[href="/onboard"]')).toHaveCount(0);
    await expect(p.locator('nav.rail a[href="/users"]')).toHaveCount(0);
  });

  test('both are in the bar, one click away, with no disclosure to find', async ({ page: p }) => {
    const bar = p.locator('.ctx-setup');

    await expect(bar.locator('a[href="/onboard"]')).toBeVisible();
    await expect(bar.locator('a[href="/users"]')).toBeVisible();
  });

  test('each says what it is for, for somebody who has not been here', async ({ page: p }) => {
    // The hint the rail used to show under the label has to go somewhere.
    await expect(p.locator('.ctx-setup a[href="/onboard"]')).toHaveAttribute(
      'title',
      /Add one, or change what it declares/,
    );
  });

  test('the page you are on still says so', async ({ page: p }) => {
    /*
       The disclosure used to open itself for the current page, so the rail
       could not claim you were nowhere. The bar has the same duty and no
       disclosure to open.
    */
    await p.setContent(page({ current: '/users' }));

    await expect(p.getByRole('link', { name: /Test users/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('telling the two halves of the bar apart', () => {
  /*
     Item 77. Item 75 put the set-up links at the end of the switcher's row and
     stopped there, so the bar was nine elements at one size, one weight and
     one colour, running "which application is this" straight into "go and
     configure the set-up" with nothing between them.

     Measured on the running page before this: .ctx-label, .ctx-env and both
     .ctx-setup-links all computed to the same muted grey with no underline —
     and the label read "Application" while the link 350px along read
     "Applications".
  */
  test('a rule separates the switcher from the set-up links', async ({ page: p }) => {
    const divider = p.locator('.ctx-divider');
    await expect(divider).toHaveCount(1);

    // Between them, not merely present: a rule on the wrong side groups the
    // wrong things and reads as though set up were part of the switcher.
    const rule = (await divider.boundingBox())!;
    const pick = (await p.locator('.ctx-pick').boundingBox())!;
    const setup = (await p.locator('.ctx-setup').boundingBox())!;

    expect(rule.x).toBeGreaterThan(pick.x + pick.width);
    expect(rule.x).toBeLessThan(setup.x);
  });

  test('it is decorative, so it is not read out as content', async ({ page: p }) => {
    // The grouping is in the markup already — .ctx-setup wraps the pair. A
    // screen reader needs that, not a vertical line.
    await expect(p.locator('.ctx-divider')).toHaveAttribute('aria-hidden', 'true');
  });

  test('a bar with no switcher draws no rule, having nothing to separate', async ({ page: p }) => {
    await p.setContent(page({ target: undefined }));

    await expect(p.locator('.ctx-setup a[href="/onboard"]')).toBeVisible();
    await expect(p.locator('.ctx-divider')).toHaveCount(0);
  });

  test('the set-up links look like links before anybody hovers them', async ({ page: p }) => {
    /*
       The defect this replaces: at rest these were styled exactly like the
       captions beside them, and the only thing that said "control" was a
       hover background — which a keyboard and a touchscreen never see.
    */
    const link = p.locator('.ctx-setup-link').first();
    const decoration = await link.evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(decoration).toContain('underline');

    const label = p.locator('.ctx-label').first();
    const [linkColour, labelColour] = await Promise.all([
      link.evaluate((el) => getComputedStyle(el).color),
      label.evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(linkColour, 'a link that matches the caption beside it is not a link').not.toBe(
      labelColour,
    );
  });

  test('the label naming the switcher no longer echoes the link beside it', async ({ page: p }) => {
    // "Application" and "Applications", same row, same grey, one letter apart.
    await expect(p.locator('.ctx-label')).toHaveText('Application');
    await expect(p.locator('.ctx-setup a[href="/onboard"]')).toHaveText('Onboarding');
  });
});
