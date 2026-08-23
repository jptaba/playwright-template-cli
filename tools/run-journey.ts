#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget, targetNames } from '../config/target';
import { REPO_ROOT, RESULTS_DIR } from '../src/support/paths';
import { readSpecs } from '../src/support/cases/collect';
import {
  coveragePresent,
  formatJourney,
  journeyComplete,
  type StageResult,
} from '../src/support/journey';

/**
 * `npm run app:journey -- --target=<app>` — the whole thing, in order.
 *
 * **Why a command and not a checklist.** "Run the application end to end" had
 * come to mean "run the suite", which is one stage of six, and the five it
 * skipped are the ones nobody notices are missing because a green suite looks
 * like a finished job. A checklist would have the same problem; this refuses
 * to report a skipped stage as a pass.
 *
 * Every service it needs can be faked — `npm run fakes:serve` prints the
 * environment to export — so the journey is runnable on any machine, and a
 * real Jira or PractiTest changes only whose channel it lands in.
 */
function shell(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
}

/** Every spec source in a pack, for reading the coverage tags out of. */
function specSources(target: string): string[] {
  const root = path.join(REPO_ROOT, 'src', 'targets', target, 'tests');
  if (!fs.existsSync(root)) return [];
  const sources: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) sources.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  return sources;
}

async function main(): Promise<number> {
  const target = process.argv
    .filter((argument) => argument.startsWith('--target='))
    .map((argument) => argument.slice('--target='.length))[0];

  if (!target) {
    console.error(
      'Which application? `npm run app:journey -- --target=<app>`. ' +
        `Onboarded: ${targetNames().join(', ')}`,
    );
    return 2;
  }
  resolveTarget(target); // throws with its own message if the profile is wrong

  const runResult = path.join(RESULTS_DIR, 'live', target, 'run-result.json');
  const env = { TARGET: target, RUN_RESULT_PATH: runResult };
  const results: StageResult[] = [];
  const add = (result: StageResult): StageResult => (results.push(result), result);

  // 1 — onboarding. Not "is there a pack" but "can a credential sign in".
  const doctor = shell('npx', ['tsx', 'tools/check-target.ts', '--sign-in'], env);
  add({
    stage: 'onboarding',
    state: doctor.status === 0 ? 'done' : 'failed',
    detail:
      doctor.status === 0
        ? 'profile, pack and credentials agree, and a real sign-in succeeded'
        : 'target:doctor --sign-in refused — run it directly for the reason',
  });

  /*
     2 — traceability. Either half satisfies it: cases out of PractiTest, or a
     story out of Jira.

     **Counted, not merely attempted.** The first version matched
     `\d+ case\(s\) pulled`, which "0 case(s) pulled" satisfies — so a run that
     traced the suite to nothing at all reported this stage green. Zero is the
     answer this stage exists to catch.
  */
  const cases = shell('npx', ['tsx', 'tools/pull-cases.ts'], env);
  const caseCount = Number(/(\d+) case\(s\) pulled/.exec(cases.stdout)?.[1] ?? 0);

  let traced = caseCount > 0 ? `${caseCount} case(s) pulled from PractiTest` : '';
  if (!traced) {
    /*
       Fall back to a story — **this target's**.

       It used to take the first `stories/*.json` on disk, which is neither
       this target's nor even this run's: the directory is leftover state from
       whatever was pulled last. Running the journey for `orangehrm` duly
       reported *"story TOOL-1 pulled from Jira"* and marked the stage green,
       which is a traceability claim satisfied by a different application's
       requirement. A stage that exists to catch "traced to nothing" must not
       be satisfiable by "traced to somebody else".

       The keys come from the specs' own `jira` annotations, which is the only
       statement in the repository of which story a spec is for.
    */
    const key = (await readSpecs(target))
      .map((spec) => spec.jiraKey)
      .find((candidate): candidate is string => Boolean(candidate));
    if (key) {
      const story = shell('npx', ['tsx', 'tools/pull-story.ts', key], env);
      if (story.status === 0 && /acceptance criteria/.test(story.stdout)) {
        traced = `story ${key} pulled from Jira — ${
          /(\d+) acceptance criteria/.exec(story.stdout)?.[1] ?? '?'
        } acceptance criteria`;
      }
    }
  }

  add({
    stage: 'stories-or-cases',
    state: traced ? 'done' : 'skipped',
    detail:
      traced ||
      'nothing traced: no cases in PractiTest and no story pulled — `npm run fakes:serve` stands both up',
  });

  // 3 — coverage, read from the tags the suite itself selects on.
  const coverage = coveragePresent(specSources(target));
  const missing = coverage.filter((entry) => !entry.present);
  add({
    stage: 'coverage',
    state: missing.length === 0 ? 'done' : 'failed',
    detail:
      missing.length === 0
        ? 'all five kinds present'
        : `missing: ${missing.map((entry) => `${entry.kind} (${entry.tag})`).join(', ')}`,
  });

  /*
     4 — the live suite.

     A parked application is still run, because naming one is a deliberate act
     and `suites:live --target=` takes it the same way — but the line says so.
     Without that, the journey reported *"2/7 passed · 5 failed"* for an
     application somebody had deliberately paused, with a reason and a review
     date, which is the signal parking exists to protect.
  */
  const parked = resolveTarget(target).parked;
  const live = shell('npx', ['tsx', 'tools/live-suites.ts', `--target=${target}`]);
  const counts = (live.stdout.match(/\d+\/\d+ passed[^\n]*/) ?? ['the live suite did not pass'])[0];
  add({
    stage: 'run',
    state: live.status === 0 ? 'done' : 'failed',
    detail: parked ? `${counts} — parked: ${parked.reason}` : counts,
  });

  /*
     5 — triage, which needs a failure to classify. The ground-truth fixture is
     the deliberate one: specs written to fail a stated way, each annotated
     with the category it should produce. A green run exercises none of triage,
     so "triage passed" on a green suite is two claims where one was checked.
  */
  const hasFixture = fs.existsSync(
    path.join(REPO_ROOT, 'src', 'targets', target, 'tests', 'triage-fixture'),
  );
  if (!hasFixture) {
    add({
      stage: 'triage',
      state: 'failed',
      detail:
        'no tests/triage-fixture/ — triage classifies failures, and a green run exercises none of it',
    });
  } else {
    const measured = shell('npx', ['tsx', 'tools/triage-measure.ts'], env);
    const agreement = (measured.stdout.match(/\d+ agreed[^\n]*/) ?? [''])[0];
    add({
      stage: 'triage',
      state: measured.status === 0 ? 'done' : 'failed',
      detail: agreement || 'triage:measure did not report agreement',
    });
  }

  // 6 — publish: results back to PractiTest, report to Teams and to email.
  const push = shell('npx', ['tsx', 'tools/publish-practitest.ts'], env);
  const teams = shell('npx', ['tsx', 'tools/notify-teams.ts'], env);
  const mail = shell('npx', ['tsx', 'tools/notify-email.ts'], env);
  const posted = /Posted \d+ result/.test(push.stdout);
  const toTeams = /Posted to Teams/.test(teams.stdout);
  const toMail = /Sent to /.test(mail.stdout);
  add({
    stage: 'publish',
    state: posted && toTeams && toMail ? 'done' : 'skipped',
    detail:
      `PractiTest ${posted ? '✓' : '·'} · Teams ${toTeams ? '✓' : '·'} · email ${toMail ? '✓' : '·'}` +
      (posted && toTeams && toMail ? '' : ' — unset destinations are skipped, not failed'),
  });

  for (const line of formatJourney(target, results)) console.log(line);
  return journeyComplete(results) ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
