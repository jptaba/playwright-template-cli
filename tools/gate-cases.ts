#!/usr/bin/env tsx
import path from 'node:path';
import { REPO_ROOT } from '../src/support/paths';
import { gateCase } from '../src/support/cases/gate';
import { loadCases } from '../src/support/cases/store';

/**
 * `npm run cases:gate [-- --target=<name>]` — step 02 of §10.
 *
 * Scores each case on preconditions, concrete input data, an explicit expected
 * result and a defined starting state, and routes failures back to the case
 * author with the specific gap named.
 *
 * A meaningful share of an existing legacy suite will fail this on first run.
 * That is the system working, and it is worth saying out loud before anyone
 * reads the rejection report as a tooling failure.
 */
function main(): number {
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
  const target = targetArg?.split('=')[1];
  const cases = loadCases(target);

  if (cases.length === 0) {
    console.log('No cases found under cases/. Nothing to gate.');
    return 0;
  }

  let rejected = 0;
  let warned = 0;

  for (const stored of cases) {
    const result = gateCase(stored.case);
    const file = path.relative(REPO_ROOT, stored.file);

    if (result.passed && result.findings.length === 0) {
      console.log(`  PASS  ${result.caseId}  ${result.title}`);
      continue;
    }

    if (!result.passed) rejected++;
    else warned++;

    console.log(
      `  ${result.passed ? 'WARN' : 'FAIL'}  ${result.caseId}  ${result.title}  (score ${result.score})`,
    );
    console.log(`        ${file}`);
    for (const finding of result.findings) {
      console.log(`        · [${finding.check}] ${finding.detail}`);
      console.log(`          → ${finding.remedy}`);
    }
  }

  console.log(
    `\n${cases.length} case(s): ${cases.length - rejected - warned} clean, ${warned} with warnings, ` +
      `${rejected} rejected.`,
  );

  if (rejected > 0) {
    console.log(
      'Rejected cases are not automatable as written — a human could not follow them either. ' +
        'Send each one back with the named gap (§10).',
    );
  }
  return rejected > 0 ? 1 : 0;
}

process.exit(main());
