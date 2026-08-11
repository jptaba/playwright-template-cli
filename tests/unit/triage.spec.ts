import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import { clusterFailures, normaliseError } from '../../src/support/triage/cluster';
import { classifyByRule, flakyVerdicts } from '../../src/support/triage/rules';
import { buildEvidence, guarded, type TriageAgent } from '../../src/support/triage/agent';
import { validateVerdict, type TriageVerdict } from '../../src/support/triage/types';
import { registerSecret, resetSecretRegistry } from '../../src/support/redact';
import { tally, type RunResult, type TestRecord } from '../../src/support/reporters/run-result';

/**
 * §20 — "the one most likely to be built wrong, because the obvious
 * implementation is to hand every failure to a model and ask what happened."
 *
 * These tests are about the order: cluster, then rules, then the model on the
 * remainder — and about the guardrails that make the model's output usable.
 */

function failing(id: string, message: string, overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id,
    title: `Test ${id}`,
    caseId: `TC-${id}`,
    jiraKey: null,
    caseHash: null,
    file: 'src/targets/demo/tests/e2e/x.spec.ts',
    project: 'e2e',
    kind: 'ui',
    tags: [],
    outcome: 'unexpected',
    status: 'failed',
    firstRunStatus: 'failed',
    retries: 0,
    durationMs: 1000,
    workerIndex: 0,
    error: { message, stack: null, snippet: null },
    steps: [],
    attachments: [],
    annotations: [],
    ...overrides,
  };
}

function runWith(tests: TestRecord[]): RunResult {
  const run = fixtureRun();
  run.tests = tests;
  run.totals = tally(tests);
  return run;
}

test.describe('clustering', () => {
  test('forty tests failing on one incident are one problem, not forty', () => {
    const tests = Array.from({ length: 40 }, (_, index) =>
      failing(`t${index}`, `connect ECONNREFUSED 10.0.0.5:443 at request #${index}`),
    );

    const clusters = clusterFailures(runWith(tests));

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.size).toBe(40);
  });

  test('genuinely different failures stay in separate clusters', () => {
    const clusters = clusterFailures(
      runWith([
        failing('a', 'connect ECONNREFUSED 10.0.0.5:443'),
        failing('b', 'Expected "Rejected" but received "Approved"'),
      ]),
    );
    expect(clusters).toHaveLength(2);
  });

  test('normalisation strips what changes every run and keeps what broke', () => {
    const first = normaliseError('Timeout 30000ms at 2026-03-01T09:00:00Z waiting for order 4821');
    const second = normaliseError('Timeout 45000ms at 2026-03-02T11:00:00Z waiting for order 9137');
    expect(first).toBe(second);
    expect(first).toContain('waiting for order');
  });

  test('clusters are ordered by breadth, because breadth is itself evidence', () => {
    const clusters = clusterFailures(
      runWith([
        failing('a', 'unique failure'),
        ...Array.from({ length: 5 }, (_, i) => failing(`b${i}`, 'shared failure')),
      ]),
    );
    expect(clusters[0]!.size).toBe(5);
  });
});

test.describe('rule classification', () => {
  const classify = (tests: TestRecord[], run = runWith(tests)) => {
    const cluster = clusterFailures(run)[0]!;
    return classifyByRule(cluster, { run, tests });
  };

  test('a connection failure is network, never a locator', () => {
    const verdict = classify([failing('a', 'connect ECONNREFUSED 10.0.0.5:443')]);
    expect(verdict).toMatchObject({ category: 'network-infrastructure', source: 'rule' });
    expect(verdict!.evidence.join(' ')).toContain('ECONNREFUSED');
  });

  test('a schema validation failure is contract drift, and routes to the provider team', () => {
    const verdict = classify([
      failing('a', 'Contract drift on POST /orders: the response no longer validates against the published schema'),
    ]);
    expect(verdict).toMatchObject({
      category: 'contract-drift',
      suggestedOwner: 'provider-team',
      recommendedAction: 'file-defect',
    });
  });

  test('every test failing at login is the environment, not four hundred defects', () => {
    const tests = Array.from({ length: 6 }, (_, index) =>
      failing(`t${index}`, 'Sign-in failed: 401 Unauthorized'),
    );
    const verdict = classify(tests);
    expect(verdict).toMatchObject({ category: 'environment-config', confidence: 'high' });
  });

  test('a 5xx on a valid request is an application fault', () => {
    const verdict = classify([failing('a', 'Read an order: GET /orders/1 returned 503')]);
    expect(verdict).toMatchObject({ category: 'application-defect' });
  });

  test('a dependency that did not answer is not the product', () => {
    const verdict = classify([failing('a', 'PollTimeoutError: timed out waiting for an OTP email')]);
    expect(verdict).toMatchObject({ category: 'dependency' });
  });

  test('an open defect is linked, not re-filed', () => {
    const tests = [failing('a', 'Expected "Rejected" but received "Approved"')];
    const run = runWith(tests);
    const cluster = clusterFailures(run)[0]!;

    const verdict = classifyByRule(cluster, {
      run,
      tests,
      knownIssueFingerprints: new Set([cluster.id]),
    });

    expect(verdict).toMatchObject({ recommendedAction: 'none' });
    expect(verdict!.evidence.join(' ')).toContain('open Jira defect');
  });

  test('a genuine judgement call is left for the model', () => {
    expect(classify([failing('a', 'Expected "Rejected" but received "Approved"')])).toBeNull();
  });

  test('passed-on-retry is flaky by definition and never reaches the model', () => {
    const verdicts = flakyVerdicts(fixtureRun());
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ category: 'flaky', source: 'rule', confidence: 'high' });
    expect(verdicts[0]!.evidence[0]).toContain('first attempt failed');
  });
});

test.describe('the agent contract', () => {
  const evidenceFor = () => {
    const tests = [failing('a', 'Expected "Rejected" but received "Approved"')];
    const run = runWith(tests);
    return buildEvidence(clusterFailures(run)[0]!, run, tests);
  };

  const agentReturning = (verdict: unknown): TriageAgent => ({
    identity: 'test-agent',
    classify: async () => verdict as TriageVerdict,
  });

  const valid: Omit<TriageVerdict, 'clusterId' | 'source'> = {
    category: 'application-defect',
    confidence: 'high',
    summary: 'Approval limit not enforced for amounts over 10,000',
    evidence: ['POST /api/claims returned 201 for amount=15000'],
    affectedTests: ['TC-a'],
    recommendedAction: 'file-defect',
    suggestedOwner: 'payments-team',
    needsHumanReview: false,
  };

  test('accepts a well-formed verdict and marks it as an AI verdict', async () => {
    const verdict = await guarded(agentReturning(valid)).classify(evidenceFor());
    expect(verdict).toMatchObject({ category: 'application-defect', source: 'agent' });
  });

  test('rejects a verdict that cites no evidence', async () => {
    // "A verdict without a specific artifact reference is rejected by the
    // schema validator. This is what makes the output reviewable rather than
    // merely confident-sounding."
    const verdict = await guarded(agentReturning({ ...valid, evidence: [] })).classify(evidenceFor());

    expect(verdict.category).toBe('unclassified');
    expect(verdict.needsHumanReview).toBe(true);
    expect(verdict.evidence.join(' ')).toContain('evidence is required');
  });

  test('rejects a percentage confidence', async () => {
    const problems = validateVerdict({ ...valid, clusterId: 'c1', confidence: '92%' });
    expect(problems.join(' ')).toMatch(/never a percentage/);
  });

  test('rejects a category outside the taxonomy', async () => {
    const verdict = await guarded(
      agentReturning({ ...valid, category: 'probably-the-network' }),
    ).classify(evidenceFor());
    expect(verdict.category).toBe('unclassified');
  });

  test('an agent that throws routes the cluster to a person rather than failing the run', async () => {
    const verdict = await guarded({
      identity: 'broken',
      classify: async () => {
        throw new Error('rate limited');
      },
    }).classify(evidenceFor());

    expect(verdict).toMatchObject({ category: 'unclassified', needsHumanReview: true, source: 'none' });
    expect(verdict.evidence.join(' ')).toContain('rate limited');
  });

  test('evidence is scrubbed before it leaves the process', () => {
    resetSecretRegistry();
    registerSecret('secret_sauce_live', 'vault:qa/app.password');
    const tests = [failing('a', 'login failed using secret_sauce_live')];
    const run = runWith(tests);

    const evidence = buildEvidence(clusterFailures(run)[0]!, run, tests);

    expect(JSON.stringify(evidence)).not.toContain('secret_sauce_live');
    resetSecretRegistry();
  });

  test('evidence carries breadth, which is what makes an infrastructure cause visible', () => {
    const tests = [failing('a', 'boom'), failing('b', 'different')];
    const run = runWith(tests);
    const evidence = buildEvidence(clusterFailures(run)[0]!, run, [tests[0]!]);
    expect(evidence.otherFailuresInWindow).toBe(1);
  });
});
