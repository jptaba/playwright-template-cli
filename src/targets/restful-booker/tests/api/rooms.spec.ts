import { expect, test } from '../../fixtures';

/**
 * RB-4 — the room service, through the typed client.
 *
 * These assert *behaviour*; the UI specs assert the journey. The pairing
 * matters here more than usual, because the admin UI reads this same endpoint
 * — so a spec that only drove the page would report a service defect as a
 * page defect, and point at the wrong file.
 *
 * Read-only throughout. Creating a room needs the admin session and the UI
 * already owns that verb; a second way to create the same record is two things
 * to keep in step.
 */

test(
  'RB-4-01 · The room listing returns rooms with the fields the admin page renders @smoke @api',
  {
    annotation: [
      { type: 'practitest', description: 'RB-4-01' },
      { type: 'jira', description: 'RB-4' },
    ],
  },
  async ({ roomsApi }) => {
    const rooms = await roomsApi.all();

    expect(rooms.length, 'the service returned no rooms at all').toBeGreaterThan(0);

    for (const room of rooms) {
      /*
         Every field the admin table shows. Asserting the *shape* rather than
         the values, because these are the vendor's demo rooms and anybody on
         the internet can edit them — "room 101 costs 100" would pass until a
         stranger changed it.
      */
      expect(room.roomid, 'a room has no id to address it by').toBeGreaterThan(0);
      expect(room.roomName.trim(), `room ${room.roomid} has no name`).not.toBe('');
      expect(room.type.trim(), `room ${room.roomid} has no type`).not.toBe('');
      expect(typeof room.accessible, `room ${room.roomid} has no accessible flag`).toBe('boolean');
      expect(Array.isArray(room.features)).toBe(true);
    }
  },
);

test(
  'RB-4-02 · Every listed room is readable by its own id @api',
  {
    annotation: [
      { type: 'practitest', description: 'RB-4-02' },
      { type: 'jira', description: 'RB-4' },
    ],
  },
  async ({ roomsApi }) => {
    /*
       The ids come from the listing rather than from this file. A transcribed
       id is a hallucinated locator wearing a different hat: it passes until
       the demo is reseeded and then reads as a service defect.
    */
    const listed = await roomsApi.all();
    const sample = listed.slice(0, 3);
    expect(sample.length, 'nothing to read back').toBeGreaterThan(0);

    for (const room of sample) {
      const byId = await roomsApi.byId(room.roomid);
      expect(byId.roomid, 'reading a room by its id returned a different room').toBe(room.roomid);
      expect(byId.roomName).toBe(room.roomName);
    }
  },
);

test(
  'RB-4-03 · Every room the listing reports is priced inside the range the form enforces @api @boundary',
  {
    annotation: [
      { type: 'practitest', description: 'RB-4-03' },
      { type: 'jira', description: 'RB-4' },
    ],
  },
  async ({ roomsApi }) => {
    /*
       The other half of RB-2's boundary specs. Those prove the *form* refuses
       0 and 1000; this proves nothing already stored sits outside the same
       range — a rule enforced only on the way in is a rule with a back door,
       and the data is where that shows.
    */
    for (const room of await roomsApi.all()) {
      expect(
        room.roomPrice,
        `room "${room.roomName}" is priced at ${room.roomPrice}, outside the 1–999 the form allows`,
      ).toBeGreaterThanOrEqual(1);
      expect(room.roomPrice).toBeLessThanOrEqual(999);
    }
  },
);
