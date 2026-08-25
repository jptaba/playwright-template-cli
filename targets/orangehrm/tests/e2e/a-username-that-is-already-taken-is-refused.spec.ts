import { expect, test } from '../../fixtures';

/**
 * A username that is already taken is refused
 *
 * **Generated from targets/orangehrm/cases/OHRM-4-duplicate-username-refused.yaml by draft:draft-ohrm-4-ir.json.**
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
 *   1. Open the system user list — users.open
 *   2. Add a system user with a username that is already in use — users.add
 */

test(
  'OHRM-4-01 · A username that is already taken is refused @negative @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-4-01' },
      { type: 'case', description: 'targets/orangehrm/cases/OHRM-4-duplicate-username-refused.yaml' },
      { type: 'case-hash', description: '91f9f2cd7dd75925' },
    ],
  },
  async ({ authedPage, users, testData }) => {
    const username = testData.username();

    await users.open(authedPage);

    try {
      const first = await users.add(authedPage, {
        username,
        password: 'Pas5wrd',
        role: 'ESS',
        status: 'Enabled',
      });
      expect(first.saved, `the first user was not created: ${first.errors.join(', ')}`).toBe(true);

      const second = await users.add(authedPage, {
        username,
        password: 'Pas5wrd',
        role: 'ESS',
        status: 'Enabled',
      });
      expect(second.saved, 'a username already in use was accepted a second time').toBe(false);
      expect(
        second.errors.join(' '),
        'the form refused without saying the username was taken',
      ).toMatch(/already exists/i);
    } finally {
      // A shared demo must not keep this run's records, whichever assertion failed.
      await users.remove(authedPage, username);
    }
  },
);
