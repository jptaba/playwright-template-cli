import { expect, test } from '@playwright/test';
import { createRouter, failure, html, json, type Route } from '../../src/support/ui/router';
import { escapeHtml, renderPage } from '../../src/support/ui/shell';

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
      pages: [{ href: '/runs', label: 'Runs' }],
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
    const alone = renderPage(content, { token: 't', pages: [{ href: '/runs', label: 'Runs' }], current: '/runs' });
    expect(alone, 'a nav with one entry is furniture pretending to be a choice').not.toContain('<nav');

    const several = renderPage(content, {
      token: 't',
      pages: [{ href: '/runs', label: 'Runs' }, { href: '/onboard', label: 'Onboard' }],
      current: '/runs',
    });
    expect(several).toContain('<nav class="pages"');
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
    const rendered = renderPage({ ...content, script: 'const x = 1;' }, { token: 't', pages: [], current: '/' });
    const script = /<script>([\s\S]*?)<\/script>/.exec(rendered)?.[1];
    expect(() => new Function(script!)).not.toThrow();
  });
});
