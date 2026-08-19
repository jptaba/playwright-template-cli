#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPORT_OUT_DIR, RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { renderTeamsCard, TEAMS_CARD_LIMIT } from '../src/support/report/render-teams';
import { triageIsForRun, type TriageResult } from '../src/support/triage/types';
import { registerSecret } from '../src/support/redact';
import type { RunResult } from '../src/support/reporters/run-result';

/**
 * `npm run notify:teams` — post the run to a Microsoft Teams channel.
 *
 * Same contract as `notify:email` and for the same reasons: it renders
 * whatever it can, **retains the card as an artifact** whether or not the post
 * succeeds, and **never fails the build**. A notification that can turn a
 * green suite red is a notification people disable.
 *
 * **The webhook URL is a credential.** A Teams incoming webhook has no
 * authentication beyond the secret in the URL, so anybody holding it can post
 * to the channel. It is registered for redaction on the way in, so it cannot
 * reach a log, an artifact or an error message.
 */
async function main(): Promise<number> {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn('No run-result.json. Nothing to post.');
    return 0;
  }
  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;

  /*
     Only a triage result belonging to *this* run. `triage-result.json` is a
     fixed path holding whatever the last triage produced, and posting another
     run's verdicts into a channel is worse than posting none.
  */
  const loaded = fs.existsSync(TRIAGE_RESULT_PATH)
    ? (JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult)
    : null;
  const triage = loaded && triageIsForRun(loaded, run.run.id) ? loaded : null;
  if (loaded && !triage) {
    console.log(
      `Ignoring triage-result.json: it is for run ${loaded.runId}, not ${run.run.id}. ` +
        'Run `npm run triage:cluster` for this run to include the verdicts.',
    );
  }

  const card = renderTeamsCard({
    run,
    triage,
    reportUrl: process.env.REPORT_URL ?? null,
  });
  const payload = JSON.stringify(card.body);

  // Retained whatever happens, like the email digest.
  fs.mkdirSync(REPORT_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_OUT_DIR, 'teams-card.json'), payload, 'utf8');
  console.log(card.summary);

  const webhook = process.env.TEAMS_WEBHOOK_URL;
  if (!webhook) {
    console.log(
      'TEAMS_WEBHOOK_URL is unset, so nothing was posted. The card is retained in ' +
        'report-out/teams-card.json. Treat the webhook URL as a credential: anybody holding it ' +
        'can post to the channel.',
    );
    return 0;
  }
  registerSecret(webhook, 'teams:webhook-url');

  const bytes = Buffer.byteLength(payload, 'utf8');
  if (bytes > TEAMS_CARD_LIMIT) {
    /*
       Teams truncates a card past 28 KB and answers 200 while doing it, so a
       silently mangled post looks like a successful one. Refusing here is the
       only way anybody finds out.
    */
    console.error(
      `The card is ${bytes} bytes, past the ${TEAMS_CARD_LIMIT} Teams accepts. It would be ` +
        'truncated silently. Not posted; the full card is in report-out/teams-card.json.',
    );
    return 0;
  }

  // Failures and state changes by default, like the digest: a channel post on
  // every green run is one people mute.
  const changed = run.run.status === 'failed' || run.totals.flaky > 0;
  if (!changed && process.env.TEAMS_ALWAYS !== 'true') {
    console.log('Run is clean and TEAMS_ALWAYS is not set — not posting. The value is in the exceptions.');
    return 0;
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!response.ok) {
      console.error(
        `Teams refused the card: ${response.status}. Logged and ignored — a failed notification ` +
          'must not fail the build. The card is retained in report-out/.',
      );
      return 0;
    }
    console.log('Posted to Teams.');
  } catch (error) {
    console.error(
      `Posting failed: ${error instanceof Error ? error.message : String(error)}\n` +
        'Logged and ignored — a failed notification must not fail the build.',
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(0);
  },
);
