#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/support/paths';
import { hashCase, loadCases } from '../src/support/cases/store';
import { storyContentHash, type NormalisedStory } from '../src/support/cases/author';
import { StoryValidationError, loadStories } from '../src/support/cases/stories';

/**
 * `npm run hashes:check` — traceability drift, both hops (§09, §22).
 *
 *   Jira story ──contentHash──▶ PractiTest case ──caseHash──▶ spec annotation
 *
 * "Each artifact stores a hash of the one upstream, and a CI check flags
 * anything whose upstream changed. An edited story surfaces as '3 cases
 * derived from FIN-2210 are stale'; an edited case surfaces as 'the spec for
 * #5104 tests a previous version'."
 *
 * Without this, Track A quietly makes the drift problem worse than Track B
 * ever did — it adds a second hop for a requirement to change behind code that
 * claims to verify it.
 */

/**
 * The stories, by key — read through the shared store so this tool cannot
 * disagree with the authoring side about what a story is or how it hashes.
 *
 * It carried its own copy of both, and the copy read a `title` field that a
 * story file does not have. It hashed an empty title, never matched a recorded
 * `contentHash`, and reported all ten cases in the repository as derived from
 * changed stories — for four months, in a check that runs in CI.
 */
function storiesByKey(): { stories: Map<string, NormalisedStory>; problem: string | null } {
  const stories = new Map<string, NormalisedStory>();
  try {
    for (const story of loadStories()) stories.set(story.key, story);
  } catch (error) {
    if (error instanceof StoryValidationError) return { stories, problem: error.message };
    throw error;
  }
  return { stories, problem: null };
}

/** The `case-hash` annotation a generated spec carries. */
function specCaseHash(specPath: string): string | null {
  const source = fs.readFileSync(specPath, 'utf8');
  const match = /type:\s*'case-hash'\s*,\s*description:\s*'([^']+)'/.exec(source);
  return match?.[1] ?? null;
}

function main(): number {
  const cases = loadCases();
  const { stories, problem: storyProblem } = storiesByKey();
  const problems: string[] = [];
  if (storyProblem) problems.push(storyProblem);
  const staleByStory = new Map<string, number>();

  for (const stored of cases) {
    const file = path.relative(REPO_ROOT, stored.file);
    const testCase = stored.case;

    // Hop 2: has the case been edited since its hash was recorded?
    const current = hashCase(testCase);
    if (testCase.caseHash && testCase.caseHash !== current) {
      problems.push(
        `${file}: the case was edited after its hash was recorded ` +
          `(${testCase.caseHash} → ${current}). Re-publish it, or restore the text.`,
      );
    }

    // Hop 2 continued: does the spec still implement this version of the case?
    if (testCase.specPath) {
      const specFile = path.join(REPO_ROOT, testCase.specPath);
      if (!fs.existsSync(specFile)) {
        problems.push(`${file}: specPath points at ${testCase.specPath}, which does not exist.`);
      } else {
        const annotated = specCaseHash(specFile);
        if (annotated && annotated !== current) {
          problems.push(
            `${testCase.specPath}: the spec for case ${testCase.id ?? testCase.source.key} tests a ` +
              `previous version of it (spec ${annotated}, case ${current}).`,
          );
        }
      }
    }

    // Hop 1: has the story moved under the case?
    if (testCase.source.type === 'jira-story') {
      const story = stories.get(testCase.source.key);
      if (story) {
        const upstream = storyContentHash(story);
        if (upstream !== testCase.source.contentHash) {
          staleByStory.set(testCase.source.key, (staleByStory.get(testCase.source.key) ?? 0) + 1);
        }
      }
    }
  }

  for (const [key, count] of staleByStory) {
    problems.push(
      `${count} case(s) derived from ${key} are stale: the story changed after they were written. ` +
        'Re-run the case author for that story and review the diff.',
    );
  }

  console.log(
    `Checked ${cases.length} case(s) against ${stories.size} story file(s).`,
  );
  if (problems.length === 0) {
    console.log('No traceability drift.');
    return 0;
  }
  console.error(`\n${problems.length} drift problem(s):`);
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error(
    '\nDrift is a visible task rather than a silent failure — that is the whole point of ' +
      'hashing both hops (§22).',
  );
  return 1;
}

process.exit(main());
