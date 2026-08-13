import { expect, test } from '@playwright/test';
import {
  classify,
  controlsIn,
  describeGauntlet,
  planGauntlet,
  renderGauntletAction,
  renderGauntletLocators,
} from '../../src/support/onboarding/gauntlet';

/**
 * The pages between a password and a home page — §12, §13.
 *
 * The property under test is not "does it recognise a one-time code field".
 * It is that what comes out is a **loop of recognisers rather than a recorded
 * sequence**, because the gauntlet is not the same twice: the expiry warning
 * appears only near expiry, the second factor only after some hours. A script
 * that replays one sign-in encodes one sample of a process that varies.
 */

const OTP_PAGE = [
  '- heading "Two-factor authentication" [level=1]',
  '- text: We sent a code to your phone',
  '- textbox "One-time code"',
  '- button "Verify"',
  '- link "Use a different method"',
].join('\n');

const EXPIRY_PAGE = [
  '- heading "Your password expires in 5 days" [level=2]',
  '- button "Change password now"',
  '- button "Remind me later"',
].join('\n');

const FORCED_PAGE = [
  '- heading "You must change your password" [level=1]',
  '- textbox "New password"',
  '- button "Save"',
].join('\n');

const REMEMBER_PAGE = [
  '- heading "Remember this device?" [level=2]',
  '- button "Yes, remember it"',
  '- button "Not now"',
].join('\n');

test.describe('recognising what is on screen', () => {
  test('a one-time code page is recognised, and needs a value it must not hold', () => {
    const found = classify(OTP_PAGE);
    expect(found?.kind).toBe('otp');
    expect(found?.safety).toBe('needs-value');
  });

  test('a forced password change is refused, not clicked through', () => {
    /*
       The distinction that matters most in this file. A password *expiring*
       and a password that *must be changed* both talk about expiry, and
       confusing them is the difference between dismissing a notice and
       changing the password every parallel worker signs in with — once,
       silently, breaking every future run.
    */
    expect(classify(FORCED_PAGE)?.kind).toBe('password-change-forced');
    expect(classify(FORCED_PAGE)?.safety).toBe('refuse');

    expect(classify(EXPIRY_PAGE)?.kind).toBe('password-expiring');
    expect(classify(EXPIRY_PAGE)?.safety).toBe('safe');
  });

  test('reads every named control, so a wrong pick can be corrected by reading', () => {
    expect(controlsIn(OTP_PAGE)).toEqual({
      textboxes: ['One-time code'],
      buttons: ['Verify', 'Use a different method'],
      headings: ['Two-factor authentication'],
    });
  });
});

test.describe('planning the handlers', () => {
  test('a remember-device prompt is answered no, on purpose', () => {
    const [step] = planGauntlet([{ snapshot: REMEMBER_PAGE }]);

    expect(step!.kind).toBe('remember-device');
    // Saying yes suppresses the second factor on later runs, which sounds
    // convenient and stops the suite exercising the path it exists to prove.
    expect(step!.resolution).toEqual({ role: 'button', name: 'Not now' });
  });

  test('an expiry notice is dismissed rather than acted on', () => {
    const [step] = planGauntlet([{ snapshot: EXPIRY_PAGE }]);
    expect(step!.resolution?.name).toBe('Remind me later');
    expect(step!.resolution?.name).not.toBe('Change password now');
  });

  test('a page nobody recognises is kept, with what was on it', () => {
    // The operator saw it and got past it. Dropping it silently would lose the
    // only observation anybody has of that page.
    const [step] = planGauntlet([
      { snapshot: '- heading "Choose a branch" [level=1]\n- button "Continue"' },
    ]);

    expect(step!.kind).toBe('unknown');
    expect(step!.safety).toBe('refuse');
    expect(step!.controls.buttons).toEqual(['Continue']);
  });

  test('the same page observed twice becomes one handler', () => {
    const steps = planGauntlet([{ snapshot: OTP_PAGE }, { snapshot: OTP_PAGE }]);
    expect(steps).toHaveLength(1);
  });
});

test.describe('the code it generates', () => {
  const steps = planGauntlet([
    { snapshot: OTP_PAGE },
    { snapshot: EXPIRY_PAGE },
    { snapshot: REMEMBER_PAGE },
    { snapshot: FORCED_PAGE },
  ]);
  const action = renderGauntletAction(steps);

  test('is a loop of independent branches, not a sequence of steps', () => {
    /*
       The whole point. Every branch asks "is this on screen now?", so the
       order they appear in does not matter and an interstitial that does not
       appear this run is simply not matched.
    */
    expect(action).toContain('for (let attempt = 0');
    expect(action).toContain('if (await gauntletLocators.oneTimeCodeField(page).isVisible())');
    expect(action).toContain('if (await gauntletLocators.passwordExpiryNotice(page).isVisible())');
    // Each branch returns to the top rather than falling into the next one.
    expect(action.match(/continue;/g) ?? []).toHaveLength(4);
  });

  test('takes the code from the fixture and never from the source', () => {
    expect(action).toContain('await otp.get(mark)');
    expect(action).not.toMatch(/\b\d{6}\b/);
  });

  test('the forced password change throws instead of clicking Save', () => {
    expect(action).toContain('Sign-in stopped at password-change-forced');
    expect(action).not.toContain("name: 'Save'");
  });

  test('an unrecognised page fails with the snapshot a new handler is written from', () => {
    expect(action).toContain('does not recognise');
    expect(action).toContain("ariaSnapshot()");
  });

  test('the loop is bounded, so a handler that changes nothing cannot spin', () => {
    expect(action).toContain('attempt +=');
    expect(action).toContain('without reaching the signed-in page');
  });

  test('the locators are role-based, grounded in the accessibility tree', () => {
    const locators = renderGauntletLocators(steps);
    expect(locators).toContain("page.getByRole('textbox', { name: 'One-time code' })");
    expect(locators).toContain("page.getByRole('heading', { name: 'Remember this device?' })");
    expect(locators, 'never a CSS path').not.toContain('page.locator(');
  });

  test('a target with no interstitials gets a loop that simply finds the marker', () => {
    const empty = renderGauntletAction([]);
    expect(empty).toContain('met no interstitials');
    expect(empty).toContain('signedInMarker');
  });

  test('describes itself in one line per step, before anything is written', () => {
    expect(describeGauntlet(steps)).toEqual([
      'otp: resolved by clicking "Verify"',
      'password-expiring: resolved by clicking "Remind me later"',
      'remember-device: resolved by clicking "Not now"',
      'password-change-forced: refused — it will stop and say why',
    ]);
  });
});
