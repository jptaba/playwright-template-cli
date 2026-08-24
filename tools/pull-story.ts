#!/usr/bin/env tsx
import { JiraClient } from '../src/integrations/jira/client';
import { normaliseStory } from '../src/support/cases/author';
import { saveStory } from '../src/support/cases/stories';

/**
 * `npm run story:pull -- FIN-2210` — step A1 of §09.
 *
 * Reads one issue, normalises its wiki markup to plain text, extracts the
 * acceptance criteria, and writes `stories/<KEY>.json`. A story with no
 * identifiable criteria is **rejected here**, with that as the stated reason —
 * generating cases from a title and a paragraph of context is exactly how
 * invention happens (§09).
 *
 * Storing the story on disk rather than passing it straight through is what
 * makes the run reproducible and gives the content hash somewhere to live.
 */
async function main(): Promise<number> {
  const key = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  if (!key) {
    console.error('Usage: npm run story:pull -- <ISSUE-KEY>');
    return 2;
  }

  const client = JiraClient.fromEnvironment();
  try {
    const issue = await client.getIssue(key);

    if (issue.acceptanceCriteria.length === 0) {
      console.error(
        `${key} has no identifiable acceptance criteria, so it is rejected at extraction ` +
          'rather than guessed at (§09).\n' +
          'Set JIRA_AC_FIELD to the custom field that holds them, or add an "Acceptance ' +
          'Criteria" heading to the description. Track A may simply not apply to older stories.',
      );
      return 1;
    }

    const story = normaliseStory({
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      acceptanceCriteria: issue.acceptanceCriteria,
    });

    const file = saveStory(story);

    console.log(`wrote ${file}`);
    console.log(`  ${issue.acceptanceCriteria.length} acceptance criteria`);
    console.log(`  contentHash ${story.contentHash}`);
    return 0;
  } finally {
    await client.dispose();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
