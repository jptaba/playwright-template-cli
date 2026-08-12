import { expect, test } from '@playwright/test';
import { gateCase, shouldEscalateToHuman } from '../../src/support/cases/gate';
import { CaseValidationError, hashCase, parseCase, slugify } from '../../src/support/cases/store';
import type { TestCase } from '../../src/support/cases/schema';

const wellFormed: TestCase = {
  id: '5104',
  target: 'demo',
  title: 'Checkout totals include tax',
  source: { type: 'jira-story', key: 'FIN-2210', contentHash: 'abc123', authoredBy: 'claude-opus-5' },
  coversAC: ['AC-3'],
  acQuoted: 'Order total must show subtotal, 8% tax and grand total.',
  preconditions: ['A shopper account signed in with an empty cart'],
  steps: [
    { action: 'Add two catalogue items to the cart', expected: 'Cart badge shows 2' },
    {
      action: 'Proceed through checkout to the order overview',
      expected: 'Subtotal, tax and total are displayed',
    },
  ],
  assertions: ['Tax equals 8% of the subtotal', 'Total equals subtotal plus tax'],
  priority: 'high',
  type: 'positive',
};

test.describe('the quality gate', () => {
  test('passes a case a human could follow', () => {
    const result = gateCase(wellFormed);
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  test('rejects the case the plan names: "Verify the report is correct"', () => {
    const vague: TestCase = {
      ...wellFormed,
      title: 'Verify the report',
      preconditions: [],
      steps: [{ action: 'Open the report', expected: 'The report is correct' }],
      assertions: ['The report works properly'],
    };

    const result = gateCase(vague);

    expect(result.passed).toBe(false);
    const checks = result.findings.map((finding) => finding.check);
    expect(checks).toContain('preconditions');
    expect(checks).toContain('vague-expectation');
    expect(checks).toContain('vague-assertion');
    expect(checks).toContain('input-data');
  });

  test('every finding names a remedy, because it is routed back to an author', () => {
    const result = gateCase({ ...wellFormed, preconditions: [] });
    for (const finding of result.findings) {
      expect(finding.remedy.length).toBeGreaterThan(10);
    }
  });

  test('"as expected" is not an expected result', () => {
    const result = gateCase({
      ...wellFormed,
      assertions: ['The totals behave as expected'],
    });
    expect(result.passed).toBe(false);
  });

  test('accepts a concrete statement that happens to contain a soft word', () => {
    const result = gateCase({
      ...wellFormed,
      assertions: ['A valid claim of £250 is accepted and shows status "Approved"'],
    });
    expect(result.passed).toBe(true);
  });

  test('an AI-authored case with no cited criterion is blocked, not published', () => {
    const uncited: TestCase = { ...wellFormed, coversAC: [], acQuoted: '' };

    const result = gateCase(uncited);

    expect(result.passed).toBe(false);
    expect(result.findings.map((finding) => finding.check)).toContain('coverage');
  });

  test('a case pulled from PractiTest warns rather than blocks on a missing criterion', () => {
    // Track B cases predate the AC convention; blocking them would reject an
    // entire legacy suite for a field nobody was asked to fill in.
    const trackB: TestCase = {
      ...wellFormed,
      source: { type: 'practitest', key: '5104', contentHash: 'x', authoredBy: null },
      coversAC: [],
      acQuoted: '',
    };

    const result = gateCase(trackB);

    expect(result.passed).toBe(true);
    expect(result.findings.map((finding) => finding.check)).toContain('coverage');
  });

  test('a failed retry escalates to a person rather than looping', () => {
    // "A model that keeps rewriting a case until it satisfies a specificity
    // checker will eventually satisfy it by inventing the missing specifics."
    expect(shouldEscalateToHuman(1)).toBe(false);
    expect(shouldEscalateToHuman(2)).toBe(true);
  });
});

test.describe('the case store', () => {
  test('rejects a case missing a required field rather than half-loading it', () => {
    expect(() => parseCase('title: only a title\n', 'x.yaml')).toThrow(CaseValidationError);
  });

  test('rejects unknown fields, so a typo is not silently ignored', () => {
    const yaml = `
id: null
target: demo
title: A case with a typo in a field name
source: { type: human, key: SD-1, contentHash: x, authoredBy: null }
coversAC: []
acQuoted: ''
preconditions: [signed in]
steps: [{ action: do the thing, expected: it happened }]
assertions: [the thing happened]
priority: high
type: positive
assertionz: [oops]
`;
    expect(() => parseCase(yaml, 'x.yaml')).toThrow(/assertionz|additional/i);
  });

  test('the case hash tracks meaning, not presentation', () => {
    const renamed = { ...wellFormed, priority: 'low' as const };
    const restepped = {
      ...wellFormed,
      steps: [{ action: 'Add three catalogue items', expected: 'Cart badge shows 3' }],
    };

    // Priority is metadata: a spec written against this case is still correct.
    expect(hashCase(renamed)).toBe(hashCase(wellFormed));
    // A changed step means the spec now tests a previous version of the case.
    expect(hashCase(restepped)).not.toBe(hashCase(wellFormed));
  });

  test('slugs are stable, lowercase and bounded', () => {
    expect(slugify('Checkout totals include tax')).toBe('checkout-totals-include-tax');
    expect(slugify('TC-4821 · Claim > limit!')).toBe('tc-4821-claim-limit');
  });
});
