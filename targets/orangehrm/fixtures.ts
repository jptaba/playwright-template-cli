import { test as framework } from '../../src/fixtures/base';
import { signIn } from './actions/sign-in';
import { users } from './actions/users';

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
export interface OrangehrmTestData {
  /** Unique per call, so parallel workers never collide on a record. */
  record(overrides?: Partial<{ reference: string }>): { reference: string };
  /**
   * A login name for a user this suite is about to create.
   *
   * Unique per call and carrying the run id, so a user left behind by a run
   * that died can be traced back to it — and so two workers creating a user at
   * the same moment do not collide on a name this application requires to be
   * unique.
   */
  username(): string;
}

export interface OrangehrmFixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /** Searching the system user list — the administrator journey. */
  users: typeof users;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: OrangehrmTestData;
}

export const test = framework.extend<OrangehrmFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  users: async ({}, use) => {
    await use(users);
  },
  testData: async ({ run }, use) => {
    await use({
      // Tagged with the run id so everything created can be cleaned up, and so
      // an orphan can be traced back to the run that left it.
      record: (overrides = {}) => ({ reference: run.unique('REC'), ...overrides }),
      // Lower case and no punctuation beyond the dash: this application
      // refuses a username it considers invalid, and that is a different
      // refusal from the one OHRM-2-01 is about.
      username: () => run.unique('qa-user').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    });
  },
});

export { expect } from '@playwright/test';
