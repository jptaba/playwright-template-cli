/**
 * Which page fixes a given diagnostic — item 75.
 *
 * The health chip in the top bar reports what `target:doctor` found. Sending
 * every finding to `/onboard` made it a notification rather than a way in: a
 * credential that will not resolve is fixed on **Test users**, and a coverage
 * kind that is missing is looked at on **Cases**. A chip that names a problem
 * and then opens the wrong page is barely better than one that says nothing.
 *
 * This is also what lets *Set up* leave the rail. Applications and Test users
 * are not steady-state destinations — they are onboarding and recovery — so
 * they moved beside the application switcher, and recovery is surfaced at the
 * moment it is needed rather than kept permanently in the first slot of a list
 * of five things somebody uses daily.
 *
 * **Matched on a prefix, not a list of every code.** The doctor has upwards of
 * forty and grows one whenever somebody finds a condition worth catching; a
 * closed list here would silently send each new one to the default and nobody
 * would notice. The prefixes are the families the codes are already named for.
 */

/** Every page this can point at. Kept narrow on purpose. */
export type FixPage = '/users' | '/cases' | '/onboard';

/**
 * Where to go to fix `code`.
 *
 * `/onboard` is the default and the right one: it holds the profile, and a
 * profile claim is what most diagnostics are about. The two exceptions are the
 * ones with a page of their own.
 */
export function whereToFix(code: string): FixPage {
  /*
     Credentials — resolvable, missing, unchecked, and the leasing and TOTP
     conditions, which are all about what the secret store holds.
  */
  if (
    code.startsWith('credentials-') ||
    code.startsWith('totp-') ||
    code.startsWith('leasing-') ||
    code.startsWith('rotation-') ||
    code.startsWith('authflow-account-')
  ) {
    return '/users';
  }

  // The only finding about what the suite covers rather than how it is set up.
  if (code === 'coverage-incomplete') return '/cases';

  return '/onboard';
}

/**
 * The finding a chip should take somebody to, given everything the doctor
 * said.
 *
 * Errors before warnings, because an error stops a run and a warning does not.
 * Within a level the first is taken: `diagnose` emits in the order it checks,
 * which is roughly the order things have to be true in.
 */
export function firstWorthFixing(
  diagnostics: readonly { level: string; code: string }[],
): string | null {
  const error = diagnostics.find((one) => one.level === 'error');
  if (error) return error.code;
  return diagnostics.find((one) => one.level === 'warning')?.code ?? null;
}
