#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { targetNames } from '../config/target';
import { RESULTS_DIR } from '../src/support/paths';
import {
  formatLiveReport,
  liveExitCode,
  liveRunNotRun,
  summariseLiveRun,
  type LiveTargetResult,
} from '../src/support/live-suites';
import type { RunResult } from '../src/support/reporters/run-result';

/**
 * `npm run suites:live [-- --target=<name>]` — run every onboarded
 * application's own suites against the real thing, and say what happened
 * (backlog item 29).
 *
 * **Deliberately not part of `npm run verify`.** Verify is lint, typecheck,
 * catalog, instructions and the framework's own two projects: it needs no
 * network, no credentials and no application to be up, which is what lets CI
 * and every contributor run it. Folding a live suite into it would make the
 * repository's one always-runnable command depend on three public demos
 * staying reachable. This is the command a *run* executes and records, which
 * is where the item put it.
 *
 * One process per application, because `TARGET` is read once when
 * `playwright.config.ts` is evaluated. Each writes its run model to its own
 * path — `RUN_RESULT_PATH` exists precisely so two runs do not share a file,
 * and without that the second application would silently overwrite the first
 * one's result before it had been read.
 */
function liveDir(target: string): string {
  return path.join(RESULTS_DIR, 'live', target);
}

function runOne(target: string): LiveTargetResult {
  const outDir = liveDir(target);
  fs.mkdirSync(outDir, { recursive: true });
  const resultPath = path.join(outDir, 'run-result.json');
  fs.rmSync(resultPath, { force: true });

  console.log(`\n▶ ${target}`);
  const run = spawnSync('npx', ['playwright', 'test'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      TARGET: target,
      // Leaves the framework's own two projects out, so this runs what tests
      // the application and nothing else.
      LIVE_ONLY: 'true',
      RUN_RESULT_PATH: resultPath,
      JUNIT_PATH: path.join(outDir, 'junit.xml'),
    },
  });

  if (run.error) {
    return liveRunNotRun(target, `could not start Playwright: ${run.error.message}`);
  }
  if (!fs.existsSync(resultPath)) {
    /*
       A non-zero status with no run model means the run never got far enough
       to produce one — a config that would not load, a project with no tests,
       a browser that would not launch. That is not the same as tests failing,
       and the exit code says so.
    */
    return liveRunNotRun(
      target,
      `no run model was written (playwright exited ${run.status ?? 'unknown'})`,
    );
  }

  try {
    return summariseLiveRun(target, JSON.parse(fs.readFileSync(resultPath, 'utf8')) as RunResult);
  } catch (error) {
    return liveRunNotRun(
      target,
      `run model unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function main(): number {
  const asked = process.argv
    .filter((argument) => argument.startsWith('--target='))
    .map((argument) => argument.slice('--target='.length));

  let known: string[];
  try {
    known = targetNames();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  if (known.length === 0) {
    console.error(
      'No applications are onboarded, so there are no live suites to run. ' +
        '`npm run onboard` adds one.',
    );
    return 2;
  }

  const unknown = asked.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    console.error(
      `Unknown target(s): ${unknown.join(', ')}. Onboarded applications: ${known.join(', ')}.`,
    );
    return 2;
  }

  const targets = asked.length > 0 ? asked : known;
  console.log(
    `Running the live suites for ${targets.length} application(s): ${targets.join(', ')}.\n` +
      'These drive real deployments, so a failure here can be the application rather than\n' +
      'the suite — every failure below carries the triage category a rule settled it as.',
  );

  const results = targets.map(runOne);

  console.log('\nLive suites:\n');
  for (const line of formatLiveReport(results)) console.log(line);

  const code = liveExitCode(results);
  if (code === 1) {
    console.log(
      '\nA category names where to look; it is not a reason to ignore the failure, which is\n' +
        'why any failure exits non-zero. `npm run triage:cluster` reads the last run written.',
    );
  }
  return code;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
