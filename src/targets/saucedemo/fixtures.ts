import { test as framework } from '../../fixtures/base';
import { auth } from './actions/auth';
import { cartState } from './actions/cart-state';
import { checkout } from './actions/checkout';
import { inventory } from './actions/inventory';
import { CATALOG, TAX_RATE, type CatalogItem, type Customer } from './data/catalog';

/**
 * The reference target's fixture surface: the framework's target-agnostic
 * fixtures plus this target's named business actions.
 *
 * Specs import `test` and `expect` from here and nowhere else. That import is
 * the closed vocabulary — everything a generated spec is allowed to reach for
 * is reachable from this one line (§02).
 */

export interface SaucedemoTestData {
  /** `count` products from the catalogue, cheapest first, with known prices. */
  catalogItems(options?: { count?: number }): CatalogItem[];
  /** Delivery details. Unique per call so parallel orders never collide. */
  customer(overrides?: Partial<Customer>): Customer;
  /** The tax rate the store is specified to apply. */
  taxRate: number;
}

export interface SaucedemoFixtures {
  /** Signing in and out, and reading what the sign-in form said. */
  auth: typeof auth;
  /** The product listing: browsing, sorting, and adding to the cart. */
  inventory: typeof inventory;
  /** The cart and the three checkout steps, up to placing the order. */
  checkout: typeof checkout;
  /** Read and seed the cart where this application actually persists it. */
  cartState: typeof cartState;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: SaucedemoTestData;
}

export const test = framework.extend<SaucedemoFixtures>({
  auth: async ({}, use) => {
    await use(auth);
  },
  inventory: async ({}, use) => {
    await use(inventory);
  },
  checkout: async ({}, use) => {
    await use(checkout);
  },
  cartState: async ({}, use) => {
    await use(cartState);
  },
  testData: async ({ run }, use) => {
    await use({
      taxRate: TAX_RATE,
      catalogItems: ({ count = 1 } = {}) => {
        if (count > CATALOG.length) {
          throw new Error(
            `Asked for ${count} catalogue items but the reference target only sells ${CATALOG.length}.`,
          );
        }
        return [...CATALOG].sort((a, b) => a.price - b.price).slice(0, count);
      },
      customer: (overrides = {}) => ({
        firstName: 'Ada',
        lastName: run.unique('Tester'),
        postalCode: 'SW1A 1AA',
        ...overrides,
      }),
    });
  },
});

export { expect } from '@playwright/test';
