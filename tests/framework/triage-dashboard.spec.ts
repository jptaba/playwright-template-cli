import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { triageRoutes, type TriageService } from '../../src/support/triage/dashboard';
import {
  agreementOf,
  appendVerdict,
  latestVerdicts,
  readVerdicts,
  type HumanVerdict,
} from '../../src/support/triage/verdicts';
import type { QuarantineView } from '../../src/support/triage/review';
import { createRouter, type UiRequest } from '../../src/support/ui/router';
import { triagePageContent } from '../../src/support/ui/triage-page';
import type { RunResult, TestRecord } from '../../src/support/reporters/run-result';
import type { TriageCategory } from '../../src/support/triage/types';

/**
 * Triage, with ground truth — §20, §08 phase 5.
 *
 * "Rules that classify something the fixture says is a different category are
 * wrong and should be tightened. Rules that decline to classify a genuine
 * judgement call are correct — the model exists for those."
 *
 * The `triage-fixture` project is a per-target thing and main carries no
 * target pack that has one, so the ground truth here is a run model whose
 * causes are recorded beside each failure. It is the same measurement: known
 * cause in, category out, compared.
 */

interface GroundTruth {
  test: TestRecord;
  /** What it really was. `null` means a genuine judgement call. */
  expected: TriageCategory | null;
}

const failing = (
  id: string,
  caseId: string,
  message: string,
  step: string,
  overrides: Partial<TestRecord> = {},
): TestRecord => ({
  id,
  title: `${id} · a spec that fails`,
  caseId,
  jiraKey: null,
  caseHash: null,
  file: 'targets/demo/tests/e2e/thing.spec.ts',
  project: 'e2e',
  kind: 'ui',
  tags: [],
  outcome: 'unexpected',
  status: 'failed',
  firstRunStatus: 'failed',
  retries: 0,
  durationMs: 1200,
  workerIndex: 0,
  error: { message, stack: null, snippet: null },
  steps: [{ title: step, durationMs: 900, failed: true }],
  attachments: [],
  annotations: [],
  ...overrides,
});

/**
 * Seven failures with causes known in advance: two infrastructure, one 5xx,
 * one contract, and three the rules should decline because the answer
 * genuinely needs a person.
 */
const GROUND_TRUTH: GroundTruth[] = [
  {
    test: failing('t1', '5101', 'page.goto: net::ERR_CONNECTION_REFUSED at /checkout', 'Open the checkout'),
    expected: 'network-infrastructure',
  },
  {
    test: failing('t2', '5102', 'page.goto: net::ERR_CONNECTION_REFUSED at /checkout', 'Open the checkout'),
    expected: 'network-infrastructure',
  },
  {
    test: failing('t3', '5103', 'Request failed with HTTP 500 on POST /orders', 'Place the order'),
    expected: 'application-defect',
  },
  {
    test: failing(
      't4',
      '5104',
      'Contract drift on GET /orders: response no longer validates against the published schema',
      'Read the order',
    ),
    expected: 'contract-drift',
  },
  {
    test: failing(
      't5',
      '5105',
      'expect(received).toBe(expected)\n\nExpected: 4\nReceived: 5',
      'Check the cart badge',
    ),
    // A wrong number is a defect or a stale expectation, and nothing in the
    // text says which. Declining is the right answer.
    expected: null,
  },
  {
    test: failing(
      't6',
      '5106',
      'locator.click: Timeout 15000ms exceeded waiting for getByRole("button", { name: "Pay now" })',
      'Pay',
    ),
    // Renamed button, or a button that never appeared because of a defect
    // upstream. A rule that guesses here is the failure mode, not the feature.
    expected: null,
  },
  {
    test: failing(
      't9',
      '5109',
      [
        "Sign-in for role 'customer' (account 1) did not establish a session.",
        'The form reported no error, so the credential was accepted but no session marker appeared.',
        '- Timeout 10000ms exceeded while waiting on the predicate',
      ].join('\n'),
      'Sign in',
      { project: 'setup:auth', file: 'targets/demo/tests/auth.setup.ts' },
    ),
    /*
       A locked account, a rotated credential and a stale signedInMarker all
       arrive exactly like this, and nothing in the text says which — so this
       must decline, like the two above it.

       It is here because it could not be caught any other way. A per-target
       `triage-fixture` cannot produce it: that project runs with no role and
       does not depend on `setup:auth`, so no spec a target can write makes the
       auth setup fail. This corpus is the only place the case exists.

       Before the `sign-in-setup-failed` rule, this was settled as
       `timing-synchronisation` with high confidence and an action of
       fix-test — because `auth.setup.ts` waits for the marker with
       `expect.poll` and `short-wait` matched the polling. Watched happen on a
       live suite against a genuinely locked account.
    */
    expected: null,
  },
];

const RUN: RunResult = {
  schemaVersion: 1,
  run: {
    id: 'run-2026-08-12-a1b2',
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
  totals: {
    total: 9,
    passed: 1,
    failed: 7,
    flaky: 1,
    skipped: 0,
    expectedFailures: 0,
    byKind: {} as RunResult['totals']['byKind'],
  },
  capabilities: [],
  tests: [
    ...GROUND_TRUTH.map((entry) => entry.test),
    {
      ...failing('t7', '5107', 'transient', 'Sign in'),
      outcome: 'flaky',
      status: 'passed',
      firstRunStatus: 'failed',
      retries: 1,
      error: null,
    },
    { ...failing('t8', '5108', 'x', 'y'), outcome: 'expected', status: 'passed', error: null },
  ],
};

const emptyQuarantine: QuarantineView = {
  candidates: [],
  runs: 0,
  minimumRuns: 5,
  quarantined: [],
};

interface Harness {
  service: TriageService;
  recorded: HumanVerdict[];
}

function harness(overrides: Partial<TriageService> = {}): Harness {
  const recorded: HumanVerdict[] = [];
  const service: TriageService = {
    runs: () => [
      {
        id: RUN.run.id,
        target: RUN.run.target,
        finishedAt: RUN.run.finishedAt,
        failures: 7,
        source: 'dashboard',
      },
    ],
    run: (id) => (id === RUN.run.id ? RUN : null),
    existingVerdicts: () => [],
    humanVerdicts: () => recorded,
    record: (verdict) => recorded.push(verdict),
    quarantine: () => emptyQuarantine,
    who: () => 'a-tester',
    now: () => '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
  return { service, recorded };
}

const call = async (
  service: TriageService,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const handle = createRouter(triageRoutes(service), { token: 'the-token' });
  const request: UiRequest = { method: 'POST', path, body, token: 'the-token', host: '127.0.0.1:1' };
  const response = await handle(request);
  return { status: response.status, body: JSON.parse(response.body) as Record<string, unknown> };
};

const reviewOf = async (service: TriageService) =>
  (await call(service, '/api/triage/review', { runId: RUN.run.id })).body as {
    clusters: Array<{
      id: string;
      size: number;
      tests: Array<{ caseId: string }>;
      verdict: { category: string; source: string; rule?: string } | null;
      human: { category: string } | null;
      agreed: boolean | null;
    }>;
    stats: Record<string, number>;
    flaky: Array<{ evidence: string[] }>;
    agreement: Record<string, unknown>;
  };

test.describe('against causes known in advance', () => {
  test('one connection error across two tests is one incident, not two defects', async () => {
    const review = await reviewOf(harness().service);

    const infrastructure = review.clusters.find((cluster) =>
      cluster.tests.some((entry) => entry.caseId === '5101'),
    )!;
    expect(infrastructure.size).toBe(2);
    expect(infrastructure.tests.map((entry) => entry.caseId)).toEqual(['5101', '5102']);
    expect(infrastructure.verdict?.category).toBe('network-infrastructure');
  });

  test('every failure with a known cause gets that category', async () => {
    const review = await reviewOf(harness().service);
    const categoryFor = (caseId: string): string | null =>
      review.clusters.find((cluster) => cluster.tests.some((entry) => entry.caseId === caseId))
        ?.verdict?.category ?? null;

    for (const { test: record, expected } of GROUND_TRUTH.filter((entry) => entry.expected)) {
      expect(categoryFor(record.caseId!), `${record.caseId} is ${expected}`).toBe(expected);
    }
  });

  test('a genuine judgement call is declined rather than guessed at', async () => {
    // The measurement this fixture exists for cuts both ways: a rule that
    // answers this one is wrong, even though answering looks like progress.
    const review = await reviewOf(harness().service);
    for (const { test: record } of GROUND_TRUTH.filter((entry) => entry.expected === null)) {
      const cluster = review.clusters.find((entry) =>
        entry.tests.some((candidate) => candidate.caseId === record.caseId),
      )!;
      expect(cluster.verdict, `${record.caseId} needs judgement`).toBeNull();
    }
    expect(review.stats.declined).toBe(3);
  });

  test('a test that passed on retry is flaky by definition and never clustered', async () => {
    const review = await reviewOf(harness().service);
    expect(review.flaky[0]!.evidence[0]).toContain('5107');
    for (const cluster of review.clusters) {
      expect(cluster.tests.map((entry) => entry.caseId)).not.toContain('5107');
    }
  });
});

test.describe('recording what a person decided', () => {
  const clusterFor = async (service: TriageService, caseId: string): Promise<string> => {
    const review = await reviewOf(service);
    return review.clusters.find((cluster) => cluster.tests.some((entry) => entry.caseId === caseId))!
      .id;
  };

  test('confirming a verdict records agreement, and the number appears', async () => {
    const { service, recorded } = harness();
    const clusterId = await clusterFor(service, '5101');

    const response = await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'network-infrastructure',
    });

    expect(response.status).toBe(200);
    expect(recorded[0]).toMatchObject({
      clusterId,
      category: 'network-infrastructure',
      automated: { category: 'network-infrastructure', source: 'rule', rule: 'transport-failure' },
      by: 'a-tester',
    });
    expect(response.body.agreement).toMatchObject({ recorded: 1, compared: 1, agreed: 1, rate: 1 });
  });

  test('overruling records the disagreement, which is what tightens a rule', async () => {
    const { service } = harness();
    const clusterId = await clusterFor(service, '5103');

    const response = await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'test-data',
      note: 'the 500 came from a fixture posting an expired token',
    });

    const agreement = response.body.agreement as Record<string, unknown>;
    expect(agreement).toMatchObject({ compared: 1, agreed: 0, rate: 0 });
    expect(agreement.disagreements).toMatchObject([
      { automated: 'application-defect', human: 'test-data', rule: 'server-error' },
    ]);
  });

  test('ruling on a cluster automation declined is not counted against the rate', async () => {
    /*
       The distinction the whole measurement rests on. A rule that declines a
       judgement call behaved correctly; scoring it as a miss would push
       whoever tunes the rules towards guessing, which is the failure mode this
       design exists to avoid.
    */
    const { service } = harness();
    const clusterId = await clusterFor(service, '5105');

    const response = await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'application-defect',
    });

    expect(response.body.agreement).toMatchObject({
      recorded: 1,
      compared: 0,
      declined: 1,
      rate: null,
    });
  });

  test('what the machine said is read from the run, never from the request', async () => {
    // Otherwise the thing being measured supplies its own score.
    const { service, recorded } = harness();
    const clusterId = await clusterFor(service, '5101');

    await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'network-infrastructure',
      automated: { category: 'test-data', source: 'rule', rule: 'invented' },
    });

    expect(recorded[0]!.automated).toMatchObject({ rule: 'transport-failure' });
  });

  test('a category outside the taxonomy is refused, because each one routes somewhere', async () => {
    const { service, recorded } = harness();
    const clusterId = await clusterFor(service, '5101');

    const response = await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'looks-wrong',
    });

    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain('not one of the triage categories');
    expect(recorded).toEqual([]);
  });

  test('a verdict against a cluster this run does not have is refused', async () => {
    const { service, recorded } = harness();
    const response = await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId: 'deadbeef',
      category: 'flaky',
    });
    expect(response.status).toBe(400);
    expect(recorded).toEqual([]);
  });

  test('the run model is never written to', async () => {
    const { service } = harness();
    const before = JSON.stringify(RUN);
    const clusterId = await clusterFor(service, '5101');
    await call(service, '/api/triage/verdict', {
      runId: RUN.run.id,
      clusterId,
      category: 'test-data',
    });
    expect(JSON.stringify(RUN)).toBe(before);
  });

  test('an agent verdict is only used where the rules declined', async () => {
    const { service } = harness({
      existingVerdicts: () => [
        {
          clusterId: 'whatever',
          category: 'test-data',
          confidence: 'low',
          summary: 'the model had an opinion about the connection error',
          evidence: ['e'],
          affectedTests: ['5101'],
          recommendedAction: 'fix-data',
          suggestedOwner: null,
          needsHumanReview: true,
          source: 'agent',
        },
      ],
    });

    const review = await reviewOf(service);
    const infrastructure = review.clusters.find((cluster) =>
      cluster.tests.some((entry) => entry.caseId === '5101'),
    )!;
    // A deterministic answer that cost nothing is not overridden by a
    // probabilistic one that did.
    expect(infrastructure.verdict?.source).toBe('rule');
  });
});

test.describe('the verdict store', () => {
  let file: string;

  test.beforeEach(() => {
    file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'verdicts-')),
      'triage-verdicts.jsonl',
    );
  });

  const entry = (overrides: Partial<HumanVerdict> = {}): HumanVerdict => ({
    runId: 'run-1',
    clusterId: 'c1',
    signature: 'sig',
    automated: { category: 'locator-drift', source: 'rule', rule: 'a-rule' },
    category: 'locator-drift',
    note: null,
    by: 'a-tester',
    at: '2026-08-12T10:00:00.000Z',
    ...overrides,
  });

  test('changing your mind appends rather than edits, and the latest wins', async () => {
    appendVerdict(entry(), file);
    appendVerdict(entry({ category: 'application-defect', at: '2026-08-12T11:00:00.000Z' }), file);

    const all = readVerdicts(file);
    expect(all, 'both lines are kept — the history is the measurement').toHaveLength(2);
    expect(latestVerdicts(all).get('run-1:c1')!.category).toBe('application-defect');
    expect(agreementOf(all)).toMatchObject({ recorded: 1, compared: 1, agreed: 0 });
  });

  test('verdicts on different runs are counted separately', () => {
    const all = [entry(), entry({ runId: 'run-2' })];
    expect(agreementOf(all)).toMatchObject({ recorded: 2, agreed: 2, rate: 1 });
  });

  test('with nothing comparable the rate is null, not zero', () => {
    expect(agreementOf([entry({ automated: null })])).toMatchObject({
      compared: 0,
      declined: 1,
      rate: null,
    });
  });
});

test.describe('the page', () => {
  const page = triagePageContent();

  test('its script is syntactically valid JavaScript', () => {
    expect(() => new Function(page.script!)).not.toThrow();
  });

  test('every element the script reaches for is in the body it ships with', () => {
    const referenced = [...page.script!.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]!);
    expect(referenced.length).toBeGreaterThan(5);
    for (const id of new Set(referenced)) {
      expect(page.body, `#${id} is used by the script`).toContain(`id="${id}"`);
    }
  });
});
