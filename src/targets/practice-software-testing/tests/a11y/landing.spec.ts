import { expect, test } from '../../fixtures';

/**
 * L4 — TEMPLATE. Accessibility, against the standard the profile declares.
 *
 * The `a11y` fixture runs axe with the rule tags that standard resolves to —
 * WCAG conformance is cumulative, so 2.2 AA means every A and AA criterion
 * from 2.0 and 2.1 as well — applies the profile's waivers, and returns what
 * it found. It asserts nothing, deliberately: "no critical violations" and
 * "none at all" are different products' answers, and that call belongs in a
 * spec where a reviewer can see it.
 *
 * Scan a page a user actually reaches. A landing page passes on almost every
 * application; the dialogs, the tables and the multi-step forms are where the
 * problems live.
 */
test(
  'A11Y-001 · The landing page meets the declared standard @a11y',
  { annotation: [{ type: 'practitest', description: 'PT-ID' }] },
  async ({ authedPage, a11y }) => {
    await authedPage.goto('/');

    const scan = await a11y.scan(authedPage);

    // Fail on everything, and tighten or loosen deliberately. A suite that
    // starts at "no critical violations" rarely moves off it.
    expect(scan.violations, describeFindings(scan)).toEqual([]);

    // Checks axe could not decide are not passes. Somebody has to look at
    // them, and a spec that stays silent about them overstates its result.
    expect(scan.incomplete, 'checks needing a human review').toBe(0);
  },
);

function describeFindings(scan: { violations: { id: string; impact: string | null; nodes: unknown[] }[] }): string {
  return scan.violations
    .map((violation) => `[${violation.impact}] ${violation.id} on ${violation.nodes.length} node(s)`)
    .join('\n');
}
