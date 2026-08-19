import { expect, test, type Page } from '@playwright/test';
import { roomLocators } from '../locators/rooms';

/**
 * L2 — the business verbs for administering rooms.
 *
 * Composes L1, returns data, asserts nothing about outcomes. The one `expect`
 * here is `expect.poll` used as a **wait**, not as a claim: this application
 * renders its room list from a request and the whole page reads "Loading…"
 * until it lands, so a verb that returned before that consistently answered
 * about a page that had not arrived.
 */

export interface NewRoom {
  /** Room name, which this application also uses as the room's number. */
  name: string;
  type: string;
  accessible: boolean;
  price: number;
}

export const rooms = {
  /**
   * Open the admin room list and wait for it to have actually loaded.
   *
   * **Waits for the Create button, not for the navigation.** The admin page
   * renders its shell immediately and then validates the session; a verb that
   * returned on `goto` read an empty list on a page still showing "Loading…",
   * and the spec reported "the room was not listed" about a room that was
   * simply not fetched yet.
   */
  async open(page: Page): Promise<void> {
    await test.step('Open the room list', async () => {
      await page.goto('/admin');
      await roomLocators.create(page).waitFor({ state: 'visible' });
    });
  },

  /**
   * Add a room, and return the name it was created with.
   *
   * Returns rather than asserts, so a spec can decide what the outcome means.
   */
  async add(page: Page, room: NewRoom): Promise<string> {
    return test.step(`Add room "${room.name}"`, async () => {
      await roomLocators.name(page).fill(room.name);
      await roomLocators.type(page).selectOption(room.type);
      await roomLocators.accessible(page).selectOption(String(room.accessible));
      await roomLocators.price(page).fill(String(room.price));
      await roomLocators.create(page).click();

      /*
         Wait for the room to be *listed*, not for the click. The create posts
         and the list refetches, so returning on the click let the next step
         read the list as it was before — the "wait for the fact, not the
         network" rule, and the fact here is a row that says this room's name.
      */
      await roomLocators.listed(page, room.name).waitFor({ state: 'visible' });
      return room.name;
    });
  },

  /**
   * Try to add a room, and report what happened either way.
   *
   * **`add` cannot express a refusal, and that is why this exists.** It waits
   * for the room to be listed, so a spec about a *rejected* room would sit
   * there until it timed out and then report "the room was not listed" — a
   * message about the application, describing a validation rule working
   * correctly. A vocabulary has to be able to describe every state the
   * application has, and "refused, and here is what it said" is one of them.
   *
   * Waits for whichever arrives first: the row, or the alert. Polling for both
   * is what keeps a refusal fast rather than a timeout.
   */
  async attemptAdd(page: Page, room: NewRoom): Promise<{ created: boolean; errors: string[] }> {
    return test.step(`Try to add room "${room.name}" at ${room.price}`, async () => {
      await roomLocators.name(page).fill(room.name);
      await roomLocators.type(page).selectOption(room.type);
      await roomLocators.accessible(page).selectOption(String(room.accessible));
      await roomLocators.price(page).fill(String(room.price));
      await roomLocators.create(page).click();

      const listed = roomLocators.listed(page, room.name);
      const alert = roomLocators.errors(page);
      await expect
        .poll(async () => (await listed.count()) > 0 || (await alert.count()) > 0, {
          message: `the form neither listed "${room.name}" nor said why it would not`,
        })
        .toBe(true);

      if ((await listed.count()) > 0) return { created: true, errors: [] };
      return {
        created: false,
        errors: (await roomLocators.errorMessages(page).allTextContents())
          .map((text) => text.trim())
          .filter(Boolean),
      };
    });
  },

  /** Every room name currently listed, in the order shown. */
  async listed(page: Page): Promise<string[]> {
    return test.step('Read the listed rooms', async () => {
      /*
         Anchored on something that waits before counting. `count()` alone does
         not wait, so on a list still loading it returns a truthful zero and
         the assertion then reads "expected 1, received 0" and points at the
         application.
      */
      await roomLocators.create(page).waitFor({ state: 'visible' });
      // locator-justification: rooms render as bare paragraphs whose only handle is the derived id.
      const listed = page.locator('p[id^="roomName"]');
      const ids = await listed.allTextContents();
      return ids.map((text) => text.trim()).filter(Boolean);
    });
  },

  /**
   * Remove a room, and wait for it to be gone.
   *
   * Used in a `finally`, so it must tolerate a room that was never created —
   * a spec that failed before adding one would otherwise fail again in its own
   * cleanup and report the wrong cause.
   */
  async remove(page: Page, name: string): Promise<void> {
    await test.step(`Remove room "${name}"`, async () => {
      const row = roomLocators.listed(page, name);
      if ((await row.count()) === 0) return;
      await roomLocators.remove(page, name).click();
      // The row detaching is the fact that the delete happened; the request
      // returning is not.
      await row.waitFor({ state: 'detached' });
    });
  },

  /** Whether a room with this name is listed. Non-waiting, for an assertion to poll. */
  async isListed(page: Page, name: string): Promise<boolean> {
    return (await roomLocators.listed(page, name).count()) > 0;
  },
};

/** Re-exported so a spec can poll a genuinely asynchronous fact. */
export { expect };
