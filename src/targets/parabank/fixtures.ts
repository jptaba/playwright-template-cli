import { test as framework } from '../../fixtures/base';
import { signIn } from './actions/sign-in';
import { banking } from './actions/accounts';

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
export interface ParabankTestData {
  /** Unique per call, so parallel workers never collide on a record. */
  record(overrides?: Partial<{ reference: string }>): { reference: string };
  /**
   * A small transfer amount this worker alone will use.
   *
   * This demo is shared and keeps every transfer anybody has ever made, so an
   * amount two concurrent workers both chose would let one worker's row answer
   * the other's search. Distinct per parallel slot fixes that.
   *
   * It does **not** try to be unique across runs, and it should not: the specs
   * that use it assert a *change* in how many transactions carry the amount,
   * never that there is exactly one. A count is the only claim that survives
   * an application whose history nobody clears.
   */
  transferAmount(): string;
}

export interface ParabankFixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /**
   * Accounts, and moving money between two of them.
   *
   * Named `banking` rather than `accounts` on purpose: the framework already
   * provides an `accounts` fixture — the account *pool*, with `lease` — and a
   * target that shadows it does not override it, it fails to typecheck. The
   * clash is worth knowing before naming the next target's verbs.
   */
  banking: typeof banking;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: ParabankTestData;
}

export const test = framework.extend<ParabankFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  banking: async ({}, use) => {
    await use(banking);
  },
  testData: async ({ run }, use) => {
    await use({
      // Tagged with the run id so everything created can be cleaned up, and so
      // an orphan can be traced back to the run that left it.
      record: (overrides = {}) => ({ reference: run.unique('REC'), ...overrides }),
      // Small on purpose: these move real money on a demo everybody shares.
      transferAmount: () => `1.${String(10 + (run.parallelIndex % 80)).padStart(2, '0')}`,
    });
  },
});

export { expect } from '@playwright/test';
