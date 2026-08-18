import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireAccount, candidatesFor, isStale } from '../../src/support/account-lock';

/**
 * Waiting for a free account instead of quietly sharing a busy one.
 *
 * The owner's instruction, and it corrects what `accountForWorker` does: modulo
 * arithmetic hands the same identity to two consumers the moment there are more
 * of them than accounts, and tells neither. Three runs of this loop chased the
 * symptoms — a session that would not establish, a cart row that would not
 * detach — before the cause was named.
 *
 * Tested against a real directory rather than a mocked filesystem. The whole
 * mechanism *is* an atomic file create across separate processes, and a fake
 * that agrees with my assumptions would prove nothing about it.
 */

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'account-lock-'));
}

const alive = () => true;
const dead = () => false;

test.describe('holding an account', () => {
  test('one consumer takes it and the next is refused it', async () => {
    const dir = tempDir();
    const options = { target: 'shop', role: 'customer', candidates: [1], holder: 'w0', dir };

    const first = await acquireAccount(options);
    expect(first.index).toBe(1);

    // Nothing frees it, so the second waits and then says so rather than
    // silently sharing — which is the behaviour this replaced.
    await expect(
      acquireAccount({ ...options, holder: 'w1', timeoutMs: 0 }),
    ).rejects.toThrow(/stayed busy/);

    first.release();
    const second = await acquireAccount({ ...options, holder: 'w1' });
    expect(second.index, 'released, so the next consumer gets it').toBe(1);
    second.release();
  });

  test('two consumers on a pool of two never get the same account', async () => {
    const dir = tempDir();
    const options = { target: 'shop', role: 'customer', candidates: [1, 2], dir };

    const a = await acquireAccount({ ...options, holder: 'w0' });
    const b = await acquireAccount({ ...options, holder: 'w1' });

    expect(new Set([a.index, b.index]).size, 'two identities, not one shared').toBe(2);
    a.release();
    b.release();
  });

  test('a waiting consumer is handed the account the moment it is freed', async () => {
    const dir = tempDir();
    const options = { target: 'shop', role: 'customer', candidates: [1], dir };
    const holder = await acquireAccount({ ...options, holder: 'w0' });

    // Freed after two polls, so this exercises the wait rather than the
    // first-try path. `wait` is injected, so it costs no wall-clock.
    let polls = 0;
    const waiting = acquireAccount({
      ...options,
      holder: 'w1',
      timeoutMs: 10_000,
      wait: async () => {
        polls += 1;
        if (polls === 2) holder.release();
      },
    });

    const taken = await waiting;
    expect(taken.index).toBe(1);
    expect(polls, 'it waited rather than succeeding immediately').toBeGreaterThan(0);
    taken.release();
  });

  test('releasing twice is harmless', async () => {
    // Teardown runs on paths that may already have released; a throw there
    // would fail a run for tidying up.
    const dir = tempDir();
    const held = await acquireAccount({
      target: 'shop',
      role: 'customer',
      candidates: [1],
      holder: 'w0',
      dir,
    });
    held.release();
    expect(() => held.release()).not.toThrow();
  });
});

test.describe('a lock whose owner is gone', () => {
  test('a live process keeps its lock however old it is', () => {
    // A long test is not an abandoned one. Reclaiming on age alone would take
    // an account away from a worker still using it, which is worse than
    // waiting.
    expect(isStale({ holder: 'w0', pid: 1, at: 0 }, 10 * 60_000, 1000, alive)).toBe(false);
  });

  test('a dead process loses it once the stale window has passed', () => {
    expect(isStale({ holder: 'w0', pid: 999, at: 0 }, 2000, 1000, dead)).toBe(true);
    expect(isStale({ holder: 'w0', pid: 999, at: 0 }, 500, 1000, dead)).toBe(false);
  });

  test('a lock left by a killed run is reclaimed rather than blocking forever', async () => {
    /*
       Ctrl-C, a CI timeout or a machine going down all leave a file nobody
       will ever delete. Without reclamation the next run blocks for its whole
       timeout on an account that is genuinely free.
    */
    const dir = tempDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'shop.customer.1.lock'),
      JSON.stringify({ holder: 'a run that died', pid: -1, at: 0 }),
    );

    const held = await acquireAccount({
      target: 'shop',
      role: 'customer',
      candidates: [1],
      holder: 'w0',
      dir,
      staleMs: 1,
    });
    expect(held.index).toBe(1);
    held.release();
  });

  test('a corrupt lock file does not block the pool forever', async () => {
    const dir = tempDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'shop.customer.1.lock'), 'not json at all');

    const held = await acquireAccount({
      target: 'shop',
      role: 'customer',
      candidates: [1],
      holder: 'w0',
      dir,
    });
    expect(held.index).toBe(1);
    held.release();
  });
});

test('the candidates are the pool minus anything reserved', () => {
  expect(candidatesFor(3, undefined)).toEqual([1, 2, 3]);
  expect(candidatesFor(3, 3), 'auth-flows keeps account 3').toEqual([1, 2]);
  expect(candidatesFor(1, 1), 'a pool of one has nothing to reserve').toEqual([1]);
});

test('the timeout message says what to do about it', async () => {
  const dir = tempDir();
  const options = { target: 'shop', role: 'customer', candidates: [1, 2], dir };
  const a = await acquireAccount({ ...options, holder: 'w0' });
  const b = await acquireAccount({ ...options, holder: 'w1' });

  const failure = await acquireAccount({ ...options, holder: 'w2', timeoutMs: 0 }).catch(
    (error: Error) => error.message,
  );

  /*
     Two real causes needing different actions: too few accounts for the
     suites running, or locks a dead run left behind. The message names both,
     the accounts it tried, and the directory to clear — which is the one the
     caller configured, not an assumed default.
  */
  expect(failure).toContain('poolSize');
  expect(failure).toContain(path.basename(dir));
  expect(failure, 'says which accounts it waited on').toContain('(1, 2)');
  a.release();
  b.release();
});
