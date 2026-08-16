import { expect, test } from '@playwright/test';
import { accountForWorker, poolSizeFor, storageStatePath } from '../../src/support/paths';

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
