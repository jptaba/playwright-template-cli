#!/usr/bin/env tsx
import { JiraClient } from '../src/integrations/jira/client';

/**
 * `npm run jira:issue -- FIN-2210` — §15.
 *
 * The replacement for the conversational access lost with Data Center: "build
 * the CLI, and only the CLI." The reporter needs the REST client anyway, so
 * this is a thin wrapper over code being written regardless — no new
 * dependency, no new egress path, no security review.
 *
 * It is also Track A's story reader: `pull-story` is the same code path, so
 * the convenience and the authoring pipeline are one thing to maintain.
 */
async function main(): Promise<number> {
  const key = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  if (!key) {
    console.error('Usage: npm run jira:issue -- <ISSUE-KEY>');
    return 2;
  }

  const client = JiraClient.fromEnvironment();
  try {
    const issue = await client.getIssue(key);
    console.log(`# ${issue.key} · ${issue.summary}\n`);
    console.log(`**Type:** ${issue.issueType}   **Status:** ${issue.status}`);
    if (issue.labels.length) console.log(`**Labels:** ${issue.labels.join(', ')}`);
    if (issue.linkedIssues.length) console.log(`**Linked:** ${issue.linkedIssues.join(', ')}`);

    console.log('\n## Acceptance criteria\n');
    if (issue.acceptanceCriteria.length === 0) {
      console.log(
        '_None found._ Set JIRA_AC_FIELD to the custom field that holds them, or add an ' +
          '"Acceptance Criteria" heading to the description. A story with no identifiable ' +
          'criteria is rejected at extraction rather than guessed at (§09).',
      );
    } else {
      issue.acceptanceCriteria.forEach((criterion, index) => {
        console.log(`${index + 1}. ${criterion}`);
      });
    }

    console.log('\n## Description\n');
    console.log(issue.description || '_Empty._');
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
