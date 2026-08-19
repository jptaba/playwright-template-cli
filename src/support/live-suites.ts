import { clusterFailures } from './triage/cluster';
import { classifyByRule } from './triage/rules';
import type { RunResult } from './reporters/run-result';
import { namesACause } from './triage/types';
import type { TriageCategory } from './triage/types';

/**
 * What the live suites did, per application — the model behind
 * `npm run suites:live` (backlog item 29).
 *
 * `npm run verify` runs the `framework` and `dashboard` projects and not one
 * spec against a real application, by design: those need network and
 * credentials, and CI must be able to run `verify` without either. The
 * consequence, unwritten until run 39b found it, is that the improvement loop
 * recorded 39 green verifies while the specs the repository exists to run went
 * unexecuted for two days with failures visible on `/triage` the whole time.
 *
 * So the live suites need their own command, and it belongs in a *run* rather
 * than in `verify`. Everything here is pure — a `RunResult` in, a summary out —
 * so the shaping and the reporting are testable with no browser, no network and
 * no target, and the tool is left with only the spawning.
 */

/** A live failure, carrying the triage category where a rule settled one. */
export interface LiveFailure {
  title: string;
  caseId: string | null;
  project: string;
  /**
   * `null` when no rule matched. That is a real answer and not a gap: the
   * taxonomy exists so a category routes somewhere, and a rule inventing one
   * for a judgement call is the defect `triage:measure` was built to catch.
   */
  category: TriageCategory | null;
  rule: string | null;
  /**
   * What a rule found when it recognised the failure but could not name its
   * cause — `sign-in-setup-failed` is the one that does this.
   *
   * Without it the line read *"no rule matched — needs judgement"* for a
   * failure a rule had matched and had something useful to say about, which
   * is a smaller version of the same defect: the report disagreeing with what
   * actually happened.
   */
  unnamedCause: string | null;
}

export interface LiveTargetResult {
  target: string;
  status: 'passed' | 'failed' | 'not-run';
  totals: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    /** Known failures a spec declared with `test.fail()`. Reported, never hidden. */
    expectedFailures: number;
  };
  failures: LiveFailure[];
  /** Why nothing ran, when status is `not-run`. */
  reason: string | null;
}

/**
 * Shape one application's run into a result, classifying every failure through
 * the triage rules the dashboard already uses.
 *
 * Reporting a bare pass/fail count was the other option and is the weaker one:
 * a live suite failing because a public demo is returning 502s and one failing
 * because a locator drifted need different reactions, and the taxonomy in
 * `triage/types.ts` already draws that line. Rather than inventing a second
 * vocabulary on top of it — which would then be free to disagree with the
 * first — this reuses `clusterFailures` and `classifyByRule` verbatim and
 * reports the category they produce.
 */
export function summariseLiveRun(target: string, run: RunResult): LiveTargetResult {
  const settled = new Map<string, { category: TriageCategory; rule: string | null }>();
  const unnamed = new Map<string, string>();
  for (const cluster of clusterFailures(run)) {
    const tests = run.tests.filter((test) => cluster.testIds.includes(test.id));
    const ruled = classifyByRule(cluster, { run, tests });
    if (!ruled) continue;
    /*
       A rule that recognised the failure but named no cause has not settled
       it. Rendering `unclassified` as the category would read as an answer;
       it is the absence of one, so its summary is carried separately and the
       line says the failure still needs a person.
    */
    if (!namesACause(ruled)) {
      for (const id of cluster.testIds) unnamed.set(id, ruled.summary);
      continue;
    }
    for (const id of cluster.testIds) {
      settled.set(id, { category: ruled.category, rule: ruled.rule ?? null });
    }
  }

  const failures: LiveFailure[] = run.tests
    .filter((test) => test.outcome === 'unexpected')
    .map((test) => ({
      title: test.title,
      caseId: test.caseId,
      project: test.project,
      category: settled.get(test.id)?.category ?? null,
      unnamedCause: unnamed.get(test.id) ?? null,
      rule: settled.get(test.id)?.rule ?? null,
    }));

  return {
    target,
    status: failures.length > 0 ? 'failed' : 'passed',
    totals: {
      total: run.totals.total,
      passed: run.totals.passed,
      failed: run.totals.failed,
      flaky: run.totals.flaky,
      skipped: run.totals.skipped,
      expectedFailures: run.totals.expectedFailures ?? 0,
    },
    failures,
    reason: null,
  };
}

/** An application whose suite could not be run at all, which is not a pass. */
export function liveRunNotRun(target: string, reason: string): LiveTargetResult {
  return {
    target,
    status: 'not-run',
    totals: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, expectedFailures: 0 },
    failures: [],
    reason,
  };
}

/**
 * What the command exits with.
 *
 * **Any live failure is a 1**, whatever its triage category. The alternative
 * considered was to forgive a failure a rule blamed on the deployment —
 * `network-infrastructure` on a public demo — and it was rejected: a rule is a
 * heuristic over error text, an outage is itself worth knowing about, and a
 * command that goes green on "the application was down" is one nobody can use
 * to answer "are the suites passing". The *category* is what tells a reader
 * where to look; the exit code only says whether everything passed.
 *
 * A suite that could not run at all is a 2 rather than a 1: nothing was
 * measured, which is a different thing from something failing, and reporting
 * it as a failure would hide a broken command behind a plausible red.
 */
export function liveExitCode(results: LiveTargetResult[]): 0 | 1 | 2 {
  if (results.length === 0) return 2;
  if (results.some((result) => result.status === 'not-run')) return 2;
  return results.some((result) => result.status === 'failed') ? 1 : 0;
}

/**
 * The report, as lines — one block per application, then a total.
 *
 * Written to be pasted into an improvement-log entry, which is the whole point
 * of the item: a run records what the live suites did the way it already
 * records `triage:measure`.
 */
export function formatLiveReport(results: LiveTargetResult[]): string[] {
  const lines: string[] = [];
  const symbol = { passed: '✓', failed: '✗', 'not-run': '!' };

  for (const result of results) {
    const { totals } = result;
    const counts =
      result.status === 'not-run'
        ? (result.reason ?? 'did not run')
        : `${totals.passed}/${totals.total} passed` +
          (totals.failed > 0 ? ` · ${totals.failed} failed` : '') +
          (totals.flaky > 0 ? ` · ${totals.flaky} flaky` : '') +
          // Inside `passed`, and said out loud anyway: a suite quietly
          // accumulating known failures should not read as perfectly green.
          (totals.expectedFailures > 0
            ? ` · ${totals.expectedFailures} known failure(s)`
            : '') +
          (totals.skipped > 0 ? ` · ${totals.skipped} skipped` : '');
    lines.push(`  ${symbol[result.status]} ${result.target} — ${counts}`);

    for (const failure of result.failures) {
      const name = failure.caseId ? `${failure.caseId} · ${failure.title}` : failure.title;
      lines.push(`      [${failure.project}] ${name}`);
      lines.push(
        failure.category
          ? `        ${failure.category}${failure.rule ? ` (rule: ${failure.rule})` : ''}`
          : failure.unnamedCause
            ? `        needs judgement — ${failure.unnamedCause}`
            : '        no rule matched — needs judgement',
      );
    }
  }

  const failed = results.filter((result) => result.status === 'failed').length;
  const notRun = results.filter((result) => result.status === 'not-run').length;
  const passed = results.filter((result) => result.status === 'passed').length;
  lines.push('');
  lines.push(
    `  ${passed} application(s) passing · ${failed} failing` +
      (notRun > 0 ? ` · ${notRun} could not be run` : ''),
  );
  return lines;
}
