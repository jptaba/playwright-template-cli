import { expect, test } from '@playwright/test';
import {
  accountForWorker,
  poolSizeFor,
  resolveWorkers,
  storageStatePath,
  usableAccounts,
  workerCeiling,
} from '../../src/support/paths';

/**
 * A static pool of accounts, partitioned across workers — §19.
 *
 * §19 has always said "partition per worker with `run.workerIndex`", and until
 * now nothing implemented it: `leased` needs Vault's compare-and-swap, so a
 * target with three perfectly good accounts in a local store had every worker
 * signing in as the first one. On an application with server-side state — a
 * cart, a draft, a half-finished wizard — that is not a slow suite but a wrong
 * one, and the failures look like defects.
 *
 * Nothing here knows what application it is for. Everything is a function of
 * a worker index and a declared pool size.
 */

test.describe('choosing an account for a worker', () => {
  test('a single account is what every worker gets', () => {
    // The shape every target had before pools existed, and still the default.
    for (const worker of [0, 1, 2, 7]) expect(accountForWorker(worker, 1)).toBe(1);
    expect(accountForWorker(3), 'undefined means one').toBe(1);
    expect(accountForWorker(3, 0), 'so does nonsense').toBe(1);
  });

  test('workers are spread across the pool, one each', () => {
    expect([0, 1, 2].map((worker) => accountForWorker(worker, 3))).toEqual([1, 2, 3]);
  });

  test('more workers than accounts wraps rather than running out', () => {
    /*
       Two workers then share an account, which is the same contention a
       single-account pool always had and no worse. Failing instead would make
       the suite's parallelism depend on how many logins somebody had created.
    */
    expect([0, 1, 2, 3, 4, 5].map((worker) => accountForWorker(worker, 3))).toEqual([
      1, 2, 3, 1, 2, 3,
    ]);
  });

  test('the same worker always gets the same account', () => {
    // Coordination-free is the whole point: no lock, no lease, no registry —
    // and a session established once can be reused for the whole run.
    expect(accountForWorker(5, 4)).toBe(accountForWorker(5, 4));
  });
});

test.describe('how many accounts a role has', () => {
  test('unstated is one', () => {
    expect(poolSizeFor(undefined, 'customer')).toBe(1);
  });

  test('a number applies to every role', () => {
    expect(poolSizeFor(4, 'customer')).toBe(4);
    expect(poolSizeFor(4, 'admin')).toBe(4);
  });

  test('a map states each role, and anything unstated is one', () => {
    /*
       Roles genuinely differ, and writing this as a single number broke on the
       first real application: three customer accounts and one administrator,
       and `setup:auth` went looking for `admin/2`. Defaulting the unstated
       role to one means adding a pool for one role cannot silently invent
       accounts for another.
    */
    const declared = { customer: 3 };
    expect(poolSizeFor(declared, 'customer')).toBe(3);
    expect(poolSizeFor(declared, 'admin')).toBe(1);
  });

  test('a size below one is still one', () => {
    expect(poolSizeFor({ customer: 0 }, 'customer')).toBe(1);
    expect(poolSizeFor(-2, 'customer')).toBe(1);
  });
});

test.describe('where a session is kept', () => {
  test('the first account keeps the original filename', () => {
    /*
       Backwards compatibility that matters: every target with one account per
       role is untouched, and no `.auth/` file already on disk is orphaned by
       adding pools to the framework.
    */
    expect(storageStatePath('customer', 'shop')).toMatch(/shop\.customer\.json$/);
    expect(storageStatePath('customer', 'shop', 1)).toMatch(/shop\.customer\.json$/);
  });

  test('every other account gets its own', () => {
    // One file per role would hand every worker the first account's cookies
    // whatever account it was given — partitioned in name, sharing an identity
    // in fact, which is the failure partitioning exists to remove.
    expect(storageStatePath('customer', 'shop', 2)).toMatch(/shop\.customer\.2\.json$/);
    expect(storageStatePath('customer', 'shop', 3)).toMatch(/shop\.customer\.3\.json$/);
  });

  test('two roles never share a file, whatever their pool sizes', () => {
    const paths = new Set([
      storageStatePath('customer', 'shop', 1),
      storageStatePath('customer', 'shop', 2),
      storageStatePath('admin', 'shop', 1),
      storageStatePath('admin', 'shop', 2),
    ]);
    expect(paths.size).toBe(4);
  });

  test('two targets never share one either', () => {
    expect(storageStatePath('customer', 'shop-one', 2)).not.toBe(
      storageStatePath('customer', 'shop-two', 2),
    );
  });
});

test('a worker reads the credential for the account it was given', () => {
  /*
     The end-to-end of the whole feature, as a pure calculation: worker 1 on a
     three-account customer pool signs in as account 2 and carries account 2's
     session. Before this, both halves said 1 and the suite looked partitioned
     while every worker shared one identity.
  */
  const poolSize = poolSizeFor({ customer: 3, admin: 1 }, 'customer');
  const index = accountForWorker(1, poolSize);

  expect(index).toBe(2);
  expect(`qa/shop/pools/workforce/customer/${index}`).toBe('qa/shop/pools/workforce/customer/2');
  expect(storageStatePath('customer', 'shop', index)).toMatch(/shop\.customer\.2\.json$/);

  // And the administrator, on the same run, stays on its only account.
  expect(accountForWorker(1, poolSizeFor({ customer: 3, admin: 1 }, 'admin'))).toBe(1);
});

test('a restarted worker must not be partitioned by the index that counts restarts', () => {
  /*
     The bug this pins, found by reading a live failure's `workerIndex` and
     noticing it was 6 on a suite capped at 3 workers.

     Playwright's `workerIndex` is unique per worker *process* and increments
     on every restart; only `parallelIndex` is bounded by the worker count. So
     partitioning a pool on `workerIndex` collides the moment a worker dies:
     three workers hold accounts 1, 2, 3; worker 1 restarts as worker 3; the
     live workers are 0, 2, 3 — and 0 and 3 are both on account 1.

     That is precisely the contention the pool exists to remove, and capping
     the worker count (item 30) does not prevent it, because the cap bounds how
     many workers run at once and not what they are numbered.
  */
  const poolSize = 3;
  const liveWorkerIndexes = [0, 2, 3]; // worker 1 died and came back as 3
  const byWorkerIndex = liveWorkerIndexes.map((index) => accountForWorker(index, poolSize));
  expect(new Set(byWorkerIndex).size, 'workerIndex hands two live workers one account').toBe(2);

  // The slots those same three workers occupy are always 0, 1, 2.
  const bySlot = [0, 1, 2].map((slot) => accountForWorker(slot, poolSize));
  expect(new Set(bySlot).size, 'parallelIndex gives each live worker its own').toBe(3);
});

test.describe('an account reserved for the project that signs in', () => {
  /*
     `auth-flows` has no `dependencies`, so it runs concurrently with `e2e`,
     and `secrets.account(role)` defaults to index 1 — the account e2e's
     slot-0 worker holds. On a target with server-side state that is two live
     sessions for one identity, one of them mutating a cart. Neither the
     worker ceiling nor `parallelIndex` prevents it: both bound how *workers*
     are numbered, and this is two *projects* holding one slot number.
  */
  test('is withheld from every worker', () => {
    expect(usableAccounts(3, 3)).toEqual([1, 2]);
    expect([0, 1, 2, 3].map((slot) => accountForWorker(slot, 3, 3))).toEqual([1, 2, 1, 2]);
  });

  test('can be any index, not only the last', () => {
    // Reserving the middle one must not silently shift the others.
    expect(usableAccounts(3, 2)).toEqual([1, 3]);
    expect(accountForWorker(0, 3, 2)).toBe(1);
    expect(accountForWorker(1, 3, 2)).toBe(3);
  });

  test('lowers the worker ceiling, because a reserved account cannot be given out', () => {
    // Toolshop's shape: three customers, one reserved, so e2e runs at two.
    expect(workerCeiling(['customer', 'admin'], { customer: 3, admin: 1 }, true, 3)).toBe(2);
  });

  test('is ignored on a pool of one, where there is no spare identity', () => {
    /*
       Honouring it would leave workers with no account at all — a silent
       degradation worse than the collision. The doctor warns about this
       configuration separately; the runtime simply refuses to make it worse.
    */
    expect(usableAccounts(1, 1)).toEqual([1]);
    expect(accountForWorker(0, 1, 1)).toBe(1);
    expect(workerCeiling(['customer'], undefined, true, 1)).toBe(1);
  });

  test('reserving nothing leaves every target exactly as it was', () => {
    expect(usableAccounts(3)).toEqual([1, 2, 3]);
    expect([0, 1, 2].map((slot) => accountForWorker(slot, 3))).toEqual([1, 2, 3]);
    expect(workerCeiling(['customer'], { customer: 3 }, true)).toBe(3);
  });
});

test.describe('capping workers at the pool that would collide', () => {
  test('no server state means nothing to cap', () => {
    // Client-only state: two workers reusing the same account share nothing
    // an assertion can see, so the ceiling does not apply.
    expect(workerCeiling(['customer'], { customer: 3 }, false)).toBeNull();
  });

  test('no role means nothing to cap', () => {
    expect(workerCeiling([], undefined, true)).toBeNull();
  });

  test('binds on the first role, not the smallest pool across every role', () => {
    /*
       Toolshop's own shape: three customer accounts, one administrator
       nothing writes as. Binding on the minimum would cap the whole suite at
       1 for a collision `admin` can never cause, because `roles[0]` is the
       identity `authedPage` actually carries.
    */
    expect(workerCeiling(['customer', 'admin'], { customer: 3, admin: 1 }, true)).toBe(3);
    expect(workerCeiling(['admin', 'customer'], { customer: 3, admin: 1 }, true)).toBe(1);
  });

  test('an undeclared pool caps at one, same as accountForWorker', () => {
    // saucedemo's shape: serverState true, no poolSize declared.
    expect(workerCeiling(['standard'], undefined, true)).toBe(1);
  });
});

test.describe('turning a ceiling into a worker count', () => {
  test('no ceiling leaves both defaults untouched', () => {
    expect(resolveWorkers(null, false), 'local, unset — Playwright decides').toBeUndefined();
    expect(resolveWorkers(null, true), 'CI, unset — the repository default').toBe(4);
  });

  test('a ceiling below the CI default lowers it', () => {
    expect(resolveWorkers(3, true)).toBe(3);
    expect(resolveWorkers(1, true)).toBe(1);
  });

  test('a ceiling above the CI default does not raise it', () => {
    // A generous pool must not turn into a request for more workers than CI
    // grants everyone else.
    expect(resolveWorkers(10, true)).toBe(4);
  });

  test('locally, the ceiling is the worker count outright', () => {
    expect(resolveWorkers(3, false)).toBe(3);
    expect(resolveWorkers(1, false)).toBe(1);
  });
});
