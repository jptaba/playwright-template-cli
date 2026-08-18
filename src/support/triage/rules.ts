import { ACCOUNT_LOCKED, TRANSPORT_ERROR } from '../failure-signals';
import type { RunResult, TestRecord } from '../reporters/run-result';
import type { FailureCluster, TriageVerdict } from './types';

/**
 * Pass 2 — classify by rule, still before any AI runs (§20).
 *
 * "A large share of failures are deterministically identifiable and need no
 * model at all." Each rule below is one row of the table in §20, and each
 * carries the evidence that justified it — a verdict without a cited artifact
 * is not reviewable.
 *
 * The model is then asked only about what the rules could not settle, which is
 * where judgement genuinely is required and is a small fraction of a run.
 */

export interface RuleContext {
  run: RunResult;
  /** Tests in this cluster, resolved from ids. */
  tests: TestRecord[];
  /** Error fingerprints with an open defect, so a known issue is not re-filed. */
  knownIssueFingerprints?: Set<string>;
}

export interface TriageRule {
  name: string;
  apply(cluster: FailureCluster, context: RuleContext): TriageVerdict | null;
}

const rule = (
  name: string,
  apply: (cluster: FailureCluster, context: RuleContext) => TriageVerdict | null,
): TriageRule => ({ name, apply });

function verdict(
  cluster: FailureCluster,
  ruleName: string,
  fields: Omit<TriageVerdict, 'clusterId' | 'affectedTests' | 'source' | 'rule'>,
): TriageVerdict {
  return {
    clusterId: cluster.id,
    affectedTests: cluster.caseIds.length > 0 ? cluster.caseIds : cluster.testIds,
    source: 'rule',
    rule: ruleName,
    ...fields,
  };
}


/**
 * Authentication-shaped failures. `\bauth\b` rather than a bare substring:
 * `net::ERR_CERT_AUTHORITY_INVALID` contains "auth", and a TLS failure
 * misfiled as a credentials problem sends the whole night's triage to the
 * wrong team.
 */
const AUTH_ERROR =
  /(\bauth\b|authentication|unauthori[sz]ed|sign ?in|log ?in|\b401\b|\b403\b|storage ?state)/i;


const errorText = (tests: TestRecord[]): string =>
  tests.map((test) => `${test.error?.message ?? ''} ${test.error?.stack ?? ''}`).join('\n');

/**
 * Order matters: the first rule that matches wins, so the most *specific*
 * signal has to come first. A transport failure is unambiguous evidence about
 * where the fault is; "everything failed and the text mentions auth" is an
 * inference, and inference must never pre-empt evidence.
 */
export const RULES: TriageRule[] = [
  /**
   * A locked or disabled account → the environment, and a person.
   *
   * **First, because it is the most specific and the most misdiagnosed.** A
   * lockout looks like every other auth failure from a stack trace, and it is
   * the one with a completely different remedy: no credential is wrong, no
   * locator has drifted, and no amount of re-running will clear it. Only an
   * administrator can.
   *
   * It cost three runs of the improvement loop to find once. The suite
   * reported "sign-in did not establish a session" while the application was
   * answering HTTP 423 and saying *"Account locked, too many failed attempts.
   * Please contact the administrator."* on screen — so the investigation went
   * to worker partitioning and locators instead of to the one line that
   * mattered.
   *
   * Deliberately matches the *message*, not a status code: a UI suite sees the
   * banner text and never the response, and an API suite sees both.
   */
  rule('account-locked', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!ACCOUNT_LOCKED.test(text)) return null;
    return verdict(cluster, 'account-locked', {
      category: 'environment-config',
      confidence: 'high',
      summary: 'A test account is locked or disabled — re-running will not clear it',
      evidence: [
        matched(text, ACCOUNT_LOCKED),
        `${cluster.size} test(s) share this signature`,
        'Only an administrator of the application can restore the account.',
      ],
      recommendedAction: 'escalate',
      suggestedOwner: 'platform',
      // A person has to unlock it, and no rule should imply otherwise.
      needsHumanReview: true,
    });
  }),

  /**
   * DNS, connection and TLS failures → network or environment, never one
   * ticket per test.
   *
   * Two vocabularies, because failures arrive from two places. Node-side codes
   * (`ECONNREFUSED`) come from the integration adapters; Chromium's `net::ERR_`
   * codes come from the browser, and those are most of what a UI suite
   * actually sees when an environment is down. Matching only the first set —
   * as this rule originally did — leaves the commonest infrastructure failure
   * in the suite unclassified.
   */
  rule('transport-failure', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!TRANSPORT_ERROR.test(text)) return null;
    return verdict(cluster, 'transport-failure', {
      category: 'network-infrastructure',
      confidence: 'high',
      summary: 'Connection, DNS or TLS failure — correlated across tests',
      evidence: [matched(text, TRANSPORT_ERROR), `${cluster.size} test(s) share this signature`],
      recommendedAction: 'escalate',
      suggestedOwner: 'platform',
      needsHumanReview: false,
    });
  }),

  // "Every test in the run failed at login" → environment or credentials.
  rule('all-failed-at-auth', (cluster, { run, tests }) => {
    const executed = run.tests.filter((test) => test.outcome !== 'skipped');
    const allFailed = executed.length > 0 && executed.every((test) => test.outcome === 'unexpected');
    const authShaped = AUTH_ERROR.test(errorText(tests));
    if (!allFailed || !authShaped) return null;
    return verdict(cluster, 'all-failed-at-auth', {
      category: 'environment-config',
      confidence: 'high',
      summary: 'Every executed test failed at authentication — the environment or the credentials',
      evidence: [
        `${executed.length} of ${executed.length} executed tests failed`,
        'failures mention authentication or a session',
      ],
      recommendedAction: 'escalate',
      suggestedOwner: 'platform',
      needsHumanReview: false,
    });
  }),

  // A schema validation failure is provider drift, not an application defect.
  rule('contract-drift', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!/Contract drift|no longer validates against the published schema/i.test(text)) return null;
    return verdict(cluster, 'contract-drift', {
      category: 'contract-drift',
      confidence: 'high',
      summary: 'A response no longer validates against the published schema',
      evidence: [matched(text, /Contract drift on ([^\n:]+)/i), 'schema validation failed inside the shared client'],
      recommendedAction: 'file-defect',
      // Routes to a different team — which is the whole reason the category
      // is separate from "application defect" (§20).
      suggestedOwner: 'provider-team',
      needsHumanReview: false,
    });
  }),

  // A Vault or mail adapter throwing is a dependency, not the product.
  rule('dependency-failure', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!/SecretStoreUnavailable|SecretNotFound|PollTimeoutError|InboxUnreadable|Vault|OTP/i.test(text)) {
      return null;
    }
    return verdict(cluster, 'dependency-failure', {
      category: 'dependency',
      confidence: 'medium',
      summary: 'A dependency the framework only talks to did not answer',
      evidence: [matched(text, /(SecretStoreUnavailableError|SecretNotFoundError|PollTimeoutError|InboxUnreadableError)/)],
      recommendedAction: 'escalate',
      suggestedOwner: 'owner-of-that-system',
      needsHumanReview: false,
    });
  }),

  // A 5xx from the app is never a locator problem.
  rule('server-error', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!/\b(50[0-9]|HTTP 5\d\d)\b/.test(text)) return null;
    return verdict(cluster, 'server-error', {
      category: 'application-defect',
      confidence: 'medium',
      summary: 'The application returned a server error on a valid request',
      evidence: [matched(text, /\b(50[0-9])\b/), 'a 5xx is an application or infrastructure fault, never a locator'],
      recommendedAction: 'file-defect',
      suggestedOwner: 'dev-team',
      needsHumanReview: false,
    });
  }),

  // Known issue: link, do not re-file.
  rule('known-issue', (cluster, { knownIssueFingerprints }) => {
    if (!knownIssueFingerprints?.has(cluster.id)) return null;
    return verdict(cluster, 'known-issue', {
      category: 'application-defect',
      confidence: 'high',
      summary: 'This failure signature matches an open defect',
      evidence: [`fingerprint ${cluster.id} matches an open Jira defect`],
      recommendedAction: 'none',
      suggestedOwner: null,
      needsHumanReview: false,
    });
  }),

  // An API test failing while its UI equivalent passed points at the client.
  rule('api-only-failure', (cluster, { run, tests }) => {
    if (!tests.every((test) => test.kind === 'api')) return null;
    const uiGreen = run.tests.some((test) => test.kind === 'ui' && test.outcome === 'expected');
    if (!uiGreen) return null;
    return verdict(cluster, 'api-only-failure', {
      category: 'contract-drift',
      confidence: 'low',
      summary: 'API tests failed while the UI journeys passed — contract or client, not the journey',
      evidence: ['every test in this cluster is an API test', 'at least one UI journey passed in the same run'],
      recommendedAction: 'escalate',
      suggestedOwner: 'provider-team',
      // Low confidence, so a person still looks: this is a hint, not a verdict.
      needsHumanReview: true,
    });
  }),
];

/**
 * Flaky is decided by definition, not by inference: a test that passed on
 * retry *is* flaky, and it never reaches the model (§20).
 */
export function flakyVerdicts(run: RunResult): TriageVerdict[] {
  const flaky = run.tests.filter((test) => test.outcome === 'flaky');
  if (flaky.length === 0) return [];
  return [
    {
      clusterId: 'flaky',
      category: 'flaky',
      confidence: 'high',
      summary: `${flaky.length} test(s) passed on retry`,
      evidence: flaky.map(
        (test) => `${test.caseId ?? test.title}: first attempt ${test.firstRunStatus}, passed after ${test.retries} retry(ies)`,
      ),
      affectedTests: flaky.map((test) => test.caseId ?? test.title),
      recommendedAction: 'fix-test',
      suggestedOwner: 'qa',
      needsHumanReview: false,
      source: 'rule',
      rule: 'passed-on-retry',
    },
  ];
}

export function classifyByRule(
  cluster: FailureCluster,
  context: RuleContext,
): TriageVerdict | null {
  for (const candidate of RULES) {
    const result = candidate.apply(cluster, context);
    if (result) return result;
  }
  return null;
}

function matched(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[0] ?? 'matched by rule';
}
