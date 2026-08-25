import { expect, test } from '@playwright/test';
import {
  MAX_REPAIR_ATTEMPTS,
  NO_VERDICT,
  claimsUnchanged,
  dispositionFor,
  extractClaims,
  outcomeOf,
  shouldContinue,
  type RepairAttempt,
} from '../../src/support/cases/repair';
import { TRIAGE_CATEGORIES, type TriageCategory } from '../../src/support/triage/types';

/**
 * Phase 3 — the repair loop's two guards.
 *
 * Both are safety-critical in a way the rest of this programme is not. A wrong
 * verdict-to-action mapping lets the loop repair a real defect into silence; a
 * weak claims check lets it do the same thing one level down, by editing the
 * assertion instead of the application. So both are tested exhaustively rather
 * than representatively — every category, and every way a claim can move.
 */

const attempt = (over: Partial<RepairAttempt> = {}): RepairAttempt => ({
  attempt: 1,
  passed: false,
  category: null,
  disposition: NO_VERDICT,
  error: null,
  refusals: [],
  ...over,
});

test.describe('the hardening policy', () => {
  /*
     Exhaustive on purpose. A category added to the taxonomy without a decision
     here would otherwise arrive as `undefined` and be read as falsy — which is
     the shape of bug that ends with a loop repairing something it must not.
  */
  test('every category in the taxonomy has a decision', () => {
    for (const category of TRIAGE_CATEGORIES) {
      const disposition = dispositionFor({ category });
      expect(disposition, `no disposition for ${category}`).toBeTruthy();
      expect(['repair', 'retry', 'stop']).toContain(disposition.act);
      expect(disposition.why.length, `${category} has no stated reason`).toBeGreaterThan(20);
    }
  });

  test('an application defect stops the loop and is reported as a finding', () => {
    const disposition = dispositionFor({ category: 'application-defect' });
    expect(disposition.act).toBe('stop');
    expect(disposition.finding).toBe(true);
  });

  test('contract drift is a finding too — it is the provider that moved', () => {
    expect(dispositionFor({ category: 'contract-drift' })).toMatchObject({
      act: 'stop',
      finding: true,
    });
  });

  /*
     The loop cannot fix its own oracle. Re-drafting from a wrong case produces
     the same spec, so looping on it is guaranteed to be wasted and may look
     like progress.
  */
  test('a defective case stops without being called a finding', () => {
    const disposition = dispositionFor({ category: 'case-defect' });
    expect(disposition.act).toBe('stop');
    expect(disposition.finding).toBeUndefined();
  });

  test('an undecided verdict is never repaired on', () => {
    expect(dispositionFor({ category: 'unclassified' }).act).toBe('stop');
    expect(NO_VERDICT.act).toBe('stop');
  });

  test('the environment being unreachable is retried, not repaired', () => {
    for (const category of ['network-infrastructure', 'dependency', 'flaky'] as TriageCategory[]) {
      expect(dispositionFor({ category }).act, category).toBe('retry');
    }
  });

  test('the four causes that live in the spec are the only ones repaired', () => {
    const repairable = TRIAGE_CATEGORIES.filter(
      (category) => dispositionFor({ category }).act === 'repair',
    );
    expect(repairable.sort()).toEqual(
      ['locator-drift', 'test-data', 'test-logic-defect', 'timing-synchronisation'].sort(),
    );
  });
});

test.describe('extracting what a spec claims', () => {
  test('reads subject, matcher and expected, and drops the message', () => {
    expect(extractClaims("expect(a.saved, 'anything').toBe(false);")).toEqual([
      'a.saved|.toBe(false)',
    ]);
  });

  /*
     The message is diagnostic, not a claim. A repair improving it must not be
     mistaken for a repair changing what the spec proves.
  */
  test('two expectations differing only in message are the same claim', () => {
    const before = "expect(a.saved, 'one wording').toBe(false);";
    const after = "expect(a.saved, `another ${wording}`).toBe(false);";
    expect(extractClaims(before)).toEqual(extractClaims(after));
  });

  test('survives the wrapping a renderer applies', () => {
    const inline = "expect(a.errors.join(' '), 'm').toMatch(/x/i);";
    const wrapped = "expect(\n  a.errors.join(' '),\n  'm',\n).toMatch(/x/i);";
    expect(extractClaims(inline)).toEqual(extractClaims(wrapped));
  });

  test('reads several expectations in order', () => {
    const body = [
      "expect(a.saved, 'm').toBe(true);",
      "expect(b.total, 'm').toBeGreaterThan(0);",
    ].join('\n');
    expect(extractClaims(body)).toEqual(['a.saved|.toBe(true)', 'b.total|.toBeGreaterThan(0)']);
  });

  test('is not fooled by a comma inside the subject', () => {
    expect(extractClaims("expect(a.join(', '), 'm').toBe('x');")).toEqual([
      "a.join(', ')|.toBe('x')",
    ]);
  });

  test('keeps a negated matcher distinct from its positive', () => {
    expect(extractClaims("expect(a, 'm').not.toContain(b);")).toEqual(['a|.not.toContain(b)']);
    expect(extractClaims("expect(a, 'm').toContain(b);")).toEqual(['a|.toContain(b)']);
  });
});

test.describe('claims are frozen across a repair', () => {
  const original = [
    'await users.open(page);',
    "expect(second.saved, 'a duplicate was accepted').toBe(false);",
    "expect(second.errors.join(' '), 'no reason given').toMatch(/already exists/i);",
  ].join('\n');

  test('accepts a repair that changes how the spec gets there', () => {
    const repaired = [
      'await users.open(page);',
      'await users.reset(page);',
      "expect(second.saved, 'a duplicate was accepted').toBe(false);",
      "expect(second.errors.join(' '), 'no reason given').toMatch(/already exists/i);",
    ].join('\n');
    expect(claimsUnchanged(original, repaired)).toEqual([]);
  });

  test('accepts a repair that improves a failure message', () => {
    const repaired = original.replace('a duplicate was accepted', 'the duplicate username saved');
    expect(claimsUnchanged(original, repaired)).toEqual([]);
  });

  /*
     The one that matters. This is the repair that would turn a real defect into
     a green test, and it is refused rather than discouraged.
  */
  test('refuses a repair that makes an assertion agree with the application', () => {
    const cheating = original.replace('.toBe(false)', '.toBe(true)');
    const findings = claimsUnchanged(original, cheating);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.check).toBe('repair-changed-claims');
    expect(findings[0]!.severity).toBe('blocker');
    expect(findings[0]!.detail).toContain('.toBe(false)');
    expect(findings[0]!.detail).toContain('.toBe(true)');
  });

  test('refuses a repair that quietly drops an assertion', () => {
    const fewer = original.split('\n').slice(0, 2).join('\n');
    expect(claimsUnchanged(original, fewer)[0]!.detail).toContain('2 expectation(s) became 1');
  });

  test('refuses a repair that adds one, which is a different claim too', () => {
    const more = `${original}\nexpect(x, 'm').toBe(1);`;
    expect(claimsUnchanged(original, more)[0]!.check).toBe('repair-changed-claims');
  });

  test('refuses a repair that loosens the matcher', () => {
    const loosened = original.replace('.toMatch(/already exists/i)', '.toBeTruthy()');
    expect(claimsUnchanged(original, loosened)[0]!.check).toBe('repair-changed-claims');
  });

  test('refuses a repair that asserts about something else entirely', () => {
    const moved = original.replace('second.saved', 'first.saved');
    expect(claimsUnchanged(original, moved)[0]!.check).toBe('repair-changed-claims');
  });
});

test.describe('when the loop stops', () => {
  test('keeps going while a repair is permitted and attempts remain', () => {
    expect(shouldContinue([])).toBe(true);
    expect(
      shouldContinue([attempt({ disposition: dispositionFor({ category: 'locator-drift' }) })]),
    ).toBe(true);
  });

  test('stops the moment it passes', () => {
    expect(shouldContinue([attempt({ passed: true })])).toBe(false);
  });

  test('stops on a category that may not be repaired, however many attempts remain', () => {
    expect(
      shouldContinue([attempt({ disposition: dispositionFor({ category: 'application-defect' }) })]),
    ).toBe(false);
  });

  test('stops at the attempt ceiling rather than grinding toward green', () => {
    const repairable = dispositionFor({ category: 'timing-synchronisation' });
    const many = Array.from({ length: MAX_REPAIR_ATTEMPTS }, (_, index) =>
      attempt({ attempt: index + 1, disposition: repairable }),
    );
    expect(shouldContinue(many)).toBe(false);
  });

  test('names the outcome, and a defect found is not an exhausted loop', () => {
    expect(outcomeOf([attempt({ passed: true })])).toBe('passed');
    expect(
      outcomeOf([attempt({ disposition: dispositionFor({ category: 'application-defect' }) })]),
    ).toBe('defect-found');
    expect(outcomeOf([attempt({ disposition: dispositionFor({ category: 'case-defect' }) })])).toBe(
      'escalated',
    );
    expect(
      outcomeOf([
        attempt({ refusals: [{ check: 'repair-changed-claims', severity: 'blocker', detail: '', remedy: '' }] }),
      ]),
    ).toBe('refused-repair');
    expect(
      outcomeOf(
        Array.from({ length: MAX_REPAIR_ATTEMPTS }, () =>
          attempt({ disposition: dispositionFor({ category: 'test-data' }) }),
        ),
      ),
    ).toBe('exhausted');
  });
});
