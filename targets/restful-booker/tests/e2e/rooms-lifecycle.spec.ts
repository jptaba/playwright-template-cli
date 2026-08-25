import { expect, test } from '../../fixtures';

/**
 * RB-3 — that a change sticks, and that repeating it does not repeat its
 * effect.
 *
 * Both specs here cross a surface: the UI makes the change and the **service**
 * is asked whether it happened. That is deliberate. A spec that creates a room
 * in the UI and then reads the UI has only proved the page is consistent with
 * itself, which it would be even if nothing were persisted at all — a
 * client-side list would pass it.
 */

test(
  'RB-3-01 · A room created in the admin survives a re-read from the service @audit @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-3-01' },
      { type: 'jira', description: 'RB-3' },
    ],
  },
  async ({ authedPage, rooms, roomsApi, testData }) => {
    const room = testData.room({ type: 'Double', price: 175 });

    await rooms.open(authedPage);

    try {
      await rooms.add(authedPage, room);

      /*
         Read back through the service, unauthenticated, on a different
         connection from the one that wrote it. This is the audit question —
         did the system actually record this, and does the record still say
         what was entered.
      */
      const recorded = await roomsApi.byName(room.name);

      expect(recorded, `the service has no record of room "${room.name}"`).not.toBeNull();
      expect(recorded!.roomPrice, 'the price was not recorded as entered').toBe(room.price);
      expect(recorded!.type).toBe(room.type);
      expect(recorded!.accessible).toBe(room.accessible);

      /*
         And it survives being read again by id — the identifier the service
         assigned, derived from the record rather than written down. A value
         that is only correct on the response that created it is not a record.
      */
      const again = await roomsApi.byId(recorded!.roomid);
      expect(again.roomName, 'reading the room by its own id returned a different room').toBe(
        room.name,
      );
      expect(again.roomPrice).toBe(room.price);
    } finally {
      await rooms.remove(authedPage, room.name);
    }
  },
);

test(
  'RB-3-02 · Removing a room twice removes one room @idempotency @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-3-02' },
      { type: 'jira', description: 'RB-3' },
    ],
  },
  async ({ authedPage, rooms, roomsApi, testData }) => {
    const room = testData.room();
    /*
       A second room this spec owns, standing in for "everything else on the
       list" — the total room count is not, because it is the whole shared
       demo's count and this suite's own other specs add and remove rooms on
       that same list concurrently. A canary answers the actual concern
       stated below without racing anyone: it proves the second removal did
       not reach past `room`, using a record only this test can delete.
    */
    const canary = testData.room({ type: 'Double' });

    await rooms.open(authedPage);

    try {
      await rooms.add(authedPage, room);
      await rooms.add(authedPage, canary);

      await rooms.remove(authedPage, room.name);
      await rooms.remove(authedPage, room.name);

      /*
         The point of an idempotency check is more than absence. "It is gone"
         passes whether the second removal did nothing or deleted somebody
         else's room — and on a shared demo the second is a real possibility,
         since the delete control is addressed by position within its row.
         The canary is what proves it did not: a room this spec created and
         never asked to remove, still there after the second call.
      */
      const after = await roomsApi.all();
      const names = after.map((listed) => listed.roomName);
      expect(names, 'removing the room twice left it behind').not.toContain(room.name);
      expect(
        names,
        'removing the same room twice also removed a different one',
      ).toContain(canary.name);
    } finally {
      await rooms.remove(authedPage, room.name);
      await rooms.remove(authedPage, canary.name);
    }
  },
);
