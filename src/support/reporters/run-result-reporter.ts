import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { RUN_RESULT_PATH } from '../paths';
import { redact } from '../redact';
import {
  RUN_RESULT_SCHEMA_VERSION,
  tally,
  type AttachmentRecord,
  type RunResult,
  type Status,
  type StepRecord,
  type TestKind,
  type TestRecord,
} from './run-result';

/**
 * The only reporter that writes facts. Everything downstream reads its output.
 *
 * The detail that produces wrong numbers if missed: `onTestEnd` fires once per
 * *attempt*, including every retry, so counting statuses there double-counts
 * retried tests. Flakiness is only knowable once all attempts are done — so
 * aggregation happens in `onEnd` using `test.outcome()`, which is the API that
 * actually encodes "passed, but not first time" (§18).
 */
export default class RunResultReporter implements Reporter {
  private startedAt = Date.now();
  private suite: Suite | undefined;
  private readonly attempts = new Map<string, TestResult[]>();

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = Date.now();
    this.suite = suite;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Collected, not counted. Counting here is the bug.
    const existing = this.attempts.get(test.id) ?? [];
    existing.push(result);
    this.attempts.set(test.id, existing);
  }

  async onEnd(result: FullResult): Promise<void> {
    const tests = (this.suite?.allTests() ?? []).map((test) => this.record(test));
    const finishedAt = Date.now();

    const runResult: RunResult = {
      schemaVersion: RUN_RESULT_SCHEMA_VERSION,
      run: {
        id: process.env.RUN_ID ?? `local-${this.startedAt.toString(36)}`,
        startedAt: new Date(this.startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - this.startedAt,
        target: process.env.TARGET ?? 'default',
        environment: process.env.TARGET_ENV ?? 'local',
        branch: process.env.CI_COMMIT_REF_NAME ?? null,
        commit: process.env.CI_COMMIT_SHA ?? null,
        buildId: process.env.CI_PIPELINE_ID ?? null,
        trigger: process.env.CI_PIPELINE_SOURCE ?? null,
        status: result.status === 'passed' ? 'passed' : 'failed',
      },
      totals: tally(tests),
      capabilities: readCapabilityNotes(),
      tests,
    };

    fs.mkdirSync(path.dirname(RUN_RESULT_PATH), { recursive: true });
    fs.writeFileSync(RUN_RESULT_PATH, `${JSON.stringify(runResult, null, 2)}\n`, 'utf8');
  }

  private record(test: TestCase): TestRecord {
    const attempts = this.attempts.get(test.id) ?? [];
    const last = attempts[attempts.length - 1];
    const first = attempts[0];
    const annotations = test.annotations.map((annotation) => ({
      type: annotation.type,
      ...(annotation.description ? { description: annotation.description } : {}),
    }));

    return {
      id: test.id,
      title: test.title,
      caseId: annotationValue(annotations, 'practitest'),
      jiraKey: annotationValue(annotations, 'jira'),
      caseHash: annotationValue(annotations, 'case-hash'),
      file: path.relative(process.cwd(), test.location.file).split(path.sep).join('/'),
      project: test.parent.project()?.name ?? 'unknown',
      kind: kindOf(test.parent.project()?.name ?? '', test.location.file),
      tags: extractTags(test.title),
      // `outcome()` is what encodes flaky; status alone cannot.
      outcome: test.outcome(),
      status: (last?.status ?? 'skipped') as Status,
      firstRunStatus: (first?.status ?? 'skipped') as Status,
      retries: Math.max(0, attempts.length - 1),
      durationMs: attempts.reduce((total, attempt) => total + attempt.duration, 0),
      workerIndex: last?.workerIndex ?? 0,
      error: last?.error
        ? {
            message: redact(last.error.message ?? ''),
            stack: last.error.stack ? redact(last.error.stack) : null,
            snippet: last.error.snippet ? redact(last.error.snippet) : null,
          }
        : null,
      steps: last ? flattenSteps(last) : [],
      attachments: last ? last.attachments.map(toAttachment) : [],
      annotations,
    };
  }
}

/** Every step title, so the report has its narrative even for nested steps. */
function flattenSteps(result: TestResult): StepRecord[] {
  const steps: StepRecord[] = [];
  const walk = (nodes: TestResult['steps']): void => {
    for (const step of nodes) {
      // `test.step` calls only: Playwright's internal categories are noise in
      // a report a product owner reads.
      if (step.category === 'test.step') {
        steps.push({
          title: redact(step.title),
          durationMs: step.duration,
          failed: Boolean(step.error),
          ...(step.error?.message ? { error: redact(step.error.message) } : {}),
        });
      }
      walk(step.steps);
    }
  };
  walk(result.steps);
  return steps;
}

function toAttachment(attachment: TestResult['attachments'][number]): AttachmentRecord {
  return {
    name: attachment.name,
    contentType: attachment.contentType,
    ...(attachment.path ? { path: attachment.path } : {}),
    // Inlined bodies are scrubbed here, before anything downstream can attach
    // them to a test management system (§11).
    ...(attachment.body ? { body: redact(attachment.body.toString('utf8').slice(0, 8_000)) } : {}),
    ...(attachment.body ? { bytes: attachment.body.byteLength } : {}),
  };
}

function annotationValue(
  annotations: Array<{ type: string; description?: string }>,
  type: string,
): string | null {
  return annotations.find((annotation) => annotation.type === type)?.description ?? null;
}

function extractTags(title: string): string[] {
  return [...title.matchAll(/@[\w-]+/g)].map((match) => match[0]);
}

/**
 * Test kind from the project and path. A UI spec that also calls the API is
 * "mixed" — the most realistic test you can write, and the one worth reading
 * separately (§05).
 */
function kindOf(project: string, file: string): TestKind {
  if (project === 'unit') return 'unit';
  if (project === 'api') return 'api';
  if (project === 'contract') return 'contract';
  const source = safeRead(file);
  if (source && /\bapi\.|\bdb\./.test(source)) return 'mixed';
  return 'ui';
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Capability notes are written by the config into the environment so the
 * report can say "api: not applicable for <target>" rather than showing a
 * silent zero (§05). The reporter must not import a target profile — it has to
 * work for any application under test.
 */
function readCapabilityNotes(): RunResult['capabilities'] {
  const raw = process.env.CAPABILITY_NOTES;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RunResult['capabilities'];
  } catch {
    return [];
  }
}
