import { expect, test } from '@playwright/test';
import {
  formatPoolMeasurement,
  poolCost,
  poolMeasureExitCode,
  whatThereIsToMeasure,
  type PoolMeasurement,
} from '../../src/support/pool-measure';
import type { TargetProfile } from '../../config/targets/types';

/**
 * Is the account pool earning what it costs — open-items.md item 56.
 *
 * The item was raised because `serverState` is human-declared and nothing
 * checks it. Every profile in this repository declares it true and four still
 * carry the scaffolder's unanswered comment; on toolshop the claim explains a
 * three-customer pool, and the cart it is about lives in `sessionStorage`,
 * which is per-tab. Two workers signing in as the same customer were never
 * going to share it.
 *
 * Everything asserted here is pure — a profile in, a report out — which is
 * what lets the reporting be tested at all, given the thing it reports on
 * needs a real deployment.
 */
function profile(overrides: Partial<TargetProfile> = {}): TargetProfile {
  return {
    name: 'demo',
    roles: ['customer', 'admin'],
    credentials: { source: 'local', root: 'qa/demo', accountType: 'pools' },
    capabilities: { serverState: true },
    ...overrides,
  } as unknown as TargetProfile;
}

test.describe('what the profile is spending', () => {
  test('a pool of one costs nothing, so there is nothing to measure', () => {
    expect(whatThereIsToMeasure(poolCost(profile()))).toBeNull();
  });

  test('serverState false caps no workers, whatever the pool holds', () => {
    // The two are a pair: the pool only bounds workers because state is
    // supposed to be shared. Without that claim it bounds nothing.
    const cost = poolCost(
      profile({
        credentials: { source: 'local', root: 'qa/demo', accountType: 'pools', poolSize: { customer: 3 } },
        capabilities: { serverState: false },
      } as unknown as Partial<TargetProfile>),
    );

    expect(whatThereIsToMeasure(cost)).toBeNull();
  });

  test('a pool with a reservation reports the workers it actually leaves', () => {
    /*
       Toolshop's shape exactly: three customers with the third reserved for
       auth-flows, so `e2e` runs at two. That is the cost the measurement is
       asking about, and it is not the pool size.
    */
    const cost = poolCost(
      profile({
        credentials: {
          source: 'local',
          root: 'qa/demo',
          accountType: 'pools',
          poolSize: { customer: 3 },
          authFlowAccount: 3,
        },
      } as unknown as Partial<TargetProfile>),
    );

    expect(cost.poolSize).toBe(3);
    expect(cost.usable).toBe(2);
    expect(whatThereIsToMeasure(cost)).toContain('2 worker(s)');
    expect(whatThereIsToMeasure(cost)).toContain('reserved for auth-flows');
  });
});

test.describe('reporting the measurement', () => {
  const cost = poolCost(
    profile({
      credentials: {
        source: 'local',
        root: 'qa/demo',
        accountType: 'pools',
        poolSize: { customer: 3 },
        authFlowAccount: 3,
      },
    } as unknown as Partial<TargetProfile>),
  );

  const measurement = (
    collapsed: PoolMeasurement['collapsed'],
    baseline: PoolMeasurement['baseline'] = [{ failures: [], passed: 8, error: null }],
  ): PoolMeasurement => ({ target: 'demo', cost, baseline, collapsed });

  test('a clean control and a clean collapsed arm says the pool is buying nothing', () => {
    /*
       It stops short of "delete the pool" on purpose. A pool also protects
       against collisions no spec currently exercises, and a tool that
       recommended removing safety on the strength of two green runs would be
       making a judgement it has no standing to make.
    */
    const report = formatPoolMeasurement(
      measurement(
        [
          { failures: [], passed: 8, error: null },
          { failures: [], passed: 8, error: null },
        ],
        [
          { failures: [], passed: 8, error: null },
          { failures: [], passed: 8, error: null },
        ],
      ),
    ).join('\n');

    expect(report).toContain('2/2 green at the declared pool · 2/2 green on one account');
    expect(report).toContain('buying no protection');
    expect(report).toContain('the decision is a person’s');
  });

  test('only the collapsed arm failing is the shape contention makes', () => {
    /*
       A clean control and a red collapsed arm is the only shape that is
       evidence *for* the pool — and even then the report asks whether the
       failing specs share the pooled identity, because toolshop's failures
       under load land on catalogue search, which signs in as nobody.
    */
    const report = formatPoolMeasurement(
      measurement([
        { failures: ['TOOL-3-02 · A product removed from the cart is gone from it'], passed: 6, error: null },
      ]),
    ).join('\n');

    expect(report).toContain('1/1 green at the declared pool · 0/1 green on one account');
    expect(report).toContain('share the pooled identity');
    expect(report).toContain('TOOL-3-02');
  });

  test('both arms failing measures nothing, and says so instead of guessing', () => {
    /*
       The answer the first version of this command could not give, and the
       reason it grew a control arm. Toolshop failed 1 of 2 collapsed runs on a
       cart spec — which reads as proof the pool is needed until you notice the
       same suite had failed at its declared pool on each of the two previous
       days, on a different spec each time.
    */
    const report = formatPoolMeasurement(
      measurement(
        [{ failures: ['TOOL-3-02 · A product removed from the cart'], passed: 6, error: null }],
        [{ failures: ['TOOL-1-02 · A search that matches nothing'], passed: 6, error: null }],
      ),
    ).join('\n');

    expect(report).toContain('measures nothing about the pool');
    expect(report).toContain('background failure rate');
  });

  test('a run that could not happen is reported apart from one that failed', () => {
    // Nothing was measured, which is a different thing from something
    // failing — the same distinction `suites:live` draws.
    const report = formatPoolMeasurement(
      measurement([{ failures: [], passed: 0, error: 'no run model was written' }]),
    ).join('\n');

    expect(report).toContain('could not run — no run model was written');
    expect(report).toContain('One arm did not run, so there is nothing to compare');
  });
});

test.describe('what the command exits with', () => {
  const cost = poolCost(profile());

  test('a failure under a collapsed pool is a result, not an error', () => {
    // Both answers are the measurement working. Exiting non-zero on one of
    // them would make the command unusable in exactly the case it is for.
    expect(
      poolMeasureExitCode({
        target: 'demo',
        cost,
        baseline: [{ failures: [], passed: 2, error: null }],
        collapsed: [{ failures: ['x'], passed: 1, error: null }],
      }),
    ).toBe(0);
  });

  test('being unable to measure at all is a two', () => {
    expect(
      poolMeasureExitCode({
        target: 'demo',
        cost,
        baseline: [{ failures: [], passed: 2, error: null }],
        collapsed: [{ failures: [], passed: 0, error: 'could not start Playwright' }],
      }),
    ).toBe(2);
  });
});
