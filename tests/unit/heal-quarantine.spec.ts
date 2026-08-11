import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import { buildHealBrief } from '../../src/support/heal/brief';
import {
  ageInDays,
  flakeCandidates,
  isOverdue,
  isQuarantined,
  loadQuarantine,
  type QuarantineEntry,
} from '../../src/support/quarantine';
import { QUARANTINE_PATH } from '../../src/support/quarantine';
import type { RunResult, TestRecord } from '../../src/support/reporters/run-result';
import type { TriageResult } from '../../src/support/triage/types';

function withFailure(message: string, overrides: Partial<TestRecord> = {}): RunResult {
  const run = fixtureRun();
  run.tests = [
    {
      ...run.tests[1]!,
      error: { message, stack: null, snippet: null },
      ...overrides,
    },
  ];
  return run;
}

test.describe('the healing brief', () => {
  test('offers a locator failure for repair', () => {
    const brief = buildHealBrief(
      withFailure('locator.click: Timeout 15000ms exceeded waiting for locator getByTestId("checkout")'),
    );
    expect(brief.candidates).toHaveLength(1);
    expect(brief.candidates[0]!.kind).toBe('locator');
  });

  test('offers a timing failure for repair', () => {
    const brief = buildHealBrief(withFailure('Timeout 30000ms exceeded while waiting for navigation'));
    expect(brief.candidates[0]!.kind).toBe('timing');
  });

  test('never offers a changed expected value — healing it would erase the coverage', () => {
    // "A locator repair and a bug are indistinguishable from inside the test."
    const brief = buildHealBrief(withFailure('Expected "Rejected" but received "Approved"'));

    expect(brief.candidates).toHaveLength(0);
    expect(brief.escalations[0]!.reason).toContain('erase the coverage');
  });

  test('respects a triage verdict that says this is not a healing job', () => {
    const run = withFailure('waiting for locator getByRole("button")');
    const triage: TriageResult = {
      schemaVersion: 1,
      runId: run.run.id,
      generatedAt: new Date().toISOString(),
      clusters: [
        {
          id: 'c1',
          signature: 's',
          summary: 'i18n bundle broke',
          category: 'application-defect',
          testIds: [run.tests[0]!.id],
          caseIds: [],
          firstSeenAt: run.run.startedAt,
          lastSeenAt: run.run.finishedAt,
          size: 1,
        },
      ],
      verdicts: [
        {
          clusterId: 'c1',
          category: 'application-defect',
          confidence: 'high',
          summary: 'The accessible name changed because the i18n bundle broke',
          evidence: ['every label on the page rendered as a translation key'],
          affectedTests: ['TC-1'],
          recommendedAction: 'file-defect',
          suggestedOwner: 'dev-team',
          needsHumanReview: false,
          source: 'agent',
        },
      ],
      stats: { failures: 1, clusters: 1, resolvedByRule: 0, sentToAgent: 1, needingHumanReview: 0 },
    };

    const brief = buildHealBrief(run, triage);

    // Locator-shaped, but triage says it is a defect — so it is not healed.
    expect(brief.candidates).toHaveLength(0);
    expect(brief.escalations[0]!.reason).toContain('application-defect');
  });

  test('states its constraints in the brief itself, for whoever picks it up', () => {
    const brief = buildHealBrief(fixtureRun());
    expect(brief.constraints.join(' ')).toContain('Never change an assertion');
    expect(brief.constraints.join(' ')).toContain('Never push to a protected branch');
  });

  test('a passing run produces an empty brief rather than busywork', () => {
    const clean = fixtureRun();
    clean.tests = clean.tests.filter((test) => test.outcome === 'expected');
    expect(buildHealBrief(clean).candidates).toEqual([]);
  });
});

test.describe('quarantine', () => {
  const entry: QuarantineEntry = {
    caseId: '5104',
    reason: 'races with the overnight batch',
    since: '2026-01-01T00:00:00.000Z',
    owner: 'a.tester',
    reviewBy: '2026-02-01T00:00:00.000Z',
  };

  test('the committed file is valid and starts empty', () => {
    // Quarantining is a reviewed decision — nothing adds to it automatically.
    expect(loadQuarantine(QUARANTINE_PATH)).toEqual([]);
  });

  test('matches by case id, which survives a spec being renamed', () => {
    expect(isQuarantined('5104', [entry])).toBe(entry);
    expect(isQuarantined('9999', [entry])).toBeNull();
    expect(isQuarantined(null, [entry])).toBeNull();
  });

  test('reports age, so a four-month "temporary" entry is visible', () => {
    const now = Date.parse('2026-03-02T00:00:00.000Z');
    expect(ageInDays(entry, now)).toBe(60);
    expect(isOverdue(entry, now)).toBe(true);
  });

  test('ranks flake candidates by rate, not by count', () => {
    // "A test that fails 1 in 3 runs matters far more than one that failed
    // twice ever." (§18)
    const perRun = [
      ['A', 'B'],
      ['A'],
      ['A'],
      ['B'],
      ['A'],
    ];
    const candidates = flakeCandidates([], perRun, 5, 0.2);

    expect(candidates[0]!.caseId).toBe('A');
    expect(candidates[0]!.rate).toBeCloseTo(0.8, 5);
    expect(candidates.map((candidate) => candidate.caseId)).toEqual(['A', 'B']);
  });

  test('refuses to judge from too little history', () => {
    expect(flakeCandidates([], [['A'], ['A']], 5, 0.2)).toEqual([]);
  });
});
