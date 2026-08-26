import { test as framework } from '../../src/fixtures/base';
import { signIn } from './actions/sign-in';
import { rooms, type NewRoom } from './actions/rooms';
import { roomsApi } from './api/rooms';

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
  /**
   * Reading rooms back from the service.
   *
   * Read-only and unauthenticated, which is the point: it answers whether
   * what the UI did actually persisted, through a different surface from the
   * one that did it.
   */
  roomsApi: ReturnType<typeof roomsApi>;
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
  roomsApi: async ({ api }, use) => {
    await use(roomsApi(api));
  },
  testData: async ({ run }, use) => {
    await use({
      // Named through the run id so everything created can be cleaned up, and
      // so a room left behind by a run that died can be traced back to it.
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
