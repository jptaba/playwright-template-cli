import { expect, test } from '@playwright/test';
import { classify, planGauntlet } from '../../src/support/onboarding/gauntlet';
import { proposeSignedInMarker } from '../../src/support/onboarding/probe';

/**
 * What the gauntlet must *not* recognise.
 *
 * An assisted sign-in on Toolshop reported three "terms" interstitials on a
 * flow that has none, and concluded the suite could never run unattended. The
 * cause was one link in a footer that appears on every page of the site,
 * including the sign-in form. The recogniser read the whole page as evidence,
 * and a word in a footer is not a demand.
 *
 * A false positive here is expensive in a way a false negative is not: it
 * tells somebody their application needs a human in the loop forever, which is
 * a reason to stop rather than a reason to look.
 */

/** Toolshop's, trimmed: an ordinary page carrying an ordinary footer. */
const HOME_WITH_A_FOOTER = [
  '- banner:',
  '  - link "Practice Software Testing"',
  '  - button "John Doe"',
  '- main:',
  '  - heading "My account" [level=1]',
  '  - link "Favorites"',
  '- contentinfo:',
  '  - link "Privacy Policy":',
  '    - /url: /privacy',
  '  - link "Terms of Service"',
].join('\n');

const SIGN_IN_PAGE = [
  '- heading "Login" [level=3]',
  '- textbox "Email address *"',
  '- textbox "Password *"',
  '- button "Login"',
  '- contentinfo:',
  '  - link "Privacy Policy"',
].join('\n');

const REAL_TERMS_GATE = [
  '- heading "Updated terms of service" [level=1]',
  '- button "I accept"',
  '- button "Cancel"',
].join('\n');

const OTP_CHALLENGE = [
  '- heading "Two-factor authentication" [level=1]',
  '- textbox "One-time code"',
  '- button "Verify"',
  '- contentinfo:',
  '  - link "Privacy Policy"',
].join('\n');

test('a footer link does not make a page a terms gate', () => {
  expect(classify(HOME_WITH_A_FOOTER), 'the footer is not a demand').toBeNull();
  expect(classify(SIGN_IN_PAGE), 'the sign-in form is not an interstitial').toBeNull();
});

test('a page that actually demands acceptance still is one', () => {
  expect(classify(REAL_TERMS_GATE)?.kind).toBe('terms');
  expect(classify(OTP_CHALLENGE)?.kind).toBe('otp');
});

test('the terms claim needs an accept-shaped button, not the words', () => {
  // Same heading, no way to accept: a notice, not a gate.
  const notice = ['- heading "Terms of service" [level=1]', '- button "Back"'].join('\n');
  expect(classify(notice)).toBeNull();
});

test('a sign-in with no interstitials plans no handlers', () => {
  /*
     What onboarding actually collects: the form still on screen while the
     navigation is in flight, then the landed page caught mid-render twice.
     Nothing here is an interstitial, and the answer must be zero.
  */
  const steps = planGauntlet([
    { snapshot: SIGN_IN_PAGE, url: 'https://shop.test/auth/login' },
    { snapshot: HOME_WITH_A_FOOTER, url: 'https://shop.test/account' },
  ]);
  expect(steps, 'the form is not a step').toHaveLength(1);
  expect(steps[0]!.kind, 'and the landed page is unrecognised, not a terms gate').toBe('unknown');
});

test('a resolution that is a link is emitted as a link', () => {
  const steps = planGauntlet([
    {
      snapshot: [
        '- heading "Remember this device?" [level=1]',
        '- link "Not now"',
        '- button "Yes, remember it"',
      ].join('\n'),
      url: 'https://shop.test/mfa/remember',
    },
  ]);
  expect(steps[0]!.kind).toBe('remember-device');
  // Not `{ role: 'button', name: 'Not now' }`, which matches nothing.
  expect(steps[0]!.resolution).toEqual({ role: 'link', name: 'Not now' });
});

test('a marker that is somebody\'s name is flagged even when the login is an email', () => {
  const before = '- heading "Login" [level=3]\n- button "Login"';
  const after = '- button "John Doe"\n- button "Login"';

  const marker = proposeSignedInMarker(before, after, ['admin@practicesoftwaretesting.com']);

  expect(marker).toEqual({ role: 'button', name: 'John Doe', identitySpecific: true });
});

test('an account menu that names no one is not flagged', () => {
  const before = '- heading "Login" [level=3]';
  const after = '- button "My account"';

  expect(proposeSignedInMarker(before, after, ['admin@shop.test'])?.identitySpecific).toBe(false);
});
