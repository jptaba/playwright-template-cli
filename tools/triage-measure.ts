#!/usr/bin/env tsx
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { measureAgreement, type AgreementRow } from '../src/support/triage/agreement';
import { triageIsForRun, type TriageResult } from '../src/support/triage/types';
import type { RunResult } from '../src/support/reporters/run-result';

/**
 * `npm run triage:measure [-- --reuse]` — how much of the triage taxonomy the
 * rules settle correctly, on failures whose cause is known in advance (§20).
 *
 * The three commands this replaces were run once, by hand, and the numbers
 * written into a log entry. That is a snapshot, not the continuous measurement
 * §20 asks for, and the difference shows the moment a rule is tightened: with
 * no cheap way to re-measure, nobody does.
 *
 * `--reuse` skips the run and measures whatever `run-result.json` already
 * holds, for when the fixture has just been run by hand.
 */
function shell(command: string, args: string[], env: NodeJS.ProcessEnv = {}): number {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(`Could not run \`${command} ${args.join(' ')}\`: ${result.error.message}`);
    return 2;
  }
  return result.status ?? 0;
}

function load<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null;
}

function report(rows: AgreementRow[]): void {
  const symbol = { agreed: '✓', contradicted: '✗', declined: '·', 'not-reproduced': '!' };
  for (const row of rows) {
    const settled = row.settled ?? 'no rule matched';
    const rule = row.rule ? ` (rule: ${row.rule})` : '';
    console.log(`  ${symbol[row.outcome]} ${row.title}`);
    console.log(`      expected ${row.expected} · settled ${settled}${rule}`);
  }
}

function main(): number {
  if (!process.argv.includes('--reuse')) {
    const ran = shell('npx', ['playwright', 'test', '--project=triage-fixture'], {
      TRIAGE_FIXTURE: 'true',
    });
    // The fixture is *meant* to fail, so a non-zero status is the expected
    // outcome. Only a failure to start the run is a problem here.
    if (ran === 2) return 2;
    for (const stage of ['cluster', 'rules']) {
      const status = shell('npx', ['tsx', 'tools/triage.ts', `--stage=${stage}`]);
      if (status !== 0) return status;
    }
  }

  const run = load<RunResult>(RUN_RESULT_PATH);
  const triage = load<TriageResult>(TRIAGE_RESULT_PATH);
  if (!run || !triage) {
    console.error(
      'No run-result.json or triage-result.json to measure. Run without --reuse, or set ' +
        'TARGET to a target whose tests/triage-fixture/ directory exists.',
    );
    return 2;
  }
  if (!triageIsForRun(triage, run.run.id)) {
    console.error(
      `triage-result.json describes run ${triage.runId}, not ${run.run.id}. ` +
        'Re-run without --reuse so the two agree.',
    );
    return 2;
  }

  const agreement = measureAgreement(run, triage);
  if (agreement.rows.length === 0 && agreement.unknownCategories.length === 0) {
    console.error(
      'No spec carried a triage-ground-truth annotation. Add one to each spec in ' +
        "targets/<app>/tests/triage-fixture/ naming the category it is meant to produce, " +
        'or there is nothing to measure agreement against.',
    );
    return 2;
  }

  for (const unknown of agreement.unknownCategories) {
    console.error(
      `  ${unknown.testId} declares triage-ground-truth "${unknown.category}", ` +
        'which is not one of the categories in src/support/triage/types.ts.',
    );
  }

  console.log(`\nTriage agreement over ${agreement.rows.length} known-cause failure(s):\n`);
  report(agreement.rows);

  const { agreed, contradicted, declined } = agreement.totals;
  const notReproduced = agreement.totals['not-reproduced'];
  console.log(
    `\n  ${agreed} agreed · ${contradicted} contradicted · ${declined} declined` +
      (notReproduced > 0 ? ` · ${notReproduced} did not reproduce` : ''),
  );
  console.log(
    '\nA decline is the right answer where no rule covers the cause — the model exists for\n' +
      'those. A contradiction is a rule that is wrong, and is what this measurement is for.',
  );

  if (notReproduced > 0) {
    console.error(
      `\n${notReproduced} ground-truth spec(s) passed. The fixture has stopped reproducing a ` +
        'cause it claims, so its category is unmeasured rather than agreed.',
    );
  }
  return contradicted > 0 || notReproduced > 0 || agreement.unknownCategories.length > 0 ? 1 : 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
