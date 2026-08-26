import { expect, test } from '@playwright/test';
import { gateCase, shouldEscalateToHuman } from '../../src/support/cases/gate';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CaseValidationError,
  hashCase,
  parseCase,
  recordPublishedHash,
  slugify,
} from '../../src/support/cases/store';
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


/**
 * The half of hop 2 that was missing, and the four months it cost.
 *
 * "Each artifact stores a hash of the one upstream, and a CI check flags
 * anything whose upstream changed" — except publishing never wrote one back.
 * `publishPayload` computed the hash, sent it to PractiTest and forgot it, so
 * a case file recorded nothing about what it was published at.
 *
 * Which left `caseHash` as a field a hand-written case could simply contain.
 * Ten of them did, with values never derived from their content, and
 * `hashes:check` reported that as "the case was edited after its hash was
 * recorded" in every CI run — an edit nobody had made, named as the one cause
 * it was not.
 */
test.describe('recording the hash a case was published at', () => {
  const scratch = (): { dir: string; file: string } => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cases-'));
    return { dir, file: path.join(dir, 'a-case.yaml') };
  };

  test('writes the hash of the content it published, into the file it came from', () => {
    const { dir, file } = scratch();
    try {
      const recorded = recordPublishedHash(file, wellFormed);

      expect(recorded).toBe(hashCase(wellFormed));
      const written = parseCase(fs.readFileSync(file, 'utf8'), file);
      expect(written.caseHash).toBe(hashCase(wellFormed));
      // And the rest of the case survives the rewrite intact.
      expect(written.title).toBe(wellFormed.title);
      expect(written.steps).toEqual(wellFormed.steps);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rewrites the file it was given rather than deriving a name', () => {
    /*
       Going through `saveCase` would re-derive the filename from a slug, so a
       re-publish after a title change would leave a second copy of the case
       behind under the old name — two records of one case, which is the exact
       thing case identity exists to prevent.
    */
    const { dir, file } = scratch();
    try {
      recordPublishedHash(file, { ...wellFormed, title: 'A completely different title' });
      expect(fs.readdirSync(dir)).toEqual(['a-case.yaml']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a case that was never published carries no hash to drift from', () => {
    const { dir, file } = scratch();
    try {
      recordPublishedHash(file, wellFormed);
      const withoutHash = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('caseHash:'))
        .join('\n');

      /*
         The honest state for a hand-written case, and what the ten fabricated
         ones should always have been. The schema allows the field to be
         absent, so `hashes:check` has nothing to compare and reports nothing.
         Publishing is what earns it.
      */
      const parsed = parseCase(withoutHash, file);
      expect(parsed.caseHash).toBeUndefined();
      expect(parsed.title).toBe(wellFormed.title);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * A case that says the application *reports* something, without saying what.
 *
 * The gap generation made visible, and it is a case defect rather than an
 * authoring one. A spec author is forbidden from reading the running
 * application — precisely so its current behaviour cannot become the oracle —
 * so an unquoted message is a message that gets **guessed**. Watched live: a
 * case asserting "the form states that the username is already in use"
 * produced `toContain('already in use')` against an application that says
 * **"Already exists"**.
 *
 * §"Locators" already states the rule for bounds — read them from the
 * application, never write one down — and OHRM-2-01 quotes "Should have at
 * least 7 characters" for exactly this reason. A message is the same kind of
 * fact.
 */
test.describe('the unquoted-message warning', () => {
  const withAssertions = (assertions: string[]): TestCase => ({
    ...wellFormed,
    assertions,
  });

  const checks = (testCase: TestCase): string[] =>
    gateCase(testCase).findings.map((finding) => finding.check);

  test('warns when a case says the form states something and does not say what', () => {
    const result = gateCase(withAssertions(['The form states that the username is taken']));
    expect(result.findings.map((finding) => finding.check)).toContain('unquoted-message');
    // A warning, never a blocker: "an error is shown" is a legitimate claim
    // about presence, and refusing it would teach people to invent a quote.
    expect(result.passed).toBe(true);
  });

  test('is satisfied by the application\'s own words', () => {
    expect(checks(withAssertions(['The form reports exactly "Already exists"']))).not.toContain(
      'unquoted-message',
    );
  });

  test('accepts a regular expression as a quotation too', () => {
    expect(checks(withAssertions(['The banner matches /already exists/i']))).not.toContain(
      'unquoted-message',
    );
  });

  /*
     Both corrections made against the real cases in this repository. A warning
     that fires on a correct assertion teaches people to ignore the check.
  */
  test('does not fire on elements being absent, which quote nothing', () => {
    expect(checks(withAssertions(['No product cards are shown']))).not.toContain(
      'unquoted-message',
    );
  });

  test('does not fire on a number that happens to be reported', () => {
    expect(
      checks(withAssertions(['The reported total is at least as large as the page count'])),
    ).not.toContain('unquoted-message');
  });

  test('stays quiet across every case this repository actually holds', () => {
    // Swept live when the rule landed: 12 cases, 5 packs, zero warnings. This
    // pins the property rather than the sweep.
    for (const assertion of [
      'No session is established',
      'The sign-in form is still on screen',
      'Tax equals 8% of the subtotal',
      'The cart badge shows 2',
      'The second user is not saved',
    ]) {
      expect(checks(withAssertions([assertion])), assertion).not.toContain('unquoted-message');
    }
  });
});
