#!/usr/bin/env tsx
import path from 'node:path';
import { PractiTestClient } from '../src/integrations/practitest/client';
import { decidePublish, publishPayload } from '../src/support/cases/publish';
import { loadCases } from '../src/support/cases/store';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run cases:push` — step A6 of §09.
 *
 * **Dry run by default.** "Writing to a shared case repository is the one
 * irreversible thing in this pipeline." Pass `--publish` to actually write.
 *
 * Idempotent on case identity, never overwrites a human-edited case, and never
 * deletes anything — an automation that can create cases *and* delete them is
 * a considerably larger conversation with whoever owns that system (§14).
 */
async function main(): Promise<number> {
  const publish = process.argv.includes('--publish');
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1];

  const cases = loadCases(targetArg);
  if (cases.length === 0) {
    console.log('No cases found under cases/. Nothing to publish.');
    return 0;
  }

  const serviceAccount = process.env.PRACTITEST_SERVICE_ACCOUNT ?? 'qa-automation';
  const client = PractiTestClient.fromEnvironment();

  const counts = { create: 0, update: 0, 'skip-human-owned': 0, 'skip-speculative': 0 };

  try {
    for (const stored of cases) {
      const decision = await decidePublish(stored.case, {
        serviceAccount,
        lookup: (identity) => client.findCaseByIdentity(identity),
      });
      counts[decision.action]++;

      const where = path.relative(REPO_ROOT, stored.file);
      const verb = publish ? decision.action : `would ${decision.action}`;
      console.log(`  ${verb.padEnd(22)} ${decision.title}`);
      console.log(`    ${where}${decision.reason ? `\n    ${decision.reason}` : ''}`);

      if (!publish) continue;
      if (decision.action === 'create') {
        const id = await client.createCase(publishPayload(stored.case));
        console.log(`    created as ${id}`);
      } else if (decision.action === 'update') {
        await client.updateCase(decision.existingId!, publishPayload(stored.case));
        console.log(`    updated ${decision.existingId}`);
      }
    }
  } finally {
    await client.dispose();
  }

  console.log(
    `\n${cases.length} case(s): ${counts.create} new, ${counts.update} updated, ` +
      `${counts['skip-human-owned']} human-owned (untouched), ` +
      `${counts['skip-speculative']} speculative (never published).`,
  );

  if (!publish) {
    console.log(
      '\nDry run — nothing was written. Re-run with --publish once the diff has been ' +
        'reviewed and merged. Tell the PractiTest owners this automation exists before it ' +
        'first runs, not after (§22).',
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
