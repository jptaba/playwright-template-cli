import { expect, test } from '../../fixtures';

/**
 * RB-2 — what the room form refuses, and what it says about it.
 *
 * **Negative coverage here is validation, not authentication.** This is a
 * public demo shared with everybody on the internet, and the conventions are
 * explicit that repeated bad passwords spend a lockout budget that belongs to
 * other people's next run. A form refusing a price of zero costs nobody
 * anything and is the refusal a manual tester would actually check.
 *
 * The bounds were read off the running service before being written down —
 * `POST /api/room` answers `must be greater than or equal to 1` and
 * `must be less than or equal to 999` — so these are the application's own
 * stated range rather than a guess about one.
 */

test(
  'RB-2-01 · A room with no name is refused, and the form says why @negative @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-2-01' },
      { type: 'jira', description: 'RB-2' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    const room = testData.room({ name: '' });

    await rooms.open(authedPage);
    const attempt = await rooms.attemptAdd(authedPage, room);

    expect(attempt.created, 'a room with no name was created').toBe(false);
    /*
       A refusal has to be *stated*, not merely a thing that did not happen.
       Asserting only "no room appeared" would pass just as well if the form
       had silently done nothing, which is a different and worse defect.
    */
    expect(attempt.errors.join(' '), 'the form refused without saying why').toMatch(
      /room name must be set/i,
    );
  },
);

test(
  'RB-2-02 · A price below the allowed range is refused @boundary @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-2-02' },
      { type: 'jira', description: 'RB-2' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    // Zero, which is one below the stated minimum of 1.
    const room = testData.room({ price: 0 });

    await rooms.open(authedPage);
    const attempt = await rooms.attemptAdd(authedPage, room);

    expect(attempt.created, 'a room priced at 0 was created').toBe(false);
    expect(attempt.errors.join(' ')).toMatch(/greater than or equal to 1/i);
  },
);

test(
  'RB-2-03 · A price above the allowed range is refused @boundary @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-2-03' },
      { type: 'jira', description: 'RB-2' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    // 1000, which is one above the stated maximum of 999.
    const room = testData.room({ price: 1000 });

    await rooms.open(authedPage);
    const attempt = await rooms.attemptAdd(authedPage, room);

    expect(attempt.created, 'a room priced at 1000 was created').toBe(false);
    expect(attempt.errors.join(' ')).toMatch(/less than or equal to 999/i);
  },
);

test(
  'RB-2-04 · Both ends of the allowed price range are accepted @boundary @rooms',
  {
    annotation: [
      { type: 'practitest', description: 'RB-2-04' },
      { type: 'jira', description: 'RB-2' },
    ],
  },
  async ({ authedPage, rooms, testData }) => {
    /*
       The inside of the boundary, and the half that is usually skipped. Three
       specs proving things are refused say nothing about whether the range is
       *too* narrow — a service that rejected everything would pass all of
       them. 1 and 999 are the first and last values that must work.
    */
    const cheapest = testData.room({ price: 1 });
    const dearest = testData.room({ price: 999 });

    await rooms.open(authedPage);

    try {
      expect((await rooms.attemptAdd(authedPage, cheapest)).created, 'price 1 was refused').toBe(
        true,
      );
      expect((await rooms.attemptAdd(authedPage, dearest)).created, 'price 999 was refused').toBe(
        true,
      );
    } finally {
      // A shared demo must not keep this run's rooms, whichever assertion failed.
      await rooms.remove(authedPage, cheapest.name);
      await rooms.remove(authedPage, dearest.name);
    }
  },
);
