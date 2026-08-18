import fs from 'node:fs';
import path from 'node:path';
import { repoPath, usableAccounts } from './paths';

/**
 * Waiting for a free account, rather than quietly sharing one.
 *
 * **The owner's instruction, and it corrects what partitioning does:** if a
 * test needs a pooled user and every one of them is busy, it should *wait*
 * until one is freed, and so should the tests behind it.
 *
 * `accountForWorker` never waits. It maps a worker slot onto an account by
 * modulo, so the moment there are more consumers than accounts two of them are
 * handed the same identity and neither is told. That is invisible until a spec
 * mutating server-side state loses a race, and then it surfaces as a cart with
 * one item too many, a session that would not establish, or a row that would
 * not detach — three symptoms this repository has now chased three times.
 *
 * Consumers are **not** just workers, which is why capping the worker count
 * did not solve it: `e2e`, `a11y` and `auth-flows` run concurrently and each
 * has its own slot 0. A lock is the only thing that can see across all of them.
 *
 * **Why a file and not a variable.** Playwright workers are separate
 * processes, so nothing in memory can coordinate them. `open(…, 'wx')` fails
 * if the path exists and is atomic on every platform this runs on, which makes
 * "create the lock file" the whole mutual exclusion.
 */

/** Where locks live. Gitignored, machine-local, and safe to delete at any time. */
export const LOCKS_DIR = repoPath('.locks');

export interface AccountLockOptions {
  target: string;
  role: string;
  /** Accounts this consumer may take, already excluding any reserved one. */
  candidates: number[];
  /** Who holds it, for a lock file somebody has to diagnose. */
  holder: string;
  /** Give up after this long rather than hanging a run. */
  timeoutMs?: number;
  /** How long before a lock is assumed abandoned by a crashed worker. */
  staleMs?: number;
  /** Injected in tests so waiting costs no wall-clock. */
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  dir?: string;
}

export interface HeldAccount {
  index: number;
  release(): void;
}

interface LockRecord {
  holder: string;
  pid: number;
  at: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const lockFile = (dir: string, target: string, role: string, index: number): string =>
  path.join(dir, `${target}.${role}.${index}.lock`);

/**
 * Whether a lock may be taken from whoever wrote it.
 *
 * Two ways a lock outlives its owner: the process was killed (Ctrl-C, a CI
 * timeout) or the machine went down mid-run. Both leave a file nobody will
 * ever delete, and without reclamation the next run blocks for its whole
 * timeout on an account that is genuinely free.
 *
 * A live process on this machine is never reclaimed regardless of age — a long
 * test is not an abandoned one — so age alone is only trusted for a holder
 * this machine cannot ask about.
 */
export function isStale(
  record: LockRecord,
  now: number,
  staleMs: number,
  alive: (pid: number) => boolean,
): boolean {
  if (record.pid > 0 && alive(record.pid)) return false;
  return now - record.at >= staleMs;
}

function processAlive(pid: number): boolean {
  try {
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists and belongs to somebody else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryTake(file: string, holder: string, staleMs: number, now: number): boolean {
  const record: LockRecord = { holder, pid: process.pid, at: now };
  try {
    fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  let existing: LockRecord;
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8')) as LockRecord;
  } catch {
    // Unreadable or half-written: treat it as abandoned rather than blocking
    // the pool on a corrupt file forever.
    existing = { holder: 'unknown', pid: -1, at: 0 };
  }

  if (!isStale(existing, now, staleMs, processAlive)) return false;

  /*
     Reclaim, then take it the same way. Deleting and re-creating with `wx`
     rather than overwriting keeps the race honest: if two workers both decide
     the lock is stale, exactly one of their creates wins.
  */
  try {
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take one of `candidates`, waiting until one is free.
 *
 * Returns the account index and the release. Throws with the pool's own
 * numbers when nothing frees in time — a run that hangs forever on a busy pool
 * is worse than one that says the pool is too small.
 */
export async function acquireAccount(options: AccountLockOptions): Promise<HeldAccount> {
  const {
    target,
    role,
    candidates,
    holder,
    timeoutMs = Number(process.env.ACCOUNT_WAIT_TIMEOUT_MS ?? 120_000),
    staleMs = Number(process.env.ACCOUNT_LOCK_STALE_MS ?? 10 * 60_000),
    now = Date.now,
    wait = sleep,
    dir = LOCKS_DIR,
  } = options;

  if (candidates.length === 0) throw new Error(`No accounts to lease for role '${role}'.`);
  fs.mkdirSync(dir, { recursive: true });

  const deadline = now() + timeoutMs;
  let waited = 0;

  for (;;) {
    for (const index of candidates) {
      if (tryTake(lockFile(dir, target, role, index), holder, staleMs, now())) {
        let released = false;
        return {
          index,
          release: () => {
            if (released) return;
            released = true;
            fs.rmSync(lockFile(dir, target, role, index), { force: true });
          },
        };
      }
    }

    if (now() >= deadline) {
      throw new Error(
        `Waited ${Math.round(waited / 1000)}s for a free '${role}' account on '${target}' and ` +
          `all ${candidates.length} (${candidates.join(', ')}) stayed busy.\n` +
          'Either the pool is smaller than the number of suites running against it — raise ' +
          'credentials.poolSize if the application really has more accounts — or a previous run ' +
          `left locks behind, in which case delete ${path.relative(repoPath('.'), dir)}/.`,
      );
    }

    // Short and fixed: the wait is for another *test* to finish, which is
    // seconds, and backing off would spend a freed account sitting idle.
    await wait(250);
    waited += 250;
  }
}

/** The accounts a consumer of this role may take. */
export function candidatesFor(
  poolSize: number,
  reserved: number | undefined,
): number[] {
  return usableAccounts(poolSize, reserved);
}
