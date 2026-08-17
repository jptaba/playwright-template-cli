import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base, type Page } from '@playwright/test';
import { createRouter } from '../../src/support/ui/router';
import { DASHBOARD_PAGES } from '../../src/support/ui/shell';
import { dashboardPage } from '../../src/support/onboarding/dashboard-page';
import {
  onboardingRoutes,
  type DashboardService,
} from '../../src/support/onboarding/dashboard';
import { EMPTY_DRAFT, type OnboardedApp, type OnboardingDraft } from '../../src/support/onboarding/draft';

/**
 * The onboarding page, driven by a browser, over the routes it really talks to.
 *
 * `tests/framework/` covers the routes with no socket and no browser, and that
 * is the right place for what the server refuses. It cannot cover the half of
 * this feature that is a page: which fields get cleared when the selection
 * changes, whether a preview that refused leaves a button somebody can still
 * press, whether the form empties when you come back to it. That logic is a
 * few hundred lines of DOM code, it is where the defects actually were, and
 * asserting on the string it is rendered from proves nothing about it.
 *
 * So this boots the real router over a real loopback socket, serves the real
 * page, and points a real browser at it. The only thing that is a fake is the
 * `DashboardService` underneath — the browser, the filesystem and the network
 * are exactly what a service must not be in a test, and every one of them is
 * behind that interface already.
 *
 * Each test gets its own server on its own port, so nothing is shared and
 * nothing has to run in sequence.
 */

/** Everything a test wants to see or steer, without reaching into the page. */
export interface Recorder {
  /** Every API call the page made, in order, with its body. */
  calls: { path: string; body: Record<string, unknown> }[];
  /** Drafts the page saved, in order. The last one is what would survive. */
  drafts: OnboardingDraft[];
  /** Bodies posted to `/api/create`, so "was a password echoed" is answerable. */
  created: Record<string, unknown>[];
  /** Paths the fake reports as already existing. Set to force a conflict. */
  conflicts: string[];
  /** Applications the fake reports as onboarded. */
  applications: OnboardedApp[];
  /** The draft the fake starts with. */
  draft: OnboardingDraft;
  /** Bodies of `/api/onboard/update`, to see what an edit actually sends. */
  updates: Record<string, unknown>[];
  /** How many polls the assisted sign-in answers before the browser "closes". */
  assistPollsBeforeClosing: number;
  /** Swapped in per test to change what the probe finds. */
  probeResult: Awaited<ReturnType<DashboardService['probe']>>;
  verifyResult: Awaited<ReturnType<DashboardService['verify']>>;
  vaultCheckResult: Awaited<ReturnType<DashboardService['checkVault']>>;
  assistFinishResult: Awaited<ReturnType<DashboardService['assistFinish']>>;
  removalPlan: ReturnType<DashboardService['planRemoval']>;
  /** Set to make the next call of that path fail, as a real one would. */
  failWith: Record<string, string>;
}

/** A probe that found everything. The happy path unless a test says otherwise. */
export function probeFound(): Recorder['probeResult'] {
  return {
    testIdAttribute: 'data-test',
    testIdCounts: { 'data-test': 42, 'data-testid': 0 },
    signIn: {
      username: 'Email address *',
      password: 'Password *',
      submit: 'Login',
      path: '/auth/login',
    },
    contract: {
      url: 'https://api.shop.test/openapi.json',
      filename: 'openapi.json',
      contents: '{"openapi":"3.0.0","paths":{}}',
    },
    notes: [],
  };
}

export function anApplication(overrides: Partial<OnboardedApp> = {}): OnboardedApp {
  return {
    name: 'shop-one',
    baseURL: 'https://one.shop.test',
    environment: 'staging',
    testIdAttribute: 'data-test',
    roles: ['standard', 'admin'],
    secretSource: 'vault',
    a11yStandard: 'wcag22aa',
    apiBaseURL: 'https://api.one.shop.test',
    include: { api: true, db: false, contracts: true, a11y: true },
    onboardedAt: '2026-08-01T09:30:00.000Z',
    packFiles: 13,
    ...overrides,
  };
}

function fakeService(recorder: Recorder, page: () => string): DashboardService {
  return {
    page,
    existingTargets: () => recorder.applications.map((app) => app.name),
    onboarded: () => recorder.applications,
    readDraft: () => recorder.draft,
    writeDraft: (draft) => {
      recorder.drafts.push(draft);
      recorder.draft = draft;
    },
    assistStart: async () => ({ started: true, detail: 'The browser is open.' }),
    assistPoll: async () => {
      const seen = recorder.calls.filter((call) => call.path === '/api/assist/poll').length;
      return seen > recorder.assistPollsBeforeClosing
        ? { open: false, observed: 0, looksSignedIn: false, summary: [] }
        : { open: true, observed: seen, looksSignedIn: false, summary: [`poll ${seen}`] };
    },
    assistFinish: async () => recorder.assistFinishResult,
    assistCancel: async () => undefined,
    probe: async () => recorder.probeResult,
    verify: async () => recorder.verifyResult,
    checkVault: async ({ path }) => ({ ...recorder.vaultCheckResult, path }),
    existing: (paths) => paths.filter((path) => recorder.conflicts.includes(path)),
    updateProfile: () => ({
      source: '',
      applied: [{ field: 'baseURL', from: 'https://one.shop.test', to: 'https://two.shop.test' }],
      unchanged: [],
      refused: [],
      warnings: [],
    }),
    planRemoval: () => recorder.removalPlan,
    remove: async (plan) => plan.removeFiles,
    create: async (plan) => ({
      written: plan.files.map((file) => file.path),
      skipped: [],
      credentialPaths: [...plan.credentialPaths],
      diagnostics: [],
      nextSteps: plan.nextSteps,
    }),
  };
}

export interface Harness {
  page: Page;
  recorder: Recorder;
  /** Reload, so a test can assert what survives a navigation. */
  reopen(): Promise<void>;
  /** The last body posted to a path, or undefined. */
  lastCall(path: string): Record<string, unknown> | undefined;
}

export const test = base.extend<{ dashboard: Harness }>({
  dashboard: async ({ page }, use) => {
    const TOKEN = 'a-test-token';

    const recorder: Recorder = {
      calls: [],
      drafts: [],
      created: [],
      updates: [],
      conflicts: [],
      applications: [],
      draft: { ...EMPTY_DRAFT },
      removalPlan: {
        target: 'shop-one',
        removeFiles: ['config/targets/shop-one.ts'],
        removeDirectories: ['src/targets/shop-one'],
        removeSecretKeys: [],
        removeStorageStates: [],
        warnings: [],
        refusals: [],
        alreadyGone: false,
      },
      assistPollsBeforeClosing: 100,
      probeResult: probeFound(),
      verifyResult: {
        ok: true,
        marker: { role: 'button', name: 'My account', identitySpecific: false },
        detail: 'Signed in.',
      },
      vaultCheckResult: {
        ok: true,
        path: '',
        exists: true,
        fields: ['username', 'password'],
        detail: 'The credential is there and carries username and password.',
        environment: ['VAULT_ADDR=https://vault.shop.test'],
      },
      assistFinishResult: {
        ok: true,
        detail: 'Session captured.',
        storageState: '.auth/shop.standard.json',
        marker: { role: 'button', name: 'My account', identitySpecific: false },
        gauntlet: [],
        describes: [],
        unattended: { possible: true, reason: 'nothing stood between the password and the page' },
      },
      failWith: {},
    };

    // The same function `tools/dashboard.ts` calls, with the same shell.
    const service = fakeService(recorder, () =>
      dashboardPage(TOKEN, { pages: DASHBOARD_PAGES, current: '/onboard' }),
    );

    const handle = createRouter(onboardingRoutes(service), { token: TOKEN });

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

        if (body) {
          recorder.calls.push({ path: url.pathname, body });
          if (url.pathname === '/api/create') recorder.created.push(body);
          if (url.pathname === '/api/onboard/update') recorder.updates.push(body);
        }

        // A route made to fail, so the page's error path is reachable.
        const forced = recorder.failWith[url.pathname];
        if (forced) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: forced }));
          return;
        }

        const result = await handle({
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
    const url = `http://127.0.0.1:${port}/onboard`;

    const open = async (): Promise<void> => {
      await page.goto(url);
      // The page's own first act. Waiting for it means no test races the
      // dropdown being populated.
      await page.waitForFunction(() => document.querySelectorAll('#pick option').length > 0);
    };

    await open();

    await use({
      page,
      recorder,
      reopen: open,
      lastCall: (path) => recorder.calls.filter((call) => call.path === path).pop()?.body,
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});

export { expect } from '@playwright/test';
