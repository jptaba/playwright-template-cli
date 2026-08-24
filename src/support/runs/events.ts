/**
 * What a run says about itself while it is happening — §08, phase 2.
 *
 * The canonical `RunResult` is written once, at the end. That is the right
 * shape for a report and the wrong shape for watching: by the time it exists
 * the thing you wanted to see is over. So a run also emits a line per event as
 * it goes, and the dashboard relays those.
 *
 * One JSON object per line, append-only, never rewritten. That makes the stream
 * cheap to tail, safe to read while it is being written, and replayable — a
 * page that reloads half way through a run reads the file from the top and
 * arrives at the same state, which is what makes reconnection trivial rather
 * than a protocol.
 *
 * Pure: this module defines and parses the vocabulary and touches nothing.
 */

export interface RunStartedEvent {
  type: 'run-started';
  at: number;
  /** How many tests the runner found. Known before any of them run. */
  planned: number;
  projects: string[];
  workers: number;
}

export interface TestStartedEvent {
  type: 'test-started';
  at: number;
  /** Which lane this is happening in. The live view is one column per worker. */
  worker: number;
  title: string;
  file: string;
  project: string;
}

export interface TestFinishedEvent {
  type: 'test-finished';
  at: number;
  worker: number;
  title: string;
  project: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  durationMs: number;
  /** First line of the error, when there was one. The rest is in the report. */
  error?: string;
}

export interface RunFinishedEvent {
  type: 'run-finished';
  at: number;
  status: 'passed' | 'failed' | 'timedout' | 'interrupted';
  durationMs: number;
}

export interface RunFailedEvent {
  type: 'run-failed';
  at: number;
  /** The runner never started, or died. Not a test failure — a run failure. */
  reason: string;
}

export type RunEvent =
  | RunStartedEvent
  | TestStartedEvent
  | TestFinishedEvent
  | RunFinishedEvent
  | RunFailedEvent;

/** One event, one line. A trailing newline is part of the contract. */
export function serialiseEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Read a stream of events, skipping anything unreadable.
 *
 * A half-written last line is normal, not exceptional: the file is being
 * appended to by another process while this reads it. Throwing on it would
 * make every read a race, so the partial line is dropped and picked up whole on
 * the next read.
 */
export function parseEvents(text: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RunEvent;
      if (typeof parsed?.type === 'string') events.push(parsed);
    } catch {
      // A line still being written. It will be complete next time.
    }
  }
  return events;
}

export interface RunProgress {
  planned: number;
  started: number;
  finished: number;
  passed: number;
  failed: number;
  skipped: number;
  /** What each worker is on right now, by worker index. */
  lanes: Record<number, { title: string; project: string; since: number }>;
  /** Every failure so far, in order, for the list under the lanes. */
  failures: { title: string; project: string; error: string }[];
  status: 'starting' | 'running' | 'passed' | 'failed' | 'interrupted';
  startedAt: number | null;
  finishedAt: number | null;
}

/**
 * Fold a stream of events into what the page shows.
 *
 * A fold rather than accumulated mutation, so replaying from the top of the
 * file after a reload produces exactly the state a page that watched from the
 * beginning would have. That equivalence is the whole reason reconnection needs
 * no special case.
 */
export function foldProgress(events: readonly RunEvent[]): RunProgress {
  const progress: RunProgress = {
    planned: 0,
    started: 0,
    finished: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    lanes: {},
    failures: [],
    status: 'starting',
    startedAt: null,
    finishedAt: null,
  };

  for (const event of events) {
    switch (event.type) {
      case 'run-started':
        progress.planned = event.planned;
        progress.startedAt = event.at;
        progress.status = 'running';
        break;

      case 'test-started':
        progress.started += 1;
        progress.lanes[event.worker] = {
          title: event.title,
          project: event.project,
          since: event.at,
        };
        break;

      case 'test-finished': {
        progress.finished += 1;
        if (event.status === 'passed') progress.passed += 1;
        else if (event.status === 'skipped') progress.skipped += 1;
        else {
          progress.failed += 1;
          progress.failures.push({
            title: event.title,
            project: event.project,
            error: event.error ?? '',
          });
        }
        // The lane goes idle rather than keeping the last title, which would
        // read as "still working on this" when it is not.
        delete progress.lanes[event.worker];
        break;
      }

      case 'run-finished':
        progress.finishedAt = event.at;
        progress.status = event.status === 'passed' ? 'passed' : 'failed';
        progress.lanes = {};
        break;

      case 'run-failed':
        progress.finishedAt = event.at;
        progress.status = 'interrupted';
        progress.lanes = {};
        break;
    }
  }

  return progress;
}
