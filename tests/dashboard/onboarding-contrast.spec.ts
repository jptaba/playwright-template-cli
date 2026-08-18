import { expect, test } from './harness';
import { contrastFindings, openEveryDisclosure } from './measure';

/**
 * The same legibility budget, on the page the whole tool is named after.
 *
 * It needs its own file because onboarding has its own harness — and it is
 * worth the second file rather than being skipped, because this page carries
 * things no other page has: the step badges, the preflight panel, the warning
 * strips, the diagnostics a write comes back with. Those are exactly the
 * elements where a colour gets chosen once, for one theme, by whoever was
 * looking at the time.
 *
 * The measurement is shared with `contrast.spec.ts`; only the harness differs.
 */

for (const theme of ['light', 'dark'] as const) {
  test(`onboarding is legible in ${theme}`, async ({ dashboard }) => {
    const { page } = dashboard;
    await page.setViewportSize({ width: 1280, height: 720 });
    /*
       Loaded in the theme rather than switched into it: the media query with
       no stored choice is the state most people are in, and a page switched
       live reports colours mid-transition.
    */
    await page.emulateMedia({ colorScheme: theme });
    await dashboard.reopen();

    /*
       Then unlock the rest of it, which is the difference between covering
       this page and covering its first screen.

       Four of the seven sections are gated until an earlier answer earns them,
       and a gated section has no height — so it is skipped, silently, by any
       measurement that walks the rendered page. Everything worth checking here
       is behind that gate: the Vault block, the credential form, the badges
       that change colour with state.
    */
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.fill('#vaultAddr', 'https://vault.shop.test');
    await page.click('#vaultCheck');
    await expect(page.locator('#vaultStatus')).toContainText('username, password');
    await page.click('#preview');
    await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');

    await openEveryDisclosure(page);

    const bad = await contrastFindings(page);
    const report = bad
      .map((one) => `${one.label} — ${one.what} at ${one.ratio}:1, needs ${one.need}:1 "${one.sample}"`)
      .join('\n');
    expect(bad, `${bad.length} below AA in ${theme}:\n${report}`).toEqual([]);
  });
}
