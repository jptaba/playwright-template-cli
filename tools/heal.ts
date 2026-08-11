#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPORT_OUT_DIR, RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { buildHealBrief } from '../src/support/heal/brief';
import type { RunResult } from '../src/support/reporters/run-result';
import type { TriageResult } from '../src/support/triage/types';

/**
 * `npm run heal` — §10, §22.
 *
 * This tool does not heal. It produces a **healing brief**: the failures that
 * are safely healable, and the ones that are not with the reason. A human — or
 * Playwright's healer agent — works from it, and the result opens a merge
 * request. Nothing here edits a spec, and nothing pushes to a protected branch.
 */
function main(): number {
  const openMr = process.argv.includes('--open-mr');

  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn('No run-result.json. Nothing to heal.');
    return 0;
  }

  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  const triage = fs.existsSync(TRIAGE_RESULT_PATH)
    ? (JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult)
    : null;

  const brief = buildHealBrief(run, triage);

  fs.mkdirSync(REPORT_OUT_DIR, { recursive: true });
  const output = path.join(REPORT_OUT_DIR, 'heal-brief.json');
  fs.writeFileSync(output, `${JSON.stringify(brief, null, 2)}\n`, 'utf8');

  console.log(`${brief.candidates.length} healable, ${brief.escalations.length} escalated to a human.`);
  for (const candidate of brief.candidates) {
    console.log(`  ${candidate.kind.padEnd(8)}${candidate.caseId ?? '—'}  ${candidate.title}`);
    console.log(`          ${candidate.file}${candidate.failingStep ? ` · ${candidate.failingStep}` : ''}`);
  }
  for (const escalation of brief.escalations) {
    console.log(`  ESCALATE ${escalation.caseId ?? '—'}  ${escalation.title}`);
    console.log(`          ${escalation.reason}`);
  }
  console.log(`\nwrote ${path.relative(process.cwd(), output)}`);

  if (brief.candidates.length > 0) {
    console.log(
      '\nNext: run Playwright\'s healer agent against this brief, review the labelled diff, and ' +
        'open a merge request. A healer that edits specs unattended is how regression coverage ' +
        'quietly disappears (§10).',
    );
  }
  if (openMr) {
    console.log('\n--open-mr: raise the merge request from the healed branch. Never auto-merge.');
  }
  return 0;
}

process.exit(main());
