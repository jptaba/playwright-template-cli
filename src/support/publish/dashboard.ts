import {
  defectDescription,
  defectLabels,
  defectSummary,
  publishableResults,
  reopenComment,
  repeatComment,
  type DefectCluster,
  type UnreportableTest,
} from './payloads';
import { confirmationMatches } from '../onboarding/offboard';
import { failure, json, type Route, type UiRequest, type UiResponse } from '../ui/router';
import { scopeRuns } from '../runs/scope';
import type { TriageReview } from '../triage/review';
import type { TriageCategory } from '../triage/types';
import type { RunResult, TestRecord } from '../reporters/run-result';
import type { RunInstanceResult } from '../../integrations/practitest/client';

/**
 * Publishing — §14, §15, §08 phase 6.
 *
 * The only part of this dashboard that touches somebody else's system. A
 * mistake here is visible to other teams and cannot be undone with `git
 * checkout`, so it is built the way offboarding is rather than the way every
 * other page is: **a preview of the exact payload, and the run's own id typed
 * back before anything is sent.** A confirmation a stray click can satisfy is
 * not a confirmation.
 *
 * Three further refusals, each of which exists because the failure it prevents
 * is expensive and public:
 *
 *  - **Nothing is filed for a cluster nobody has triaged.** "Open Jira defects
 *    for confirmed failures" — an automated filer pointed at a broken
 *    environment can open hundreds of tickets in one night, and the thing that
 *    stops it is a human verdict, not a threshold.
 *  - **One ticket per cluster, deduplicated on the fingerprint**, re-checked at
 *    send time rather than trusted from the preview. Forty tests failing on one
 *    incident is one problem.
 *  - **The payload is rebuilt from the run**, never accepted from the request.
 *    The page says what will be sent; it does not get to decide it.
 */

/** Categories a defect ticket is the right answer to. */
const FILEABLE: readonly TriageCategory[] = ['application-defect', 'contract-drift'];

export interface DestinationStatus {
  configured: boolean;
  /** What is missing, when it is not configured. Never a credential. */
  reason?: string;
  /** Where it would go. Shown so nobody publishes into the wrong project. */
  destination?: string;
}

export interface ResultsPreview {
  results: RunInstanceResult[];
  unreportable: UnreportableTest[];
}

export interface DefectPreview {
  clusterId: string;
  fingerprint: string;
  category: string;
  /** Exactly the summary and body that would be sent. */
  summary: string;
  description: string;
  labels: string[];
  tests: string[];
  action: 'create' | 'comment' | 'reopen';
  existing: { key: string; status: string } | null;
  /** Set when this cluster may not be filed at all, and why. */
  blocked: string | null;
  /** Pre-selected: triage says a defect is the right response. */
  recommended: boolean;
}

export interface PublishPreview {
  runId: string;
  target: string;
  environment: string;
  practitest: DestinationStatus;
  jira: DestinationStatus;
  results: ResultsPreview;
  defects: DefectPreview[];
}

export interface PublishService {
  runs(): Array<{ id: string; target: string; finishedAt: string; failures: number }>;
  run(id: string): RunResult | null;
  /** The same clustering and verdicts the triage page shows. */
  review(runId: string): TriageReview | null;
  practitest(): DestinationStatus;
  jira(): DestinationStatus;
  /** Read-only. Safe to call while previewing. */
  findDefect(fingerprint: string): Promise<{ key: string; status: string; resolved: boolean } | null>;
  postResults(
    results: RunInstanceResult[],
  ): Promise<{ posted: number; unresolved: string[]; failed: string[] }>;
  createDefect(input: {
    summary: string;
    description: string;
    fingerprint: string;
    labels: string[];
  }): Promise<string>;
  comment(key: string, body: string): Promise<void>;
  reopen(key: string): Promise<string | null>;
}

export function publishRoutes(service: PublishService): Route[] {
  const paths = [
    '/api/publish/runs',
    '/api/publish/preview',
    '/api/publish/results',
    '/api/publish/defects',
  ];
  return paths.map<Route>((path) => ({
    method: 'POST',
    path,
    handle: (request) => publishApi(request, service),
  }));
}

async function publishApi(request: UiRequest, service: PublishService): Promise<UiResponse> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const runId = String(body.runId ?? '').trim();

  switch (request.path) {
    case '/api/publish/runs':
      // Scoped to the bar — item 80.
      return json(200, scopeRuns(service.runs(), String(body.target ?? '')));
    case '/api/publish/preview':
      return preview(runId, service);
    case '/api/publish/results':
      return sendResults(runId, body, service);
    case '/api/publish/defects':
      return sendDefects(runId, body, service);
    default:
      return failure(404, `No route for ${request.path}.`);
  }
}

/** The failures of one cluster, as the payload builders want them. */
function clusterOf(review: TriageReview, clusterId: string, run: RunResult): DefectCluster | null {
  const cluster = review.clusters.find((candidate) => candidate.id === clusterId);
  if (!cluster) return null;

  const ids = new Set(cluster.tests.map((test) => test.id));
  const tests = run.tests.filter((record: TestRecord) => ids.has(record.id));
  return {
    // The person's verdict wins over the machine's — it is the later and
    // better-informed one, and it is what the ticket should say.
    category: cluster.human?.category ?? cluster.verdict?.category ?? 'unclassified',
    summary: cluster.summary,
    fingerprint: cluster.id,
    tests,
  };
}

async function previewDefect(
  review: TriageReview,
  clusterId: string,
  run: RunResult,
  service: PublishService,
): Promise<DefectPreview | null> {
  const cluster = review.clusters.find((candidate) => candidate.id === clusterId);
  const defect = clusterOf(review, clusterId, run);
  if (!cluster || !defect) return null;

  const triaged = Boolean(cluster.human ?? cluster.verdict);
  const existing = triaged ? await service.findDefect(defect.fingerprint) : null;

  return {
    clusterId,
    fingerprint: defect.fingerprint,
    category: defect.category,
    summary: defectSummary(defect),
    description: defectDescription(defect),
    labels: defectLabels(run),
    tests: defect.tests.map((test) => `${test.caseId ? `${test.caseId} — ` : ''}${test.title}`),
    action: !existing ? 'create' : existing.resolved ? 'reopen' : 'comment',
    existing: existing ? { key: existing.key, status: existing.status } : null,
    blocked: triaged
      ? null
      : 'Nothing has triaged this cluster. A ticket filed before anyone looked is how a bad ' +
        'night becomes a hundred tickets — rule on it first.',
    recommended: FILEABLE.includes(defect.category as TriageCategory),
  };
}

async function preview(runId: string, service: PublishService): Promise<UiResponse> {
  const run = service.run(runId);
  const review = service.review(runId);
  if (!run || !review) return failure(400, `No run model for '${runId}'.`);

  const jira = service.jira();
  const defects = jira.configured
    ? (
        await Promise.all(
          review.clusters.map((cluster) => previewDefect(review, cluster.id, run, service)),
        )
      ).filter((entry): entry is DefectPreview => entry !== null)
    : [];

  return json(200, {
    runId,
    target: run.run.target,
    environment: run.run.environment,
    practitest: service.practitest(),
    jira,
    results: publishableResults(run),
    defects,
  } satisfies PublishPreview);
}

/** The guard that stands between a click and somebody else's system. */
function confirmed(runId: string, body: Record<string, unknown>): string | null {
  if (confirmationMatches(runId, typeof body.confirm === 'string' ? body.confirm : null)) {
    return null;
  }
  return (
    `Type the run id — ${runId} — to confirm. This sends to a system outside this ` +
    'repository, and it cannot be undone with git.'
  );
}

async function sendResults(
  runId: string,
  body: Record<string, unknown>,
  service: PublishService,
): Promise<UiResponse> {
  const run = service.run(runId);
  if (!run) return failure(400, `No run model for '${runId}'.`);

  const status = service.practitest();
  if (!status.configured) return failure(400, status.reason ?? 'PractiTest is not configured.');

  const refusal = confirmed(runId, body);
  if (refusal) return failure(400, refusal);

  // Rebuilt from the run, not read from the request.
  const { results } = publishableResults(run);
  if (results.length === 0) {
    return failure(400, 'No test in this run carries a case id, so there is nothing to post.');
  }

  const outcome = await service.postResults(results);
  return json(200, { destination: status.destination ?? null, ...outcome });
}

async function sendDefects(
  runId: string,
  body: Record<string, unknown>,
  service: PublishService,
): Promise<UiResponse> {
  const run = service.run(runId);
  const review = service.review(runId);
  if (!run || !review) return failure(400, `No run model for '${runId}'.`);

  const status = service.jira();
  if (!status.configured) return failure(400, status.reason ?? 'Jira is not configured.');

  const refusal = confirmed(runId, body);
  if (refusal) return failure(400, refusal);

  const wanted = Array.isArray(body.clusterIds) ? body.clusterIds.map(String) : [];
  if (wanted.length === 0) return failure(400, 'Nothing was selected, so nothing was sent.');

  const filed: Array<{ clusterId: string; action: string; key: string | null; error?: string }> = [];

  for (const clusterId of wanted) {
    /*
       Re-previewed here rather than trusting what the page was shown. The
       lookup is what deduplication turns on, and between rendering a preview
       and pressing the button somebody else's pipeline may have filed the
       same ticket.
    */
    const entry = await previewDefect(review, clusterId, run, service);
    if (!entry) {
      filed.push({ clusterId, action: 'skipped', key: null, error: 'no such cluster in this run' });
      continue;
    }
    if (entry.blocked) {
      filed.push({ clusterId, action: 'skipped', key: null, error: entry.blocked });
      continue;
    }

    const defect = clusterOf(review, clusterId, run)!;
    try {
      if (entry.existing && entry.action === 'comment') {
        await service.comment(entry.existing.key, repeatComment(run, defect));
        filed.push({ clusterId, action: 'commented', key: entry.existing.key });
        continue;
      }
      if (entry.existing && entry.action === 'reopen') {
        const applied = await service.reopen(entry.existing.key);
        await service.comment(entry.existing.key, reopenComment(run, Boolean(applied)));
        filed.push({ clusterId, action: applied ? 'reopened' : 'commented', key: entry.existing.key });
        continue;
      }
      const key = await service.createDefect({
        summary: entry.summary,
        description: entry.description,
        fingerprint: entry.fingerprint,
        labels: entry.labels,
      });
      filed.push({ clusterId, action: 'created', key });
    } catch (error) {
      // One ticket failing must not abandon the rest, and it must be said.
      filed.push({
        clusterId,
        action: 'failed',
        key: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(200, { destination: status.destination ?? null, filed });
}
