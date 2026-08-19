#!/usr/bin/env tsx
import { FakeJiraServer } from '../tests/support/fake-jira-server';
import { FakePractiTestServer } from '../tests/support/fake-practitest-server';
import { FakeSmtpServer } from '../tests/support/fake-smtp-server';
import { FakeTeamsServer } from '../tests/support/fake-teams-server';

/**
 * `npm run fakes:serve` — Jira and PractiTest, locally, for as long as you
 * need them.
 *
 * **Why this exists.** The operational half of this framework — pull the
 * stories, pull the cases, run, push the results — could only ever be
 * exercised by whoever owned a Jira and a PractiTest licence. So it was
 * exercised for exactly one application, and the audit that found that
 * (backlog item 46) could not close it without buying something.
 *
 * The fakes were already here and already thorough; they were only reachable
 * from inside a Playwright test. Both are plain HTTP servers, so the whole
 * missing piece was a process to hold them open.
 *
 * **They are fakes, and the difference matters.** They believe whatever they
 * are told and never rate-limit unless asked to. Anything that is genuinely an
 * assumption about the *real* service still needs the real service once — the
 * same rule this repository already applies to Vault.
 *
 * Roles, because they are easy to mix up:
 *
 *   - **Jira** is where user stories come *from*.
 *   - **PractiTest** is where test cases come *from* and where run results go
 *     *to*.
 *   - **Teams** and **SMTP** are where the report goes *out*, so the
 *     notification paths can be exercised with no channel and no mailbox.
 */
/**
 * The failures, injected **here** — in the seeded cases and the story that
 * describes them — rather than invented in a pack.
 *
 * That is the owner's instruction and it is the right way round: a case is
 * where a person says what should happen, so a case describing a known-cause
 * failure is where the cause is *stated*. The pack's `tests/triage-fixture/`
 * specs implement these cases, and `publish:practitest` pushes their results
 * back against them — so the loop closes on the same ids it started from.
 *
 * Each carries the triage category it should produce, in the case name, so
 * seeing the seed tells you what the measurement expects without opening a
 * spec.
 */
const FAILURE_CASES: Array<[string, string]> = [
  ['TF-RB-01', 'A control that is not on the page → locator-drift'],
  ['TF-RB-02', 'An assertion about data the spec did not create → test-data'],
  ['TF-RB-03', 'A page that will not load because the address is wrong → network-infrastructure'],
  ['TF-RB-04', 'A wait too short for a page that fetches → timing-synchronisation'],
];

const SEEDED_STORIES: Array<[string, Record<string, unknown>]> = [
  [
    'RB-1',
    {
      summary: 'An administrator can keep the room list up to date',
      description: [
        'As an administrator I want to add and remove rooms so that the rooms guests can book',
        'reflect what the hotel actually has.',
        '',
        // The heading the extractor looks for. A story without it is refused
        // rather than guessed at, which is the rule being exercised here.
        'Acceptance Criteria',
        '* A room I create appears in the room list',
        '* A room I remove is gone from the room list',
        '* A room with no name is refused, and the form says why',
      ].join('\n'),
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
    },
  ],
  [
    'RB-2',
    {
      summary: 'The room form refuses what the service will not accept',
      description: [
        'As an administrator I want the form to tell me why a room was rejected so that I am',
        'not left guessing which field was wrong.',
        '',
        'Acceptance Criteria',
        '* A price below the allowed range is refused',
        '* A price above the allowed range is refused',
        '* Both ends of the allowed range are accepted',
      ].join('\n'),
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
    },
  ],
  [
    // The story the deliberate failures belong to. Triage is a product
    // capability like any other, and it is only exercised by things that fail.
    'RB-9',
    {
      summary: 'Failures are classified so a run says where to look',
      description: [
        'As a tester I want a failing run to say which kind of failure it was so that I am not',
        'reading four stack traces to find out whether the application is broken.',
        '',
        'Acceptance Criteria',
        '* A control that is not on the page is classified as locator drift',
        '* An assertion about data the spec did not create is classified as test data',
        '* An unreachable address is classified as network or infrastructure',
        '* A wait shorter than the page takes is classified as timing',
      ].join('\n'),
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
    },
  ],
];

async function main(): Promise<void> {
  const jira = new FakeJiraServer();
  const practitest = new FakePractiTestServer();
  const teams = new FakeTeamsServer();
  const smtp = new FakeSmtpServer();

  const jiraUrl = await jira.start();
  const practitestUrl = await practitest.start();
  const teamsUrl = await teams.start();
  const mailbox = await smtp.start();

  for (const [key, fields] of SEEDED_STORIES) jira.seedIssue(key, fields);

  /*
     Seeded from the case ids the specs already carry, so a pull finds the
     cases those specs claim rather than a set invented here. A fake whose
     contents have nothing to do with the suite proves the plumbing and
     nothing else.
  */
  const caseIds = process.argv
    .filter((argument) => argument.startsWith('--cases='))
    .flatMap((argument) => argument.slice('--cases='.length).split(','))
    .filter(Boolean);
  for (const id of caseIds) practitest.seedCase(id, { name: `Case ${id}` } as never);

  /*
     The deliberate failures, seeded as cases in their own right. Without them
     the fixture's results have no case to be pushed against, and triage would
     be measuring specs that PractiTest has never heard of.
  */
  for (const [id, name] of FAILURE_CASES) practitest.seedCase(id, { name } as never);

  console.log('Fake services are up. They hold no data between runs.\n');
  console.log('  Jira        (user stories)        ', jiraUrl);
  console.log('  PractiTest  (cases in, results out)', practitestUrl);
  console.log('  Teams       (report out)          ', teamsUrl);
  console.log(`  SMTP        (report out)           ${mailbox.host}:${mailbox.port}`);
  if (caseIds.length > 0) {
    console.log(`\n  Seeded ${caseIds.length} passing case(s): ${caseIds.join(', ')}`);
  }
  console.log(`\n  Seeded ${FAILURE_CASES.length} deliberate-failure case(s) — triage's input:`);
  for (const [id, name] of FAILURE_CASES) console.log(`    ${id}  ${name}`);
  console.log('\nExport these in the shell you run the tools from:\n');
  console.log(`  export JIRA_BASE_URL=${jiraUrl}`);
  console.log('  export JIRA_PAT=jira-service-pat');
  console.log(`  export PRACTITEST_URL=${practitestUrl}`);
  console.log('  export PRACTITEST_TOKEN=pt-service-token');
  console.log('  export PRACTITEST_PROJECT_ID=1');
  // Quoted: the webhook carries its secret in the path, and an unquoted URL
  // with a `?` or `&` in it is a shell surprise nobody needs.
  console.log(`  export TEAMS_WEBHOOK_URL='${teamsUrl}'`);
  console.log(`  export SMTP_HOST=${mailbox.host} SMTP_PORT=${mailbox.port} SMTP_SECURE=false`);
  console.log('  export DIGEST_TO=qa-team@fake.invalid DIGEST_FROM=qa-automation@fake.invalid');
  console.log('  export TEAMS_ALWAYS=true DIGEST_ALWAYS=true   # notify on green runs too\n');
  console.log('Then: npm run story:pull -- RB-1 · npm run publish:practitest · npm run notify:teams · npm run notify:email');
  console.log('Ctrl+C to stop.\n');

  const shutdown = async (): Promise<void> => {
    /*
       What each service actually received, on the way out. It is the cheapest
       possible proof that a chain ran end to end rather than merely exiting
       zero — and the number that is zero tells you which link did not.
    */
    console.log('\nStopping.');
    console.log(`  Jira        ${jira.calls.length} call(s)`);
    console.log(`  PractiTest  ${practitest.calls.length} call(s)`);
    console.log(`  Teams       ${teams.posts.length} card(s) accepted, ${teams.rejected.length} refused`);
    console.log(`  SMTP        ${smtp.received.length} mail(s)`);
    for (const mail of smtp.received) console.log(`                └ "${mail.subject}" → ${mail.to.join(', ')}`);
    await Promise.all([jira.stop(), practitest.stop(), teams.stop(), smtp.stop()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Hold the process open. The servers keep it alive on their own, but saying
  // so beats a reader wondering why there is no loop.
  await new Promise(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
