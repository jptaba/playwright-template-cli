import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base, type Page } from '@playwright/test';
import { createRouter, html, json, type Route } from '../../src/support/ui/router';
import { DASHBOARD_PAGES, renderPage, type DashboardPageContent } from '../../src/support/ui/shell';
import { casesPageContent } from '../../src/support/ui/cases-page';
import { publishPageContent } from '../../src/support/ui/publish-page';
import { publishRoutes, type PublishService } from '../../src/support/publish/dashboard';
import { buildReview, type QuarantineView } from '../../src/support/triage/review';
import type { CoverageReport, CaseRow, OrphanSpec } from '../../src/support/cases/coverage';
import type { RunResult, TestRecord } from '../../src/support/reporters/run-result';

/**
 * The dashboard pages that are not onboarding, in a browser.
 *
 * There was no such harness, and that is why two of these pages had grown past
 * seven screens without the suite having an opinion: `tests/dashboard/` covered
 * onboarding and the shell, and every other reference to these pages in
 * `tests/` was the onboarding form's own picker. Publish was rendering 192 spec
 * titles joined into one 3660px sentence and every test passed.
 *
 * Built the same way `harness.ts` is, for the same reasons: a real loopback
 * socket, the real page, the real routes, and a fake only at the service
 * boundary the routes already take. What is faked here is a run and a coverage
 * report — the two things that come off a disk this test has no business
 * having.
 *
 * The size of what comes back is a **parameter**, because the defects these
 * pages had were defects of quantity. A page that is fine with three rows and
 * unusable with two hundred is exactly what a fixed fixture hides.
 */

const RUN_ID = 'run-2026-08-17-c3d4';

const aTest = (id: string, overrides: Partial<TestRecord> = {}): TestRecord => ({
  id,
  title: `${id} · place the order`,
  caseId: '5101',
  jiraKey: null,
  caseHash: null,
  file: 'src/targets/demo/tests/e2e/checkout.spec.ts',
  project: 'e2e',
  kind: 'ui',
  tags: [],
  outcome: 'expected',
  status: 'passed',
  firstRunStatus: 'passed',
  retries: 0,
  durationMs: 1200,
  workerIndex: 0,
  error: null,
  steps: [],
  attachments: [],
  annotations: [],
  ...overrides,
});

/**
 * A run carrying `unannotated` specs with no case id.
 *
 * Those are what Publish lists as unpostable, and the number of them is the
 * whole point: it is the list that had no bound.
 */
function aRun(unannotated: number): RunResult {
  const tests = [
    aTest('t1'),
    ...Array.from({ length: unannotated }, (_, index) =>
      aTest(`u${index}`, {
        caseId: null,
        title: `an unannotated spec number ${index} with a title of a realistic length`,
      }),
    ),
  ];
  return {
    schemaVersion: 1,
    run: {
      id: RUN_ID,
      startedAt: '2026-08-17T09:00:00.000Z',
      finishedAt: '2026-08-17T09:04:00.000Z',
      durationMs: 240_000,
      target: 'demo',
      environment: 'test',
      branch: 'main',
      commit: null,
      buildId: null,
      trigger: null,
      status: 'passed',
    },
    totals: {
      total: tests.length,
      passed: tests.length,
      failed: 0,
      flaky: 0,
      skipped: 0,
      byKind: {} as RunResult['totals']['byKind'],
    },
    capabilities: [],
    tests,
  };
}

const QUARANTINE: QuarantineView = { candidates: [], runs: 0, minimumRuns: 5, quarantined: [] };

function publishService(run: RunResult): PublishService {
  return {
    runs: () => [{ id: RUN_ID, target: 'demo', finishedAt: run.run.finishedAt, failures: 0 }],
    run: (id) => (id === RUN_ID ? run : null),
    review: (id) => (id === RUN_ID ? buildReview({ run, human: [], quarantine: QUARANTINE }) : null),
    practitest: () => ({ configured: true, destination: 'project 42 at practitest.example' }),
    jira: () => ({ configured: true, destination: 'project QA at jira.example' }),
    findDefect: async () => null,
    postResults: async (results) => ({ posted: results.length, unresolved: [], failed: [] }),
    createDefect: async () => 'QA-1',
    comment: async () => undefined,
    reopen: async () => null,
  };
}

const aCase = (index: number, status: CaseRow['status']): CaseRow => ({
  file: `cases/demo/case-${index}.yaml`,
  id: String(5000 + index),
  title: `a case about something a user does, number ${index}`,
  target: 'demo',
  priority: 'medium',
  status,
  specs: status === 'automated' ? [`src/targets/demo/tests/e2e/spec-${index}.spec.ts`] : [],
  matchedBy: status === 'automated' ? 'case-id' : null,
  note: null,
  gate: { passed: true, score: 5, findings: [] },
});

const anOrphan = (index: number): OrphanSpec => ({
  file: `src/targets/demo/tests/e2e/orphan-${index}.spec.ts`,
  title: `a spec citing a case that is not there, number ${index}`,
  cites: String(9000 + index),
  citedAs: 'case id',
});

function aCoverageReport(sizes: { noSpec: number; orphans: number; automated: number }): CoverageReport {
  const cases = [
    ...Array.from({ length: sizes.noSpec }, (_, i) => aCase(i, 'no-spec')),
    ...Array.from({ length: sizes.automated }, (_, i) => aCase(100 + i, 'automated')),
  ];
  return {
    cases,
    orphans: Array.from({ length: sizes.orphans }, (_, i) => anOrphan(i)),
    counts: {
      cases: cases.length,
      automated: sizes.automated,
      drifted: 0,
      noSpec: sizes.noSpec,
      orphans: sizes.orphans,
      specs: sizes.automated + sizes.orphans,
    },
  };
}

/** How much each page is given. Every test may set it before opening. */
export interface PageData {
  /** Specs in the run with no case id — Publish's unpostable list. */
  unannotated: number;
  cases: { noSpec: number; orphans: number; automated: number };
}

export interface PagesHarness {
  page: Page;
  data: PageData;
  /** Open one of the pages this harness serves. */
  open(path: '/publish' | '/cases'): Promise<void>;
  /** Total document height in screens at the current viewport. */
  screens(): Promise<number>;
  /** The tallest single element inside the page body, and what it is. */
  tallestBlock(): Promise<{ label: string; height: number }>;
}

export const test = base.extend<{ pages: PagesHarness }>({
  pages: async ({ page }, use) => {
    const TOKEN = 'a-test-token';
    const data: PageData = {
      unannotated: 0,
      cases: { noSpec: 0, orphans: 0, automated: 0 },
    };

    const shell = (current: string) => ({
      token: TOKEN,
      pages: DASHBOARD_PAGES,
      current,
      target: { name: 'demo', environment: 'test' },
    });
    const serve = (content: DashboardPageContent, current: string) =>
      html(renderPage(content, shell(current)));

    /*
       The routes are rebuilt per request rather than once, so a test can set
       `data` and then open the page. Building them in the fixture would freeze
       the sizes at zero, which is the one shape these tests must not be stuck
       with.
    */
    const routes = (): Route[] => [
      { method: 'GET', path: '/publish', public: true, handle: () => serve(publishPageContent(), '/publish') },
      ...publishRoutes(publishService(aRun(data.unannotated))),
      { method: 'GET', path: '/cases', public: true, handle: () => serve(casesPageContent(), '/cases') },
      { method: 'POST', path: '/api/cases', handle: () => json(200, aCoverageReport(data.cases)) },
    ];

    const server = http.createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
        const body: Record<string, unknown> | null =
          request.method === 'POST'
            ? await new Promise((resolve) => {
                let raw = '';
                request.on('data', (chunk) => (raw += chunk));
                request.on('end', () => {
                  try {
                    resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
                  } catch {
                    resolve({});
                  }
                });
              })
            : null;

        const result = await createRouter(routes(), { token: TOKEN })({
          method: request.method ?? 'GET',
          path: url.pathname,
          body,
          token: (request.headers['x-onboard-token'] as string | undefined) ?? null,
          host: request.headers.host ?? null,
        });
        response.writeHead(result.status, { 'Content-Type': result.contentType });
        response.end(result.body);
      })();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    await use({
      page,
      data,
      open: async (path) => {
        await page.goto(`http://127.0.0.1:${port}${path}`);
        // Every one of these pages fills itself from an API call on load.
        // Asserting on the shell before that lands measures an empty page.
        await page.waitForFunction(() => document.querySelector('#content section') !== null);
      },
      screens: async () =>
        page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight),
      tallestBlock: async () =>
        page.evaluate(() => {
          let worst = { label: 'nothing', height: 0 };
          for (const node of Array.from(document.querySelectorAll('#content *'))) {
            const height = node.getBoundingClientRect().height;
            if (height <= worst.height) continue;
            const id = node.id ? `#${node.id}` : '';
            const cls = node.className && typeof node.className === 'string'
              ? `.${node.className.split(' ')[0]}`
              : '';
            worst = { label: node.tagName.toLowerCase() + id + cls, height: Math.round(height) };
          }
          return worst;
        }),
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});

export { expect } from '@playwright/test';
