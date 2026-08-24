import { buildReview, type QuarantineView, type TriageReview } from './review';
import { isTriageCategory, type HumanVerdict } from './verdicts';
import { TRIAGE_CATEGORIES, type TriageVerdict } from './types';
import { failure, json, type Route, type UiRequest, type UiResponse } from '../ui/router';
import type { RunResult } from '../reporters/run-result';
import { scopeRuns } from '../runs/scope';

/**
 * The triage page's rules — §20, §08 phase 5.
 *
 * One of them carries the whole feature: **what the automated pass said is
 * read from the run, never from the request**. A page that accepted "the rule
 * said locator-drift, and I say application-defect" as a single posted object
 * would let the thing being measured supply its own score, and the agreement
 * rate would stop meaning anything the moment anyone refreshed mid-triage.
 */

export interface TriageRunRef {
  id: string;
  target: string;
  finishedAt: string;
  failures: number;
  /** A run this dashboard started, or the one at the repository root. */
  source: 'dashboard' | 'command-line';
}

export interface TriageService {
  runs(): TriageRunRef[];
  run(id: string): RunResult | null;
  /** Verdicts from a `triage-result.json` written for this run, if there is one. */
  existingVerdicts(runId: string): TriageVerdict[];
  humanVerdicts(): HumanVerdict[];
  record(verdict: HumanVerdict): void;
  quarantine(): QuarantineView;
  /** Who is at the keyboard. "the team" is not an owner (§18). */
  who(): string;
  now(): string;
}

export function triageRoutes(service: TriageService): Route[] {
  const paths = ['/api/triage/runs', '/api/triage/review', '/api/triage/verdict'];
  return paths.map<Route>((path) => ({
    method: 'POST',
    path,
    handle: (request) => triageApi(request, service),
  }));
}

function reviewFor(runId: string, service: TriageService): TriageReview | null {
  const run = service.run(runId);
  if (!run) return null;
  return buildReview({
    run,
    existing: service.existingVerdicts(runId),
    human: service.humanVerdicts(),
    quarantine: service.quarantine(),
  });
}

function triageApi(request: UiRequest, service: TriageService): UiResponse {
  const body = (request.body ?? {}) as Record<string, unknown>;

  switch (request.path) {
    case '/api/triage/runs': {
      // Scoped to the bar — item 80. This page defaults to a run and invites
      // verdicts on it, so an unscoped list records judgements against an
      // application the operator is not looking at.
      const scoped = scopeRuns(service.runs(), String(body.target ?? ''));
      return json(200, { ...scoped, categories: TRIAGE_CATEGORIES });
    }

    case '/api/triage/review': {
      const review = reviewFor(String(body.runId ?? '').trim(), service);
      return review
        ? json(200, review)
        : failure(400, `No run model for '${String(body.runId ?? '')}'.`);
    }

    case '/api/triage/verdict':
      return record(body, service);

    default:
      return failure(404, `No route for ${request.path}.`);
  }
}

function record(body: Record<string, unknown>, service: TriageService): UiResponse {
  const runId = String(body.runId ?? '').trim();
  const clusterId = String(body.clusterId ?? '').trim();
  const category = body.category;

  if (!isTriageCategory(category)) {
    return failure(
      400,
      `'${String(category)}' is not one of the triage categories. Each one routes somewhere ` +
        `different, which is the point of having a fixed list: ${TRIAGE_CATEGORIES.join(', ')}.`,
    );
  }

  const review = reviewFor(runId, service);
  if (!review) return failure(400, `No run model for '${runId}'.`);

  const cluster = review.clusters.find((candidate) => candidate.id === clusterId);
  if (!cluster) {
    return failure(400, `Run ${runId} has no cluster ${clusterId}. Re-read the run and try again.`);
  }

  /*
     Derived here, not accepted from the caller. This is the number the whole
     measurement rests on, and the page it comes from is not a source of truth
     about what a rule decided.
  */
  const verdict: HumanVerdict = {
    runId,
    clusterId,
    signature: cluster.signature,
    automated: cluster.verdict
      ? {
          category: cluster.verdict.category,
          source: cluster.verdict.source,
          rule: cluster.verdict.rule ?? null,
        }
      : null,
    category,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    by: service.who(),
    at: service.now(),
  };

  service.record(verdict);

  // The review is rebuilt rather than patched, so what comes back is what a
  // reload would show.
  return json(200, reviewFor(runId, service));
}
