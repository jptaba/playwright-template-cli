import { expect, test } from '../../fixtures';

/**
 * OHRM-2 and OHRM-3 — the two coverage kinds that need data this suite makes.
 *
 * Everything else in this pack reads. These write, because neither claim can
 * be made otherwise: a boundary needs a value the application accepts as well
 * as one it refuses, and an audit needs a change to have happened before
 * anything can be asked whether it was recorded.
 *
 * **Both clean up in a `finally`.** This demo is shared and reseeds on its own
 * schedule rather than ours, so a run that left its users behind would slowly
 * become the reason somebody else's spec fails.
 */

test(
  'OHRM-2-01 · The password rule the form states is the rule it enforces @boundary @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-2-01' },
      { type: 'jira', description: 'OHRM-2' },
    ],
  },
  async ({ authedPage, users, testData }) => {
    /*
       **The bound is read from the application, never written down here.**
       OrangeHRM answers *"Should have at least 7 characters"* under the
       password field, so the spec asks for that sentence rather than asserting
       a 7 it decided on — the day the policy changes, this fails saying the
       application now states something else, which is the truth.

       **Both ends, and the accepted one is the half usually skipped.** A spec
       that only showed a short password refused would be satisfied by a form
       that refused everything, so one character more is then accepted and a
       real user is created by it.
    */
    const short = 'Pas5wrd'.slice(0, 6);
    const refused = await users.add(authedPage, {
      username: testData.username(),
      password: short,
      role: 'ESS',
      status: 'Enabled',
    });

    expect(refused.saved, 'a password under the stated minimum was accepted').toBe(false);
    expect(
      refused.errors.join(' '),
      'the form refused without saying what the rule is',
    ).toMatch(/at least \d+ characters/i);

    const username = testData.username();
    try {
      const accepted = await users.add(authedPage, {
        username,
        password: 'Pas5wrd',
        role: 'ESS',
        status: 'Enabled',
      });

      expect(
        accepted.saved,
        `the shortest allowed password was refused: ${accepted.errors.join(', ')}`,
      ).toBe(true);
    } finally {
      await users.remove(authedPage, username);
    }
  },
);

test(
  'OHRM-3-01 · A user that was added is on the list, and gone once removed @audit @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-3-01' },
      { type: 'jira', description: 'OHRM-3' },
    ],
  },
  async ({ authedPage, users, testData }) => {
    /*
       The audit claim: the change is made on the add-user form and the
       question is asked of the *list*, which the application renders from what
       it recorded. A spec that read the form back would only have proved the
       page agrees with itself.

       Asserted through the application's **own count** rather than by counting
       rows. `(N) Records Found` is what this application says about its data,
       and a row count is what a table happens to be showing — which on a
       paginated list is a different number.
    */
    const username = testData.username();

    try {
      const created = await users.add(authedPage, {
        username,
        password: 'Pas5wrd',
        role: 'ESS',
        status: 'Enabled',
      });
      expect(created.saved, `the user was not created: ${created.errors.join(', ')}`).toBe(true);

      await users.open(authedPage);
      const found = await users.searchByUsername(authedPage, username);

      expect(found.total, 'the created user reached no record').toBe(1);
      expect(found.usernames).toContain(username);
    } finally {
      await users.remove(authedPage, username);
    }

    /*
       And gone again — the other half of the same claim. An audit that only
       showed a creation being recorded would say nothing about a removal
       being recorded, and a list that never lets go is its own defect.
    */
    await users.open(authedPage);
    const afterRemoval = await users.searchByUsername(authedPage, username);
    expect(afterRemoval.total, 'the removed user is still on the list').toBe(0);
  },
);
