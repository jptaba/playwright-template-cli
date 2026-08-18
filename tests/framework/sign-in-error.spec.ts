import { expect, test } from '@playwright/test';
import {
  chooseErrorText,
  ERROR_CANDIDATE_SELECTORS,
} from '../../src/support/sign-in-error';
import { planScaffold } from '../../src/support/onboarding/scaffold';

/**
 * Reading what the application actually said when a sign-in failed.
 *
 * The scaffolder writes one guessed error locator — `getByRole('alert')` — and
 * on an application whose banner carries no `role` attribute it matches
 * nothing. `readError` then returned null and the run reported "the form
 * reported no error, so the credential was accepted", while the screen said
 * "Account locked, too many failed attempts. Please contact the
 * administrator." Three runs of the improvement loop investigated worker
 * partitioning and locators before anybody asked the application directly.
 *
 * The fix belongs here rather than in any pack: the guess is what the
 * *scaffolder* produces, so the scaffolder and the framework beneath it are
 * what had to change (rule zero).
 */

test.describe('choosing the message to show', () => {
  test('the shortest candidate wins, because error markup nests', () => {
    /*
       `div.alert > div.help-block` is the shape this was found on: the outer
       match is the inner message plus its surroundings, so the shortest
       candidate is closest to the sentence the application actually wrote.
    */
    expect(
      chooseErrorText([
        '  Account locked, too many failed attempts.  \n  Please try later  ',
        'Account locked, too many failed attempts.',
      ]),
    ).toBe('Account locked, too many failed attempts.');
  });

  test('whitespace is collapsed, so a message reads as one line', () => {
    expect(chooseErrorText(['\n  Invalid   email\n  or password\n '])).toBe(
      'Invalid email or password',
    );
  });

  test('nothing usable is null, never an empty string', () => {
    // An empty string would render as `The application said: ""`, which reads
    // like the application said something blank rather than nothing.
    expect(chooseErrorText([])).toBeNull();
    expect(chooseErrorText(['', '   ', '\n'])).toBeNull();
    expect(chooseErrorText(['x'], ), 'a single character is not a message').toBeNull();
  });

  test('a whole page wrapper is not a message', () => {
    /*
       `[class*="error"]` happily matches a form wrapper. Returning three
       hundred words of page furniture as "what the application said" is its
       own kind of lie, so anything past the cap is dropped — and if that
       leaves nothing, the answer is honestly null.
    */
    expect(chooseErrorText(['word '.repeat(200)])).toBeNull();
    expect(chooseErrorText(['word '.repeat(200), 'Password is required'])).toBe(
      'Password is required',
    );
  });

  test('the same words matched twice are reported once', () => {
    // Nested matches are the norm; reporting them twice reads like two
    // separate problems.
    expect(chooseErrorText(['Locked', 'Locked'])).toBe('Locked');
  });
});

test.describe('where it looks', () => {
  test('roles and ARIA come before class-name conventions', () => {
    // What a screen reader is told is the most trustworthy signal; the CSS
    // conventions are the breadth beneath it.
    expect(ERROR_CANDIDATE_SELECTORS[0]).toBe('[role="alert"]');
    expect(ERROR_CANDIDATE_SELECTORS.indexOf('[aria-live="assertive"]')).toBeLessThan(
      ERROR_CANDIDATE_SELECTORS.indexOf('[class*="error" i]'),
    );
  });

  test('it covers the shapes real applications actually use', () => {
    // `data-test*=error` and `alert-danger` are the two that would have caught
    // the application this was found on, whose banner is
    // `div.alert.alert-danger[data-test="login-error"]` with no role at all.
    const all = ERROR_CANDIDATE_SELECTORS.join(' ');
    expect(all).toContain('data-test*="error"');
    expect(all).toContain('alert-danger');
  });
});

test('every newly scaffolded pack reads the page, not only its own guess', () => {
  /*
     The point of fixing the scaffolder rather than a pack: the next
     application onboarded gets the floor without anybody remembering to add
     it. `signInLocators.error` stays the preferred answer — a target that
     named its banner precisely keeps the precise one.
  */
  const plan = planScaffold({
    name: 'demo',
    baseURL: 'https://demo.internal.corp',
    roles: ['standard'],
  });
  const actions = plan.files.find((file) => file.path.endsWith('actions/sign-in.ts'));

  expect(actions, 'the scaffolder writes a sign-in action').toBeDefined();
  expect(actions!.contents).toContain('readVisibleError');
  expect(actions!.contents).toContain("from '../../../support/sign-in-error'");
  expect(actions!.contents, 'the named locator is still tried first').toContain(
    'signInLocators.error(page)',
  );
});
