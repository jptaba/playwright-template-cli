#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget, targetNames } from '../config/target';
import { RESULTS_DIR } from '../src/support/paths';
import {
  formatPoolMeasurement,
  poolCost,
  poolMeasureExitCode,
  whatThereIsToMeasure,
  type PoolRun,
} from '../src/support/pool-measure';
import type { RunResult } from '../src/support/reporters/run-result';

/**
 * `npm run pool:measure [-- --target=<name>] [--runs=N]` — is the account pool
 * earning what it costs? (open-items.md item 56)
 *
 * Collapses the pool to one account with `POOL_SIZE_OVERRIDE`, runs the
 * target's own `e2e` suite with every worker on that single identity, and
 * reports what happened. No profile is edited, which is the point: the
 * question "does this application really share state across sessions" was
 * previously answerable only by editing the profile of the application under
 * test.
 *
 * Deliberately **not** part of `npm run verify`, for the same reason
 * `suites:live` is not: it drives a real deployment.
 */
function runOnce(
  target: string,
  workers: number,
  label: string,
  index: number,
  collapse: boolean,
): PoolRun {
  const outDir = path.join(RESULTS_DIR, 'pool', target);
  fs.mkdirSync(outDir, { recursive: true });
  const resultPath = path.join(outDir, `${label}-${index + 1}.json`);
  fs.rmSync(resultPath, { force: true });

  console.log(`\n▶ ${label} run ${index + 1}`);
  const run = spawnSync('npx', ['playwright', 'test', '--project=e2e', `--workers=${workers}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      TARGET: target,
      LIVE_ONLY: 'true',
      // The control arm runs the profile exactly as written.
      ...(collapse ? { POOL_SIZE_OVERRIDE: '1' } : {}),
      RUN_RESULT_PATH: resultPath,
      JUNIT_PATH: path.join(outDir, `junit-${label}-${index + 1}.xml`),
    },
  });

  if (run.error) return { failures: [], passed: 0, error: `could not start Playwright: ${run.error.message}` };
  if (!fs.existsSync(resultPath)) {
    return {
      failures: [],
      passed: 0,
      error: `no run model was written (playwright exited ${run.status ?? 'unknown'})`,
    };
  }

  try {
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as RunResult;
    return {
      failures: result.tests
        .filter((test) => test.outcome === 'unexpected')
        .map((test) => test.title),
      passed: result.totals.passed,
      error: null,
    };
  } catch (error) {
    return {
      failures: [],
      passed: 0,
      error: `run model unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function main(): number {
  const arg = (name: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

  let known: string[];
  try {
    known = targetNames();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (known.length === 0) {
    console.error('No applications are onboarded, so there is no pool to measure.');
    return 2;
  }

  const target = arg('target') ?? process.env.TARGET ?? (known.length === 1 ? known[0]! : '');
  if (!known.includes(target)) {
    console.error(
      `Name the application: --target=<name>. Onboarded: ${known.join(', ')}.`,
    );
    return 2;
  }

  /*
     The profile as written, not as overridden — the cost being measured is the
     one a normal run pays, so this must be read before POOL_SIZE_OVERRIDE is
     set for the child processes.
  */
  const cost = poolCost(resolveTarget(target));
  const worth = whatThereIsToMeasure(cost);
  if (worth === null) {
    console.log(
      `\n${target} spends nothing on its account pool — serverState is false, so no worker ` +
        'ceiling is derived.\nThere is nothing to measure.',
    );
    return 0;
  }

  const runs = Math.max(1, Number(arg('runs') ?? 2));

  /*
     **The control runs at the ceiling the profile actually imposes, and the
     experiment runs above it** — item 66.

     Both arms used to run at `cost.poolSize`, which for toolshop was 3 while
     its real ceiling was 2. That made the control an abnormal run, and run
     77's conclusion had to be corrected in run 83 because of it: the collapsed
     arm looked cleaner than a control that was itself over-subscribed.

     It also could not express the case that matters most. An application with
     one account is capped at one worker, so "collapse the pool" is a no-op
     there and both arms would have been identical — which is why this command
     used to decline the four applications paying the most for the claim.

     Framed this way the question is the same for both shapes: **is the cap
     earned?** Control at the cap, experiment above it with every worker on one
     identity. A target with a pool has its pool collapsed in the experiment
     too, so what is being tried is the honest worst case rather than a wider
     pool.
  */
  const ceiling = Math.max(1, cost.usable);
  const above = Math.max(ceiling + 1, Number(arg('workers') ?? ceiling + 1));

  console.log(`\n${worth}`);
  console.log(
    `\nRunning ${target}'s e2e suite ${runs} time(s) at its ceiling of ${ceiling} worker(s),\n` +
      `then ${runs} time(s) at ${above} with every worker on one account. The question is\n` +
      'whether the cap is earned, so the arms differ in exactly that.',
  );

  const baseline = Array.from({ length: runs }, (_, index) =>
    runOnce(target, ceiling, 'control', index, false),
  );
  const collapsed = Array.from({ length: runs }, (_, index) =>
    runOnce(target, above, 'one-account', index, true),
  );
  const measurement = { target, cost, baseline, collapsed };

  console.log('\nAccount pool:\n');
  for (const line of formatPoolMeasurement(measurement)) console.log(line);
  return poolMeasureExitCode(measurement);
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
