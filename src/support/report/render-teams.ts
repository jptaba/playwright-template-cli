import type { RunResult } from '../reporters/run-result';
import type { TriageResult } from '../triage/types';

/**
 * The run, as an Adaptive Card for a Microsoft Teams incoming webhook.
 *
 * **Not the email digest with different markup.** A channel post is read on a
 * phone, in a list, next to other people's messages — so it carries the
 * verdict, the numbers, and what to do, and stops. The report is where detail
 * belongs, and the card links to it rather than reproducing it.
 *
 * Pure: a run in, a card out. The posting lives in `tools/notify-teams.ts`.
 */

export interface TeamsCardOptions {
  run: RunResult;
  triage: TriageResult | null;
  /** Where the full report is, when it is published somewhere reachable. */
  reportUrl?: string | null;
}

/** Teams truncates a card past 28 KB without saying so. */
export const TEAMS_CARD_LIMIT = 28 * 1024;

/**
 * How many triage lines a card may carry.
 *
 * A failing run with sixty clusters would otherwise post sixty lines into a
 * channel, which is how a notification gets muted. The rest are counted, and
 * the report has all of them.
 */
const MAX_TRIAGE_LINES = 5;

export interface TeamsCard {
  /** The JSON body to POST. */
  body: Record<string, unknown>;
  /** What the card says, flattened — for a log line and for tests. */
  summary: string;
}

export function renderTeamsCard(options: TeamsCardOptions): TeamsCard {
  const { run, triage, reportUrl } = options;
  const { totals } = run;
  const failed = run.run.status === 'failed';

  const verdict = failed
    ? `${totals.failed} failed`
    : totals.flaky > 0
      ? `passed with ${totals.flaky} flaky`
      : 'all passed';
  const title = `${failed ? '❌' : '✅'} ${run.run.target} · ${run.run.environment} · ${verdict}`;

  const facts = [
    { title: 'Result', value: `${totals.passed}/${totals.total} passed` },
    { title: 'Failed', value: String(totals.failed) },
    { title: 'Flaky', value: String(totals.flaky) },
    ...(totals.expectedFailures > 0
      ? [{ title: 'Known failures', value: String(totals.expectedFailures) }]
      : []),
    { title: 'Run', value: run.run.id },
  ];

  const body: unknown[] = [
    { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
    { type: 'FactSet', facts },
  ];

  /*
     Triage only when there is something to triage. A "0 clusters" line on
     every green run is the sort of noise that gets a channel muted, and the
     verdict above already said the run passed.
  */
  const verdicts = triage?.verdicts ?? [];
  if (verdicts.length > 0) {
    const shown = verdicts.slice(0, MAX_TRIAGE_LINES);
    body.push({
      type: 'TextBlock',
      text: shown.map((entry) => `**${entry.category}** — ${entry.summary}`).join('\n\n'),
      wrap: true,
    });
    if (verdicts.length > shown.length) {
      body.push({
        type: 'TextBlock',
        text: `_and ${verdicts.length - shown.length} more in the report_`,
        wrap: true,
        isSubtle: true,
      });
    }
  }

  const actions = reportUrl
    ? [{ type: 'Action.OpenUrl', title: 'Open the report', url: reportUrl }]
    : [];

  return {
    body: {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            /*
               No `$schema`. Teams does not require it, and the only way to
               include it is a hardcoded host literal — which `no-hardcoded-urls`
               refuses, correctly: the rule cannot tell a schema identifier from
               an application host, and the version below is what actually
               decides how Teams renders this.
            */
            type: 'AdaptiveCard',
            version: '1.4',
            body,
            ...(actions.length > 0 ? { actions } : {}),
          },
        },
      ],
    },
    summary: `${title} — ${totals.passed}/${totals.total} passed`,
  };
}
