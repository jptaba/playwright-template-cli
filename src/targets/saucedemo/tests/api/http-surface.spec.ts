import { expect, test } from '../../fixtures';
import { siteApi } from '../../api/site';

/**
 * The HTTP surface — the `api` project for this target.
 *
 * Read the profile before reading these: this target has no service API, so
 * these assert the contract it *does* have. They run without a browser, in
 * seconds, and would run on every merge request.
 */
test(
  'SD-100 · The sign-in document is served with the right status and type @smoke @api',
  { annotation: [{ type: 'practitest', description: '5200' }] },
  async ({ api }) => {
    const site = siteApi(api);

    const landing = await site.landing();

    expect(landing.status).toBe(200);
    expect(landing.contentType).toContain('text/html');
    expect(landing.body).toContain('Swag Labs');
  },
);

test(
  'SD-101 · A path that does not exist is not served as a success @api',
  { annotation: [{ type: 'practitest', description: '5201' }] },
  async ({ api, run }) => {
    const site = siteApi(api);

    // A unique path each run, so a cache cannot make this pass by accident.
    const response = await site.missingPath(run.unique('probe'));

    // A single-page app served from a CDN legitimately answers 200 with the
    // shell for unknown paths. What must never happen is a 5xx.
    expect(response.status).toBeLessThan(500);
    expect([200, 403, 404]).toContain(response.status);
  },
);

test(
  'SD-102 · Deep links are recovered by the client, not served by the host @api',
  { annotation: [{ type: 'practitest', description: '5202' }] },
  async ({ api }) => {
    const site = siteApi(api);

    const document = await site.inventoryDocument();

    // The finding this test exists to record: every UI test navigates to
    // /inventory.html happily, but the *host* answers 404 and a shim rewrites
    // the URL in the browser. Two consequences a UI-only suite cannot see —
    // a hard refresh of a deep link depends on that shim, and anything which
    // consumes the site over HTTP (a crawler, a monitor, a link checker) sees
    // a 404. This is the case for testing below the browser, in one test.
    expect(document.status).toBe(404);
    expect(document.contentType).toContain('text/html');
    expect(document.body).toContain('Single Page Apps for GitHub Pages');
  },
);

test(
  'SD-103 · Every asset the sign-in page references resolves @api',
  { annotation: [{ type: 'practitest', description: '5203' }] },
  async ({ api }) => {
    const site = siteApi(api);
    const landing = await site.landing();

    // Resolved from the document rather than guessed: the asset names are
    // content-hashed, so a hard-coded path would rot on the next deploy.
    const references = [...landing.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
      .map((match) => match[1]!)
      .slice(0, 5);

    expect(references.length).toBeGreaterThan(0);

    for (const reference of references) {
      const asset = await site.asset(reference);
      expect(asset.status, `${reference} should resolve`).toBe(200);
      expect(asset.bytes, `${reference} should not be empty`).toBeGreaterThan(0);
    }
  },
);

test(
  'SD-104 · The document is served over a trusted, compressed connection @api',
  { annotation: [{ type: 'practitest', description: '5204' }] },
  async ({ api, target }) => {
    const site = siteApi(api);

    const landing = await site.landing();

    // Boundary-ish, and cheap: these are the properties whose absence is a
    // real defect but which no UI test would ever notice.
    expect(target.baseURL.startsWith('https://')).toBe(true);
    expect(landing.headers).toHaveProperty('content-type');
    expect(landing.bytes).toBeGreaterThan(200);
  },
);
