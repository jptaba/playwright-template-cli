import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORIES_DIR } from '../paths';
import type { NormalisedStory } from './author';

/**
 * Reading and writing `stories/<KEY>.json` — the upstream half of hop 1 (§09).
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

export function storyPath(key: string, dir = STORIES_DIR): string {
  return path.join(dir, `${key}.json`);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

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

const describe = (value: unknown): string =>
  value === undefined ? 'nothing' : value === null ? 'null' : `a ${typeof value}`;

export function readStory(key: string, dir = STORIES_DIR): NormalisedStory {
  const file = storyPath(key, dir);
  return parseStory(fs.readFileSync(file, 'utf8'), path.relative(REPO_ROOT, file));
}

/** Every story on disk, sorted by key. Throws on the first unusable one. */
export function loadStories(dir = STORIES_DIR): NormalisedStory[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      return parseStory(fs.readFileSync(file, 'utf8'), path.relative(REPO_ROOT, file));
    });
}

/** Write one story, and return its repo-relative path with forward slashes. */
export function saveStory(story: NormalisedStory, dir = STORIES_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = storyPath(story.key, dir);
  fs.writeFileSync(file, `${JSON.stringify(story, null, 2)}\n`, 'utf8');
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}
