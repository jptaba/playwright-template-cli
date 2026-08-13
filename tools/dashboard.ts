#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import {
  CASES_DIR,
  REPO_ROOT,
  RUN_RESULT_PATH,
  STORIES_DIR,
  TRIAGE_RESULT_PATH,
} from '../src/support/paths';
import { dashboardPage } from '../src/support/onboarding/dashboard-page';
import {
  onboardingRoutes,
  type CreateResult,
  type DashboardService,
} from '../src/support/onboarding/dashboard';
import { createRouter, failure, html, json, type Route } from '../src/support/ui/router';
import { renderPage } from '../src/support/ui/shell';
import { runsPageContent } from '../src/support/ui/runs-page';
import { casesPageContent } from '../src/support/ui/cases-page';
import { storiesPageContent } from '../src/support/ui/stories-page';
import { collectCoverage } from '../src/support/cases/collect';
import { CaseValidationError, loadCases, saveCase } from '../src/support/cases/store';
import { authoringRoutes, type AuthoringService } from '../src/support/cases/authoring';
import type { CaseAuthorModel, NormalisedStory } from '../src/support/cases/author';
import type {
  AnthropicCaseAuthor as CaseAuthorClass,
  AuthoringUsage,
} from '../src/integrations/llm/case-author-model';
import { credentialFromEnv } from '../src/support/env-credentials';
import { JiraClient } from '../src/integrations/jira/client';
import { pruneRuns, RunManager, RUNS_DIR } from '../src/support/runs/manager';
import { triagePageContent } from '../src/support/ui/triage-page';
import { triageRoutes, type TriageRunRef, type TriageService } from '../src/support/triage/dashboard';
import { appendVerdict, readVerdicts } from '../src/support/triage/verdicts';
import type { QuarantineView } from '../src/support/triage/review';
import type { TriageResult } from '../src/support/triage/types';
import {
  ageInDays,
  flakeCandidates,
  FLAKE_MINIMUM_RUNS,
  isOverdue,
  loadQuarantine,
} from '../src/support/quarantine';
import { readHistory } from '../src/support/report/history';
import type { RunResult } from '../src/support/reporters/run-result';
import { publishPageContent } from '../src/support/ui/publish-page';
import {
  publishRoutes,
  type DestinationStatus,
  type PublishService,
} from '../src/support/publish/dashboard';
import { buildReview } from '../src/support/triage/review';
import { PractiTestClient } from '../src/integrations/practitest/client';
import { REOPEN_TRANSITIONS } from '../src/support/publish/payloads';
import { diagnose, type TargetFacts } from '../src/support/onboarding/diagnose';
import { planOffboard, type OffboardPlan } from '../src/support/onboarding/offboard';
import { gatherFacts, removeTarget } from './offboard';
import {
  probeTarget,
  verifySignIn,
  type ProbedSignIn,
  type ProbePage,
  type SignInCredentials,
} from '../src/support/onboarding/probe';
import type { ScaffoldOptions, ScaffoldPlan } from '../src/support/onboarding/scaffold';
import type { TargetProfile } from '../config/targets/types';

/**
 * `npm run dashboard` — the local dashboard, and `npm run onboard`, which is the
 * same server opened on the onboarding page.
 *
 * This file is the socket, the browser and the filesystem, and nothing else.
 * Every rule it enforces lives in `src/support/onboarding/dashboard.ts`, which
 * has no I/O in it and is unit-tested — the same split that keeps
 * `parseScaffoldArgs` testable while the CLI around it calls `process.exit`.
 */

const HOST = '127.0.0.1';

/**
 * Minted per run and required on every mutating request.
 *
 * The server binds to loopback, which stops the network reaching it but not the
 * browser: a page on any origin can POST to `http://127.0.0.1:<port>`, and this
 * endpoint writes files into the repository. The token is in the URL that gets
 * opened and in the page that gets served, and nowhere else.
 */
const TOKEN = crypto.randomBytes(24).toString('hex');

function existingTargets(): string[] {
  const directory = path.join(REPO_ROOT, 'config', 'targets');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.ts') && file !== 'types.ts')
    .map((file) => file.replace(/\.ts$/, ''));
}

/** Which of a plan's files already exist. Nothing is ever overwritten. */
function existing(paths: string[]): string[] {
  return paths.filter((relative) => fs.existsSync(path.join(REPO_ROOT, relative)));
}

/**
 * Run something against a real browser pointed at the application.
 *
 * Chromium is launched per operation and closed again: onboarding is a
 * once-per-application act, and a browser left running behind a local server is
 * a surprise nobody wants.
 */
async function withProbePage<T>(work: (page: ProbePage) => Promise<T>): Promise<T> {
  // Imported here rather than at module load so `npm run onboard` starts fast
  // and does not need a browser installed just to serve its own page.
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const raw = await (await browser.newContext()).newPage();

    return await work({
      goto: (url) => raw.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
      evaluate: (script) => raw.evaluate(script),
      ariaSnapshot: () => raw.locator('body').ariaSnapshot(),
      /*
         `domcontentloaded` is the right thing to navigate on and the wrong
         thing to read on. A single-page application has rendered nothing at
         that point, so the first version of this probe counted one test-id
         attribute where the running application has ninety-six, and found no
         sign-in form on a page that plainly has one. Both were reported as
         findings, with no complaint. A probe that reads too early lies.
      */
      settle: async () => {
        await raw.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      },
      hasPasswordField: async (timeoutMs) =>
        raw
          // locator-justification: probing an unknown application, before any vocabulary exists to name its fields.
          .locator('input[type="password"]')
          .first()
          .waitFor({ state: 'visible', timeout: timeoutMs })
          .then(() => true)
          .catch(() => false),
      waitForPasswordGone: async (timeoutMs) =>
        raw
          // locator-justification: probing an unknown application, before any vocabulary exists to name its fields.
          .locator('input[type="password"]')
          .first()
          .waitFor({ state: 'hidden', timeout: timeoutMs })
          .then(() => true)
          .catch(() => false),
      /*
         Through the same `getByRole` lookups the generated locators use — which
         is the point. If this signs in, the pack signs in, because it is the
         same call with the same names.
      */
      submitSignIn: async (fields, credentials) => {
        await raw.getByRole('textbox', { name: fields.username }).fill(credentials.username);
        await raw.getByRole('textbox', { name: fields.password }).fill(credentials.password);
        await raw.getByRole('button', { name: fields.submit }).click();
      },
      url: () => raw.url(),
    });
  } finally {
    await browser.close();
  }
}

const probe = (input: { baseURL: string; apiBaseURL?: string }) =>
  withProbePage((page) =>
    probeTarget(
      page,
      async (url) => {
        const response = await fetch(url, { redirect: 'follow' });
        return { status: response.status, body: await response.text() };
      },
      input,
    ),
  );

const verify = (input: {
  baseURL: string;
  signIn: ProbedSignIn;
  credentials: SignInCredentials;
}) => withProbePage((page) => verifySignIn(page, input));

/**
 * Write the credential entries the profile will look for.
 *
 * Only ever `config/secrets.local.json`, and only when the profile says its
 * source is `local`. A Vault-backed target gets the paths printed and nothing
 * written: the agent writes the reference, a person writes the value.
 */
function writeLocalCredentials(
  credentialPaths: readonly string[],
  credentials: Record<string, { username: string; password: string }>,
): void {
  const file = path.join(REPO_ROOT, 'config', 'secrets.local.json');
  if (!fs.existsSync(file)) return;

  const store = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  for (const credentialPath of credentialPaths) {
    const role = credentialPath.split('/').at(-2) ?? '';
    const supplied = credentials[role];
    if (credentialPath in store) continue;
    store[credentialPath] = supplied ?? { username: 'replace-me', password: 'replace-me' };
  }
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

/**
 * Load the profile that was just written and run the doctor over it.
 *
 * Reported immediately rather than left for a later `npm run target:doctor`,
 * because the whole point of the dashboard is that the thing it produces is
 * finished. A scaffold whose own preflight it never ran is a scaffold that
 * fails a minute later somewhere less obvious.
 */
async function diagnoseWritten(name: string): Promise<CreateResult['diagnostics']> {
  const profilePath = path.join(REPO_ROOT, 'config', 'targets', `${name}.ts`);
  if (!fs.existsSync(profilePath)) return [];

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require(profilePath) as Record<string, unknown>;
  const profile = Object.values(module).find(
    (value): value is TargetProfile =>
      typeof value === 'object' && value !== null && 'capabilities' in value,
  );
  if (!profile) return [];

  const root = path.join(REPO_ROOT, 'src', 'targets', name);
  const packFiles: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
      else packFiles.push(relative);
    }
  };
  if (fs.existsSync(root)) walk(root, '');

  const specPath = profile.capabilities.contracts.spec;
  const facts: TargetFacts = {
    packExists: fs.existsSync(root),
    packFiles,
    // Credentials are not read back. The doctor's own note for "could not
    // check" is the honest answer here, and it keeps this path incapable of
    // touching a value it just wrote.
    resolvableRoles: [],
    credentialsChecked: false,
    contractSpecExists: Boolean(specPath && fs.existsSync(path.join(REPO_ROOT, specPath))),
    env: {
      ...(process.env.MAIL_API_URL ? { MAIL_API_URL: process.env.MAIL_API_URL } : {}),
      ...(process.env.GENERATION_HOST_ALLOWLIST
        ? { GENERATION_HOST_ALLOWLIST: process.env.GENERATION_HOST_ALLOWLIST }
        : {}),
    },
  };
  return diagnose(profile, facts);
}

async function create(
  plan: ScaffoldPlan,
  options: ScaffoldOptions,
  credentials: Record<string, { username: string; password: string }>,
): Promise<CreateResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of plan.files) {
    const full = path.join(REPO_ROOT, file.path);
    if (fs.existsSync(full)) {
      skipped.push(file.path);
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.contents, 'utf8');
    written.push(file.path);
  }

  if (options.secretSource === 'local') {
    writeLocalCredentials(plan.credentialPaths, credentials);
  }

  return {
    written,
    skipped,
    credentialPaths: [...plan.credentialPaths],
    diagnostics: await diagnoseWritten(options.name),
    nextSteps: plan.nextSteps,
  };
}

const service: DashboardService = {
  page: () => dashboardPage(TOKEN, { pages: PAGES, current: '/onboard' }),
  existingTargets,
  probe,
  verify,
  existing,
  /*
     Offboarding shares its planner and its remover with `npm run target:remove`
     rather than reimplementing them. There is one description of what a target
     owns, and one thing that deletes it — a second copy of either is a second
     chance to delete the wrong thing.
  */
  planRemoval: (target) => planOffboard(target, gatherFacts(target)),
  remove: async (plan: OffboardPlan) => removeTarget(plan),
  create,
};

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // A published OpenAPI document can be a megabyte; a request that is tens of
    // megabytes is not one this asked for.
    if (size > 32 * 1024 * 1024) throw new Error('Request body too large.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function open(url: string): void {
  const command =
    process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    spawn(command, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    }).unref();
  } catch {
    // A browser that will not open is not a failure; the URL is printed.
  }
}

/*
   Every page the dashboard serves, mounted on one router.

   Phase 0 has one page, so the navigation does not render — a nav with a single
   entry is furniture pretending to be a choice. Adding the runs page is adding
   a route table and a page module, and nothing else.
*/
const runManager = new RunManager();

/** Every page the dashboard serves. The navigation is built from this. */
const PAGES = [
  { href: '/runs', label: 'Runs' },
  { href: '/triage', label: 'Triage' },
  { href: '/publish', label: 'Publish' },
  { href: '/stories', label: 'Stories' },
  { href: '/cases', label: 'Cases' },
  { href: '/onboard', label: 'Onboard' },
];

const runRoutes: Route[] = [
  {
    method: 'GET',
    path: '/runs',
    public: true,
    handle: () =>
      html(renderPage(runsPageContent(), { token: TOKEN, pages: PAGES, current: '/runs' })),
  },
  {
    method: 'POST',
    path: '/api/runs/start',
    handle: (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const target = String(body.target ?? '').trim();
      if (!target) return json(400, { error: 'Choose an application to run against.' });
      const started = runManager.start({
        target,
        projects: Array.isArray(body.projects)
          ? body.projects.map((entry) => String(entry).trim()).filter(Boolean)
          : [],
        ...(body.grep ? { grep: String(body.grep) } : {}),
        headed: body.headed === true,
        liveView: body.liveView === true,
      });
      return json(200, started);
    },
  },
  {
    method: 'POST',
    path: '/api/runs/cancel',
    handle: (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      runManager.cancel(String(body.id ?? ''));
      return json(200, { cancelled: String(body.id ?? '') });
    },
  },
  {
    method: 'POST',
    path: '/api/runs/view',
    handle: (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      runManager.setExpanded(String(body.id ?? ''), body.expanded === true);
      return json(200, { ok: true });
    },
  },
  {
    method: 'POST',
    path: '/api/runs/frame',
    handle: (request) => {
      // Posted by the live-view fixture inside a running test process.
      const body = (request.body ?? {}) as Record<string, unknown>;
      const id = String(body.id ?? '');
      runManager.recordFrame(id, String(body.frame ?? ''));
      return json(200, { expanded: runManager.isExpanded(id) });
    },
  },
];

/**
 * Track A's I/O, and nothing else — every rule it obeys is in
 * `src/support/cases/authoring.ts`, tested against the same fake Jira server
 * the client's own tests use.
 */
let lastAuthor: { usage: AuthoringUsage } | null = null;

const authoring: AuthoringService = {
  storedStories: () => {
    if (!fs.existsSync(STORIES_DIR)) return [];
    return fs
      .readdirSync(STORIES_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => {
        const file = path.join(STORIES_DIR, name);
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8')) as NormalisedStory;
        } catch (error) {
          // Named rather than skipped: a story file that will not parse is a
          // story that silently stops being offered, and the person looking
          // for it has no way to find out why.
          throw new Error(
            `${path.relative(REPO_ROOT, file)} is not readable JSON: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
  },

  jira: () => {
    const baseURL = process.env.JIRA_BASE_URL;
    // Read through the helper that registers it for redaction, so checking
    // whether a credential exists cannot itself leak one.
    const token = credentialFromEnv('JIRA_PAT');
    if (baseURL && token) return { configured: true };
    return {
      configured: false,
      reason:
        `Reading a story from Jira needs ${!baseURL ? 'JIRA_BASE_URL' : ''}` +
        `${!baseURL && !token ? ' and ' : ''}${!token ? 'JIRA_PAT' : ''}. ` +
        'Stories already in stories/ can be drafted from without either.',
    };
  },

  fetchIssue: async (key) => {
    const client = JiraClient.fromEnvironment();
    try {
      return await client.getIssue(key);
    } finally {
      await client.dispose();
    }
  },

  saveStory: (story) => {
    fs.mkdirSync(STORIES_DIR, { recursive: true });
    const file = path.join(STORIES_DIR, `${story.key}.json`);
    fs.writeFileSync(file, `${JSON.stringify(story, null, 2)}\n`, 'utf8');
    return path.relative(REPO_ROOT, file).split(path.sep).join('/');
  },

  targets: existingTargets,

  /*
     Built per draft, not once: the usage this reports is what that draft cost,
     and a model reused across drafts would report a total that grows while
     looking like a single answer.

     Loaded here rather than at the top of the file because requiring the
     Anthropic SDK costs 2.8 seconds — measured — and a dashboard opened to
     watch a run should not wait for a client it may never use.
  */
  model: async (): Promise<CaseAuthorModel> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AnthropicCaseAuthor } = require('../src/integrations/llm/case-author-model') as {
      AnthropicCaseAuthor: typeof CaseAuthorClass;
    };
    try {
      const author = new AnthropicCaseAuthor();
      lastAuthor = author;
      return author;
    } catch (error) {
      lastAuthor = null;
      throw new Error(
        'The case author could not be created: ' +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'It needs an Anthropic credential in the environment — ANTHROPIC_API_KEY. ' +
          'Nothing was drafted and nothing was written.',
      );
    }
  },

  usage: () => (lastAuthor ? { ...lastAuthor.usage } : null),

  writeCase: (testCase, slug) => {
    const full = path.join(CASES_DIR, testCase.target, `${slug}.yaml`);
    const replaced = fs.existsSync(full);
    const written = saveCase(testCase, slug);
    return {
      file: path.relative(REPO_ROOT, written).split(path.sep).join('/'),
      replaced,
      yaml: fs.readFileSync(written, 'utf8'),
    };
  },

  casesFor: (storyKey) =>
    loadCases()
      .filter((stored) => stored.case.source.key === storyKey)
      .map((stored) => ({
        file: path.relative(REPO_ROOT, stored.file).split(path.sep).join('/'),
        title: stored.case.title,
        speculative: stored.case.speculative === true,
      })),
};

/**
 * Every run model on disk: the ones this dashboard started, and the one a
 * command-line run leaves at the repository root.
 *
 * Re-read on every request rather than cached. The files are the truth and
 * this process did not write them — the same reason the runs page folds the
 * event stream from disk instead of accumulating it in memory.
 */
function runModels(): Array<{ run: RunResult; source: TriageRunRef['source'] }> {
  const found: Array<{ run: RunResult; source: TriageRunRef['source'] }> = [];

  const read = (file: string, source: TriageRunRef['source']): void => {
    if (!fs.existsSync(file)) return;
    try {
      found.push({ run: JSON.parse(fs.readFileSync(file, 'utf8')) as RunResult, source });
    } catch {
      // A half-written model from a run still finishing is not an error worth
      // failing a page over; it appears on the next read.
    }
  };

  if (fs.existsSync(RUNS_DIR)) {
    for (const entry of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) read(path.join(RUNS_DIR, entry.name, 'run-result.json'), 'dashboard');
    }
  }
  read(RUN_RESULT_PATH, 'command-line');

  return found.filter((entry) => entry.run?.run?.id);
}

const triage: TriageService = {
  runs: () =>
    runModels()
      .map(({ run, source }) => ({
        id: run.run.id,
        target: run.run.target,
        finishedAt: run.run.finishedAt,
        failures: run.tests.filter((test) => test.outcome === 'unexpected').length,
        source,
      }))
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),

  run: (id) => runModels().find((entry) => entry.run.run.id === id)?.run ?? null,

  existingVerdicts: (runId) => {
    if (!fs.existsSync(TRIAGE_RESULT_PATH)) return [];
    try {
      const result = JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult;
      // A triage file from a previous run must not leak into this one.
      return result.runId === runId ? result.verdicts : [];
    } catch {
      return [];
    }
  },

  humanVerdicts: () => readVerdicts(),
  record: (verdict) => appendVerdict(verdict),

  quarantine: (): QuarantineView => {
    const flakyPerRun = runModels().map(({ run }) =>
      run.tests
        .filter((test) => test.outcome === 'flaky')
        .map((test) => test.caseId ?? test.title),
    );
    const now = Date.now();
    return {
      candidates: flakeCandidates(readHistory(), flakyPerRun),
      runs: flakyPerRun.length,
      minimumRuns: FLAKE_MINIMUM_RUNS,
      quarantined: loadQuarantine().map((entry) => ({
        ...entry,
        ageDays: ageInDays(entry, now),
        overdue: isOverdue(entry, now),
      })),
    };
  },

  who: () => os.userInfo().username,
  now: () => new Date().toISOString(),
};

/**
 * Publishing's I/O. Both clients are built per call and disposed: this page is
 * used rarely, and a long-lived client holding a token in a process that also
 * serves a browser is a worse trade than reconnecting.
 */
const withJira = async <T>(work: (client: JiraClient) => Promise<T>): Promise<T> => {
  const client = JiraClient.fromEnvironment();
  try {
    return await work(client);
  } finally {
    await client.dispose();
  }
};

const jiraProject = (): string => process.env.JIRA_DEFECT_PROJECT ?? '';

const publish: PublishService = {
  runs: () => triage.runs(),
  run: (id) => triage.run(id),

  review: (runId) => {
    const run = triage.run(runId);
    if (!run) return null;
    return buildReview({
      run,
      existing: triage.existingVerdicts(runId),
      human: triage.humanVerdicts(),
      quarantine: triage.quarantine(),
    });
  },

  practitest: (): DestinationStatus => {
    const baseURL = process.env.PRACTITEST_URL;
    const projectId = process.env.PRACTITEST_PROJECT_ID;
    const token = credentialFromEnv('PRACTITEST_TOKEN');
    if (baseURL && projectId && token) {
      // The destination, never the credential.
      return { configured: true, destination: `project ${projectId} at ${new URL(baseURL).host}` };
    }
    const missing = [
      ...(baseURL ? [] : ['PRACTITEST_URL']),
      ...(projectId ? [] : ['PRACTITEST_PROJECT_ID']),
      ...(token ? [] : ['PRACTITEST_TOKEN']),
    ];
    return { configured: false, reason: `Posting results needs ${missing.join(', ')}.` };
  },

  jira: (): DestinationStatus => {
    const baseURL = process.env.JIRA_BASE_URL;
    const token = credentialFromEnv('JIRA_PAT');
    const project = jiraProject();
    if (baseURL && token && project) {
      return { configured: true, destination: `project ${project} at ${new URL(baseURL).host}` };
    }
    const missing = [
      ...(baseURL ? [] : ['JIRA_BASE_URL']),
      ...(token ? [] : ['JIRA_PAT']),
      ...(project ? [] : ['JIRA_DEFECT_PROJECT']),
    ];
    return { configured: false, reason: `Filing defects needs ${missing.join(', ')}.` };
  },

  findDefect: (fingerprint) =>
    withJira((client) => client.findDefectByFingerprint(jiraProject(), fingerprint)),

  postResults: async (results) => {
    const client = PractiTestClient.fromEnvironment();
    try {
      return await client.postRunResults(results, (message) => console.warn(`  ${message}`));
    } finally {
      await client.dispose();
    }
  },

  createDefect: (input) =>
    withJira((client) => client.createDefect({ ...input, projectKey: jiraProject() })),
  comment: (key, body) => withJira((client) => client.comment(key, body)),
  reopen: (key) => withJira((client) => client.transitionByName(key, REOPEN_TRANSITIONS)),
};

const publishViewRoutes: Route[] = [
  {
    method: 'GET',
    path: '/publish',
    public: true,
    handle: () =>
      html(renderPage(publishPageContent(), { token: TOKEN, pages: PAGES, current: '/publish' })),
  },
  ...publishRoutes(publish),
];

const triageViewRoutes: Route[] = [
  {
    method: 'GET',
    path: '/triage',
    public: true,
    handle: () =>
      html(renderPage(triagePageContent(), { token: TOKEN, pages: PAGES, current: '/triage' })),
  },
  ...triageRoutes(triage),
];

const storyRoutes: Route[] = [
  {
    method: 'GET',
    path: '/stories',
    public: true,
    handle: () =>
      html(renderPage(storiesPageContent(), { token: TOKEN, pages: PAGES, current: '/stories' })),
  },
  ...authoringRoutes(authoring),
];

const caseRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cases',
    public: true,
    handle: () =>
      html(renderPage(casesPageContent(), { token: TOKEN, pages: PAGES, current: '/cases' })),
  },
  {
    method: 'POST',
    path: '/api/cases',
    handle: async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const target = String(body.target ?? '').trim();
      try {
        return json(200, await collectCoverage(target || undefined));
      } catch (error) {
        /*
           A case file that does not parse is this page's commonest failure and
           it is the operator's to fix, not a fault in the server. The loader's
           message names the file and every field that is wrong, so it is worth
           passing through as a 400 rather than becoming a 500 nobody reads.
        */
        if (error instanceof CaseValidationError) return failure(400, error.message);
        throw error;
      }
    },
  },
];

const handle = createRouter(
  [
    ...runRoutes,
    ...triageViewRoutes,
    ...publishViewRoutes,
    ...storyRoutes,
    ...caseRoutes,
    ...onboardingRoutes(service),
  ],
  { token: TOKEN },
);

/**
 * The live stream, handled by the server rather than the router.
 *
 * The router models a request and a response, which is the right model for
 * everything else here and the wrong one for a connection that stays open and
 * pushes. Rather than bend it into something that can hold a socket, streaming
 * stays where the I/O already lives.
 *
 * The token comes in the query string because `EventSource` cannot set headers.
 * That is a weaker place to carry a secret — it lands in logs — which is
 * tolerable for a value minted per run on a loopback-only server, and would not
 * be anywhere else.
 */
function streamRuns(request: http.IncomingMessage, response: http.ServerResponse): void {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`);
  if (url.searchParams.get('token') !== TOKEN) {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Missing or stale session token.' }));
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });

  const push = (): void => {
    const payload = JSON.stringify({ runs: runManager.list(), slotsFree: runManager.slotsFree() });
    response.write(`data: ${payload}

`);
  };

  push();
  // Twice a second: fast enough that a lane change reads as immediate, slow
  // enough that folding a few hundred events costs nothing.
  const timer = setInterval(push, 500);
  request.on('close', () => clearInterval(timer));
}

function main(): void {
  const server = http.createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`);
        if (url.pathname === '/api/runs/stream') {
          streamRuns(request, response);
          return;
        }
        const result = await handle({
          method: request.method ?? 'GET',
          path: url.pathname,
          body: request.method === 'POST' ? await readBody(request) : null,
          token: (request.headers['x-onboard-token'] as string | undefined) ?? null,
          host: request.headers.host ?? null,
        });
        response.writeHead(result.status, {
          'Content-Type': result.contentType,
          // Nothing here should ever be cached, embedded or sniffed.
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          /*
             `img-src data:` is load-bearing, not boilerplate. The live view is
             a JPEG in a data URI, and without it the policy refused every frame
             — the tile rendered a broken-image icon while the frames arriving
             on the wire were perfectly good JPEGs. Nothing external is allowed
             either way.
          */
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
            "img-src 'self' data:; connect-src 'self'",
        });
        response.end(result.body);
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        );
      }
    })();
  });

  const pruned = pruneRuns();
  if (pruned.removed.length > 0) {
    console.log(`Pruned ${pruned.removed.length} old run(s) from .runs/.`);
  }

  /* A dashboard that exits leaving browsers behind is a set of windows nobody
     can explain, so the runs it started go with it. */
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      runManager.cancelAll();
      process.exit(0);
    });
  }

  server.listen(0, HOST, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const url = `http://${HOST}:${port}/`;
    // Runs need this to post frames back, and it is only knowable now.
    runManager.setEndpoint(url, TOKEN);
    console.log(`\nOnboarding dashboard: ${url}`);
    console.log('Bound to loopback only. Press Ctrl+C when the target is created.\n');
    open(url);
  });
}

main();
