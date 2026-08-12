import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { LIVE_EVENTS_PATH } from '../paths';
import { serialiseEvent, type RunEvent } from '../runs/events';
import { stripAnsi } from '../text';

/**
 * A run, narrated while it happens — §08, phase 2.
 *
 * The canonical `RunResult` is written once, at the end, which is the right
 * shape for a report and the wrong shape for watching: by the time it exists
 * the thing you wanted to see is over. This writes a line per event as the run
 * goes, and the dashboard tails it.
 *
 * **It does nothing at all unless `LIVE_EVENTS_PATH` is set.** A run from the
 * command line, and every run in CI, pays one environment-variable check for a
 * feature only the local dashboard uses. That is deliberate: a reporter that
 * cost something on every run would be a tax on the common case to serve the
 * rare one.
 *
 * Appended synchronously, one line at a time. The volume is a few hundred lines
 * over minutes, so the cost is irrelevant, and the alternative — buffering —
 * means the last events of a run that crashes are the ones you lose, which are
 * exactly the ones worth having.
 */
export default class LiveEventsReporter implements Reporter {
  private readonly file = LIVE_EVENTS_PATH;
  private startedAt = 0;

  private write(event: RunEvent): void {
    if (!this.file) return;
    try {
      fs.appendFileSync(this.file, serialiseEvent(event), 'utf8');
    } catch {
      /*
         A run must never fail because nobody was watching it. If the stream
         cannot be written — the directory was removed, the disk is full — the
         run carries on and the live view simply stops updating.
      */
    }
  }

  onBegin(config: FullConfig, suite: Suite): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.startedAt = Date.now();
    this.write({
      type: 'run-started',
      at: this.startedAt,
      planned: suite.allTests().length,
      projects: config.projects.map((project) => project.name).filter(Boolean),
      workers: config.workers,
    });
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.write({
      type: 'test-started',
      at: Date.now(),
      worker: result.workerIndex,
      title: test.title,
      file: test.location.file,
      project: test.parent.project()?.name ?? '',
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.write({
      type: 'test-finished',
      at: Date.now(),
      worker: result.workerIndex,
      title: test.title,
      project: test.parent.project()?.name ?? '',
      status: result.status,
      durationMs: result.duration,
      // Stripped and trimmed to one line: colour is for a terminal, and the
      // full message belongs in the report rather than in a lane.
      ...(result.error?.message
        ? { error: stripAnsi(result.error.message).split('\n')[0]?.slice(0, 300) ?? '' }
        : {}),
    });
  }

  onEnd(result: FullResult): void {
    this.write({
      type: 'run-finished',
      at: Date.now(),
      status: result.status,
      durationMs: Date.now() - this.startedAt,
    });
  }

  /** Playwright asks; without this it prints its own errors over the live log. */
  printsToStdio(): boolean {
    return false;
  }
}
