import { expect, test } from '../../fixtures';

/**
 * TOOL-5 — accessibility, against the standard the profile declares.
 *
 * The fixture returns findings and asserts nothing: "no critical violations"
 * and "none at all" are different products' answers, and that call belongs in
 * a spec a reviewer can read. This one draws the line at serious, and says so.
 *
 * Scanned on pages a shopper actually reaches. A landing page passes nearly
 * everywhere; the form and the product page are where the problems are.
 */

test(
  'TOOL-5-01 · The sign-in form has no critical or serious accessibility violations @a11y',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-5-01' },
      { type: 'jira', description: 'TOOL-5' },
    ],
  },
  async ({ page, a11y }) => {
    await page.goto('/auth/login');

    const scan = await a11y.scan(page);
    const blocking = scan.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      blocking.map((violation) => `${violation.id} (${violation.impact})`),
      'critical or serious violations on the sign-in form',
    ).toEqual([]);

    /*
       Incomplete is not a pass. These are checks axe could not decide, and a
       spec that ignores them overstates its result — so the count is recorded
       against the result, and the spec still fails only on what axe was sure
       about.
    */
    if (scan.incomplete > 0) {
      test.info().annotations.push({
        type: 'a11y-undecided',
        description: `${scan.incomplete} check(s) axe could not decide — a human has to look`,
      });
    }
  },
);
