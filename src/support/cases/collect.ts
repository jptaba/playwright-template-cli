import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../paths';
import { coveragePresent } from '../journey';
import { buildCoverage, type CoverageReport } from './coverage';
import { readSpecFacts, type SpecFact } from './specs';
import { loadCases } from './store';

/**
 * The disk half of the coverage report — §18.
 *
 * Cases come from `cases/`, specs from every pack's `tests/`. Neither list is
 * configured anywhere: a target with cases and no pack, or a pack with specs
 * and no cases, is a real state and both show up as what they are rather than
 * as an empty report.
 */

const TARGETS_DIR = path.join(REPO_ROOT, 'targets');

/** Repo-relative and forward-slashed, which is how every stored path is written. */
function relative(full: string): string {
  return path.relative(REPO_ROOT, full).split(path.sep).join('/');
}

function packsWithTests(target?: string): string[] {
  if (!fs.existsSync(TARGETS_DIR)) return [];
  const names = target
    ? [target]
    : fs
        .readdirSync(TARGETS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

  return names
    .map((name) => path.join(TARGETS_DIR, name, 'tests'))
    .filter((directory) => fs.existsSync(directory));
}

function specFilesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...specFilesUnder(full));
    else if (entry.name.endsWith('.spec.ts')) found.push(full);
  }
  return found.sort();
}

/**
 * Read what every spec cites.
 *
 * ts-morph is imported here rather than at the top of the file because it
 * carries the TypeScript compiler — a fifth of a second the dashboard would
 * otherwise pay at startup to serve pages that never open this one. No type
 * information is needed, so the project is built without a tsconfig and
 * without resolving what any of these files import.
 */
export async function readSpecs(target?: string): Promise<SpecFact[]> {
  const files = packsWithTests(target).flatMap(specFilesUnder);
  if (files.length === 0) return [];

  const { Project } = await import('ts-morph');
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  return files.flatMap((file) => readSpecFacts(project.addSourceFileAtPath(file), relative(file)));
}

/** `collectCoverage`'s report, plus the five coverage *kinds* — a different question. */
export interface TargetCoverage extends CoverageReport {
  /**
   * Which of happy path / negative / idempotency / audit / boundary the pack's
   * specs carry, or `null` when the report spans every application and there
   * is no one pack to ask.
   *
   * This is what the dashboard's health chip promises when it routes a
   * `coverage-incomplete` finding here (`where-to-fix.ts`): the case-to-spec
   * matching above answers "does every case have a spec", which is a
   * different question from "does the suite have all five kinds of test",
   * and neither page said so until this field existed.
   */
  kinds: ReturnType<typeof coveragePresent> | null;
}

/**
 * The report for one application, or for all of them when no name is given.
 *
 * Throws `CaseValidationError` when a case file is malformed, rather than
 * skipping it: a case the loader could not read is not a case with no spec,
 * and reporting it as one would be a lie with an action attached.
 */
export async function collectCoverage(target?: string): Promise<TargetCoverage> {
  const cases = loadCases(target).map((stored) => ({
    file: relative(stored.file),
    case: stored.case,
  }));
  const specs = await readSpecs(target);

  return {
    ...buildCoverage({ cases, specs }),
    // Read from the same titles `target:doctor` tags a spec by, so the two
    // cannot come to disagree about which kinds are present.
    kinds: target ? coveragePresent(specs.map((spec) => spec.title)) : null,
  };
}
