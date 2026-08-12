/**
 * Resolve an optional path against the target's base URL — and refuse anything
 * that would move the origin.
 *
 * `new URL(argument, base)` is not enough on its own: an argument that parses
 * as an absolute URL replaces the origin entirely. That matters because
 * exploration deliberately takes its host from the resolved profile, which is
 * what subjects it to the same non-production allowlist check as a test run
 * (§17). An argument that can replace the host defeats the point.
 *
 * It is not a hypothetical. Git Bash on Windows rewrites a leading `/path`
 * argument into a local filesystem path before the process ever sees it, and
 * that mangled value parses as a URL with a scheme of its own.
 */
export function resolveExploreUrl(baseURL: string, argument?: string): string {
  if (!argument) return baseURL;

  const base = new URL(baseURL);
  const candidate = new URL(argument, `${baseURL}/`);
  if (candidate.origin !== base.origin) {
    throw new Error(
      `'${argument}' resolves to ${candidate.origin}, not the target's ${base.origin}. ` +
        'Pass a path on the target — "/checkout" — not a URL. The host comes from the profile ' +
        'so that exploration is subject to the same non-production guard as a test run (§17).\n' +
        'On Git Bash a leading slash is rewritten to a local path: use "//checkout", or set ' +
        'MSYS_NO_PATHCONV=1.',
    );
  }
  return candidate.toString();
}
