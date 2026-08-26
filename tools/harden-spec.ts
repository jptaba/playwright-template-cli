#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../config/target';
import { loadCases, recordGeneratedSpec } from '../src/support/cases/store';
import { gateCase } from '../src/support/cases/gate';
import { vocabularyFor } from '../src/support/cases/vocabulary';
import { authorSpec, type SpecAuthorModel, type SpecDraft, type SpecRequest } from '../src/support/cases/spec-author';
import {
  MAX_REPAIR_ATTEMPTS,
  NO_VERDICT,
  claimsUnchanged,
  dispositionFor,
  outcomeOf,
  shouldContinue,
  type RepairAttempt,
} from '../src/support/cases/repair';
import {
  STABILITY_BASIS,
  assessStability,
  nextArm,
  type StabilityReport,
  type StabilityRun,
} from '../src/support/cases/stability';
import { clusterFailures } from '../src/support/triage/cluster';
import { classifyByRule } from '../src/support/triage/rules';
import type { RunResult, TestRecord } from '../src/support/reporters/run-result';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run spec:harden -- <CASE-ID> --draft=a.json[,b.json…]` — phase 3.
 *
 * Generate, run, triage, repair, repeat. The loop the owner asked for, with the
 * two guards `repair.ts` exists to enforce: the triage category decides whether
 * a repair is permitted at all, and a repair may never change what the spec
 * claims.
 *
 * **The triage here is the same triage a run uses** — `clusterFailures` and
 * `classifyByRule`, unchanged — asked a different question. A run asks "what
 * broke and who owns it"; this asks "is this spec finished yet". Sharing the
 * classifier is deliberate: a spec hardened against a private idea of what a
 * failure means would be hardened for a suite it is not about to join.
 */

/**
 * A model standing in for `AnthropicSpecAuthor`, reading drafts from disk.
 *
 * A sequence rather than one file, so the repair loop can actually be driven
 * end to end without an API key: attempt 1 takes the first draft, each repair
 * takes the next. What it cannot do is respond to the failure it was given —
 * which is exactly why the guards are mechanical and not prompt-shaped.
 */
class SequenceDraftAuthor implements SpecAuthorModel {
  readonly identity: string;
  private index = 0;

  constructor(private readonly files: string[]) {
    this.identity = `draft:${files.map((file) => path.basename(file)).join(' → ')}`;
  }

  async draft(_request: SpecRequest): Promise<SpecDraft> {
    const file = this.files[Math.min(this.index, this.files.length - 1)]!;
    this.index += 1;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SpecDraft;
  }

  get exhausted(): boolean {
    return this.index >= this.files.length;
  }
}

interface RunOutcome {
  passed: boolean;
  failure: { test: TestRecord; error: string; failedStep: string | null } | null;
  ranAtAll: boolean;
  durationMs: number;
}

/**
 * Run the spec, and read the run model rather than parsing console output.
 *
 * `scope: 'suite'` drops the file filter so the spec runs inside its own
 * application's e2e project, at that target's worker width — which is the
 * contention it will actually meet, and the arm item 67 says a measurement in
 * isolation does not stand in for.
 */
function runSpec(
  target: string,
  specPath: string,
  resultPath: string,
  scope: 'spec' | 'suite' = 'spec',
): RunOutcome {
  const result = spawnSync(
    'npx',
    [
      'playwright',
      'test',
      '--project=e2e',
      ...(scope === 'spec' ? [specPath.replace(/\\/g, '/')] : []),
    ],
    {
      cwd: REPO_ROOT,
      // RUN_RESULT_PATH keeps this off the repository's own run-result.json,
      // which the report, triage and publish stages all read.
      env: { ...process.env, TARGET: target, RUN_RESULT_PATH: resultPath },
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 10 * 60_000,
    },
  );

  if (!fs.existsSync(resultPath)) {
    console.error(result.stdout?.slice(-2000) ?? '');
    console.error(result.stderr?.slice(-2000) ?? '');
    return { passed: false, failure: null, ranAtAll: false, durationMs: 0 };
  }

  const run = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as RunResult;
  /*
     Ours specifically, by filename. In the suite arm the run contains every
     other spec of the application too, and "did the suite pass" is a different
     and much weaker question than "did this spec pass while the suite ran".
  */
  const mine = run.tests.filter((test) => test.file.replace(/\\/g, '/').endsWith(
    specPath.replace(/\\/g, '/').split('/').slice(-1)[0]!,
  ));
  const failed = mine.find((test) => test.outcome === 'unexpected');
  const durationMs = mine.reduce((total, test) => total + test.durationMs, 0);

  if (!failed) {
    return { passed: mine.length > 0, failure: null, ranAtAll: mine.length > 0, durationMs };
  }

  return {
    passed: false,
    ranAtAll: true,
    durationMs,
    failure: {
      test: failed,
      error: failed.error?.message ?? 'the run recorded a failure with no message',
      failedStep: failed.steps.find((step) => step.failed)?.title ?? null,
    },
  };
}

/**
 * The stability stage: repeat it, and repeat it where it will actually live.
 *
 * Stops at the first failure rather than completing the schedule — the
 * remaining passes cost minutes and cannot change the verdict, and the report
 * says how far it got so an unfinished measurement is never read as a pass.
 */
function measureStability(target: string, specPath: string, resultPath: string): StabilityReport {
  const runs: StabilityRun[] = [];
  console.log(`\n── stability ── ${STABILITY_BASIS}\n`);

  for (let arm = nextArm(runs); arm !== null; arm = nextArm(runs)) {
    const underLoad = arm === 'under-load';
    const label = underLoad ? "in its application's suite" : 'alone';
    process.stdout.write(`  pass ${runs.length + 1} ${label}… `);

    const outcome = runSpec(target, specPath, resultPath, underLoad ? 'suite' : 'spec');
    runs.push({
      attempt: runs.length + 1,
      passed: outcome.passed,
      durationMs: outcome.durationMs,
      underLoad,
      error: outcome.failure?.error ?? null,
    });
    console.log(outcome.passed ? `green (${outcome.durationMs}ms)` : 'RED');
  }

  return assessStability(runs);
}

function renderStability(report: StabilityReport): void {
  console.log(
    `\n  alone: ${report.aloneGreen}/${report.aloneRun} green · ` +
      `in its suite: ${report.loadGreen}/${report.loadRun} green`,
  );
  console.log(
    `  duration: ${report.durations.minMs}–${report.durations.maxMs}ms ` +
      `(median ${report.durations.medianMs}ms, spread ${report.durations.spread}×)`,
  );

  for (const finding of report.findings) {
    console.log(`\n  [${finding.severity}] ${finding.check}: ${finding.detail}`);
    console.log(`      → ${finding.remedy}`);
  }

  /*
     The two failures are diagnosed differently on purpose. "Flaky" is the word
     that stops people looking, and green-alone-red-in-its-suite has a specific
     cause and a specific fix that a wait will not provide.
  */
  if (report.contentionSensitive) {
    console.log('\n  This spec works and its neighbours are what break it. That is a finding');
    console.log('  about what it asserts on, not about timing.');
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const reference = args.find((arg) => !arg.startsWith('-'));
  const drafts = args.find((arg) => arg.startsWith('--draft='))?.split('=')[1]?.split(',') ?? [];
  const skipStability = args.includes('--no-stability');

  if (!reference || drafts.length === 0) {
    console.error(
      'Usage: npm run spec:harden -- <CASE-ID> --draft=a.json[,b.json] [--target=] [--no-stability]',
    );
    return 2;
  }

  const target = args.find((arg) => arg.startsWith('--target='))?.split('=')[1] ?? resolveTarget().name;
  const stored = loadCases(target).find(
    (entry) =>
      entry.case.id === reference ||
      entry.case.source.key === reference ||
      path.basename(entry.file, path.extname(entry.file)) === reference,
  );
  if (!stored) {
    console.error(`No case matching '${reference}' for target '${target}'.`);
    return 2;
  }

  const gate = gateCase(stored.case);
  if (!gate.passed) {
    console.error(`The case does not pass the specificity gate (score ${gate.score}).`);
    for (const found of gate.findings) console.error(`  [${found.severity}] ${found.check}: ${found.detail}`);
    return 1;
  }

  const vocabulary = vocabularyFor(target);
  const model = new SequenceDraftAuthor(drafts);
  const resultPath = path.join(REPO_ROOT, '.hardening-run.json');

  const attempts: RepairAttempt[] = [];
  let specPath: string | null = null;
  let previousSource: string | null = null;

  console.log(`Hardening ${stored.case.id ?? stored.case.source.key} on '${target}'`);
  console.log(`  at most ${MAX_REPAIR_ATTEMPTS} repair attempt(s); claims are frozen throughout\n`);

  while (shouldContinue(attempts)) {
    const attempt = attempts.length + 1;
    console.log(`── attempt ${attempt} ─────────────────────────────`);

    const authored = await authorSpec(stored.case, model, vocabulary, stored.file, { typecheck: true });
    if (authored.refusal) {
      console.log('  the pack cannot express this case:');
      for (const missing of authored.refusal.missing) console.log(`    missing verb: ${missing.verb}`);
      return 0;
    }

    const blockers = authored.findings.filter((found) => found.severity === 'blocker');
    if (blockers.length > 0) {
      console.log('  the draft did not verify, so it was never run:');
      for (const found of blockers) console.log(`    [blocker] ${found.check}: ${found.detail}`);
      attempts.push({
        attempt,
        passed: false,
        category: null,
        disposition: NO_VERDICT,
        error: null,
        refusals: blockers,
      });
      break;
    }

    /*
       The claims check, and it runs *before* the spec reaches disk. A repair
       that changed what is asserted is not written, not run, and not given
       another attempt — it is the one failure mode that must never get as far
       as a green result somebody might believe.
    */
    if (previousSource) {
      const changed = claimsUnchanged(previousSource, authored.source!);
      if (changed.length > 0) {
        console.log('  the repair changed what the spec claims, and was refused:');
        for (const found of changed) console.log(`    [blocker] ${found.detail}`);
        attempts.push({
          attempt,
          passed: false,
          category: null,
          disposition: NO_VERDICT,
          error: null,
          refusals: changed,
        });
        break;
      }
      console.log('  claims unchanged from the previous attempt ✓');
    }

    specPath = authored.specPath!;
    const full = path.join(REPO_ROOT, specPath);
    if (attempt === 1 && fs.existsSync(full)) {
      console.error(`\n${specPath} already exists. Nothing is ever overwritten.`);
      return 1;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, authored.source!, 'utf8');
    previousSource = authored.source!;
    console.log(`  wrote ${specPath}`);

    const outcome = runSpec(target, specPath, resultPath);
    if (!outcome.ranAtAll) {
      console.log('  the spec did not run at all — see the output above');
      attempts.push({ attempt, passed: false, category: null, disposition: NO_VERDICT, error: null, refusals: [] });
      break;
    }
    if (outcome.passed) {
      console.log('  passed ✓');
      attempts.push({ attempt, passed: true, category: null, disposition: { act: 'stop', why: 'it passed' }, error: null, refusals: [] });
      break;
    }

    /*
       Failed — so triage it with the same clustering and rules a run uses.
       The category is shared; only the policy laid over it is this module's.
    */
    const run = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as RunResult;
    const clusters = clusterFailures(run);
    const cluster = clusters[0];
    const verdict = cluster
      ? classifyByRule(cluster, { run, tests: run.tests.filter((test) => cluster.testIds.includes(test.id)) })
      : null;

    const disposition = verdict ? dispositionFor(verdict) : NO_VERDICT;
    console.log(`  failed: ${outcome.failure!.error.split('\n')[0]!.slice(0, 120)}`);
    console.log(`  triage: ${verdict ? `${verdict.category} (rule: ${verdict.rule ?? 'n/a'})` : 'no verdict'}`);
    console.log(`  → ${disposition.act}: ${disposition.why}`);

    attempts.push({
      attempt,
      passed: false,
      category: verdict?.category ?? null,
      disposition,
      error: outcome.failure!.error,
      refusals: [],
    });

    if (disposition.act !== 'stop' && model.exhausted && drafts.length > 1) {
      console.log('  (no further draft supplied — the stand-in model has nothing left to try)');
    }
  }

  fs.rmSync(resultPath, { force: true });

  const outcome = outcomeOf(attempts);
  console.log(`\n═══ ${outcome} after ${attempts.length} attempt(s) ═══`);

  switch (outcome) {
    case 'passed': {
      if (!specPath) return 0;
      recordGeneratedSpec(stored.file, stored.case, specPath);
      console.log(`${specPath} is on disk and green.`);

      if (skipStability) {
        console.log('\nStability was skipped. One green run is not hardened — re-run without');
        console.log('--no-stability before trusting this spec.');
        return 0;
      }

      const report = measureStability(target, specPath, resultPath);
      renderStability(report);
      fs.rmSync(resultPath, { force: true });

      if (!report.stable) {
        console.log('\nNot hardened. The spec is on disk so the evidence is inspectable, but it');
        console.log('should not be committed as it stands.');
        return 1;
      }

      console.log('\nHardened. Next: npm run lint && npx tsc --noEmit, then commit.');
      return 0;
    }
    case 'defect-found':
      console.log('The spec is finished and it works: it caught a real defect on its first outing.');
      console.log('That is a success of authoring, not a failure of it. Commit it with a declared');
      console.log("`known-failure` annotation stating what the failure should contain, rather than");
      console.log('repairing it — §"A defect in the application is a failure, and it stays one".');
      return 0;
    case 'refused-repair':
      console.log('A repair tried to change what the spec claims and was refused before it ran.');
      console.log('If the claim is genuinely wrong, the case is wrong — fix the case, not the spec.');
      return 1;
    case 'escalated':
      console.log('Stopped for a person: the cause is not one a repair may act on.');
      return 1;
    default:
      console.log(`Ran out of attempts at ${MAX_REPAIR_ATTEMPTS}. The transcript above is the`);
      console.log('evidence; a fourth attempt would be grinding toward green by attrition.');
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
