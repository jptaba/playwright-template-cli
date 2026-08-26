import { expect, test } from '../../fixtures';

/**
 * A username that is already taken is refused
 *
 * **Generated from targets/orangehrm/cases/OHRM-4-duplicate-username-refused.yaml by cli:claude.**
 * The case is the oracle; this file is the automation of it. Edit the case and
 * regenerate rather than editing here — `npm run hashes:check` reports a spec
 * whose case has moved on, and a hand-edit is invisible to it.
 *
 * Acceptance criterion: "A username that is already in use is refused, and the form says so."
 *
 * Preconditions, and how this spec meets them:
 *   1. An administrator is signed in — fixture authedPage
 *   2. A system user already exists with a known username — established by users.add()
 *
 * The journey, step by step from the case:
 *   1. Open the system user list — users.open, users.read
 *   2. Add a system user with a username that is already in use — users.add, users.fieldError, users.open, users.searchByUsername
 */

test(
  'OHRM-4-01 · A username that is already taken is refused, and the form says so @negative @admin @users',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-4-01' },
      { type: 'case', description: 'targets/orangehrm/cases/OHRM-4-duplicate-username-refused.yaml' },
      { type: 'case-hash', description: '8ca0155461d4d4cd' },
    ],
  },
  async ({ authedPage, testData, users }) => {
    const existingUser = testData.newUser();

    await users.open(authedPage);

    try {
      // The data this case says must already exist, created by the spec that
      // asserts about it — never assumed to be sitting there.
      const seeded = await users.add(authedPage, existingUser);
      expect(
        seeded.saved,
        'The system user this case needs to already exist could not be created',
      ).toBe(true);

      await users.open(authedPage);

      await users.read(authedPage);

      const duplicate = await users.add(authedPage, {
        username: existingUser.username,
        password: existingUser.password,
        role: 'ESS',
        status: 'Enabled',
      });
      expect(
        duplicate.saved,
        'The form saved a second system user under a username that is already in use',
      ).toBe(false);

      const usernameError = await users.fieldError(authedPage, 'username');
      expect(
        usernameError,
        `The form did not report the duplicate against the username field in the words the case requires: ${usernameError}`,
      ).toBe('Already exists');

      await users.open(authedPage);

      const found = await users.searchByUsername(authedPage, existingUser.username);
      expect(
        found.total,
        `The user list holds more than the one seeded account under that username, so the refused user was saved after all: ${found.usernames.join(', ')}`,
      ).toBe(1);
    } finally {
      // A shared demo must not keep this run's records, whichever assertion failed.
      await users.remove(authedPage, existingUser.username);
    }
  },
);
