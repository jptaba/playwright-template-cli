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

/**
 * A sign-in that ran and left no session, in whichever words a pack says it.
 *
 * Here rather than in either caller because three things now have to agree
 * about it: `target:doctor --sign-in` reads it *before* a run, triage
 * classifies it *after* one, and the scaffolder writes the sentence that
 * produces it.
 *
 * The account number is optional, and that is the point — packs scaffolded at
 * different times say *"role 'customer' (account 1)"* and *"role 'customer'"*.
 * The doctor's fallback required the bracketed half, so on a target whose pack
 * predates it the one useful sentence in the output was not lifted out at all.
 * Observed on parabank, whose sign-in was failing while this was written.
 */
export const NO_SESSION = /Sign-in for role '([^']+)'(?: \(account \d+\))?[^\n]*did not establish a session/i;

/** The role a run failed to sign in as, or null when that is not what happened. */
export function roleWithoutSession(text: string): string | null {
  return NO_SESSION.exec(text)?.[1] ?? null;
}

/**
 * The application saying it faulted, in both vocabularies.
 *
 * The status code is what an API suite sees. The **words** are what a UI suite
 * sees, and until this existed the rule knew only the code — the same blind
 * spot `ACCOUNT_LOCKED` was written to close, for the same reason: a browser
 * is shown a banner and never a status line.
 *
 * Found on parabank, whose sign-in had been failing all day. Its own login
 * endpoint answers **HTTP 500**, and what reaches a UI suite is the sentence
 * *"An internal error has occurred and has been logged."* Nothing matched it,
 * so a plainly broken application was reported as a failure needing judgement.
 *
 * Deliberately narrow. "Something went wrong" and "unexpected error" are what
 * applications also print for validation failures and for a user's own
 * mistake, and a rule that read those as server faults would file defects
 * against working software.
 */
export const SERVER_FAULT =
  /(\b(50[0-9]|HTTP 5\d\d)\b|internal (server )?error|server error occurred)/i;

/** Whether this text is the application reporting a fault of its own. */
export function looksLikeServerFault(text: string): boolean {
  return SERVER_FAULT.test(text);
}
