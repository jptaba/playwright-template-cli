import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import { clusterFailures, normaliseError } from '../../src/support/triage/cluster';
import { classifyByRule, flakyVerdicts } from '../../src/support/triage/rules';
import { buildEvidence, guarded, type TriageAgent } from '../../src/support/triage/agent';
import {
  triageIsForRun,
  validateVerdict,
  type TriageResult,
  type TriageVerdict,
} from '../../src/support/triage/types';
import { GROUND_TRUTH_ANNOTATION, measureAgreement } from '../../src/support/triage/agreement';
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

  /**
   * Taken verbatim from `expect.poll(fn, { message })`, which prints the
   * message as the `Error:` prefix *and* again in the body. That is the
   * primitive these conventions mandate for eventual consistency, so counting
   * raw lines spent the whole window on the message and its own echo — the
   * required style produced the least informative signature in the suite.
   * `expect(value, message)` prints it once and was never affected.
   */
  test('a polled assertion does not spend the window saying itself twice', () => {
    const signature = normaliseError(
      [
        'Error: the listing never changed after the search',
        '',
        'the listing never changed after the search',
        '',
        'expect(received).toBe(expected) // Object.is equality',
      ].join('\n'),
    );

    expect(signature).toContain('Object.is equality');
    expect(signature.match(/the listing never changed/g)).toHaveLength(1);
  });

  test('a blank line does not cost the signature a line of evidence', () => {
    const signature = normaliseError(
      [
        'Error: expect(locator).toBeVisible() failed',
        '',
        "Locator: getByRole('button', { name: 'Open Menu' })",
        'Expected: visible',
      ].join('\n'),
    );

    expect(signature).toContain('Expected: visible');
  });

  /**
   * The counterweight to the two above: dropping a repeat must mean the line
   * before it, not any line that happens to look alike. A stack of near
   * identical rows is what a strict-mode violation *is*, and collapsing it
   * would merge two locators into one signature.
   */
  test('repeated evidence is kept when it is the evidence', () => {
    const signature = normaliseError(
      [
        "Error: strict mode violation: getByRole('link', { name: 'Backpack' }) resolved to 2 elements:",
        '    1) <a id="item_4_img_link"></a>',
        '    2) <a id="item_4_title_link"></a>',
      ].join('\n'),
    );

    expect(signature).toContain('item_4_img_link');
    expect(signature).toContain('item_4_title_link');
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

  test('a browser network failure is network too, not just a Node error code', () => {
    // Chromium reports `net::ERR_CONNECTION_REFUSED`, which contains none of
    // the Node codes. A UI suite against a dead environment produces these
    // almost exclusively, so missing them left the commonest infrastructure
    // failure unclassified.
    const verdict = classify([
      failing('a', 'page.goto: net::ERR_CONNECTION_REFUSED at https://app.internal/'),
    ]);
    expect(verdict).toMatchObject({ category: 'network-infrastructure', confidence: 'high' });
    expect(verdict!.evidence[0]).toContain('net::ERR_CONNECTION_REFUSED');
  });

  test('an unresolvable host is network, however the failure was reported', () => {
    for (const message of [
      'page.goto: net::ERR_NAME_NOT_RESOLVED',
      'connect ENOTFOUND vault.internal',
      'request failed: net::ERR_CERT_AUTHORITY_INVALID',
    ]) {
      expect(classify([failing('a', message)])).toMatchObject({
        category: 'network-infrastructure',
      });
    }
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

test.describe('a triage result belongs to one run', () => {
  test('a file from a different run is not this run\'s triage', () => {
    /*
       `triage-result.json` is a fixed path, so what is sitting there is
       whatever the last triage produced. The report read it without asking,
       and the first green run after a red one rendered "All passed" above
       four failures and a network-infrastructure verdict from a different
       run. Every figure on that page comes from one run, or the page is not
       worth reading.
    */
    expect(triageIsForRun({ runId: 'run-b' }, 'run-a')).toBe(false);
    expect(triageIsForRun({ runId: 'run-a' }, 'run-a')).toBe(true);
    expect(triageIsForRun(null, 'run-a')).toBe(false);
    expect(triageIsForRun(undefined, 'run-a')).toBe(false);
  });
});

test.describe('agreement against a ground-truth fixture', () => {
  const withTruth = (id: string, message: string, expected: string, overrides = {}) =>
    failing(id, message, {
      annotations: [{ type: GROUND_TRUTH_ANNOTATION, description: expected }],
      ...overrides,
    });

  /** The real pipeline, so the measurement is taken over what the rules actually settle. */
  function triaged(tests: TestRecord[]): { run: RunResult; triage: TriageResult } {
    const run = runWith(tests);
    const clusters = clusterFailures(run);
    const verdicts: TriageVerdict[] = [];
    for (const cluster of clusters) {
      const ruled = classifyByRule(cluster, {
        run,
        tests: tests.filter((test) => cluster.testIds.includes(test.id)),
      });
      if (ruled) verdicts.push(ruled);
    }
    return {
      run,
      triage: {
        schemaVersion: 1,
        runId: run.run.id,
        generatedAt: run.run.finishedAt,
        clusters,
        verdicts,
        stats: {
          failures: tests.length,
          clusters: clusters.length,
          resolvedByRule: verdicts.length,
          sentToAgent: 0,
          needingHumanReview: 0,
        },
      },
    };
  }

  test('a rule that settles a failure as the fixture says agrees', () => {
    const { run, triage } = triaged([
      withTruth('a', 'connect ECONNREFUSED 10.0.0.5:443', 'network-infrastructure'),
    ]);
    const agreement = measureAgreement(run, triage);
    expect(agreement.totals.agreed).toBe(1);
    expect(agreement.rows[0]).toMatchObject({ settled: 'network-infrastructure', outcome: 'agreed' });
  });

  test('a rule that settles a failure as something else is contradicted, not agreed', () => {
    // The transport rule is right about the cause and the fixture claims a
    // different one. Exactly one of them is wrong, and this is the measurement
    // that says so instead of a green run that measured nothing.
    const { run, triage } = triaged([
      withTruth('a', 'connect ECONNREFUSED 10.0.0.5:443', 'application-defect'),
    ]);
    expect(measureAgreement(run, triage).totals).toMatchObject({ contradicted: 1, agreed: 0 });
  });

  test('declining a judgement call is a distinct outcome from getting it wrong', () => {
    const { run, triage } = triaged([
      withTruth('a', 'Expected "Rejected" but received "Approved"', 'application-defect'),
    ]);
    const agreement = measureAgreement(run, triage);
    expect(agreement.totals).toMatchObject({ declined: 1, contradicted: 0 });
    expect(agreement.rows[0]!.settled).toBeNull();
  });

  test('a ground-truth spec that passed measures nothing and says so', () => {
    const passed = withTruth('a', 'no error message', 'application-defect', {
      outcome: 'expected' as const,
      status: 'passed' as const,
      firstRunStatus: 'passed' as const,
      error: null,
    });
    const { run, triage } = triaged([passed]);
    expect(measureAgreement(run, triage).totals['not-reproduced']).toBe(1);
  });

  test('a category the taxonomy does not have is a typo, not a disagreement', () => {
    const { run, triage } = triaged([withTruth('a', 'boom', 'app-defect')]);
    const agreement = measureAgreement(run, triage);
    expect(agreement.rows).toHaveLength(0);
    expect(agreement.unknownCategories).toEqual([{ testId: 'a', category: 'app-defect' }]);
  });

  test('specs without the annotation are not measured', () => {
    const { run, triage } = triaged([failing('a', 'connect ECONNREFUSED 10.0.0.5:443')]);
    expect(measureAgreement(run, triage).rows).toHaveLength(0);
  });
});
