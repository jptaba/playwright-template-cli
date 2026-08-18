import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base, type Page } from '@playwright/test';
import { createRouter, html, json, type Route } from '../../src/support/ui/router';
import { DASHBOARD_PAGES, renderPage, type DashboardPageContent } from '../../src/support/ui/shell';
import { casesPageContent } from '../../src/support/ui/cases-page';
import { publishPageContent } from '../../src/support/ui/publish-page';
import { publishRoutes, type PublishService } from '../../src/support/publish/dashboard';
import { triageRoutes, type TriageService } from '../../src/support/triage/dashboard';
import { triagePageContent } from '../../src/support/ui/triage-page';
import { buildReview, type QuarantineView } from '../../src/support/triage/review';
import type { HumanVerdict } from '../../src/support/triage/verdicts';
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
 * A run carrying `unannotated` specs with no case id, and `failures` failures.
 *
 * The unannotated ones are what Publish lists as unpostable; the failures are
 * what Triage clusters. Both counts are the whole point: they are the lists
 * that had no bound.
 *
 * Each failure carries a distinct message, so clustering produces distinct
 * clusters rather than one. Forty tests failing on one incident is one problem
 * — which is right, and is not the shape that makes a page tall.
 */
function aRun(unannotated: number, failures = 0): RunResult {
  const tests = [
    aTest('t1'),
    ...Array.from({ length: unannotated }, (_, index) =>
      aTest(`u${index}`, {
        caseId: null,
        title: `an unannotated spec number ${index} with a title of a realistic length`,
      }),
    ),
    ...Array.from({ length: failures }, (_, index) =>
      aTest(`f${index}`, {
        caseId: String(6000 + index),
        title: `a spec that fails for reason ${index}`,
        file: `src/targets/demo/tests/e2e/failing-${index}.spec.ts`,
        outcome: 'unexpected',
        status: 'failed',
        firstRunStatus: 'failed',
        error: {
          message: `expect(received).toBe(expected)\n\nExpected: ${index}\nReceived: ${index + 1}`,
          stack: null,
          snippet: null,
        },
        steps: [{ title: `Step ${index}`, durationMs: 900, failed: true }],
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
      status: failures > 0 ? 'failed' : 'passed',
    },
    totals: {
      total: tests.length,
      passed: tests.length - failures,
      failed: failures,
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

function triageService(run: RunResult): TriageService {
  const human: HumanVerdict[] = [];
  return {
    runs: () => [
      {
        id: RUN_ID,
        target: 'demo',
        finishedAt: run.run.finishedAt,
        failures: run.totals.failed,
        source: 'dashboard',
      },
    ],
    run: (id) => (id === RUN_ID ? run : null),
    existingVerdicts: () => [],
    humanVerdicts: () => human,
    record: (verdict) => human.push(verdict),
    quarantine: () => QUARANTINE,
    who: () => 'a tester',
    now: () => '2026-08-17T10:00:00.000Z',
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
  /** Failing specs, each with its own message — Triage's clusters. */
  failures: number;
  cases: { noSpec: number; orphans: number; automated: number };
}

export interface PagesHarness {
  page: Page;
  data: PageData;
  /** Open one of the pages this harness serves. */
  open(path: '/publish' | '/cases' | '/triage'): Promise<void>;
  /** Total document height in screens at the current viewport. */
  screens(): Promise<number>;
  /**
   * The tallest single element inside the page body, and what it is.
   *
   * Sections are excluded, and that is the whole usefulness of the number. A
   * section holding ten things somebody has to work through is legitimately
   * tall; what this is looking for is **one block** with no bound inside it —
   * the 3660px paragraph, the list of every row there happens to be.
   */
  tallestBlock(): Promise<{ label: string; height: number }>;
}

export const test = base.extend<{ pages: PagesHarness }>({
  pages: async ({ page }, use) => {
    const TOKEN = 'a-test-token';
    const data: PageData = {
      unannotated: 0,
      failures: 0,
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
    const routes = (): Route[] => {
      const run = aRun(data.unannotated, data.failures);
      return [
        { method: 'GET', path: '/publish', public: true, handle: () => serve(publishPageContent(), '/publish') },
        ...publishRoutes(publishService(run)),
        { method: 'GET', path: '/cases', public: true, handle: () => serve(casesPageContent(), '/cases') },
        { method: 'POST', path: '/api/cases', handle: () => json(200, aCoverageReport(data.cases)) },
        { method: 'GET', path: '/triage', public: true, handle: () => serve(triagePageContent(), '/triage') },
        ...triageRoutes(triageService(run)),
      ];
    };

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
            if (node.tagName === 'SECTION') continue;
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
