/**
 * Bounded polling for integration code.
 *
 * Specs use `expect.poll`; adapters cannot, and hand-rolled `while (true)`
 * loops are how a missing email becomes a hung suite instead of a clear
 * failure. Every wait in this framework has a stated timeout and a stated
 * reason (§12).
 */
export interface PollOptions<T> {
  /** What is being waited for, quoted in the timeout error. */
  description: string;
  timeoutMs: number;
  intervalMs?: number;
  /** Accept the value and stop. */
  until: (value: T) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class PollTimeoutError extends Error {
  constructor(description: string, timeoutMs: number, attempts: number) {
    super(
      `Timed out after ${timeoutMs}ms (${attempts} attempts) waiting for ${description}. ` +
        'This is a bounded wait failing as a clear error rather than a hung run.',
    );
    this.name = 'PollTimeoutError';
  }
}

export async function pollUntil<T>(
  probe: () => Promise<T>,
  options: PollOptions<T>,
): Promise<T> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const interval = options.intervalMs ?? 500;
  const deadline = now() + options.timeoutMs;

  let attempts = 0;
  for (;;) {
    attempts++;
    const value = await probe();
    if (options.until(value)) return value;
    if (now() >= deadline) throw new PollTimeoutError(options.description, options.timeoutMs, attempts);
    await sleep(Math.min(interval, Math.max(1, deadline - now())));
  }
}

/** Full-jitter exponential backoff, as used by the retrying HTTP client. */
export function backoffDelay(attempt: number, baseMs = 200, capMs = 10_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * ceiling);
}
