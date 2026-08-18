#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget, targetNames } from '../config/target';
import { REPO_ROOT } from '../src/support/paths';
import { formatUpgrade, planUpgrade, type UpgradePlan } from '../src/support/onboarding/upgrade';

/**
 * `npm run target:upgrade [-- --name=<app>] [--apply]` — how far a pack has
 * drifted from the templates that would write it today.
 *
 * **Why it exists.** Rule zero sends every troubleshooting fix into the
 * framework rather than into an application's pack, which is right, and leaves
 * a gap nobody had named: a scaffolder improvement reaches applications
 * onboarded *afterwards* and no others. The applications that exposed a defect
 * are by definition the ones already on disk, so the fix lands everywhere
 * except where it was needed.
 *
 * **It reports. It does not rewrite.** `--apply` adds files the templates write
 * and the pack does not have, and nothing else — a file that exists and differs
 * is left exactly alone. That asymmetry is the whole design: adding a missing
 * file cannot destroy work, and replacing a diverged one usually would, because
 * a diverged file is normally somebody's locators read off a real page rather
 * than an outdated template.
 *
 * `target:new` never overwrites, which is what makes onboarding safe to re-run.
 * This does not weaken that.
 */
function readPack(targetName: string): Map<string, string> {
  const onDisk = new Map<string, string>();
  const roots = [
    path.join('src', 'targets', targetName),
    path.join('config', 'targets'),
  ];

  for (const root of roots) {
    const absolute = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absolute)) continue;
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        // Keys are repo-relative with forward slashes, matching what the
        // scaffolder emits.
        const key = path.relative(REPO_ROOT, full).split(path.sep).join('/');
        onDisk.set(key, fs.readFileSync(full, 'utf8'));
      }
    };
    walk(absolute);
  }
  return onDisk;
}

function apply(plan: UpgradePlan): number {
  if (plan.addable.length === 0) {
    console.log('\n  Nothing to add — every file the templates write is already here.');
    return 0;
  }
  for (const file of plan.addable) {
    const full = path.join(REPO_ROOT, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.contents ?? '');
    console.log(`  wrote ${file.path}`);
  }
  console.log(
    `\n  Added ${plan.addable.length} file(s). Nothing that already existed was touched.\n` +
      '  Run `npm run verify` and `npm run target:doctor` before committing.',
  );
  return 0;
}

function main(): number {
  const named = process.argv
    .filter((argument) => argument.startsWith('--name='))
    .map((argument) => argument.slice('--name='.length));
  const applying = process.argv.includes('--apply');

  let known: string[];
  try {
    known = targetNames();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (known.length === 0) {
    console.error('No applications are onboarded, so there is no pack to compare.');
    return 2;
  }

  const unknown = named.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    console.error(`Unknown target(s): ${unknown.join(', ')}. Onboarded: ${known.join(', ')}.`);
    return 2;
  }

  const targets = named.length > 0 ? named : known;
  if (applying && targets.length !== 1) {
    console.error(
      '--apply writes files, so it takes one application at a time: ' +
        '`npm run target:upgrade -- --name=<app> --apply`.',
    );
    return 2;
  }

  console.log(
    `Comparing ${targets.length} pack(s) against the templates that would write them today.\n` +
      'Files that differ are reported and never rewritten — a pack is half generated\n' +
      "shape and half somebody's work, and this cannot tell which is which.",
  );

  let addable = 0;
  for (const name of targets) {
    const plan = planUpgrade(resolveTarget(name), readPack(name));
    for (const line of formatUpgrade(plan)) console.log(line);
    addable += plan.addable.length;
    if (applying) return apply(plan);
  }

  if (addable > 0 && !applying) {
    console.log(
      `\n${addable} file(s) could be added. ` +
        '`--apply` writes those and only those, one application at a time.',
    );
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
