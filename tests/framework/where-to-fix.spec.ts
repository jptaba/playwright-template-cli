import { expect, test } from '@playwright/test';
import { chipHref, firstWorthFixing, whereToFix } from '../../src/support/onboarding/where-to-fix';

/**
 * Which page the health chip should send somebody to, and with what.
 *
 * Both halves matter: `whereToFix` decides the family of page, `chipHref`
 * decides the actual URL. A finding routed to the right page family but a
 * bare `/onboard` still lands on a blank "add one" form for an application
 * whose finding was being read — the chip's own promise (item 75: "the page
 * that fixes the finding") was false for every finding that landed here,
 * because /onboard is the one page that does not read the top bar's
 * application the way every other page does.
 */

test.describe('whereToFix', () => {
  test('a credential family goes to Test users', () => {
    for (const code of [
      'credentials-missing',
      'credentials-unchecked',
      'totp-unconfigured',
      'leasing-exhausted',
      'rotation-overdue',
      'authflow-account-missing',
    ]) {
      expect(whereToFix(code)).toBe('/users');
    }
  });

  test('missing coverage goes to Cases', () => {
    expect(whereToFix('coverage-incomplete')).toBe('/cases');
  });

  test('everything else — including a code invented after this was written — goes to the profile', () => {
    for (const code of ['worker-cap-unmeasured', 'a11y-waiver-expired', 'made-up-future-code']) {
      expect(whereToFix(code)).toBe('/onboard');
    }
  });
});

test.describe('firstWorthFixing', () => {
  test('an error outranks a warning, whatever order they were found in', () => {
    expect(
      firstWorthFixing([
        { level: 'warning', code: 'worker-cap-unmeasured' },
        { level: 'error', code: 'credentials-missing' },
      ]),
    ).toBe('credentials-missing');
  });

  test('the first warning, when nothing is an error', () => {
    expect(
      firstWorthFixing([
        { level: 'warning', code: 'worker-cap-unmeasured' },
        { level: 'warning', code: 'a11y-waiver-expired' },
      ]),
    ).toBe('worker-cap-unmeasured');
  });

  test('nothing worth fixing is null, not a fabricated code', () => {
    expect(firstWorthFixing([])).toBeNull();
  });
});

test.describe('chipHref', () => {
  test('/users and /cases need nothing extra — the top bar already scopes them', () => {
    expect(chipHref('/users', 'orangehrm')).toBe('/users');
    expect(chipHref('/cases', 'orangehrm')).toBe('/cases');
  });

  test('/onboard carries the application, because its own picker does not read the top bar', () => {
    expect(chipHref('/onboard', 'orangehrm')).toBe('/onboard?target=orangehrm');
  });

  test('a name that needs escaping is escaped, like every other value that reaches a URL', () => {
    expect(chipHref('/onboard', 'a b&c')).toBe('/onboard?target=a%20b%26c');
  });
});
