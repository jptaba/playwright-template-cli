import type { VaultSecretStore } from './vault-store';

/**
 * Account pools, leased per worker — §13, §22.
 *
 * Tests declare what they need — a role — rather than naming a user. A
 * worker-scoped lease means one login and one storage state per worker, not
 * per test, while still guaranteeing two parallel workers never share an
 * identity.
 *
 * Four properties this has to get right, each of which corresponds to a
 * failure that looks like something else entirely:
 *
 *  - **Atomic.** Two runners starting simultaneously will otherwise both take
 *    account 1. A KV v2 compare-and-swap write is the cheapest correct answer.
 *  - **TTL'd.** A crashed runner that never releases its lease shrinks the pool
 *    permanently. Leases expire so abandonment self-heals.
 *  - **Loud on exhaustion.** "No available account for role approver: pool size
 *    4, all leased" — never a timeout ten minutes later.
 *  - **Observable.** Utilisation is reported, so shrinkage is visible before it
 *    is critical.
 */

export type AccountState = 'available' | 'leased' | 'quarantined';

export interface LeaseRecord {
  state: AccountState;
  /** Who holds it: run id plus worker index, so an orphan is traceable. */
  holder?: string;
  /** Epoch milliseconds. A lease past this is treated as free. */
  expiresAt?: number;
  /** Why it was quarantined, kept for the report and for a human. */
  reason?: string;
  quarantinedAt?: number;
}

export interface AccountLease {
  role: string;
  index: number;
  credentials: Record<string, string>;
  holder: string;
  expiresAt: number;
  release(): Promise<void>;
}

export class PoolExhaustedError extends Error {
  constructor(role: string, size: number, leased: number, quarantined: number) {
    super(
      `No available account for role '${role}': pool size ${size}, ${leased} leased, ` +
        `${quarantined} quarantined. Pool size must be at least the maximum concurrent workers ` +
        'for the role, or the suite serialises on account availability (§13).',
    );
    this.name = 'PoolExhaustedError';
  }
}

export interface AccountPoolOptions {
  /** `<root>/<accountType>` — the profile's path shape. */
  poolRoot: string;
  /** Largest index to probe. Pools are small and dense by convention. */
  size: number;
  leaseTtlMs: number;
  holder: string;
  now?: () => number;
}

export class VaultAccountPool {
  private readonly now: () => number;

  constructor(
    private readonly vault: VaultSecretStore,
    private readonly options: AccountPoolOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  private accountPath(role: string, index: number): string {
    return `${this.options.poolRoot}/${role}/${index}`;
  }

  private leasePath(role: string, index: number): string {
    return `${this.accountPath(role, index)}/lease`;
  }

  /**
   * Take the first account in the pool whose lease record is free, expired, or
   * absent. The compare-and-swap is what makes "first" safe under concurrency:
   * a losing writer sees a version mismatch and moves to the next index rather
   * than overwriting the winner.
   */
  async lease(role: string): Promise<AccountLease> {
    let leased = 0;
    let quarantined = 0;

    for (let index = 1; index <= this.options.size; index++) {
      const leasePath = this.leasePath(role, index);
      const { record, version } = await this.readLease(leasePath);

      if (record.state === 'quarantined') {
        quarantined++;
        continue;
      }
      if (record.state === 'leased' && (record.expiresAt ?? 0) > this.now()) {
        leased++;
        continue;
      }

      const expiresAt = this.now() + this.options.leaseTtlMs;
      const next: LeaseRecord = { state: 'leased', holder: this.options.holder, expiresAt };
      const written = await this.vault.writeIfUnchanged(leasePath, next, version);
      if (written === null) {
        // Another runner won this index between our read and our write.
        leased++;
        continue;
      }

      const credentials = await this.vault.read(this.accountPath(role, index));
      return {
        role,
        index,
        credentials,
        holder: this.options.holder,
        expiresAt,
        release: () => this.release(role, index),
      };
    }

    throw new PoolExhaustedError(role, this.options.size, leased, quarantined);
  }

  /** Release is best-effort: the TTL is the real guarantee, not this call. */
  async release(role: string, index: number): Promise<void> {
    const leasePath = this.leasePath(role, index);
    const { record, version } = await this.readLease(leasePath);
    if (record.state === 'quarantined') return; // never un-quarantine implicitly
    await this.vault.writeIfUnchanged(leasePath, { state: 'available' }, version);
  }

  /**
   * Remove an account from the pool and leave a reason. Used when rotation
   * fails part-way: never leave an account in a state where the next run finds
   * it broken (§13).
   */
  async quarantine(role: string, index: number, reason: string): Promise<void> {
    const leasePath = this.leasePath(role, index);
    const { version } = await this.readLease(leasePath);
    await this.vault.writeIfUnchanged(
      leasePath,
      { state: 'quarantined', reason, quarantinedAt: this.now() },
      version,
    );
  }

  /** Utilisation for the run report's health band (§18). */
  async utilisation(role: string): Promise<{
    size: number;
    available: number;
    leased: number;
    expired: number;
    quarantined: number;
  }> {
    const counts = { size: this.options.size, available: 0, leased: 0, expired: 0, quarantined: 0 };
    for (let index = 1; index <= this.options.size; index++) {
      const { record } = await this.readLease(this.leasePath(role, index));
      if (record.state === 'quarantined') counts.quarantined++;
      else if (record.state !== 'leased') counts.available++;
      else if ((record.expiresAt ?? 0) > this.now()) counts.leased++;
      else counts.expired++;
    }
    return counts;
  }

  private async readLease(
    leasePath: string,
  ): Promise<{ record: LeaseRecord; version: number }> {
    const description = await this.vault.describe(leasePath);
    if (!description.exists) return { record: { state: 'available' }, version: 0 };
    const raw = await this.vault.read(leasePath);
    return {
      record: {
        state: (raw.state as AccountState) ?? 'available',
        holder: raw.holder,
        expiresAt: raw.expiresAt ? Number(raw.expiresAt) : undefined,
        reason: raw.reason,
        quarantinedAt: raw.quarantinedAt ? Number(raw.quarantinedAt) : undefined,
      },
      version: description.version ?? 0,
    };
  }
}
