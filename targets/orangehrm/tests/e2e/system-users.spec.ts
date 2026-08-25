import { expect, test } from '../../fixtures';

/**
 * OHRM-1 — finding a system user, which is what an administrator opens this
 * screen to do.
 *
 * **Read-only, deliberately.** This is a public demo whose users anybody can
 * add, edit or delete, and the conventions are explicit that a spec must not
 * assert on data it did not create. So these specs assert on the *relationship*
 * between a filter and its result — narrowing, and the empty case — rather
 * than on any particular user existing, which would pass until a stranger
 * removed them.
 *
 * The one username taken from the application is `Admin`, and it is taken from
 * the list at run time rather than written down.
 */

test(
  'OHRM-1-01 · Filtering the user list by username narrows it to that user @smoke @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-1-01' },
      { type: 'jira', description: 'OHRM-1' },
    ],
  },
  async ({ authedPage, users }) => {
    await users.open(authedPage);
    const all = await users.read(authedPage);

    expect(all.total, 'the user list came back empty, so there is nothing to filter').toBeGreaterThan(0);

    /*
       Derived, never transcribed. Filtering for a username read off the list
       means this still works after the demo is reseeded — a written-down name
       would pass until somebody deleted that user, and then fail as though
       the filter were broken.
    */
    const target = all.usernames[0]!;
    const filtered = await users.searchByUsername(authedPage, target);

    expect(filtered.usernames, `filtering for "${target}" lost it`).toContain(target);
    expect(
      filtered.total,
      `filtering for "${target}" returned as many records as no filter at all`,
    ).toBeLessThanOrEqual(all.total);
    // The filter did something: every row it returned matches what was asked for.
    for (const username of filtered.usernames) {
      expect(username.toLowerCase()).toContain(target.toLowerCase());
    }
  },
);

test(
  'OHRM-1-02 · A username that matches nothing says so rather than showing an empty table @negative @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-1-02' },
      { type: 'jira', description: 'OHRM-1' },
    ],
  },
  async ({ authedPage, users }) => {
    await users.open(authedPage);

    /*
       Deliberately not a word. Any real string risks matching a user the day
       somebody registers one, and a negative test that quietly stops testing
       anything is worse than one that fails.
    */
    const result = await users.searchByUsername(authedPage, 'zzzqqqxxx-no-such-user');

    expect(result.usernames, 'a username nobody has returned rows').toEqual([]);
    expect(result.total).toBe(0);
  },
);

test(
  'OHRM-1-03 · Clearing the filter restores the full list @idempotency @admin',
  {
    annotation: [
      { type: 'practitest', description: 'OHRM-1-03' },
      { type: 'jira', description: 'OHRM-1' },
    ],
  },
  async ({ authedPage, users }) => {
    await users.open(authedPage);
    const before = await users.read(authedPage);

    /*
       One existing username, not the aggregate total. `before.total` is the
       whole shared demo's user count, and this suite's own OHRM-2-01 and
       OHRM-3-01 create and remove users on that same list concurrently — so
       "the same total again" compares two different moments of data this
       spec did not create, and a neighbour's write between the two reads
       fails an idempotency spec for a reason that has nothing to do with
       resetting a filter. Whether one specific already-listed user
       reappears after the round trip carries none of that: it is wrong only
       if that exact record vanished in the window, not if the list's size
       moved at all.
    */
    const marker = before.usernames[0]!;

    await users.searchByUsername(authedPage, 'zzzqqqxxx-no-such-user');
    await users.reset(authedPage);
    const afterOnce = await users.read(authedPage);

    expect(afterOnce.usernames, 'clearing the filter did not restore the full list').toContain(
      marker,
    );

    // And again: clearing an already-clear filter changes nothing.
    await users.reset(authedPage);
    expect((await users.read(authedPage)).usernames).toContain(marker);
  },
);
