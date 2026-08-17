import { expect, test } from '@playwright/test';
import { createRouter, failure, html, json, type Route } from '../../src/support/ui/router';
import { dashboardPage } from '../../src/support/onboarding/dashboard-page';
import {
  DASHBOARD_PAGES,
  escapeHtml,
  renderPage,
  type PageLink,
} from '../../src/support/ui/shell';

/** A link with the fields a test does not care about filled in. */
const aLink = (href: string, label: string): PageLink => ({
  href,
  label,
  group: 'Execute',
  hint: 'what this page is for',
});

/**
 * The dashboard shell and its router — phase 0.
 *
 * Nothing here is about onboarding. These are the guards every page added after
 * it inherits, which is the whole reason they were lifted out of the onboarding
 * server rather than left to be restated once per screen.
 */

const page: Route = { method: 'GET', path: '/runs', public: true, handle: () => html('<p>ok</p>') };
const write: Route = { method: 'POST', path: '/api/go', handle: () => json(200, { ok: true }) };
const routes = [page, write];
const handle = createRouter(routes, { token: 'the-token' });

const request = (overrides: Partial<Parameters<typeof handle>[0]> = {}) => ({
  method: 'POST',
  path: '/api/go',
  body: {},
  token: 'the-token',
  host: '127.0.0.1:5599',
  ...overrides,
});

test('a page is public, because a browser cannot carry a token it has not been given', async () => {
  const response = await handle(request({ method: 'GET', path: '/runs', token: null, host: null }));
  expect(response.status).toBe(200);
  expect(response.contentType).toContain('text/html');
});

test('everything that writes is behind the loopback and token checks', async () => {
  /*
     Both are load-bearing. Binding to loopback stops the network; it does not
     stop a page on any origin POSTing to 127.0.0.1, and these endpoints write
     to the repository and start browsers.
  */
  expect((await handle(request({ host: 'evil.example' }))).status).toBe(403);
  expect((await handle(request({ host: null }))).status).toBe(403);
  expect((await handle(request({ token: null }))).status).toBe(403);
  expect((await handle(request({ token: 'guessed' }))).status).toBe(403);
  expect((await handle(request())).status).toBe(200);
});

test('an unknown path is a 404 and a known path with the wrong method is a 405', async () => {
  expect((await handle(request({ path: '/api/nope' }))).status).toBe(404);
  expect((await handle(request({ method: 'DELETE', path: '/api/go' }))).status).toBe(405);
});

test('a handler that throws becomes a response, not a crashed server', async () => {
  const thrower = createRouter(
    [{ method: 'POST', path: '/api/go', handle: () => { throw new Error('inner failure'); } }],
    { token: 'the-token' },
  );
  const response = await thrower(request());
  expect(response.status).toBe(500);
  expect(response.body).toContain('inner failure');
});

test('a custom error mapper wins, so a page can classify its own failures', async () => {
  const mapped = createRouter(
    [{ method: 'POST', path: '/api/go', handle: () => { throw new Error('bad input'); } }],
    { token: 'the-token', onError: (error) => failure(400, String(error)) },
  );
  expect((await mapped(request())).status).toBe(400);
});

test.describe('the shell', () => {
  const content = {
    title: 'Runs',
    eyebrow: 'Results',
    heading: 'What happened',
    lede: 'The last run and the ones before it.',
    body: '<section><p>body</p></section>',
  };

  test('renders one document with the shared stylesheet and the token', () => {
    const rendered = renderPage(content, {
      token: 'abc123',
      pages: [aLink('/runs', 'Runs')],
      current: '/runs',
    });
    expect(rendered).toContain('<!doctype html>');
    expect(rendered).toContain('<title>Runs</title>');
    expect(rendered).toContain('--accent:');
    expect(rendered).toContain('"abc123"');
  });

  test('handles all three theme states, not two', () => {
    // The default "system" setting stamps nothing on the root, so a colour
    // defined only behind [data-theme] never applies there — which is how a
    // page ends up rendering one theme's text on the other theme's ground.
    const rendered = renderPage(content, { token: 't', pages: [], current: '/runs' });
    expect(rendered).toContain('@media (prefers-color-scheme: dark)');
    expect(rendered).toContain(':root:not([data-theme="light"])');
    expect(rendered).toContain(':root[data-theme="dark"]');
  });

  test('shows navigation only when there is somewhere else to go', () => {
    const alone = renderPage(content, { token: 't', pages: [aLink('/runs', 'Runs')], current: '/runs' });
    expect(alone, 'a nav with one entry is furniture pretending to be a choice').not.toContain('<nav');

    const several = renderPage(content, {
      token: 't',
      pages: [aLink('/runs', 'Runs'), aLink('/onboard', 'Onboard')],
      current: '/runs',
    });
    expect(several).toContain('<nav class="rail"');
    expect(several).toContain('aria-current="page"');
  });

  test('escapes page copy, so a target name with an ampersand cannot break a page', () => {
    expect(escapeHtml('Tom & Jerry <script>')).toBe('Tom &amp; Jerry &lt;script&gt;');
    const rendered = renderPage({ ...content, heading: 'A & B' }, { token: 't', pages: [], current: '/' });
    expect(rendered).toContain('A &amp; B');
  });

  test('every page it renders is syntactically valid JavaScript', () => {
    // The guard that exists because a stray newline in an inlined script once
    // killed every handler on a page at parse time, silently.
    //
    // *Every* block, not the first one. The theme restore runs in the head and
    // is now the first, so a check that stopped there would have quietly
    // stopped covering the page's own script — the thing it was written for.
    const rendered = renderPage({ ...content, script: 'const x = 1;' }, { token: 't', pages: [], current: '/' });
    const scripts = [...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length, 'the head restore and the body script').toBeGreaterThanOrEqual(2);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
  });

  test('offers the three theme states it styles, on every page', () => {
    /*
       The palette had all three from the start and nothing ever stamped
       data-theme, so the tool followed the operating system and offered no say
       in it — while the handbook, same design system, had the control. It is
       in the shell, so a page gets it by being a page: this one names no
       target and no pages and still has it.
    */
    const rendered = renderPage(content, { token: 't', pages: [], current: '/runs' });
    expect(rendered).toContain('aria-label="Colour theme"');
    for (const choice of ['light', 'dark', 'auto']) {
      expect(rendered).toContain(`data-theme-choice="${choice}"`);
    }
  });

  test('applies a stored theme in the head, before the body can paint', () => {
    /*
       Ordering is the whole feature. Restore from the body script and somebody
       who chose dark gets a white page first — the flash the choice was made
       to avoid, worst on the pages slowest to render.
    */
    const rendered = renderPage(content, { token: 't', pages: [], current: '/runs' });
    const restore = rendered.indexOf("localStorage.getItem('theme')");
    expect(restore, 'the restore script is missing').toBeGreaterThan(-1);
    expect(restore, 'it has to be inside the head').toBeLessThan(rendered.indexOf('</head>'));
  });
});


// ---------------------------------------------------------------------------
// The shape of the navigation
// ---------------------------------------------------------------------------

const aPage = {
  title: 'Runs',
  eyebrow: 'Results',
  heading: 'What happened',
  lede: 'The last run and the ones before it.',
  body: '<section><p>body</p></section>',
};

const render = (
  options: Partial<Parameters<typeof renderPage>[1]> = {},
  content: Partial<typeof aPage> = {},
) =>
  renderPage(
    { ...aPage, ...content },
    { token: 't', pages: DASHBOARD_PAGES, current: '/runs', ...options },
  );

/**
 * The markup, without the stylesheet.
 *
 * Every class name in the design system appears in the `<style>` block too,
 * so `not.toContain('nav-badge')` against the whole document is always false
 * and the assertion proves nothing. Asked a second time, that is exactly how a
 * test passes while the thing it describes is broken.
 */
const markup = (html: string) => html.slice(html.indexOf('<body>'));

test.describe('the destinations', () => {
  test('read top to bottom as the order the work happens in', () => {
    /*
       Not alphabetical, and not the order the pages were built — which is what
       it was, and which put the end of the pipeline first: Runs, Triage,
       Publish, then Stories, Cases, Onboard.
    */
    expect(DASHBOARD_PAGES.map((page) => page.href)).toEqual([
      '/onboard',
      '/users',
      '/stories',
      '/cases',
      '/runs',
      '/triage',
      '/publish',
    ]);
  });

  test('are grouped into the four stages, in order and without repeating one', () => {
    // A group that appears twice renders two headings with the same name, and
    // the grouping stops meaning anything.
    const seen: string[] = [];
    for (const page of DASHBOARD_PAGES) {
      if (seen[seen.length - 1] !== page.group) seen.push(page.group);
    }
    expect(seen).toEqual(['Set up', 'Author', 'Execute', 'Report']);
  });

  test('every one of them is there exactly once, and says what it is for', () => {
    const hrefs = DASHBOARD_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size, 'a duplicate renders two identical links').toBe(hrefs.length);
    for (const page of DASHBOARD_PAGES) {
      expect(page.hint.length, `${page.href} has no hint`).toBeGreaterThan(10);
    }
  });

  test('are words, not icons — a word is worth a thousand pictures in a nav', () => {
    const html = render();
    for (const page of DASHBOARD_PAGES) {
      expect(html).toContain(`<span class="nav-label">${page.label}</span>`);
    }
  });

  test('mark the one being looked at, and only that one', () => {
    const html = markup(render({ current: '/triage' }));
    expect(html).toContain('href="/triage" aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// What is waiting
// ---------------------------------------------------------------------------

test.describe('the badges', () => {
  test('put what is waiting against the page it is waiting on', () => {
    const html = render({
      badges: {
        '/triage': { count: 4, tone: 'attention', label: '4 failure group(s) waiting' },
      },
    });
    expect(html).toContain('nav-badge attention');
    expect(html).toContain('>4</span>');
    expect(html, 'the number alone is not a sentence').toContain(
      'aria-label="4 failure group(s) waiting"',
    );
  });

  test('a count of zero is no badge at all', () => {
    // "0 waiting" is a thing to read and dismiss on every page load.
    const html = render({
      badges: { '/triage': { count: 0, tone: 'attention', label: 'nothing waiting' } },
    });
    expect(markup(html)).not.toContain('nav-badge');
  });

  test('a page with nothing waiting carries nothing', () => {
    expect(markup(render())).not.toContain('nav-badge');
  });

  test('a number too big for the space is capped rather than breaking the row', () => {
    const html = render({
      badges: { '/triage': { count: 412, tone: 'attention', label: '412 waiting' } },
    });
    expect(html).toContain('>99+</span>');
    expect(html, 'and the real number is still announced').toContain('aria-label="412 waiting"');
  });

  test('a badge on a page that is not in the navigation is ignored', () => {
    const html = render({ badges: { '/nowhere': { count: 9, tone: 'busy', label: 'x' } } });
    expect(markup(html)).not.toContain('nav-badge');
  });
});

// ---------------------------------------------------------------------------
// Which application this is all about
// ---------------------------------------------------------------------------

test.describe('the context bar', () => {
  test('names the selected application on every page', () => {
    // Every page but Onboard is scoped to one, and none of them said which.
    const html = render({ target: { name: 'acme-shop', environment: 'staging' } });
    expect(html).toContain('acme-shop');
    expect(html).toContain('staging');
  });

  test('says so plainly when nothing is selected', () => {
    expect(render({ target: { name: null } })).toContain('none selected');
  });

  test('an application without an environment still renders', () => {
    const html = markup(render({ target: { name: 'acme-shop' } }));
    expect(html).toContain('acme-shop');
    expect(html).not.toContain('ctx-env');
  });

  test('a target name is escaped, like every other value', () => {
    expect(render({ target: { name: 'a<script>&' } })).toContain('a&lt;script&gt;&amp;');
  });
});

// ---------------------------------------------------------------------------
// The right rail
// ---------------------------------------------------------------------------

test.describe('the right rail', () => {
  test('is rendered only by a page that supplies one', () => {
    // A rail with nothing in it is chrome charging rent.
    expect(markup(render())).not.toContain('class="sidecar"');
    expect(renderPage({ ...aPage, aside: '<p>where you are</p>' }, {
      token: 't',
      pages: DASHBOARD_PAGES,
      current: '/runs',
    })).toContain('class="sidecar"');
  });
});

// ---------------------------------------------------------------------------
// Getting past it
// ---------------------------------------------------------------------------

test('a keyboard user can skip the rail', () => {
  // Six links plus four headings on every page is a lot to tab through.
  const html = render();
  expect(html).toContain('class="skip"');
  expect(html).toContain('href="#content"');
  expect(html).toContain('id="content"');
});

test('the section name is said once, not twice forty pixels apart', () => {
  /*
     It was in the context bar and again above the heading. A distinctive value
     on purpose: the first version of this test used the fixture's own
     "Results", which also appears inside the Publish link's hint, and counted
     that as the duplicate it was looking for.
  */
  const body = markup(render({}, { eyebrow: 'Zzyzx' }));
  expect(body.match(/Zzyzx/g), 'the eyebrow appears exactly once').toHaveLength(1);
  expect(body).toContain('class="crumb"');
});

test('the shell forwards every option the onboarding page is given', () => {
  /*
     `dashboardPage` rebuilt the options object field by field, so each option
     added to the shell afterwards was silently dropped on that one page: the
     context bar and the badges rendered empty there and correctly everywhere
     else, which is the hardest kind of difference to notice.
  */
  const html = dashboardPage('t', {
    pages: DASHBOARD_PAGES,
    current: '/onboard',
    target: { name: 'acme-shop', environment: 'uat' },
    badges: { '/triage': { count: 3, tone: 'attention', label: '3 waiting' } },
  });
  expect(html).toContain('acme-shop');
  expect(html).toContain('uat');
  expect(markup(html)).toContain('nav-badge');
});
