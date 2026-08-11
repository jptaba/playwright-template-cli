/**
 * A token bucket, shared across a process — §14.
 *
 * PractiTest allows 30 API calls per minute and 20 instances per run POST.
 * That is not much once instance resolution, run creation and attachment
 * uploads are counted, and a naive implementation hits 429s on the first full
 * nightly run. One limiter instance is shared by every caller so the budget is
 * global rather than per-client.
 */
export interface RateLimiterOptions {
  /** Maximum burst. */
  capacity: number;
  /** Tokens added per interval. */
  refillTokens: number;
  /** Interval in milliseconds. */
  refillIntervalMs: number;
  /** Injected in tests so the limiter can be exercised without real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Serialises waiters so two callers cannot both spend the last token. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.tokens = options.capacity;
    this.lastRefill = this.now();
  }

  private refill(): void {
    const elapsed = this.now() - this.lastRefill;
    if (elapsed < this.options.refillIntervalMs) return;
    const intervals = Math.floor(elapsed / this.options.refillIntervalMs);
    this.tokens = Math.min(
      this.options.capacity,
      this.tokens + intervals * this.options.refillTokens,
    );
    this.lastRefill += intervals * this.options.refillIntervalMs;
  }

  /** Wait until a token is available, then spend it. */
  async take(count = 1): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        this.refill();
        if (this.tokens >= count) {
          this.tokens -= count;
          return;
        }
        const deficit = count - this.tokens;
        const intervalsNeeded = Math.ceil(deficit / this.options.refillTokens);
        const waitMs = Math.max(
          1,
          this.lastRefill + intervalsNeeded * this.options.refillIntervalMs - this.now(),
        );
        await this.sleep(waitMs);
      }
    });
    // Keep the chain alive even if a waiter throws.
    this.queue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  /** Diagnostics for the run report's health band. */
  get available(): number {
    this.refill();
    return this.tokens;
  }
}

/** The envelope PractiTest documents: 30 calls per minute, burst of 30 (§14). */
export const practitestLimiter = (): RateLimiter =>
  new RateLimiter({ capacity: 30, refillTokens: 30, refillIntervalMs: 60_000 });
