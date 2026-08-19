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
      `\n${target} spends nothing on its account pool` +
        (cost.serverState ? ` — '${cost.role}' has a single account.` : ' — serverState is false.') +
        '\nThere is nothing to measure.',
    );
    return 0;
  }

  const runs = Math.max(1, Number(arg('runs') ?? 2));
  console.log(`\n${worth}`);
  console.log(
    `\nRunning ${target}'s e2e suite ${runs} time(s) at the declared pool, then ${runs} time(s)\n` +
      `with every worker on one account — both at ${cost.poolSize} workers, so the only thing\n` +
      'that differs between the arms is how many identities they share.',
  );

  /*
     Both arms run at the same worker count, which is the collapsed pool's
     natural one. A control at a different concurrency would be measuring
     load as well as sharing, and then neither number means anything.
  */
  const baseline = Array.from({ length: runs }, (_, index) =>
    runOnce(target, cost.poolSize, 'control', index, false),
  );
  const collapsed = Array.from({ length: runs }, (_, index) =>
    runOnce(target, cost.poolSize, 'one-account', index, true),
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
