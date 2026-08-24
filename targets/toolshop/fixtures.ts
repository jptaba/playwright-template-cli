import { test as framework } from '../../src/fixtures/base';
import { signIn } from './actions/sign-in';
import { catalogue } from './actions/catalogue';
import { cart } from './actions/cart';
import { authApi, catalogueApi } from './api/catalogue';

/**
 * L3 — the one import a spec makes.
 *
 * This file *is* the closed vocabulary for this application: the framework's
 * target-agnostic fixtures plus this target's named verbs. Everything a
 * generated spec may reach for is reachable from here, and
 * `docs/generated/catalog.md` lists it all.
 *
 * Keep the surface small. Resisting a fixture that only one spec wants is the
 * whole discipline — the value is in what a model *cannot* choose.
 */
export interface ToolshopTestData {
  /**
   * A search term that matches several products, and one that matches none.
   *
   * Stated here rather than in a spec because they are facts about the
   * catalogue: a spec asserting "4 results for pliers" would be asserting on
   * data it did not create, and would fail the day somebody adds a fifth.
   */
  readonly searchTerm: string;
  readonly termThatMatchesNothing: string;
}

export interface ToolshopFixtures {
  signIn: typeof signIn;
  catalogue: typeof catalogue;
  cart: typeof cart;
  /** Read-only catalogue verbs over the typed client. */
  shopApi: ReturnType<typeof catalogueApi>;
  /** Exchanging a credential for a token. */
  authApi: ReturnType<typeof authApi>;
  testData: ToolshopTestData;
}

export const test = framework.extend<ToolshopFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  catalogue: async ({}, use) => {
    await use(catalogue);
  },
  cart: async ({}, use) => {
    await use(cart);
  },
  shopApi: async ({ api }, use) => {
    await use(catalogueApi(api));
  },
  authApi: async ({ api }, use) => {
    await use(authApi(api));
  },
  testData: async ({}, use) => {
    await use({
      searchTerm: 'pliers',
      /*
         Deliberately not a word: any real word risks matching a product the
         day the catalogue grows, and a negative search test that quietly stops
         testing anything is worse than one that fails.
      */
      termThatMatchesNothing: 'zzzqqqxxx',
    });
  },
});

export { expect } from '@playwright/test';
