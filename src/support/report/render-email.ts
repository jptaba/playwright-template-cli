import { esc, formatDuration, percent } from './render-html';
import { firstRunPassRate, passRate, type RunResult } from '../reporters/run-result';
import type { TriageResult } from '../triage/types';

/**
 * The email digest — §19.
 *
 * "The instinct is to email the pretty report. That does not work."
 *
 * Outlook desktop renders HTML through the Word engine: no flexbox, no grid,
 * no CSS custom properties, no media queries, no reliable border-radius, no
 * background images. So this renderer emits **table-based layout, ~600px,
 * fully inlined CSS, no JavaScript**, with a plain-text alternative part.
 *
 * Two further traps it avoids: no base64 `data:` images (Gmail strips them,
 * Outlook blocks them outright), and the rich report is **linked, never
 * attached** — an `.html` attachment is a standard phishing vector and
 * corporate filters routinely quarantine it.
 *
 * It carries the verdict, the counts, the triage summary and the top failures
 * — enough to decide whether to open anything at all.
 */
export interface DigestOptions {
  run: RunResult;
  triage?: TriageResult | null;
  /** Stable per-run URL for the rich report. Omitted → detail is inlined. */
  reportUrl?: string | null;
  maxFailures?: number;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
}

const WIDTH = 600;

/** Word-engine safe: hex colours on table cells, nothing more exotic. */
const PALETTE = {
  pass: { bg: '#dceBe3', ink: '#1c6b4f' },
  fail: { bg: '#f3dddf', ink: '#9f2b37' },
  flaky: { bg: '#f1e6cc', ink: '#855f0f' },
};

export function renderDigest(options: DigestOptions): Digest {
  const { run, triage, reportUrl } = options;
  const maxFailures = options.maxFailures ?? 10;
  const verdict = run.run.status === 'passed' ? (run.totals.flaky > 0 ? 'flaky' : 'pass') : 'fail';
  const colours = PALETTE[verdict];

  const failures = run.tests.filter((test) => test.outcome === 'unexpected').slice(0, maxFailures);
  const totalFailures = run.totals.failed;

  // Triageable from a phone lock screen: the verdict, not the tool (§19).
  const subject =
    `[${verdict === 'pass' ? 'PASS' : verdict === 'flaky' ? 'FLAKY' : 'FAIL'}] ` +
    `${run.run.target} · ${run.run.environment} · ` +
    `${run.totals.failed} failed, ${run.totals.flaky} flaky` +
    (run.run.buildId ? ` · build ${run.run.buildId}` : '');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#eaedf1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eaedf1;">
<tr><td align="center" style="padding:16px 8px;">

<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:${WIDTH}px;background-color:#ffffff;border:1px solid #cfd6df;">

  <tr><td bgcolor="${colours.bg}" style="padding:18px 20px;border-bottom:3px solid ${colours.ink};">
    <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5f6b7c;">
      ${esc(run.run.target)} &middot; ${esc(run.run.environment)}${run.run.branch ? ` &middot; ${esc(run.run.branch)}` : ''}
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${colours.ink};">
      ${headline(run)}
    </p>
    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5f6b7c;">
      ${run.totals.total} test(s) in ${formatDuration(run.run.durationMs)} &middot; run ${esc(run.run.id)}
    </p>
  </td></tr>

  <tr><td style="padding:16px 20px 0;">
    ${countsTable(run)}
  </td></tr>

  ${triage && triage.verdicts.length > 0 ? `<tr><td style="padding:16px 20px 0;">${triageTable(triage)}</td></tr>` : ''}

  ${
    failures.length > 0
      ? `<tr><td style="padding:16px 20px 0;">${failureTable(failures, totalFailures, Boolean(reportUrl))}</td></tr>`
      : ''
  }

  ${reportUrl ? `<tr><td style="padding:20px;" align="center">${button(reportUrl)}</td></tr>` : ''}

  <tr><td style="padding:14px 20px 20px;border-top:1px solid #cfd6df;">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5f6b7c;">
      First-run pass rate ${percent(firstRunPassRate(run.tests))} &mdash; a suite that is green
      only after retries is not green.${
        reportUrl ? '' : ' No report host is configured, so the top failures are inlined above.'
      }
    </p>
  </td></tr>

</table>

</td></tr></table>
</body></html>`;

  return { subject, html, text: renderText(run, triage ?? null, failures, reportUrl ?? null) };
}

function headline(run: RunResult): string {
  if (run.totals.failed > 0) return `${run.totals.failed} failed`;
  if (run.totals.flaky > 0) return `Passed, ${run.totals.flaky} flaky`;
  return 'All passed';
}

function countsTable(run: RunResult): string {
  const cell = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:6px 8px;border-bottom:1px solid #e4e9ee;';
  const head = `${cell}font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5f6b7c;`;
  const rows = Object.entries(run.totals.byKind)
    .filter(([, totals]) => totals.total > 0)
    .map(
      ([kind, totals]) =>
        `<tr><td style="${cell}">${esc(kind)}</td><td style="${cell}" align="right">${totals.total}</td>
         <td style="${cell}" align="right">${totals.failed}</td><td style="${cell}" align="right">${totals.flaky}</td>
         <td style="${cell}" align="right">${percent(passRate(totals))}</td></tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="${head}">Kind</td><td style="${head}" align="right">Total</td>
        <td style="${head}" align="right">Failed</td><td style="${head}" align="right">Flaky</td>
        <td style="${head}" align="right">Pass rate</td></tr>
    ${rows}
  </table>`;
}

function triageTable(triage: TriageResult): string {
  const cell = 'font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:5px 8px;border-bottom:1px solid #e4e9ee;';
  return `<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5f6b7c;">Triage</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${triage.verdicts
    .slice(0, 6)
    .map(
      (verdict) =>
        `<tr><td style="${cell}"><b>${esc(verdict.category)}</b> (${verdict.affectedTests.length})<br>
         ${esc(verdict.summary)}<br>
         <span style="color:#5f6b7c;">${verdict.source === 'agent' ? 'AI verdict' : 'rule'} &middot; ${esc(
           verdict.confidence,
         )} confidence</span></td></tr>`,
    )
    .join('')}
  </table>`;
}

function failureTable(
  failures: Array<{ title: string; caseId: string | null; error: { message: string } | null }>,
  total: number,
  linked: boolean,
): string {
  const cell = 'font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:5px 8px;border-bottom:1px solid #e4e9ee;';
  return `<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5f6b7c;">
    Top failures${total > failures.length ? ` (${failures.length} of ${total})` : ''}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${failures
    .map(
      (failure) =>
        `<tr><td style="${cell}">${failure.caseId ? `<b>${esc(failure.caseId)}</b> ` : ''}${esc(failure.title)}
        ${
          // Degrade to inline detail only when nothing can host the report.
          !linked && failure.error
            ? `<br><span style="color:#9f2b37;">${esc(failure.error.message.split('\n')[0]!.slice(0, 200))}</span>`
            : ''
        }</td></tr>`,
    )
    .join('')}
  </table>`;
}

/** VML-wrapped so Outlook renders the button rather than dropping it (§19). */
function button(url: string): string {
  return `<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
    href="${esc(url)}" style="height:42px;v-text-anchor:middle;width:260px;" arcsize="8%" strokecolor="#151a21" fillcolor="#151a21">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Open the full report</center>
  </v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${esc(url)}" style="background-color:#151a21;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:42px;text-align:center;text-decoration:none;width:260px;">Open the full report</a>
<!--<![endif]-->`;
}

/**
 * The plain-text alternative part. Not optional: some corporate gateways score
 * HTML-only mail as spam, and it is the accessible rendering (§19).
 */
function renderText(
  run: RunResult,
  triage: TriageResult | null,
  failures: Array<{ title: string; caseId: string | null; error: { message: string } | null }>,
  reportUrl: string | null,
): string {
  const lines = [
    `${headline(run)} — ${run.run.target} / ${run.run.environment}`,
    `Run ${run.run.id}, ${run.totals.total} test(s) in ${formatDuration(run.run.durationMs)}`,
    '',
    `Passed ${run.totals.passed} | Failed ${run.totals.failed} | Flaky ${run.totals.flaky} | Skipped ${run.totals.skipped}`,
    `Pass rate ${percent(passRate(run.totals))} (first-run ${percent(firstRunPassRate(run.tests))})`,
  ];

  if (triage && triage.verdicts.length > 0) {
    lines.push('', 'TRIAGE');
    for (const verdict of triage.verdicts.slice(0, 6)) {
      lines.push(
        `- [${verdict.category}] ${verdict.summary} ` +
          `(${verdict.affectedTests.length} test(s), ${verdict.confidence} confidence, ` +
          `${verdict.source === 'agent' ? 'AI verdict' : 'rule'})`,
      );
    }
  }

  if (failures.length > 0) {
    lines.push('', 'TOP FAILURES');
    for (const failure of failures) {
      lines.push(`- ${failure.caseId ? `${failure.caseId} ` : ''}${failure.title}`);
      if (!reportUrl && failure.error) {
        lines.push(`    ${failure.error.message.split('\n')[0]!.slice(0, 200)}`);
      }
    }
  }

  if (reportUrl) lines.push('', `Full report: ${reportUrl}`);
  return lines.join('\n');
}
