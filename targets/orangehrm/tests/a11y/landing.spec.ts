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

    // Two scans of this page had to agree before the findings above counted.
    // Under load a page can hold still for the quiet period because it is
    // starved rather than finished, and a scan that fires then answers for a
    // shell. `false` here means the page was still moving, so the findings
    // are a snapshot of something in flight rather than a verdict.
    expect(scan.stable, describeFindings(scan)).toBe(true);
  },
);

/**
 * The failure message, and it names **which page was scanned**.
 *
 * Without the URL, a violation on a page you did not think you were scanning
 * is indistinguishable from one you expected — and so is a profile waiver
 * scoped to the wrong page. Onboarding an application whose `/` redirects to
 * a dashboard, a waiver written for the sign-in URL simply never applied, and
 * finding out took a throwaway script to ask the browser where it had ended
 * up. The scan already knows; it just was not saying.
 */
function describeFindings(scan: {
  url: string;
  waived: { rule: string }[];
  violations: { id: string; impact: string | null; nodes: unknown[] }[];
}): string {
  const found = scan.violations
    .map((violation) => `  [${violation.impact}] ${violation.id} on ${violation.nodes.length} node(s)`)
    .join('\n');
  const waived = scan.waived.length
    ? `\nwaived here: ${scan.waived.map((entry) => entry.rule).join(', ')}`
    : '';
  return `scanned ${scan.url}\n${found}${waived}`;
}
