import { looksLikeLockout, looksLikeTransportFailure } from '../failure-signals';

/**
 * Proving a credential can actually sign in, rather than merely existing.
 *
 * **The gap this closes.** `target:doctor` asks the secret store whether a
 * credential is there and stops. Existence is not usability: a locked, expired
 * or rotated account *describes* perfectly — right path, right field names —
 * and fails every run. So the doctor could report a target as entirely healthy
 * minutes before every spec in it failed at sign-in, which is precisely what
 * happened.
 *
 * **Why it runs `setup:auth` rather than signing in itself.** Framework code
 * may not import a target pack, and driving a sign-in needs that pack's
 * locators and its business verb. `setup:auth` is the project that already
 * owns exactly this — one real authentication per role, through the
 * application's own vocabulary — so the honest preflight is to run it and read
 * the result, not to build a second sign-in path that could disagree with the
 * one the suite uses.
 *
 * The interpretation is pure and lives here; the spawning is in
 * `tools/check-target.ts`.
 */

export interface SignInCheckResult {
  /** Exit status of the `setup:auth` run. */
  status: number;
  /** Everything it printed, stdout and stderr together. */
  output: string;
}

export interface SignInVerdict {
  ok: boolean;
  /** A stable code, so a log line can be searched for. */
  code:
    | 'sign-in-ok'
    | 'account-locked'
    | 'environment-unreachable'
    | 'sign-in-failed'
    | 'sign-in-not-run';
  message: string;
  /** What to do about it. Every verdict has one, or it is not worth printing. */
  fix: string;
  /** The application's own words, when it said anything. */
  reported: string | null;
}

/**
 * The sentence the application itself said, or null when it said nothing.
 *
 * Separate from `reportedByApplication` because the two answer different
 * questions, and the verdict needs to tell them apart: this is the
 * application's own words, where that one falls back to the framework's own
 * summary line when there are none.
 */
export function quotedByApplication(output: string): string | null {
  const said = output
    .split('\n')
    .filter((line) => !/^\s*[>|]?\s*\d+\s*\|/.test(line))
    .map((line) => /The application said: "([^"]+)"/.exec(line)?.[1])
    .find((quoted): quoted is string => Boolean(quoted));
  return said?.trim() ?? null;
}

/**
 * The line the application itself contributed, out of a Playwright run's
 * output.
 *
 * `auth.setup.ts` prints `The application said: "…"` when it managed to read
 * the form's error. That sentence is the single most useful thing in the whole
 * output and it is buried in a stack trace, so it is lifted out.
 */
export function reportedByApplication(output: string): string | null {
  /*
     Read it off the run's own lines, and never out of a code frame.

     Playwright echoes the failing source, and `auth.setup.ts` line 73 *is*
     the sentence this looks for — `The application said: "${reported}"` —
     with the placeholder still in it. So a plain match over the whole output
     found the framework quoting its own source back, and the preflight
     printed the placeholder verbatim, in quotes, for a locked
     toolshop account. Observed on a real run, not reasoned about.

     Two things followed from that one wrong capture, and the second is worse
     than the cosmetic first: having "found" a message, the verdict took the
     branch that says *read what the application said above* — where nothing
     was said — instead of the one that names the marker and the credential.
     And `looksLikeLockout` was asked about a placeholder rather than about
     "Account locked, too many failed attempts", so the lockout branch could
     never be reached from a run whose form error the pack failed to read.

     A code-frame line carries a line number and a pipe; the sentence we want
     is part of a thrown error's message and never does.
  */
  const said = quotedByApplication(output);
  if (said) return said;

  /*
     Nothing quoted. Fall back to the framework's own summary line, which is
     still better than handing back a stack trace — and deliberately *not* to
     "first line containing the word error", which on a Playwright run is
     almost always a file path.
  */
  const summary = /Sign-in for role '[^']+' \(account \d+\)[^\n]*/.exec(output);
  return summary?.[0]?.trim() ?? null;
}

/**
 * Turn a `setup:auth` run into something worth printing.
 *
 * A lockout is separated from every other failure because the remedy is
 * completely different: no credential is wrong, nothing has drifted, and
 * re-running cannot help — only an administrator can. Reporting it as "check
 * the credential" sends somebody to look at the one thing that is fine.
 */
export function interpretSignInCheck(result: SignInCheckResult): SignInVerdict {
  const reported = reportedByApplication(result.output);

  if (result.status === 0) {
    return {
      ok: true,
      code: 'sign-in-ok',
      message: 'Every declared role signed in and established a session.',
      fix: 'Nothing to do.',
      reported: null,
    };
  }

  // A run that never started is not a failed sign-in, and saying so stops a
  // broken command being read as a broken credential.
  if (result.status === 2 || /No tests found|Error: Cannot find module/i.test(result.output)) {
    return {
      ok: false,
      code: 'sign-in-not-run',
      message: 'The sign-in check could not be run at all, so nothing was proven.',
      fix:
        'Run `npx playwright test --project=setup:auth` for this target and fix whatever stops ' +
        'it starting — a missing tests/auth.setup.ts is the usual cause.',
      reported,
    };
  }

  /*
     The environment being unreachable, which is not a credential problem at
     all. Found by running the check against a dead port and being told to
     "check the signed-in marker" — advice that is exactly as wrong as the
     message this whole preflight was built to replace, and for the same
     reason: the most specific evidence has to be read first.

     Matched against the whole output rather than the extracted sentence,
     because a transport failure never reaches the form and so never produces
     one.
  */
  if (looksLikeTransportFailure(result.output)) {
    return {
      ok: false,
      code: 'environment-unreachable',
      message: 'The application could not be reached, so no credential was tested.',
      fix:
        'Check the profile\'s baseURL and that the environment is up. Nothing here is wrong ' +
        'with the credential or the pack — the sign-in never got as far as the form.',
      reported,
    };
  }

  if (reported && looksLikeLockout(reported)) {
    return {
      ok: false,
      code: 'account-locked',
      message: `The account is locked or disabled — the application said: "${reported}"`,
      fix:
        'Ask an administrator of the application to unlock it. Re-running will not clear it, ' +
        'and no credential here is wrong. On a shared deployment anybody using it can spend ' +
        'the lockout budget, which is what `sharedEnvironment: true` warns about.',
      reported,
    };
  }

  /*
     Only the *quoted* sentence is the application's. The fallback above is
     the framework's own summary line, and attributing that to the
     application is the same lie the placeholder was — it reads as though the
     form said something when the pack could not read the form at all, which
     is precisely the case that wants the marker looked at.
  */
  const said = quotedByApplication(result.output);

  return {
    ok: false,
    code: 'sign-in-failed',
    message: said
      ? `Sign-in did not establish a session. The application said: "${said}"`
      : 'Sign-in did not establish a session, and the application reported nothing.',
    fix: said
      ? 'Read what the application said above — it is usually the credential or the account.'
      : 'Check the signed-in marker in the pack, then the credential. A form that reports ' +
        'nothing at all usually means the marker locator is wrong rather than the password.',
    reported,
  };
}
