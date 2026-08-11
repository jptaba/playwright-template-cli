#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORIES_DIR } from '../src/support/paths';
import { hashCase, hashContent, loadCases } from '../src/support/cases/store';

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

interface Story {
  key: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
}

function storyHash(story: Story): string {
  return hashContent(
    JSON.stringify({
      title: story.title ?? '',
      description: story.description ?? '',
      acceptanceCriteria: story.acceptanceCriteria ?? [],
    }),
  );
}

function loadStories(): Map<string, Story> {
  const stories = new Map<string, Story>();
  if (!fs.existsSync(STORIES_DIR)) return stories;
  for (const file of fs.readdirSync(STORIES_DIR).filter((name) => name.endsWith('.json'))) {
    const story = JSON.parse(fs.readFileSync(path.join(STORIES_DIR, file), 'utf8')) as Story;
    stories.set(story.key, story);
  }
  return stories;
}

/** The `case-hash` annotation a generated spec carries. */
function specCaseHash(specPath: string): string | null {
  const source = fs.readFileSync(specPath, 'utf8');
  const match = /type:\s*'case-hash'\s*,\s*description:\s*'([^']+)'/.exec(source);
  return match?.[1] ?? null;
}

function main(): number {
  const cases = loadCases();
  const stories = loadStories();
  const problems: string[] = [];
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
        const upstream = storyHash(story);
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
