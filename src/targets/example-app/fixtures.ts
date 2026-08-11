import { test as framework } from '../../fixtures/base';
import { signIn } from './actions/sign-in';

/**
 * L3 — TEMPLATE. The one import a spec makes.
 *
 * This file *is* the closed vocabulary for this application: the framework's
 * target-agnostic fixtures, plus this target's named verbs and data builders.
 * Everything a generated spec may reach for is reachable from here, and
 * `docs/generated/catalog.md` lists it all for the agent.
 *
 * Keep the surface small. Resisting a fixture that only one spec wants is the
 * whole discipline — the value is in what a model *cannot* choose.
 */
export interface ExampleTestData {
  /** Unique per call, so parallel workers never collide on a record. */
  order(overrides?: Partial<{ reference: string; customerId: string }>): {
    reference: string;
    customerId: string;
  };
}

export interface ExampleAppFixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: ExampleTestData;
}

export const test = framework.extend<ExampleAppFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  testData: async ({ run }, use) => {
    await use({
      // Tagged with the run id so everything created can be cleaned up, and
      // so an orphan can be traced back to the run that left it.
      order: (overrides = {}) => ({
        reference: run.unique('ORD'),
        customerId: run.unique('CUST'),
        ...overrides,
      }),
    });
  },
});

export { expect } from '@playwright/test';
