/**
 * When rotation may run — §13.
 *
 * "Rotating an account while the nightly suite is mid-flight produces
 * authentication failures that look like application defects and will consume
 * a morning of triage." The blackout window and the jitter are enforced here,
 * in the script, rather than in the pipeline schedule — so a manually
 * triggered run cannot bypass them.
 */
export interface BlackoutWindow {
  /** 24-hour local time, `HH:MM`. */
  start: string;
  end: string;
}

export interface RotationConfig {
  enabled: boolean;
  maxAgeDays: number;
  /** Spread rotations so a whole pool does not expire on the same night. */
  jitterDays: number;
  blackout: BlackoutWindow;
  onFailure: 'quarantine';
}

export const DEFAULT_ROTATION: RotationConfig = {
  enabled: false,
  maxAgeDays: 60,
  jitterDays: 5,
  blackout: { start: '18:00', end: '06:00' },
  onFailure: 'quarantine',
};

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Not a HH:MM time: ${time}`);
  }
  return hours! * 60 + minutes!;
}

/** Windows that cross midnight are the normal case for a nightly suite. */
export function isInBlackout(now: Date, window: BlackoutWindow): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(window.start);
  const end = minutesOfDay(window.end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export interface RotationCandidate {
  role: string;
  index: number;
  /** Epoch milliseconds of the last successful rotation, or 0 if never. */
  rotatedAt: number;
}

const DAY_MS = 86_400_000;

/**
 * Deterministic per-account jitter. Derived from the account's identity rather
 * than from a random draw, so a re-run picks the same day and an account does
 * not drift earlier every cycle.
 */
export function jitterDaysFor(role: string, index: number, jitterDays: number): number {
  if (jitterDays <= 0) return 0;
  const key = `${role}/${index}`;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % (jitterDays + 1);
}

/** Accounts due for rotation, oldest first. */
export function dueForRotation(
  candidates: RotationCandidate[],
  config: RotationConfig,
  now: number,
  minAgeDays: number,
): RotationCandidate[] {
  return candidates
    .filter((candidate) => {
      const ageDays = (now - candidate.rotatedAt) / DAY_MS;
      // The application's own minimum-age rule wins: rotating sooner is
      // rejected by the application, and a rejected change fails half-way.
      if (ageDays < minAgeDays) return false;
      const threshold =
        config.maxAgeDays + jitterDaysFor(candidate.role, candidate.index, config.jitterDays);
      return ageDays >= threshold;
    })
    .sort((a, b) => a.rotatedAt - b.rotatedAt);
}
