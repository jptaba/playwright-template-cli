import { expect, test } from '@playwright/test';
import { FakeJiraServer } from '../support/fake-jira-server';
import { FakePractiTestServer } from '../support/fake-practitest-server';
import { JiraClient } from '../../src/integrations/jira/client';
import { PractiTestClient } from '../../src/integrations/practitest/client';
import { publishRoutes, type PublishService } from '../../src/support/publish/dashboard';
import { REOPEN_TRANSITIONS } from '../../src/support/publish/payloads';
import { buildReview, type QuarantineView } from '../../src/support/triage/review';
import { createRouter, type UiRequest } from '../../src/support/ui/router';
import { publishPageContent } from '../../src/support/ui/publish-page';
import type { HumanVerdict } from '../../src/support/triage/verdicts';
import type { RunResult, TestRecord } from '../../src/support/reporters/run-result';

/**
 * Publishing — §14, §15, §08 phase 6.
 *
 * This is the one part of the dashboard that touches somebody else's system,
 * so the tests are mostly about what it refuses: no confirmation, no send; no
 * triage, no ticket; and the same failure twice is one ticket, not two.
 */

const RUN_ID = 'run-2026-08-12-a1b2';

const failing = (id: string, caseId: string, message: string): TestRecord => ({
  id,
  title: `${caseId} · place the order`,
  caseId,
  jiraKey: null,
  caseHash: null,
  file: 'src/targets/demo/tests/e2e/checkout.spec.ts',
  project: 'e2e',
  kind: 'ui',
  tags: [],
  outcome: 'unexpected',
  status: 'failed',
  firstRunStatus: 'failed',
  retries: 0,
  durationMs: 4200,
  workerIndex: 0,
  error: { message, stack: null, snippet: null },
  steps: [{ title: 'Place the order', durationMs: 900, failed: true }],
  attachments: [],
  annotations: [],
});

const RUN: RunResult = {
  schemaVersion: 1,
  run: {
    id: RUN_ID,
    startedAt: '2026-08-12T09:00:00.000Z',
    finishedAt: '2026-08-12T09:04:00.000Z',
    durationMs: 240_000,
    target: 'demo',
    environment: 'test',
    branch: 'main',
    commit: null,
    buildId: null,
    trigger: null,
    status: 'failed',
  },
  totals: { total: 3, passed: 1, failed: 2, flaky: 0, skipped: 0, byKind: {} as RunResult['totals']['byKind'] },
  capabilities: [],
  tests: [
    failing('t1', '5101', 'Request failed with HTTP 500 on POST /orders'),
    failing('t2', '5102', 'expect(received).toBe(expected)\n\nExpected: 4\nReceived: 5'),
    {
      ...failing('t3', '5103', 'x'),
      outcome: 'expected',
      status: 'passed',
      error: null,
      steps: [],
    },
    // No case id: nothing can be posted for it, and that has to be said.
    {
      ...failing('t4', 'x', 'y'),
      caseId: null,
      title: 'an unannotated spec',
      outcome: 'expected',
      status: 'passed',
      error: null,
      steps: [],
    },
  ],
};

const quarantine: QuarantineView = { candidates: [], runs: 0, minimumRuns: 5, quarantined: [] };

interface Harness {
  service: PublishService;
  created: Array<{ summary: string; description: string; fingerprint: string }>;
  comments: Array<{ key: string; body: string }>;
  posted: number;
}

function harness(overrides: Partial<PublishService> = {}, human: HumanVerdict[] = []): Harness {
  const created: Harness['created'] = [];
  const comments: Harness['comments'] = [];
  const state = { posted: 0 };

  const service: PublishService = {
    runs: () => [{ id: RUN_ID, target: 'demo', finishedAt: RUN.run.finishedAt, failures: 2 }],
    run: (id) => (id === RUN_ID ? RUN : null),
    review: (id) => (id === RUN_ID ? buildReview({ run: RUN, human, quarantine }) : null),
    practitest: () => ({ configured: true, destination: 'project 42 at practitest.example' }),
    jira: () => ({ configured: true, destination: 'project QA at jira.example' }),
    findDefect: async () => null,
    postResults: async (results) => {
      state.posted = results.length;
      return { posted: results.length, unresolved: [], failed: [] };
    },
    createDefect: async (input) => {
      created.push(input);
      return `QA-${created.length}`;
    },
    comment: async (key, body) => {
      comments.push({ key, body });
    },
    reopen: async () => 'Reopen Issue',
    ...overrides,
  };

  return {
    service,
    created,
    comments,
    get posted() {
      return state.posted;
    },
  };
}

const call = async (
  service: PublishService,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown>; raw: string }> => {
  const handle = createRouter(publishRoutes(service), { token: 'the-token' });
  const request: UiRequest = { method: 'POST', path, body, token: 'the-token', host: '127.0.0.1:1' };
  const response = await handle(request);
  return {
    status: response.status,
    body: JSON.parse(response.body) as Record<string, unknown>,
    raw: response.body,
  };
};

type Preview = {
  results: { results: Array<Record<string, unknown>>; unreportable: Array<{ reason: string }> };
  defects: Array<{
    clusterId: string;
    summary: string;
    description: string;
    action: string;
    blocked: string | null;
    recommended: boolean;
    fingerprint: string;
  }>;
};

const previewOf = async (service: PublishService): Promise<Preview> =>
  (await call(service, '/api/publish/preview', { runId: RUN_ID })).body as unknown as Preview;

test.describe('the preview is the payload', () => {
  test('results carry the status, the duration and the scrubbed output', async () => {
    const preview = await previewOf(harness().service);

    expect(preview.results.results).toHaveLength(3);
    expect(preview.results.results[0]).toMatchObject({
      caseDisplayId: '5101',
      status: 'FAILED',
      durationSeconds: 4,
    });
    expect(String(preview.results.results[0]!.actualResult)).toContain('HTTP 500 on POST /orders');
    expect(String(preview.results.results[0]!.actualResult)).toContain('Failed at step: Place the order');
  });

  test('a spec with no case id is named rather than quietly dropped', async () => {
    const preview = await previewOf(harness().service);
    expect(preview.results.unreportable.map((entry) => entry.reason)).toContain(
      'no practitest annotation, so there is no case to post against',
    );
  });

  test('the defect body is the wiki markup that will be sent, not a summary of it', async () => {
    const preview = await previewOf(harness().service);
    const defect = preview.defects.find((entry) => entry.summary.includes('500'))!;

    expect(defect.summary).toContain('[application-defect]');
    expect(defect.description).toContain('h3. What failed');
    expect(defect.description).toContain('* 5101 — 5101 · place the order');
    expect(defect.description).toContain('{noformat}');
    expect(defect.action).toBe('create');
    expect(defect.recommended, 'a 5xx is a defect worth filing').toBe(true);
  });
});

test.describe('what it refuses', () => {
  test('nothing is sent without the run id typed back', async () => {
    const results = harness();
    const wrong = await call(results.service, '/api/publish/results', {
      runId: RUN_ID,
      confirm: 'yes',
    });
    expect(wrong.status).toBe(400);
    expect(String(wrong.body.error)).toContain(RUN_ID);
    expect(results.posted).toBe(0);

    const defects = harness();
    const preview = await previewOf(defects.service);
    const none = await call(defects.service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: preview.defects.map((entry) => entry.clusterId),
    });
    expect(none.status).toBe(400);
    expect(defects.created).toEqual([]);
  });

  test('a cluster nobody triaged cannot be filed, even when it is selected', async () => {
    /*
       "Open Jira defects for confirmed failures." An automated filer pointed
       at a broken environment can open hundreds of tickets in one night, and
       a human verdict is what stands in the way.
    */
    const { service, created } = harness();
    const preview = await previewOf(service);
    const untriaged = preview.defects.find((entry) => entry.blocked)!;
    expect(untriaged.blocked).toContain('triaged');

    const response = await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: [untriaged.clusterId],
      confirm: RUN_ID,
    });

    expect(response.status).toBe(200);
    expect(created).toEqual([]);
    expect((response.body.filed as Array<{ action: string }>)[0]!.action).toBe('skipped');
  });

  test('the payload is rebuilt from the run, never taken from the request', async () => {
    const { service, created } = harness();
    const preview = await previewOf(service);
    const fileable = preview.defects.find((entry) => !entry.blocked)!;

    await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: [fileable.clusterId],
      confirm: RUN_ID,
      summary: 'anything I like',
      description: 'and any body I like',
    });

    expect(created[0]!.summary).toBe(fileable.summary);
    expect(created[0]!.description).not.toContain('any body I like');
  });

  test('an unconfigured destination says what is missing and sends nothing', async () => {
    const { service, posted } = harness({
      practitest: () => ({ configured: false, reason: 'Posting results needs PRACTITEST_TOKEN.' }),
    });

    const response = await call(service, '/api/publish/results', { runId: RUN_ID, confirm: RUN_ID });

    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain('PRACTITEST_TOKEN');
    expect(posted).toBe(0);
  });

  test('no credential appears in a preview or a response', async () => {
    // The destination is shown so nobody publishes into the wrong project; the
    // token that reaches it never is.
    const { service } = harness();
    const preview = await call(service, '/api/publish/preview', { runId: RUN_ID });
    expect(preview.raw).toContain('project 42 at practitest.example');
    for (const secret of ['pt-service-token', 'jira-service-pat', 'PTToken', 'Bearer ']) {
      expect(preview.raw, `${secret} must not be in a response`).not.toContain(secret);
    }
  });
});

test.describe('the human verdict decides what the ticket says', () => {
  const humanVerdict = (clusterId: string): HumanVerdict => ({
    runId: RUN_ID,
    clusterId,
    signature: 'sig',
    automated: null,
    category: 'application-defect',
    note: 'the badge count is genuinely wrong',
    by: 'a-tester',
    at: '2026-08-12T10:00:00.000Z',
  });

  test('a triaged cluster becomes fileable, and the ticket carries the human category', async () => {
    const first = await previewOf(harness().service);
    const untriaged = first.defects.find((entry) => entry.blocked)!;

    const { service, created } = harness({}, [humanVerdict(untriaged.clusterId)]);
    const preview = await previewOf(service);
    const now = preview.defects.find((entry) => entry.clusterId === untriaged.clusterId)!;

    expect(now.blocked).toBeNull();
    expect(now.summary).toContain('[application-defect]');

    await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: [now.clusterId],
      confirm: RUN_ID,
    });
    expect(created[0]!.description).toContain('Category: application-defect');
  });
});

test.describe('against the real clients and the fake servers', () => {
  let jira: FakeJiraServer;
  let practitest: FakePractiTestServer;
  let service: PublishService;

  test.beforeEach(async () => {
    jira = new FakeJiraServer();
    practitest = new FakePractiTestServer();
    const jiraURL = await jira.start();
    const practitestURL = await practitest.start();

    practitest.seedCase('5101');
    practitest.seedCase('5102');
    practitest.seedCase('5103');

    const jiraClient = () => new JiraClient({ baseURL: jiraURL, token: 'jira-service-pat' });
    const practitestClient = () =>
      new PractiTestClient({ baseURL: practitestURL, projectId: '42', token: 'pt-service-token' });

    // Every cluster ruled on, so nothing is blocked and both can be filed.
    const ruledOn: HumanVerdict[] = buildReview({ run: RUN, human: [], quarantine }).clusters.map(
      (cluster) => ({
        runId: RUN_ID,
        clusterId: cluster.id,
        signature: cluster.signature,
        automated: null,
        category: 'application-defect',
        note: null,
        by: 'a-tester',
        at: '2026-08-12T10:00:00.000Z',
      }),
    );

    const base = harness().service;
    service = {
      ...base,
      review: () => buildReview({ run: RUN, human: ruledOn, quarantine }),
      findDefect: async (fingerprint) => {
        const client = jiraClient();
        try {
          return await client.findDefectByFingerprint('QA', fingerprint);
        } finally {
          await client.dispose();
        }
      },
      postResults: async (results) => {
        const client = practitestClient();
        try {
          return await client.postRunResults(results);
        } finally {
          await client.dispose();
        }
      },
      createDefect: async (input) => {
        const client = jiraClient();
        try {
          return await client.createDefect({ ...input, projectKey: 'QA' });
        } finally {
          await client.dispose();
        }
      },
      comment: async (key, body) => {
        const client = jiraClient();
        try {
          await client.comment(key, body);
        } finally {
          await client.dispose();
        }
      },
      reopen: async (key) => {
        const client = jiraClient();
        try {
          return await client.transitionByName(key, REOPEN_TRANSITIONS);
        } finally {
          await client.dispose();
        }
      },
    };
  });

  test.afterEach(async () => {
    await jira.stop();
    await practitest.stop();
  });

  test('results reach PractiTest, one post for the run', async () => {
    const response = await call(service, '/api/publish/results', { runId: RUN_ID, confirm: RUN_ID });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ posted: 3, unresolved: [], failed: [] });
    expect(practitest.postedRuns).toHaveLength(3);
    expect(practitest.calls.filter((entry) => entry.includes('runs.json'))).toHaveLength(1);
  });

  test('publishing twice opens one ticket, not two — the fingerprint holds', async () => {
    const preview = await previewOf(service);
    const clusterIds = preview.defects.map((entry) => entry.clusterId);

    const first = await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds,
      confirm: RUN_ID,
    });
    expect((first.body.filed as Array<{ action: string }>).map((entry) => entry.action)).toEqual([
      'created',
      'created',
    ]);
    expect(jira.issues.size).toBe(2);

    const second = await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds,
      confirm: RUN_ID,
    });

    expect((second.body.filed as Array<{ action: string }>).map((entry) => entry.action)).toEqual([
      'commented',
      'commented',
    ]);
    expect(jira.issues.size, 'still two tickets, not four').toBe(2);
    expect(jira.comments).toHaveLength(2);
    expect(jira.comments[0]!.body).toContain(`Failed again in run ${RUN_ID}`);
  });

  test('a resolved defect that fails again is reopened rather than duplicated', async () => {
    const preview = await previewOf(service);
    const one = preview.defects[0]!.clusterId;

    await call(service, '/api/publish/defects', { runId: RUN_ID, clusterIds: [one], confirm: RUN_ID });
    const key = [...jira.issues.keys()][0]!;
    jira.issues.get(key)!.fields.status = { name: 'Done' };

    const again = await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: [one],
      confirm: RUN_ID,
    });

    expect((again.body.filed as Array<{ action: string }>)[0]!.action).toBe('reopened');
    expect(jira.transitionsApplied).toHaveLength(1);
    expect(jira.issues.size).toBe(1);
  });

  test('the ticket carries the fingerprint label, which is what makes the second run find it', async () => {
    const preview = await previewOf(service);
    await call(service, '/api/publish/defects', {
      runId: RUN_ID,
      clusterIds: [preview.defects[0]!.clusterId],
      confirm: RUN_ID,
    });

    const issue = [...jira.issues.values()][0]!;
    expect(issue.fields.labels).toContain(`qa-fp-${preview.defects[0]!.fingerprint}`);
    expect(issue.fields.labels).toContain('env-test');
    expect(issue.fields.labels).toContain('automated-test');
  });
});

test.describe('the page', () => {
  const page = publishPageContent();

  test('its script is syntactically valid JavaScript', () => {
    expect(() => new Function(page.script!)).not.toThrow();
  });

  test('every element the script reaches for is in the body it ships with', () => {
    const referenced = [...page.script!.matchAll(/\$\('([^']+)'\)/g)]
      .map((match) => match[1]!)
      // Built per defect at runtime, so they are not in the static body.
      .filter((id) => !id.startsWith("d-' +"));
    expect(referenced.length).toBeGreaterThan(5);
    for (const id of new Set(referenced)) {
      expect(page.body, `#${id} is used by the script`).toContain(`id="${id}"`);
    }
  });
});
