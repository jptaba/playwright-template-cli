import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { REPO_ROOT } from '../paths';
import { foldProgress, parseEvents, type RunProgress } from './events';
import {
  activeRuns,
  canCancel,
  canStart,
  contentionWarning,
  newRunId,
  runCommand,
  type RunRecord,
  type RunRequest,
} from './registry';

/**
 * Starting, watching and stopping runs — §08, phase 2.
 *
 * The decisions live in `registry.ts`, which is pure; this is the half that
 * spawns processes and reads files. The split is the one `onboard` and
 * `offboard` already use, and it is why "may a third run start" is unit-tested
 * without ever creating one.
 */

export const RUNS_DIR = path.join(REPO_ROOT, '.runs');

/** Keep the list readable and the disk sane. Both, or neither works. */
export const RETENTION = { runs: 20, bytes: 2 * 1024 * 1024 * 1024 };

export interface LiveRun extends RunRecord {
  progress: RunProgress;
  liveView: boolean;
  /** Latest frame, base64 JPEG, when a live view is attached. */
  frame?: string;
  /** Why there is no picture, when there is a reason worth saying. */
  viewNote?: string;
}

interface Tracked {
  record: RunRecord;
  child: ChildProcess | null;
  frame?: string;
  viewNote?: string;
  /** Bigger frames while the tile is expanded. */
  expanded: boolean;
}

export class RunManager {
  private readonly runs = new Map<string, Tracked>();

  /** Where a run posts its frames. Known only once the server is listening. */
  private endpoint: { url: string; token: string } | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  setEndpoint(url: string, token: string): void {
    this.endpoint = { url, token };
  }

  list(): LiveRun[] {
    return [...this.runs.values()]
      .sort((a, b) => b.record.startedAt - a.record.startedAt)
      .map((tracked) => ({
        ...tracked.record,
        progress: this.progressOf(tracked.record),
        liveView: Boolean(tracked.record.request.liveView),
        ...(tracked.frame ? { frame: tracked.frame } : {}),
        ...(tracked.viewNote ? { viewNote: tracked.viewNote } : {}),
      }));
  }

  slotsFree(): number {
    return Math.max(0, 2 - activeRuns([...this.runs.values()].map((t) => t.record)).length);
  }

  /**
   * Read the run's own event stream and fold it.
   *
   * Read on every poll rather than accumulated in memory, because the file is
   * the truth and this process did not write it. It also means a dashboard
   * restarted mid-run picks the run back up rather than losing it.
   */
  private progressOf(record: RunRecord): RunProgress {
    const file = path.join(record.directory, 'events.ndjson');
    if (!fs.existsSync(file)) return foldProgress([]);
    try {
      return foldProgress(parseEvents(fs.readFileSync(file, 'utf8')));
    } catch {
      return foldProgress([]);
    }
  }

  start(request: RunRequest): { id: string; warning: string | null } {
    const records = [...this.runs.values()].map((tracked) => tracked.record);
    const allowed = canStart(records);
    if (allowed !== true) throw new Error(allowed.error);

    const id = newRunId(this.now(), Math.random().toString(36).slice(2, 6));
    const directory = path.join(RUNS_DIR, id);
    fs.mkdirSync(directory, { recursive: true });

    const record: RunRecord = {
      id,
      request,
      state: 'starting',
      startedAt: this.now(),
      finishedAt: null,
      directory,
      pid: null,
    };

    const { args, env } = runCommand({ ...record, directory });
    const child = spawn('npx', args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...env,
        /*
           Where the live view posts frames. Passed rather than discovered: the
           port is chosen at startup, and a run that had to guess it would be a
           run that quietly stopped working the day the port changed.
        */
        ...(request.liveView && this.endpoint
          ? { DASHBOARD_URL: this.endpoint.url, DASHBOARD_TOKEN: this.endpoint.token }
          : {}),
      },
      // Detached so the whole tree can be killed: Playwright spawns workers and
      // browsers, and killing only the parent leaves those behind.
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    const log = fs.createWriteStream(path.join(directory, 'output.log'));
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);

    record.pid = child.pid ?? null;
    record.state = 'running';

    child.on('exit', (code) => {
      const tracked = this.runs.get(id);
      if (!tracked) return;
      tracked.record.finishedAt = this.now();
      tracked.child = null;
      if (tracked.record.state === 'cancelled') return;
      tracked.record.state = code === 0 ? 'finished' : 'failed';
    });

    child.on('error', (error) => {
      const tracked = this.runs.get(id);
      if (!tracked) return;
      tracked.record.state = 'failed';
      tracked.record.finishedAt = this.now();
      tracked.viewNote = error.message;
    });

    this.runs.set(id, { record, child, expanded: false });
    return { id, warning: contentionWarning(this.list()) };
  }

  cancel(id: string): void {
    const tracked = this.runs.get(id);
    const allowed = canCancel(tracked?.record);
    if (allowed !== true) throw new Error(allowed.error);

    tracked!.record.state = 'cancelled';
    tracked!.record.finishedAt = this.now();

    const child = tracked!.child;
    if (!child?.pid) return;
    try {
      if (process.platform === 'win32') {
        // Playwright leaves workers and browsers behind if only the parent is
        // signalled, and an orphaned headed browser is a window nobody can
        // explain.
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      // Already gone. The exit handler has the last word either way.
    }
  }

  /** A frame from a running worker, posted by the live-view fixture. */
  recordFrame(id: string, frame: string): void {
    const tracked = this.runs.get(id);
    if (tracked) tracked.frame = frame;
  }

  /** Whether this run's tile is expanded, which decides the frame size. */
  setExpanded(id: string, expanded: boolean): void {
    const tracked = this.runs.get(id);
    if (tracked) tracked.expanded = expanded;
  }

  isExpanded(id: string): boolean {
    return this.runs.get(id)?.expanded ?? false;
  }

  /** Stop everything still going. Called when the dashboard itself shuts down. */
  cancelAll(): void {
    for (const [id, tracked] of this.runs) {
      if (tracked.record.state === 'running' || tracked.record.state === 'starting') {
        try {
          this.cancel(id);
        } catch {
          // Best effort on the way out.
        }
      }
    }
  }
}

/**
 * Prune old run directories, on start rather than on a timer.
 *
 * Two caps together. A count alone is not enough: twenty runs keeping traces
 * only for failures is a few hundred megabytes, and twenty runs where somebody
 * passed `--trace=on` is nearer 2.6 GB, since one trace of a short journey
 * measured 2.9 MB. The size cap protects the disk; the count keeps the list
 * readable.
 */
export function pruneRuns(
  directory = RUNS_DIR,
  limits = RETENTION,
): { removed: string[]; keptBytes: number } {
  if (!fs.existsSync(directory)) return { removed: [], keptBytes: 0 };

  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(directory, entry.name);
      return { name: entry.name, full, bytes: directorySize(full) };
    })
    // Newest first: run ids are time-ordered, which is why they are shaped that way.
    .sort((a, b) => b.name.localeCompare(a.name));

  const removed: string[] = [];
  let kept = 0;

  for (const [index, entry] of entries.entries()) {
    const overCount = index >= limits.runs;
    const overSize = kept + entry.bytes > limits.bytes;
    if (overCount || overSize) {
      fs.rmSync(entry.full, { recursive: true, force: true });
      removed.push(entry.name);
    } else {
      kept += entry.bytes;
    }
  }

  return { removed, keptBytes: kept };
}

function directorySize(directory: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    try {
      total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
    } catch {
      // A file being written, or removed underneath. Not worth failing a prune.
    }
  }
  return total;
}
