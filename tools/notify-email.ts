#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { REPORT_OUT_DIR, RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { renderDigest } from '../src/support/report/render-email';
import { credentialFromEnv } from '../src/support/env-credentials';
import type { RunResult } from '../src/support/reporters/run-result';
import type { TriageResult } from '../src/support/triage/types';

/**
 * `npm run notify:email` — §19.
 *
 * Sends once, from the merge job, after all shards have reported. Per-shard
 * emails are how a team learns to filter your notifications into a folder they
 * never open.
 *
 * **Failure to send must not fail the build**: it logs, retains the digest as
 * an artifact, and exits zero.
 */
async function main(): Promise<number> {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.warn('No run-result.json. Nothing to send.');
    return 0;
  }
  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  const triage = fs.existsSync(TRIAGE_RESULT_PATH)
    ? (JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult)
    : null;

  const digest = renderDigest({
    run,
    triage,
    // GitLab Pages, or a job artifact URL if Pages is off on this instance.
    reportUrl: process.env.REPORT_URL ?? null,
  });

  // Always retain the digest, whether or not the send succeeds.
  fs.mkdirSync(REPORT_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_OUT_DIR, 'digest.html'), digest.html, 'utf8');
  fs.writeFileSync(path.join(REPORT_OUT_DIR, 'digest.txt'), digest.text, 'utf8');
  console.log(`Subject: ${digest.subject}`);

  const recipients = process.env.DIGEST_TO;
  const host = process.env.SMTP_HOST;
  if (!recipients || !host) {
    console.log(
      'SMTP_HOST or DIGEST_TO is unset, so nothing was sent. The digest is retained as an ' +
        'artifact in report-out/. Confirm the sending account is a sanctioned service mailbox ' +
        'rather than a person\'s (§19).',
    );
    return 0;
  }

  // Only send failures and state changes by default: a nightly mail that is
  // green 90% of the time trains its recipients to filter it (§22).
  const changed = run.run.status === 'failed' || run.totals.flaky > 0;
  if (!changed && process.env.DIGEST_ALWAYS !== 'true') {
    console.log('Run is clean and DIGEST_ALWAYS is not set — not sending. The value is in the exceptions.');
    return 0;
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 25),
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              // From Vault via the same path as every other credential (§19).
              pass: credentialFromEnv('SMTP_PASSWORD', 'smtp:password') ?? '',
            },
          }
        : {}),
    });

    await transport.sendMail({
      from: process.env.DIGEST_FROM ?? 'qa-automation@localhost',
      to: recipients,
      subject: digest.subject,
      // Both parts, always: some corporate gateways score HTML-only mail as spam.
      html: digest.html,
      text: digest.text,
    });
    console.log(`Sent to ${recipients}.`);
  } catch (error) {
    console.error(
      `Sending failed: ${error instanceof Error ? error.message : String(error)}\n` +
        'Logged and ignored — a failed notification must not fail the build. The digest is ' +
        'retained in report-out/ (§19).',
    );
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(0),
);
