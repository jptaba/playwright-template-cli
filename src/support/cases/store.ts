import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import YAML from 'yaml';
import { TARGETS_ROOT, casesDirFor } from '../paths';
import { testCaseSchema, type TestCase } from './schema';

/**
 * Reading and writing `cases/<target>/<id>.yaml`.
 *
 * Git is the staging area; PractiTest is publication (§09). Cases land here on
 * a branch and are reviewed as a diff — review-by-diff is a skill the team
 * already has, rejected cases leave a trace of *why*, and a bad generation run
 * is reverted with `git revert` rather than by deleting records by hand.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
let validator: ValidateFunction<TestCase> | null = null;

function validate(): ValidateFunction<TestCase> {
  if (!validator) validator = ajv.compile<TestCase>(testCaseSchema);
  return validator;
}

export class CaseValidationError extends Error {
  constructor(file: string, errors: string[]) {
    super(`${file} is not a valid test case:\n  - ${errors.join('\n  - ')}`);
    this.name = 'CaseValidationError';
  }
}

export interface StoredCase {
  file: string;
  case: TestCase;
}

/**
 * A stable hash of the case's meaning — the fields a spec is written against.
 * Changing a title should not invalidate a spec; changing a step should.
 */
export function hashCase(testCase: TestCase): string {
  const meaningful = {
    title: testCase.title,
    preconditions: testCase.preconditions,
    steps: testCase.steps,
    assertions: testCase.assertions,
    acQuoted: testCase.acQuoted,
  };
  return crypto.createHash('sha256').update(JSON.stringify(meaningful)).digest('hex').slice(0, 16);
}

export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 16);
}

export function parseCase(text: string, file = '<inline>'): TestCase {
  const parsed = YAML.parse(text) as unknown;
  const check = validate();
  if (!check(parsed)) {
    throw new CaseValidationError(
      file,
      (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`),
    );
  }
  return parsed;
}

export function loadCases(target?: string): StoredCase[] {
  if (!fs.existsSync(TARGETS_ROOT)) return [];
  const targets = target
    ? [target]
    : fs
        .readdirSync(TARGETS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

  const cases: StoredCase[] = [];
  for (const name of targets) {
    const dir = casesDirFor(name);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((entry) => /\.ya?ml$/.test(entry)).sort()) {
      const full = path.join(dir, file);
      cases.push({ file: full, case: parseCase(fs.readFileSync(full, 'utf8'), full) });
    }
  }
  return cases;
}

export function saveCase(testCase: TestCase, slug: string): string {
  const dir = casesDirFor(testCase.target);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.yaml`);
  const withHash: TestCase = { ...testCase, caseHash: hashCase(testCase) };
  fs.writeFileSync(file, YAML.stringify(withHash, { lineWidth: 100 }), 'utf8');
  return file;
}

/**
 * Record, in the file the case came from, the hash it was just published at.
 *
 * Hop 2's premise is that each artifact stores a hash of the one upstream —
 * and publishing never wrote one back. `publishPayload` computed the hash,
 * sent it to PractiTest and forgot it, so the local file kept whatever it had
 * and "has this case changed since it was published?" had nothing to compare
 * against. A case written by hand could carry a `caseHash` nobody had ever
 * derived from its content, and `hashes:check` would report that for months as
 * an edit that never happened.
 *
 * Rewrites the file in place rather than going through `saveCase`, which
 * derives a filename from a slug: re-deriving it here is how a re-publish
 * leaves a second copy of a case behind under a slightly different name.
 */
export function recordPublishedHash(file: string, testCase: TestCase): string {
  const hash = hashCase(testCase);
  fs.writeFileSync(file, YAML.stringify({ ...testCase, caseHash: hash }, { lineWidth: 100 }), 'utf8');
  return hash;
}

/**
 * Record, in the case, which spec now automates it and at which version.
 *
 * **The same omission `recordPublishedHash` was written for, one hop later.**
 * `check-hashes` asks "does the spec still implement this version of the case?"
 * only `if (testCase.specPath)` — so a generator that writes a `case-hash` into
 * the spec and nothing back into the case leaves that question with nothing to
 * compare against, and the drift check passes on a spec that has silently
 * fallen behind. Caught by editing a case and watching `hashes:check` report
 * nothing.
 *
 * Rewrites in place rather than going through `saveCase`, for the reason above:
 * re-deriving the filename from a slug is how a second copy of a case appears.
 */
export function recordGeneratedSpec(file: string, testCase: TestCase, specPath: string): string {
  const hash = hashCase(testCase);
  fs.writeFileSync(
    file,
    YAML.stringify(
      { ...testCase, caseHash: hash, specPath: specPath.replace(/\\/g, '/') },
      { lineWidth: 100 },
    ),
    'utf8',
  );
  return hash;
}

/**
 * Identity is the case's slug plus story key, so re-publishing updates a case
 * rather than creating a second one (§09).
 */
export function caseIdentity(testCase: TestCase): string {
  return `${testCase.target}:${testCase.source.key}:${slugify(testCase.title)}`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
