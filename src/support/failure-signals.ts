/**
 * What a failure was actually about, in patterns two tools have to share.
 *
 * One definition, in a neutral home, because two copies of a pattern is how
 * the two came to disagree — the same argument that put the auth-flow file
 * pattern in one place and holds it there with a test. Triage classifies a
 * failure *after* a run; `target:doctor --sign-in` reports one *before* a run.
 * Both have to mean the same thing by "locked" and by "unreachable".
 */

/**
 * DNS, connection and TLS failures, in both vocabularies.
 *
 * Node's own codes come from the integration adapters; Chromium's `net::ERR_`
 * codes come from the browser, and those are most of what a UI suite actually
 * sees when an environment is down. Matching only the first set leaves the
 * commonest infrastructure failure in a suite unrecognised.
 */
export const TRANSPORT_ERROR =
  /(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|SELF_SIGNED_CERT[A-Z_]*|CERT_[A-Z_]+|net::ERR_[A-Z_]+)/i;

/** Whether this text is the environment being unreachable rather than wrong. */
export function looksLikeTransportFailure(text: string): boolean {
  return TRANSPORT_ERROR.test(text);
}

/**
 * An account the application will not let anybody into, however correct the
 * credential is.
 *
 * Both vocabularies: the words applications print ("account locked", "too many
 * failed attempts", "account disabled", "suspended") and the status code that
 * carries it, `423 Locked`. A bare `\b423\b` would match a duration or an id,
 * so it is anchored to the word applications put beside it.
 *
 * This exists because a lockout is the most misdiagnosed authentication
 * failure there is: it looks like every other one from a stack trace, and it
 * is the only one where no credential is wrong, nothing has drifted, and
 * re-running cannot help. It cost three runs of the improvement loop once,
 * while the application displayed *"Account locked, too many failed attempts.
 * Please contact the administrator."* on screen.
 */
export const ACCOUNT_LOCKED =
  /(account (is )?(locked|disabled|suspended|blocked)|too many failed attempts|locked out|\b423 Locked\b|HTTP 423\b)/i;

/** Whether this text is an application saying the account itself is barred. */
export function looksLikeLockout(text: string): boolean {
  return ACCOUNT_LOCKED.test(text);
}
