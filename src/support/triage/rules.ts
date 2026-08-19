import {
  ACCOUNT_LOCKED,
  roleWithoutSession,
  SERVER_FAULT,
  TRANSPORT_ERROR,
} from '../failure-signals';
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


/** The project that establishes a session. Framework-defined, not a pack's. */
const AUTH_SETUP_PROJECT = 'setup:auth';

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

  /**
   * The application saying it faulted → its defect, never a locator and never
   * a wait.
   *
   * **Two vocabularies, and it only had one.** A status code is what an API
   * suite sees. The *words* are what a UI suite sees, and this rule knew only
   * the code — so a browser watching an application fall over matched nothing.
   *
   * parabank found it, after its sign-in had been failing all day. Its own
   * login endpoint answers **HTTP 500**; what reaches the suite is
   * *"An internal error has occurred and has been logged."* The framework had
   * every piece of evidence a person needs and reported a failure that needed
   * judgement.
   *
   * **Moved ahead of the sign-in and timing rules**, because an application
   * that says why it failed outranks both "I cannot tell why" and a heuristic
   * about how long something waited. Where a 5xx and a short timeout are both
   * in the text, the 5xx is the cause and the timeout is a consequence.
   */
  rule('server-error', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!SERVER_FAULT.test(text)) return null;
    return verdict(cluster, 'server-error', {
      category: 'application-defect',
      confidence: 'medium',
      summary: 'The application reported a fault of its own on a valid request',
      evidence: [
        matched(text, SERVER_FAULT),
        'a server fault is an application or infrastructure problem, never a locator',
      ],
      recommendedAction: 'file-defect',
      suggestedOwner: 'dev-team',
      needsHumanReview: false,
    });
  }),

  /**
   * The auth setup failed → the run has no session, and *why* is a judgement
   * call.
   *
   * **Ordered ahead of `short-wait`, and that ordering is the whole fix.**
   * `auth.setup.ts` waits for the signed-in marker with `expect.poll`, so
   * every failed sign-in in every target carries Playwright's "waiting on the
   * predicate" — and `short-wait` matched it, settling the failure as
   * `timing-synchronisation` with **high** confidence and an action of
   * `fix-test`, owner qa.
   *
   * Watched happen on a live suite: toolshop's shared account was genuinely
   * locked — its own service answering *423 Account locked, too many failed
   * attempts* to the exact credential in the store — and the run reported a
   * test-timing defect for a condition only an administrator can clear. That
   * is the failure `account-locked` exists to prevent, arriving through a
   * different door: the rule is ordered first and correctly, but the
   * application's sentence only reaches the error text when the pack's
   * `readError` could read the banner, which on a lockout is exactly the case
   * it often cannot.
   *
   * So this rule claims the cluster and then declines to name a cause.
   * `unclassified` is scored as a decline by the agreement measurement, which
   * is the honest outcome: no session was established, and the text does not
   * say whether that is a locked account, a rotated credential or a
   * `signedInMarker` that no longer matches. Naming one of the three
   * confidently is how a real lockout gets sent to the wrong team — and it is
   * the same lesson as the "Pay now" button this repository already declines
   * to guess about.
   *
   * Keyed on the project rather than on the message: the project is the
   * framework's own, where the sentence is written by each pack and already
   * differs between packs scaffolded at different times.
   *
   * **It does not stand aside for `all-failed-at-auth`, and the first draft
   * did.** The reasoning was that "every executed test failed" is stronger
   * evidence — true, but that rule is ordered *after* `short-wait`, so
   * deferring handed the cluster straight back to the rule this one exists to
   * pre-empt. And the case it would have deferred in is the exact one that
   * gets reported: when the auth setup fails, everything downstream is
   * *skipped* rather than run, so a live suite is one failure and two skips —
   * which is "every executed test failed". The deferral would have been
   * inert everywhere except where it did harm.
   */
  rule('sign-in-setup-failed', (cluster, { tests }) => {
    if (tests.length === 0 || !tests.every((test) => test.project === AUTH_SETUP_PROJECT)) {
      return null;
    }
    const role = roleWithoutSession(errorText(tests));
    return verdict(cluster, 'sign-in-setup-failed', {
      category: 'unclassified',
      confidence: 'high',
      summary: role
        ? `Sign-in for role '${role}' established no session — the run had no identity`
        : 'The auth setup failed, so the run had no identity',
      evidence: [
        `${cluster.size} test(s) in the ${AUTH_SETUP_PROJECT} project failed`,
        'the application said nothing a rule can act on — no lockout banner, no transport error',
        'a locked account, a rotated credential and a stale signedInMarker all look like this',
      ],
      recommendedAction: 'escalate',
      suggestedOwner: null,
      /*
         High confidence in *what* happened and none at all in why, which is
         why the category declines and this is true. `npm run target:doctor
         --sign-in` is the thing that separates the three, and it says which.
      */
      needsHumanReview: true,
    });
  }),

  /**
   * A wait shorter than the thing being waited for → the spec's timing, not
   * the application.
   *
   * **Ordered before `locator-drift`, and the ordering carries the whole
   * distinction.** Both arrive as "timed out waiting for a locator" and are
   * otherwise identical in shape; what separates them is *how long the spec
   * was willing to wait*. A timeout at the configured default means we waited
   * the normal amount and the element never came — something moved. An
   * explicitly short timeout means the spec chose not to wait, and the defect
   * is the assumption about timing.
   *
   * `expect.poll` is the unambiguous half: Playwright renders it as "waiting
   * on the predicate", and the conventions mandate it for exactly the
   * eventually-consistent facts that produce this failure.
   *
   * The threshold is a heuristic and is stated as one. This suite configures
   * `actionTimeout: 15_000` and `expect: { timeout: 10_000 }`, so anything
   * under a second was deliberately passed by a caller — nobody arrives at
   * 1ms by accident.
   */
  rule('short-wait', (cluster, { tests }) => {
    const text = errorText(tests);
    const shortWait = /Timeout (\d{1,3})ms exceeded/.exec(text);
    const polled = /waiting on the predicate/i.test(text);
    if (!polled && !shortWait) return null;

    return verdict(cluster, 'short-wait', {
      category: 'timing-synchronisation',
      confidence: polled ? 'high' : 'medium',
      summary: polled
        ? 'A polled condition never became true inside its timeout'
        : `A wait of ${shortWait?.[1]}ms expired — shorter than this application answers in`,
      evidence: [
        polled ? matched(text, /waiting on the predicate/i) : matched(text, /Timeout \d+ms exceeded/),
        'The suite waits 15s by default, so a sub-second timeout was chosen by the caller.',
      ],
      recommendedAction: 'fix-test',
      suggestedOwner: 'qa',
      // Medium on the magnitude alone: a genuinely absent element with a short
      // timeout looks the same, and a person should confirm which it was.
      needsHumanReview: !polled,
    });
  }),

  /**
   * A locator that matches **several** elements → the locator is wrong.
   *
   * **Strict-mode violations only, and the narrowness is the point.** The
   * obvious rule is "a timeout waiting for a locator is locator drift", and
   * this repository had already decided against it, in the ground-truth
   * fixture, with reasoning worth repeating: a "Pay now" button that never
   * appears is *either* a renamed control *or* a button missing because
   * checkout is broken upstream, and nothing in the text says which.
   *
   * The first draft of this rule ignored that and matched the timeout too. It
   * settled a case the fixture deliberately marks as a judgement call, and the
   * existing test caught it. Healing a locator for a control that is
   * legitimately absent would paper over an application defect — which is
   * exactly the thing the conventions forbid, arrived at through triage
   * instead of through a code change.
   *
   * A strict-mode violation carries no such ambiguity: the element is there,
   * and the locator names too many of them.
   */
  rule('locator-drift', (cluster, { tests }) => {
    const text = errorText(tests);
    if (!/strict mode violation/i.test(text)) return null;

    return verdict(cluster, 'locator-drift', {
      category: 'locator-drift',
      confidence: 'high',
      summary: 'A locator matches more than one element',
      evidence: [
        matched(text, /strict mode violation[^\n]*/i),
        `${cluster.size} test(s) share this signature`,
      ],
      recommendedAction: 'heal',
      suggestedOwner: 'qa',
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
