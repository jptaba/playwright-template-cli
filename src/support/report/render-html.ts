import {
  firstRunPassRate,
  flakeRate,
  passRate,
  type RunResult,
  type TestRecord,
} from '../reporters/run-result';
import type { TriageResult } from '../triage/types';
import type { TrendView } from './history';

/**
 * The rich report — §18.
 *
 * "Serenity's real achievement is not that it is pretty. It is that a product
 * owner can read it without knowing what a locator is."
 *
 * Self-contained single HTML file: inlined CSS and JS, no CDN, opens from a
 * file share with no server. Rendered from `run-result.json` and nothing else,
 * which is what makes it testable — feed a fixture with a known mix of pass,
 * fail, flaky and skipped and assert the output.
 *
 * Semantic colour for pass/fail/flaky is a data encoding here, kept distinct
 * from the accent, and never the only signal: every status carries a text
 * label too.
 */
export interface RenderOptions {
  run: RunResult;
  triage?: TriageResult | null;
  trend?: TrendView | null;
  /** Coverage of the managed case set, when the case files are available. */
  coverage?: CoverageSummary | null;
}

export interface CoverageSummary {
  totalCases: number;
  automatedCases: number;
  executedCases: number;
  /** Specs carrying no case id — invisible in case coverage (§18). */
  specsWithoutCase: number;
  /** Acceptance criteria with a passing case behind them (§18). */
  criteriaCovered?: number;
  criteriaTotal?: number;
}

const STATUS_LABEL: Record<string, string> = {
  expected: 'Passed',
  unexpected: 'Failed',
  flaky: 'Flaky',
  skipped: 'Skipped',
};

export function renderReport(options: RenderOptions): string {
  const { run, triage, trend, coverage } = options;
  const failed = run.totals.failed;
  const verdict = run.run.status === 'passed' ? (run.totals.flaky > 0 ? 'flaky' : 'pass') : 'fail';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(run.run.target)} · ${esc(run.run.environment)} · run ${esc(run.run.id)}</title>
<style>${STYLES}</style>
</head>
<body>
<header class="band band--${verdict}">
  <p class="eyebrow">${esc(run.run.target)} · ${esc(run.run.environment)}${
    run.run.branch ? ` · ${esc(run.run.branch)}` : ''
  }</p>
  <h1>${verdictHeadline(run)}</h1>
  <p class="sub">${esc(run.totals.total)} test(s) in ${formatDuration(run.run.durationMs)} ·
    finished ${esc(formatTime(run.run.finishedAt))} ·
    ${run.run.buildId ? `build ${esc(run.run.buildId)}` : 'local run'}</p>
</header>

<main>
  ${renderVerdictBand(run)}
  ${triage ? renderTriage(triage) : ''}
  ${trend ? renderTrend(trend) : ''}
  ${coverage ? renderCoverage(coverage) : ''}
  ${renderCapabilities(run)}
  ${renderResults(run)}
  ${renderHealth(run)}
</main>

<footer>
  <p>Rendered from <code>run-result.json</code> (schema v${run.schemaVersion}). Every figure on
  this page comes from that one file — the report, the email digest and the test-management
  push never re-derive facts independently.</p>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;

  function verdictHeadline(result: RunResult): string {
    if (failed > 0) return `${failed} failed`;
    if (result.totals.flaky > 0) return `Passed, ${result.totals.flaky} flaky`;
    if (result.totals.total === 0) return 'No tests ran';
    return 'All passed';
  }
}

function renderVerdictBand(run: RunResult): string {
  const kinds = Object.entries(run.totals.byKind).filter(([, totals]) => totals.total > 0);

  return `<section>
  <h2>Verdict</h2>
  <table class="counts">
    <thead><tr><th>Kind</th><th>Total</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Skipped</th><th>Pass rate</th></tr></thead>
    <tbody>
      ${kinds
        .map(
          ([kind, totals]) => `<tr>
        <td>${esc(kind)}</td><td>${totals.total}</td><td>${totals.passed}</td>
        <td>${totals.failed}</td><td>${totals.flaky}</td><td>${totals.skipped}</td>
        <td>${percent(passRate(totals))}</td></tr>`,
        )
        .join('\n')}
      <tr class="total"><td>All</td><td>${run.totals.total}</td><td>${run.totals.passed}</td>
        <td>${run.totals.failed}</td><td>${run.totals.flaky}</td><td>${run.totals.skipped}</td>
        <td>${percent(passRate(run.totals))}</td></tr>
    </tbody>
  </table>
  <p class="note">First-run pass rate <b>${percent(firstRunPassRate(run.tests))}</b> —
  a suite that is green only after retries is not green, so this is recorded separately from
  the final outcome. Flake rate <b>${percent(flakeRate(run.totals))}</b>, as a rate rather than
  a count.</p>
</section>`;
}

function renderTriage(triage: TriageResult): string {
  if (triage.clusters.length === 0) return '';
  return `<section>
  <h2>Triage</h2>
  <p class="note">${triage.stats.failures} failure(s) in ${triage.stats.clusters} cluster(s).
  ${triage.stats.resolvedByRule} settled by rule, ${triage.stats.sentToAgent} needed judgement,
  ${triage.stats.needingHumanReview} flagged for a person. Forty tests failing on one incident
  is one problem, not forty.</p>
  <table>
    <thead><tr><th>Category</th><th>Summary</th><th>Tests</th><th>Confidence</th><th>Source</th><th>Action</th></tr></thead>
    <tbody>
    ${triage.verdicts
      .map(
        (verdict) => `<tr>
      <td><span class="cat">${esc(verdict.category)}</span></td>
      <td>${esc(verdict.summary)}
        <details><summary>evidence</summary><ul>${verdict.evidence
          .map((item) => `<li>${esc(item)}</li>`)
          .join('')}</ul></details></td>
      <td>${verdict.affectedTests.length}</td>
      <td>${esc(verdict.confidence)}</td>
      <td><span class="src src--${verdict.source}">${
        verdict.source === 'agent' ? 'AI verdict' : 'rule'
      }</span></td>
      <td>${esc(verdict.recommendedAction)}${
        verdict.needsHumanReview ? ' <b>· needs review</b>' : ''
      }</td>
    </tr>`,
      )
      .join('\n')}
    </tbody>
  </table>
  <p class="note">AI verdicts are marked as distinct from rule-derived ones on purpose: a wrong
  verdict stated fluently next to correct ones is indistinguishable from them unless the report
  says which is which.</p>
</section>`;
}

function renderTrend(trend: TrendView): string {
  const rows = trend.recent
    .slice(-10)
    .map(
      (entry) => `<tr>
      <td>${esc(formatTime(entry.finishedAt))}</td>
      <td>${esc(entry.runId)}</td>
      <td>${percent(entry.passRate)}</td>
      <td>${percent(entry.firstRunPassRate)}</td>
      <td>${entry.failed}</td>
      <td>${entry.flaky}</td>
      <td>${formatDuration(entry.durationMs)}</td>
    </tr>`,
    )
    .join('\n');

  return `<section>
  <h2>Trend</h2>
  <table>
    <thead><tr><th>Finished</th><th>Run</th><th>Pass rate</th><th>First-run</th><th>Failed</th><th>Flaky</th><th>Duration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="split">
    <div><h3>Newly failing (${trend.newlyFailing.length})</h3>${list(trend.newlyFailing)}</div>
    <div><h3>Newly fixed (${trend.newlyFixed.length})</h3>${list(trend.newlyFixed)}</div>
  </div>
  <p class="note">Flake rate over the retained window: <b>${percent(trend.windowFlakeRate)}</b>.</p>
</section>`;
}

function renderCoverage(coverage: CoverageSummary): string {
  return `<section>
  <h2>Coverage — what did we <em>not</em> test?</h2>
  <table>
    <tbody>
      <tr><th>Cases in scope</th><td>${coverage.totalCases}</td></tr>
      <tr><th>Automated</th><td>${coverage.automatedCases}</td></tr>
      <tr><th>Executed in this run</th><td>${coverage.executedCases}</td></tr>
      <tr><th>Specs with no case id</th><td>${coverage.specsWithoutCase}</td></tr>
      ${
        coverage.criteriaTotal
          ? `<tr><th>Acceptance criteria with a passing case</th>
             <td>${coverage.criteriaCovered ?? 0} of ${coverage.criteriaTotal}</td></tr>`
          : ''
      }
    </tbody>
  </table>
</section>`;
}

function renderCapabilities(run: RunResult): string {
  if (run.capabilities.length === 0) return '';
  return `<section>
  <h2>Applicability</h2>
  <ul class="caps">
    ${run.capabilities
      .map(
        (capability) =>
          `<li><b>${esc(capability.capability)}</b>: ${esc(capability.note)}</li>`,
      )
      .join('\n')}
  </ul>
  <p class="note">A disabled capability is stated rather than shown as a silent zero.</p>
</section>`;
}

function renderResults(run: RunResult): string {
  const rows = run.tests
    .map((test, index) => {
      const label = STATUS_LABEL[test.outcome] ?? test.outcome;
      return `<tr class="row row--${test.outcome}" data-outcome="${test.outcome}" data-kind="${esc(test.kind)}">
      <td><span class="pill pill--${test.outcome}">${label}</span></td>
      <td>${test.caseId ? `<code>${esc(test.caseId)}</code>` : '<span class="muted">no case id</span>'}</td>
      <td>
        <button class="link" data-toggle="ev-${index}">${esc(test.title)}</button>
        <div class="evidence" id="ev-${index}" hidden>${renderEvidence(test)}</div>
      </td>
      <td>${esc(test.kind)}</td>
      <td>${formatDuration(test.durationMs)}</td>
      <td>${test.retries > 0 ? `${test.retries} retry(ies), first ${esc(test.firstRunStatus)}` : '—'}</td>
    </tr>`;
    })
    .join('\n');

  return `<section>
  <h2>Results</h2>
  <div class="chips" role="group" aria-label="Filter results">
    ${['all', 'unexpected', 'flaky', 'expected', 'skipped']
      .map(
        (value) =>
          `<button class="chip${value === 'all' ? ' chip--on' : ''}" data-filter="${value}">${
            value === 'all' ? 'All' : (STATUS_LABEL[value] ?? value)
          }</button>`,
      )
      .join('')}
  </div>
  <table class="results">
    <thead><tr><th>Status</th><th>Case</th><th>Test</th><th>Kind</th><th>Duration</th><th>Retries</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

/** Narrative first, stack trace second: the test is the disclosure (§18). */
function renderEvidence(test: TestRecord): string {
  const steps = test.steps.length
    ? `<ol class="steps">${test.steps
        .map(
          (step) =>
            `<li class="${step.failed ? 'step--failed' : ''}">${esc(step.title)}
             <span class="muted">${formatDuration(step.durationMs)}</span>
             ${step.error ? `<div class="err">${esc(step.error)}</div>` : ''}</li>`,
        )
        .join('')}</ol>`
    : '<p class="muted">No named steps recorded. Step titles are the report\'s narrative — name them for intent.</p>';

  const error = test.error
    ? `<h4>What went wrong</h4><pre class="err">${esc(test.error.message)}</pre>${
        test.error.snippet ? `<pre>${esc(test.error.snippet)}</pre>` : ''
      }`
    : '';

  const attachments = test.attachments.length
    ? `<h4>Evidence</h4><ul>${test.attachments
        .map(
          (attachment) =>
            `<li>${esc(attachment.name)} <span class="muted">${esc(attachment.contentType)}</span>${
              attachment.path ? ` — <a href="${esc(attachment.path)}">open</a>` : ''
            }</li>`,
        )
        .join('')}</ul>`
    : '';

  return `<div class="drawer">
    <p class="muted">${esc(test.file)} · ${esc(test.project)}${
      test.jiraKey ? ` · ${esc(test.jiraKey)}` : ''
    }</p>
    <h4>What happened</h4>${steps}${error}${attachments}
  </div>`;
}

function renderHealth(run: RunResult): string {
  const slowest = [...run.tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const retried = run.tests.filter((test) => test.retries > 0);

  return `<section>
  <h2>Health — what is rotting?</h2>
  <h3>Slowest tests</h3>
  <ol>${slowest
    .map((test) => `<li>${esc(test.title)} <span class="muted">${formatDuration(test.durationMs)}</span></li>`)
    .join('')}</ol>
  <h3>Retried in this run (${retried.length})</h3>
  ${
    retried.length
      ? `<ul>${retried
          .map(
            (test) =>
              `<li>${esc(test.title)} — first attempt ${esc(test.firstRunStatus)}, ${test.retries} retry(ies)</li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">None.</p>'
  }
</section>`;
}

function list(items: string[]): string {
  if (items.length === 0) return '<p class="muted">None.</p>';
  return `<ul>${items.map((item) => `<li><code>${esc(item)}</code></li>`).join('')}</ul>`;
}

export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime(iso: string): string {
  // Timestamp with timezone, because "at 3am" is ambiguous across a sharded
  // run and a distributed team (§18).
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

const STYLES = `
:root{--ink:#151a21;--muted:#5f6b7c;--rule:#cfd6df;--surface:#fbfcfd;--bg:#eaedf1;
--pass:#1c6b4f;--pass-bg:#dceBe3;--fail:#9f2b37;--fail-bg:#f3dddf;--warn:#855f0f;--warn-bg:#f1e6cc;--accent:#8a5e12}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,"Segoe UI",system-ui,sans-serif}
main,footer{max-width:70rem;margin:0 auto;padding:0 1.25rem}
.band{padding:2rem 1.25rem;border-bottom:4px solid var(--rule)}
.band--pass{background:var(--pass-bg);border-color:var(--pass)}
.band--fail{background:var(--fail-bg);border-color:var(--fail)}
.band--flaky{background:var(--warn-bg);border-color:var(--warn)}
.band h1{margin:.2rem 0;font-size:2rem}
.eyebrow{margin:0;font:600 .75rem/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.sub{margin:.35rem 0 0;color:var(--muted);font-size:.9rem}
section{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:1.1rem 1.25rem;margin:1.25rem 0}
h2{font-size:1.2rem;margin:0 0 .75rem}
h3{font-size:.95rem;margin:1rem 0 .35rem}
h4{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:.9rem 0 .3rem}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--rule);vertical-align:top}
thead th{font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
tr.total td{font-weight:700}
.note{font-size:.85rem;color:var(--muted);margin:.7rem 0 0}
.muted{color:var(--muted)}
.pill{display:inline-block;padding:.1rem .45rem;border-radius:3px;font:600 .72rem/1.5 ui-monospace,monospace;border:1px solid}
.pill--expected{color:var(--pass);background:var(--pass-bg);border-color:var(--pass)}
.pill--unexpected{color:var(--fail);background:var(--fail-bg);border-color:var(--fail)}
.pill--flaky{color:var(--warn);background:var(--warn-bg);border-color:var(--warn)}
.pill--skipped{color:var(--muted);background:#eef1f4;border-color:var(--rule)}
.src{font:600 .7rem/1.5 ui-monospace,monospace;padding:.1rem .4rem;border-radius:3px;border:1px dashed var(--rule)}
.src--agent{border-style:solid;border-color:var(--accent);color:var(--accent)}
.cat{font:600 .75rem/1.5 ui-monospace,monospace}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem}
.chip{font:600 .78rem/1 inherit;padding:.4rem .7rem;border-radius:999px;border:1px solid var(--rule);background:#fff;cursor:pointer}
.chip--on{background:var(--ink);color:#fff;border-color:var(--ink)}
.link{background:none;border:0;padding:0;font:inherit;color:var(--ink);text-align:left;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.drawer{border-left:3px solid var(--rule);padding:.5rem 0 .5rem .8rem;margin:.5rem 0}
.steps{margin:.2rem 0;padding-left:1.2rem}
.step--failed{color:var(--fail);font-weight:600}
pre{background:#eef2f6;border:1px solid var(--rule);border-radius:5px;padding:.7rem;overflow-x:auto;font-size:.8rem}
.err{color:var(--fail)}
.split{display:flex;gap:2rem;flex-wrap:wrap}
.split>div{flex:1 1 16rem}
.caps{margin:0;padding-left:1.1rem;font-size:.88rem}
footer{padding:1.5rem 1.25rem 3rem;color:var(--muted);font-size:.82rem}
code{font:.85em ui-monospace,monospace;background:#eef2f6;padding:.05em .3em;border-radius:3px}
`;

const SCRIPT = `
document.addEventListener('click', function (event) {
  var toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    var panel = document.getElementById(toggle.getAttribute('data-toggle'));
    if (panel) panel.hidden = !panel.hidden;
    return;
  }
  var chip = event.target.closest('[data-filter]');
  if (!chip) return;
  var wanted = chip.getAttribute('data-filter');
  document.querySelectorAll('[data-filter]').forEach(function (other) {
    other.classList.toggle('chip--on', other === chip);
  });
  document.querySelectorAll('tr.row').forEach(function (row) {
    row.hidden = wanted !== 'all' && row.getAttribute('data-outcome') !== wanted;
  });
});
`;
