import { test as framework } from '../../src/fixtures/base';
import { signIn } from './actions/sign-in';
import { inventory } from './actions/inventory';
import { checkout } from './actions/checkout';

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
export interface SaucedemoTestData {
  /**
   * Delivery details for checkout's first step.
   *
   * A builder rather than three literals in a spec: the form takes three
   * fields and every checkout spec needs all three, so a spec that wrote them
   * out would be stating data rather than intent. Unique per call for the same
   * reason every generated value here is.
   */
  customer(): { firstName: string; lastName: string; postalCode: string };
}

export interface SaucedemoFixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /** Browsing the product listing and the cart it feeds. */
  inventory: typeof inventory;
  /** The cart and the first step of checkout. */
  checkout: typeof checkout;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: SaucedemoTestData;
}

export const test = framework.extend<SaucedemoFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  inventory: async ({}, use) => {
    await use(inventory);
  },
  checkout: async ({}, use) => {
    await use(checkout);
  },
  testData: async ({ run }, use) => {
    await use({
      customer: () => ({
        firstName: 'Casey',
        lastName: run.unique('Tester'),
        postalCode: '12345',
      }),
    });
  },
});

export { expect } from '@playwright/test';
