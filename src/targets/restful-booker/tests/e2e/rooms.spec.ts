import { expect, test } from '../../fixtures';

/**
 * RB-1 — administering rooms, which is the journey this application exists
 * for: without rooms there is nothing for a guest to book.
 *
 * **Everything asserted about is created by the spec that asserts it.**
 * `automationintesting.online` is a public demo whose room list anybody on the
 * internet can change, so a spec asserting anything about rooms 101–103 would
 * pass until a stranger deleted one. The room here is named per run, created,
 * asserted about, and removed again.
 */

test(
  'RB-1-01 · A room an administrator creates appears in the room list @smoke @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-1-01' },
      { type: 'jira', description: 'RB-1' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    const room = testData.room();

    await rooms.open(authedPage);

    /*
       Inside the try, and that is not tidiness. `add` creates the room and then
       waits for it to be listed; when that wait threw on the first run, the
       room existed and nothing removed it — three of them are still on the
       shared demo. Cleanup has to cover the window between the click and the
       verb returning.
    */
    try {
      const created = await rooms.add(authedPage, room);
      const listed = await rooms.listed(authedPage);

      expect(listed, `room "${created}" was not in the list after creating it`).toContain(created);
      /*
         The room the spec made, and only it. Asserting a *count* here would be
         asserting on data the spec did not create — the demo's other rooms
         come and go while this runs.
      */
      expect(listed.filter((name) => name === created), 'the room was listed twice').toHaveLength(1);
    } finally {
      // A shared demo must not accumulate this run's rooms, whether an
      // assertion failed or the create half-succeeded.
      await rooms.remove(authedPage, room.name);
    }
  },
);

test(
  'RB-1-02 · A room removed by an administrator is gone from the list @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-1-02' },
      { type: 'jira', description: 'RB-1' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    /*
       Its own room, created here rather than reusing RB-1-01's. A spec that
       depended on another having run first is the thing the conventions
       forbid outright, and on a parallel suite it is also a race.
    */
    const room = testData.room({ type: 'Double' });

    await rooms.open(authedPage);

    try {
      const created = await rooms.add(authedPage, room);
      expect(await rooms.isListed(authedPage, created), 'the room was not created').toBe(true);

      await rooms.remove(authedPage, created);

      expect(
        await rooms.isListed(authedPage, created),
        'the room survived being removed',
      ).toBe(false);
    } finally {
      // Removing twice is a no-op — `remove` tolerates a room that is gone.
      await rooms.remove(authedPage, room.name);
    }
  },
);
