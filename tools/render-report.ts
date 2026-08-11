#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPORT_OUT_DIR, RUN_RESULT_PATH, TRIAGE_RESULT_PATH } from '../src/support/paths';
import { appendHistory, buildTrend, readHistory, summarise } from '../src/support/report/history';
import { renderReport, type CoverageSummary } from '../src/support/report/render-html';
import { loadCases } from '../src/support/cases/store';
import type { RunResult } from '../src/support/reporters/run-result';
import type { TriageResult } from '../src/support/triage/types';

/**
 * `npm run report:render` — §18.
 *
 * Reads the canonical model and writes a self-contained HTML file. Also
 * appends this run to the history file, which is what makes the trend band
 * possible at all (§22 — the decision is a committed JSON-lines file, not a
 * database).
 */
function coverageOf(run: RunResult): CoverageSummary | null {
  const cases = loadCases(run.run.target);
  if (cases.length === 0) return null;

  const executed = new Set(run.tests.map((test) => test.caseId).filter(Boolean));
  const automated = new Set(
    cases.filter((stored) => stored.case.specPath).map((stored) => stored.case.id),
  );

  return {
    totalCases: cases.length,
    automatedCases: automated.size,
    executedCases: cases.filter((stored) => stored.case.id && executed.has(stored.case.id)).length,
    specsWithoutCase: run.tests.filter(
      (test) => !test.caseId && !['unit', 'contract'].includes(test.project) && !test.project.startsWith('setup:'),
    ).length,
    criteriaTotal: cases.reduce((sum, stored) => sum + stored.case.coversAC.length, 0),
    criteriaCovered: cases
      .filter((stored) => stored.case.id && executed.has(stored.case.id))
      .reduce((sum, stored) => sum + stored.case.coversAC.length, 0),
  };
}

function main(): number {
  if (!fs.existsSync(RUN_RESULT_PATH)) {
    console.error(`No ${RUN_RESULT_PATH}. Run the suite first, or run report:normalise.`);
    return 1;
  }
  const run = JSON.parse(fs.readFileSync(RUN_RESULT_PATH, 'utf8')) as RunResult;
  const triage = fs.existsSync(TRIAGE_RESULT_PATH)
    ? (JSON.parse(fs.readFileSync(TRIAGE_RESULT_PATH, 'utf8')) as TriageResult)
    : null;

  const entry = summarise(run);
  const trend = buildTrend(entry, readHistory());
  if (process.env.REPORT_SKIP_HISTORY !== 'true') appendHistory(entry);

  const html = renderReport({ run, triage, trend, coverage: coverageOf(run) });

  fs.mkdirSync(REPORT_OUT_DIR, { recursive: true });
  const output = path.join(REPORT_OUT_DIR, 'index.html');
  fs.writeFileSync(output, html, 'utf8');

  console.log(`wrote ${path.relative(process.cwd(), output)} (${Math.round(html.length / 1024)} KB)`);
  console.log(
    'Self-contained: inlined CSS and JS, no CDN. It opens from a file share with no server.',
  );
  return 0;
}

process.exit(main());
