import { expect, test } from '@playwright/test';
import {
  interpretSignInCheck,
  reportedByApplication,
} from '../../src/support/onboarding/sign-in-check';
import { ACCOUNT_LOCKED, looksLikeLockout } from '../../src/support/failure-signals';
import { RULES } from '../../src/support/triage/rules';

/**
 * Proving a credential can sign in, rather than merely exist.
 *
 * `target:doctor` asked the secret store whether a credential was there and
 * stopped. Existence is not usability: a locked account describes perfectly —
 * right path, right field names — and fails every run, so the doctor could
 * report a target entirely healthy minutes before every spec in it failed at
 * sign-in. That is exactly what happened.
 */

const LOCKED_OUTPUT = `
  1) [setup:auth] › src/targets/demo/tests/auth.setup.ts:25:6 › Establish a session

    Error: Sign-in for role 'customer' (account 1) did not establish a session.
    The application said: "Account locked, too many failed attempts. Please contact the administrator."
`;

test.describe('reading what the application contributed', () => {
  test('lifts the quoted sentence out of a stack trace', () => {
    // It is the single most useful thing in the output and it is buried.
    expect(reportedByApplication(LOCKED_OUTPUT)).toBe(
      'Account locked, too many failed attempts. Please contact the administrator.',
    );
  });

  test('falls back to the framework summary when the form said nothing', () => {
    const output = "Error: Sign-in for role 'admin' (account 2) did not establish a session.";
    expect(reportedByApplication(output)).toContain("role 'admin' (account 2)");
  });

  test('a run that said nothing useful yields null, not a file path', () => {
    // "First line containing the word error" is almost always a path on a
    // Playwright run, and handing that back as the application's words is
    // worse than admitting there were none.
    expect(reportedByApplication('at /repo/src/targets/demo/errors.ts:12:9')).toBeNull();
  });
});

test.describe('the verdict', () => {
  test('a clean run is a pass with nothing to do', () => {
    const verdict = interpretSignInCheck({ status: 0, output: '1 passed' });
    expect(verdict.ok).toBe(true);
    expect(verdict.code).toBe('sign-in-ok');
  });

  test('a lockout is called a lockout, because the remedy is different', () => {
    /*
       No credential is wrong, nothing has drifted, and re-running cannot help
       — only an administrator can. Reporting it as "check the credential"
       sends somebody to look at the one thing that is fine.
    */
    const verdict = interpretSignInCheck({ status: 1, output: LOCKED_OUTPUT });

    expect(verdict.code).toBe('account-locked');
    expect(verdict.message).toContain('Account locked');
    expect(verdict.fix).toMatch(/administrator/i);
    expect(verdict.fix, 'and says re-running is pointless').toMatch(/will not clear it/i);
  });

  test('an ordinary refusal quotes the application and stops there', () => {
    const verdict = interpretSignInCheck({
      status: 1,
      output: 'The application said: "Invalid email or password."',
    });
    expect(verdict.code).toBe('sign-in-failed');
    expect(verdict.message).toContain('Invalid email or password');
  });

  test('a silent form points at the marker, not the password', () => {
    // The failure this whole thread began with: a form that reports nothing
    // usually means the signed-in locator is wrong, and telling somebody to
    // check the credential sends them to the wrong file for three runs.
    const verdict = interpretSignInCheck({
      status: 1,
      output: 'Timeout waiting for predicate',
    });
    expect(verdict.code).toBe('sign-in-failed');
    expect(verdict.fix).toMatch(/marker/i);
  });

  test('an unreachable environment is not a credential problem', () => {
    /*
       Found by running the preflight against a dead port and being told to
       "check the signed-in marker" — advice exactly as wrong as the message
       this whole thing was built to replace. A transport failure never
       reaches the form, so it never produces a reported sentence, and it has
       to be read before the generic case.
    */
    const verdict = interpretSignInCheck({
      status: 1,
      output: 'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:9/',
    });

    expect(verdict.code).toBe('environment-unreachable');
    expect(verdict.fix).toMatch(/baseURL/);
    expect(verdict.fix, 'and clears the credential of blame').toMatch(/nothing here is wrong/i);
  });

  test('a check that could not run is not a failed sign-in', () => {
    // Saying so stops a broken command being read as a broken credential.
    const verdict = interpretSignInCheck({ status: 2, output: 'No tests found' });
    expect(verdict.code).toBe('sign-in-not-run');
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('nothing was proven');
  });
});

test('the doctor and triage share one definition of a lockout', () => {
  /*
     Two copies of a pattern is how the two came to disagree — the same
     argument that put the auth-flow pattern in one place and holds it there
     with a test. Triage classifies a failure after a run and the doctor
     reports one before it; both have to mean the same thing by "locked".
  */
  expect(looksLikeLockout('Account locked, too many failed attempts')).toBe(true);
  expect(looksLikeLockout('HTTP 423')).toBe(true);
  expect(looksLikeLockout('401 Unauthorized, invalid password')).toBe(false);

  const rule = RULES.find((candidate) => candidate.name === 'account-locked');
  expect(rule, 'the triage rule still exists').toBeDefined();
  expect(ACCOUNT_LOCKED.source, 'and reads the shared pattern').toContain('too many failed attempts');
});
