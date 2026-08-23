#!/usr/bin/env tsx
import { FakeJiraServer } from '../tests/support/fake-jira-server';
import { FakePractiTestServer } from '../tests/support/fake-practitest-server';
import { FakeSmtpServer } from '../tests/support/fake-smtp-server';
import { FakeTeamsServer } from '../tests/support/fake-teams-server';
import { readSpecs } from '../src/support/cases/collect';
import { casesBySet, storiesFor, storyFields } from '../src/support/cases/seed';

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
 * What gets seeded is **derived from the suite**, not written down here.
 *
 * This file used to carry `TF-RB-01…04` and three `RB-*` stories as constants,
 * so `npm run app:journey` traced green for one application and reported
 * *"nothing traced"* for the other four (items 46 and 48). The ids and the
 * story keys are already in every spec's annotations — the same ones
 * `triage:measure` scores and `publish:practitest` pushes against — so reading
 * them means a newly onboarded application is seeded with no change here.
 *
 * The failures are still *stated in the cases* rather than invented in a pack,
 * which is the owner's instruction: a ground-truth spec's category goes into
 * the case name, so reading the seed tells you what the measurement expects.
 */
async function main(): Promise<void> {
  const jira = new FakeJiraServer();
  const practitest = new FakePractiTestServer();
  const teams = new FakeTeamsServer();
  const smtp = new FakeSmtpServer();

  const jiraUrl = await jira.start();
  const practitestUrl = await practitest.start();
  const teamsUrl = await teams.start();
  const mailbox = await smtp.start();

  /*
     Every onboarded application, because the journey is run per application
     and a fake that only knows one of them sends the other four to a stage
     that cannot pass.
  */
  const specs = await readSpecs();
  const stories = storiesFor(specs);
  /*
     One set per application, because "the cases for this suite" is otherwise
     unanswerable in a project holding all five (item 63). `pull-cases` looks
     the set up by the application's own name.
  */
  const bySet = casesBySet(specs);
  const cases = [...bySet.values()].flat();

  for (const story of stories) jira.seedIssue(story.key, storyFields(story));
  for (const [set, entries] of bySet) {
    practitest.seedSet(set);
    for (const entry of entries) {
      practitest.seedCase(entry.id, { name: entry.name, setName: set } as never);
    }
  }

  /*
     Still honoured, for a case id that no spec claims yet — writing the spec
     after pulling the case is a legitimate order to work in.
  */
  const extra = process.argv
    .filter((argument) => argument.startsWith('--cases='))
    .flatMap((argument) => argument.slice('--cases='.length).split(','))
    .filter(Boolean);
  for (const id of extra) practitest.seedCase(id, { name: `Case ${id}` } as never);

  console.log('Fake services are up. They hold no data between runs.\n');
  console.log('  Jira        (user stories)        ', jiraUrl);
  console.log('  PractiTest  (cases in, results out)', practitestUrl);
  console.log('  Teams       (report out)          ', teamsUrl);
  console.log(`  SMTP        (report out)           ${mailbox.host}:${mailbox.port}`);
  const groundTruth = cases.filter((entry) => entry.name.includes(' → '));
  console.log(
    `\n  Seeded ${cases.length} case(s) in ${bySet.size} set(s) and ${stories.length} story(ies), read from the specs` +
      ` on disk${extra.length > 0 ? ` (plus ${extra.length} asked for)` : ''}.`,
  );
  console.log(
    `  Sets:    ${[...bySet.entries()].map(([set, e]) => `${set} (${e.length})`).join(', ') || 'none'}`,
  );
  console.log(`  Stories: ${stories.map((story) => story.key).join(', ') || 'none'}`);
  if (groundTruth.length > 0) {
    // Named individually because these are triage's input: the deliberate
    // failures, each stating the category it should produce.
    console.log(`\n  Of those, ${groundTruth.length} deliberate-failure case(s):`);
    for (const entry of groundTruth) console.log(`    ${entry.id}  ${entry.name}`);
  }
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
  // The first seeded story rather than a literal, so the hint names one that
  // exists whatever is onboarded.
  const example = stories[0]?.key ?? '<story>';
  console.log(
    `Then: npm run story:pull -- ${example} · npm run publish:practitest · ` +
      'npm run notify:teams · npm run notify:email',
  );
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
