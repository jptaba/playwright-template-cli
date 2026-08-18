import { test as framework } from '../../fixtures/base';
import { signIn } from './actions/sign-in';
import { rooms, type NewRoom } from './actions/rooms';

/**
 * L3 — the one import a spec makes.
 *
 * This file *is* the closed vocabulary for this application: the framework's
 * target-agnostic fixtures plus this target's named verbs and data builders.
 * Everything a generated spec may reach for is reachable from here, and
 * `docs/generated/catalog.md` lists it all for the agent.
 *
 * Keep the surface small. Resisting a fixture that only one spec wants is the
 * whole discipline — the value is in what a model *cannot* choose.
 */
export interface RestfulBookerTestData {
  /** Unique per call, so parallel workers never collide on a record. */
  record(overrides?: Partial<{ reference: string }>): { reference: string };
  /**
   * A room this run owns.
   *
   * The name is unique per call because it is also the room *number* on this
   * application, and the demo is shared with everybody on the internet — a
   * fixed number would collide with a stranger and with the next run.
   */
  room(overrides?: Partial<NewRoom>): NewRoom;
}

export interface RestfulBookerFixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /** Administering rooms: the journey this application exists for. */
  rooms: typeof rooms;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: RestfulBookerTestData;
}

export const test = framework.extend<RestfulBookerFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  rooms: async ({}, use) => {
    await use(rooms);
  },
  testData: async ({ run }, use) => {
    await use({
      // Tagged with the run id so everything created can be cleaned up, and so
      // an orphan can be traced back to the run that left it.
      record: (overrides = {}) => ({ reference: run.unique('REC'), ...overrides }),
      room: (overrides = {}) => ({
        name: run.unique('qa'),
        type: 'Single',
        accessible: true,
        price: 123,
        ...overrides,
      }),
    });
  },
});

export { expect } from '@playwright/test';
