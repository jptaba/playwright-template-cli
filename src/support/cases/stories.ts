import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_ROOTS, REPO_ROOT, TARGETS_ROOT, repoPath, storiesDirFor } from '../paths';
import type { NormalisedStory } from './author';

/**
 * Reading and writing `targets/<app>/stories/<KEY>.json` — the upstream half of hop 1
 * (§09).
 *
 * One module rather than four, which is the whole point of it existing. Four
 * tools read these files — `hashes:check`, `cases:author`, `story:pull` and the
 * dashboard — and each had its own idea of the shape. `check-hashes` declared a
 * `title` field that story files do not have, so it hashed an empty title,
 * could never reproduce a recorded `contentHash`, and reported every case
 * derived from every story as stale. Nothing noticed, because a hash that
 * disagrees looks exactly like drift, which is the thing the check exists to
 * report.
 *
 * So the shape is validated on the way in rather than cast to. A story missing
 * a field it is hashed over is a broken file, and saying so is the difference
 * between a diagnosable error and fifteen plausible-looking drift reports.
 *
 * The directory is per application for the same reason its cases are: a story
 * file names no application, so "the stories" meant "every story on disk", and
 * `target:remove` had nothing to remove. A story two applications both prove
 * is still a real state — `story-scope.ts` answers that, from the specs that
 * cite it. This says where a story was pulled to, which is a different question
 * and the one nothing on disk could previously answer.
 */

export class StoryValidationError extends Error {
  constructor(file: string, errors: string[]) {
    super(
      `${file} is not a usable story:\n  - ${errors.join('\n  - ')}\n` +
        'Stories are written by `npm run story:pull`. A story that has lost a field cannot be ' +
        'hashed, and an unhashable story reports every case derived from it as stale (§09).',
    );
    this.name = 'StoryValidationError';
  }
}

/** A story, and the application whose directory it sits in. */
export interface OwnedStory {
  target: string;
  story: NormalisedStory;
}

const storiesIn = (target: string, root: string): string =>
  root === TARGETS_ROOT ? storiesDirFor(target) : path.join(root, target, 'stories');

export function storyPath(key: string, target: string, root = TARGETS_ROOT): string {
  return path.join(storiesIn(target, root), `${key}.json`);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const describe = (value: unknown): string =>
  value === undefined ? 'nothing' : value === null ? 'null' : `a ${typeof value}`;

/** Parse and validate one story. Throws rather than defaulting a missing field. */
export function parseStory(text: string, file = '<inline>'): NormalisedStory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new StoryValidationError(file, [
      `not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new StoryValidationError(file, ['expected a JSON object']);
  }

  const story = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const requireString = (field: string) => {
    if (typeof story[field] !== 'string' || story[field] === '') {
      errors.push(`${field}: expected a non-empty string, found ${describe(story[field])}`);
    }
  };

  requireString('key');
  requireString('summary');
  requireString('contentHash');
  if (typeof story['description'] !== 'string') {
    errors.push(`description: expected a string, found ${describe(story['description'])}`);
  }
  if (!isStringArray(story['acceptanceCriteria'])) {
    errors.push(
      `acceptanceCriteria: expected an array of strings, found ${describe(story['acceptanceCriteria'])}`,
    );
  }

  if (errors.length > 0) throw new StoryValidationError(file, errors);
  return story as unknown as NormalisedStory;
}

function readDir(dir: string): NormalisedStory[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      return parseStory(fs.readFileSync(file, 'utf8'), path.relative(REPO_ROOT, file));
    });
}

export function readStory(key: string, target: string, root = TARGETS_ROOT): NormalisedStory {
  const file = storyPath(key, target, root);
  return parseStory(fs.readFileSync(file, 'utf8'), path.relative(REPO_ROOT, file));
}

/** One application's stories, sorted by key. Throws on the first unusable one. */
export function loadStories(target: string, root = TARGETS_ROOT): NormalisedStory[] {
  return readDir(storiesIn(target, root));
}

/**
 * Every story in the repository, each with the application it was pulled for.
 *
 * What `hashes:check` needs: drift is checked across all of them, because a
 * case names its story by key and the key is unique repository-wide.
 */
export function loadAllStories(root = TARGETS_ROOT): OwnedStory[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((target) => readDir(storiesIn(target, root)).map((story) => ({ target, story })));
}

/**
 * Story files sitting loose at the root, belonging to no application.
 *
 * Every tool that scopes by directory skips them silently — which is the
 * failure this scoping was meant to end, in a new costume. Reported rather
 * than adopted: guessing an owner is what the flat directory did.
 */
export function looseStories(root = TARGETS_ROOT): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Anything left in the top-level directories cases and stories used to live in.
 *
 * The same orphan one level up, and the one an incomplete migration leaves:
 * `loadCases` and `loadAllStories` now read `targets/<app>/`, so a file still
 * sitting under `cases/` or `stories/` is read by nothing at all and says so
 * to nobody. Reported by `hashes:check`, never adopted.
 */
export function legacyArtifacts(): string[] {
  const stray: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), next);
      else stray.push(next);
    }
  };
  for (const root of LEGACY_ROOTS) walk(repoPath(root), root);
  return stray.sort();
}

/** Write one story into its application's directory, and return its repo path. */
export function saveStory(story: NormalisedStory, target: string, root = TARGETS_ROOT): string {
  const file = storyPath(story.key, target, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(story, null, 2)}\n`, 'utf8');
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}
