import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import { renderReport } from '../../src/support/report/render-html';
import { renderDigest } from '../../src/support/report/render-email';
import { buildTrend, summarise, type HistoryEntry } from '../../src/support/report/history';
import { stripAnsi } from '../../src/support/text';
import {
  firstRunPassRate,
  flakeRate,
  passRate,
  tally,
} from '../../src/support/reporters/run-result';
import type { TriageResult } from '../../src/support/triage/types';

const triage: TriageResult = {
  schemaVersion: 1,
  runId: 'run-fixture-1',
  generatedAt: '2026-03-01T22:05:00.000Z',
  clusters: [
    {
      id: 'c1',
      signature: 'expected-n-received-n',
      summary: 'Tax is not applied at checkout',
      category: 'application-defect',
      testIds: ['t2'],
      caseIds: ['5104'],
      firstSeenAt: '2026-03-01T22:01:00.000Z',
      lastSeenAt: '2026-03-01T22:01:00.000Z',
      size: 1,
    },
  ],
  verdicts: [
    {
      clusterId: 'c1',
      category: 'application-defect',
      confidence: 'high',
      summary: 'Tax is not applied at checkout',
      evidence: ['Overview showed Tax: $0.00 for a £29.99 subtotal'],
      affectedTests: ['5104'],
      recommendedAction: 'file-defect',
      suggestedOwner: 'payments',
      needsHumanReview: false,
      source: 'agent',
    },
  ],
  stats: { failures: 1, clusters: 1, resolvedByRule: 0, sentToAgent: 1, needingHumanReview: 0 },
};

test.describe('the run model', () => {
  test('counts a retried-then-passed test as flaky, not as passed', () => {
    const run = fixtureRun();
    // onTestEnd fires once per attempt; counting there double-counts retries.
    // The aggregate must come from test.outcome() (§18).
    expect(run.totals).toMatchObject({ total: 5, passed: 2, failed: 1, flaky: 1, skipped: 1 });
  });

  test('reports pass rate and flake rate as rates over executed tests', () => {
    const totals = tally(fixtureRun().tests);
    // 4 executed (1 skipped): 2 passed + 1 flaky = 3/4.
    expect(passRate(totals)).toBeCloseTo(0.75, 5);
    expect(flakeRate(totals)).toBeCloseTo(0.25, 5);
  });

  test('first-run pass rate is lower than final pass rate when a test was retried', () => {
    const run = fixtureRun();
    // The honest number: only t1 and t5 passed on the first attempt.
    expect(firstRunPassRate(run.tests)).toBeCloseTo(0.5, 5);
    expect(firstRunPassRate(run.tests)).toBeLessThan(passRate(run.totals));
  });

  test('splits totals by kind, so one number cannot hide a bad slice', () => {
    const run = fixtureRun();
    expect(run.totals.byKind.ui.total).toBe(4);
    expect(run.totals.byKind.api.total).toBe(1);
    expect(run.totals.byKind.contract.total).toBe(0);
  });
});

test.describe('captured text', () => {
  test('strips the ANSI colouring Playwright puts in assertion errors', () => {
    // Invisible in a console, very visible in a report cell, a Jira
    // description, a PractiTest run output, and a cluster signature.
    const coloured = 'Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeNull()';

    expect(stripAnsi(coloured)).toBe('Error: expect(received).toBeNull()');
  });

  test('leaves ordinary text alone', () => {
    expect(stripAnsi('Timeout 30000ms exceeded')).toBe('Timeout 30000ms exceeded');
  });

  test('colour does not change a clustering signature', () => {
    // Otherwise the same failure clusters differently depending on where it
    // ran, which quietly defeats the whole point of clustering.
    const plain = 'Expected "Rejected" but received "Approved"';
    const coloured = 'Expected [32m"Rejected"[39m but received [31m"Approved"[39m';

    expect(stripAnsi(coloured)).toBe(plain);
  });
});

test.describe('the rich report', () => {
  const html = renderReport({ run: fixtureRun(), triage, trend: null, coverage: null });

  test('is self-contained: no CDN, no external stylesheet, no remote script', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
  });

  test('leads with a verdict that reads correctly from across a desk', () => {
    expect(html).toContain('band--fail');
    expect(html).toContain('1 failed');
  });

  test('states status as a word, never colour alone', () => {
    // Semantic colour is a data encoding, and it is never the only signal.
    for (const label of ['Passed', 'Failed', 'Flaky', 'Skipped']) {
      expect(html).toContain(label);
    }
  });

  test('marks an AI verdict as distinct from a rule-derived one', () => {
    expect(html).toContain('AI verdict');
    expect(html).toContain('src--agent');
  });

  test('shows the narrative steps, not just a stack trace', () => {
    expect(html).toContain('Check out as far as the order overview');
    expect(html).toContain('Expected 2.40 but received 0.00');
  });

  test('says a disabled capability is not applicable rather than showing a silent zero', () => {
    expect(html).toContain('not applicable for demo: database assertions off');
  });

  test('names the case id so coverage is traceable, and flags specs without one', () => {
    expect(html).toContain('5104');

    // A spec with no case id cannot be reported against a case and is
    // invisible in the coverage view — the report says so rather than
    // rendering a blank cell (§18).
    const unannotated = fixtureRun();
    unannotated.tests[0]!.caseId = null;
    expect(renderReport({ run: unannotated, trend: null })).toContain('no case id');
  });

  test('escapes untrusted text from test titles and errors', () => {
    const run = fixtureRun();
    run.tests[0]!.title = '<img src=x onerror="alert(1)">';
    const rendered = renderReport({ run, trend: null });
    expect(rendered).not.toContain('<img src=x');
    expect(rendered).toContain('&lt;img src=x');
  });
});

test.describe('the email digest', () => {
  const digest = renderDigest({ run: fixtureRun(), triage, reportUrl: 'https://reports.internal/run/1' });

  test('carries the verdict in the subject, triageable from a lock screen', () => {
    expect(digest.subject).toMatch(/^\[FAIL\]/);
    expect(digest.subject).toContain('1 failed');
    expect(digest.subject).toContain('build 4821');
  });

  test('survives the Word rendering engine: no flexbox, grid, custom properties or media queries', () => {
    expect(digest.html).not.toMatch(/display\s*:\s*(flex|grid)/i);
    expect(digest.html).not.toMatch(/--[a-z-]+\s*:/);
    expect(digest.html).not.toMatch(/@media/i);
    expect(digest.html).not.toMatch(/<style/i); // fully inlined
    expect(digest.html).not.toMatch(/<script/i);
  });

  test('uses table layout at a fixed 600px width', () => {
    expect(digest.html).toContain('width="600"');
    expect(digest.html).toContain('role="presentation"');
  });

  test('has no base64 data: images — Gmail strips them and Outlook blocks them', () => {
    expect(digest.html).not.toContain('data:image');
  });

  test('links the report rather than attaching it, with a VML-wrapped button', () => {
    expect(digest.html).toContain('https://reports.internal/run/1');
    expect(digest.html).toContain('v:roundrect');
    expect(digest.html).toContain('<![endif]-->');
  });

  test('always emits a plain-text alternative part', () => {
    expect(digest.text).toContain('1 failed');
    expect(digest.text).toContain('TOP FAILURES');
    expect(digest.text).not.toContain('<');
  });

  test('inlines the failure detail only when no report host is configured', () => {
    const linked = renderDigest({ run: fixtureRun(), reportUrl: 'https://reports.internal/1' });
    const unhosted = renderDigest({ run: fixtureRun(), reportUrl: null });

    expect(linked.html).not.toContain('Expected 2.40 but received 0.00');
    expect(unhosted.html).toContain('Expected 2.40 but received 0.00');
  });

  test('a clean run reads as passed', () => {
    const clean = fixtureRun();
    clean.tests = clean.tests.filter((testCase) => testCase.outcome === 'expected');
    clean.totals = tally(clean.tests);
    clean.run.status = 'passed';

    expect(renderDigest({ run: clean }).subject).toMatch(/^\[PASS\]/);
  });
});

test.describe('run history', () => {
  const entry = (overrides: Partial<HistoryEntry>): HistoryEntry => ({
    ...summarise(fixtureRun()),
    ...overrides,
  });

  test('computes newly failing and newly fixed against the previous run in the same lane', () => {
    const previous = entry({ runId: 'r1', failedCaseIds: ['5104', '5109'] });
    const current = entry({ runId: 'r2', failedCaseIds: ['5104', '5201'] });

    const trend = buildTrend(current, [previous]);

    expect(trend.newlyFailing).toEqual(['5201']);
    expect(trend.newlyFixed).toEqual(['5109']);
  });

  test('does not mix lanes: a different environment is a different trend', () => {
    const other = entry({ runId: 'r1', environment: 'uat', failedCaseIds: ['9999'] });
    const current = entry({ runId: 'r2', failedCaseIds: [] });

    const trend = buildTrend(current, [other]);

    expect(trend.newlyFixed).toEqual([]);
    expect(trend.recent).toHaveLength(1);
  });

  test('reports flake rate over the window as a rate, not a count', () => {
    const previous = entry({ runId: 'r1', total: 10, skipped: 0, flaky: 2 });
    const trend = buildTrend(entry({ runId: 'r2' }), [previous]);
    expect(trend.windowFlakeRate).toBeCloseTo(0.2, 5);
  });
});
