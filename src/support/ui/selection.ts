/**
 * Which application every page is scoped to — §08.
 *
 * The top bar has named the selected application since the shell was written,
 * and named it from `resolveTarget()`, which reads `TARGET` from the
 * environment. With two profiles registered and nothing exported — the normal
 * state of a repository holding more than one — that throws, so the bar said
 * "none selected" on every page, always, while the pages underneath had each
 * quietly picked one.
 *
 * They picked it by filling a `<select>` from `/api/targets` and letting the
 * browser take the first option, which is alphabetical order deciding which
 * application gets tested. The conventions refuse exactly that at the CLI:
 * *"alphabetical order does not get to decide which application gets tested."*
 * A dashboard where **Start a run** sits one click from that guess is the last
 * place the rule should be quietly dropped.
 *
 * So the selection becomes a thing the dashboard holds, and this module is the
 * part of it that decides. It is pure: the file it is stored in belongs to the
 * tool, and every rule here is answerable without one.
 */

/** Where a selection came from. The bar says which, because they differ. */
export type SelectionSource =
  /** `TARGET` or `DEFAULT_TARGET` in the environment. Not ours to change. */
  | 'environment'
  /** Chosen in the bar, and kept on this machine. */
  | 'chosen'
  /** One application onboarded, so there is nothing to choose between. */
  | 'only-one'
  /** Nothing selected, and the pages should say so rather than guess. */
  | 'none';

export interface Selection {
  /** The application every page is scoped to, or null. */
  name: string | null;
  source: SelectionSource;
  /** Every onboarded application, for the switcher. */
  available: readonly string[];
  /**
   * Whether the bar may change it.
   *
   * False when the environment decided. CI exports `TARGET`, and a dashboard
   * that let a click override it would be a page disagreeing with the run it
   * is about to start.
   */
  switchable: boolean;
}

export interface SelectionInputs {
  /** What `TARGET` / `DEFAULT_TARGET` resolved to, or null. */
  fromEnvironment?: string | null;
  /** What was last chosen in the bar on this machine, or null. */
  stored?: string | null;
  /** Every onboarded application, in whatever order the tool lists them. */
  available: readonly string[];
}

/**
 * Decide which application is selected, and say why.
 *
 * The order is the interesting part, and each step earns its place:
 *
 * 1. **The environment wins.** CI sets it, and a file somebody's laptop wrote
 *    must not override it — the same rule the Vault connection settings are
 *    heading for, and the reason the dashboard does not write to
 *    `config/targets/`.
 * 2. **Then the stored choice**, if that application still exists. It might
 *    not: offboarding removes profiles, and a selection outliving its target
 *    would scope every page to something that is gone.
 * 3. **Then one application, if there is exactly one.** Not a guess — with a
 *    single profile there is nothing to guess between, and making somebody
 *    choose from a list of one is a click that carries no information.
 * 4. **Otherwise nothing**, and the pages say so. This is the case the old
 *    behaviour answered with the alphabetically first application.
 */
export function resolveSelection(inputs: SelectionInputs): Selection {
  const available = [...inputs.available];
  const has = (name: string | null | undefined): name is string =>
    typeof name === 'string' && available.includes(name);

  if (has(inputs.fromEnvironment)) {
    return { name: inputs.fromEnvironment, source: 'environment', available, switchable: false };
  }

  /*
     An environment naming something that is not there is reported as "none"
     rather than honoured. It is the one case where the answer is neither the
     environment's nor the file's, and silently falling through to a stored
     choice would hide a broken TARGET behind a page that looks fine.
  */
  if (inputs.fromEnvironment) {
    return { name: null, source: 'environment', available, switchable: false };
  }

  if (has(inputs.stored)) {
    return { name: inputs.stored, source: 'chosen', available, switchable: true };
  }

  if (available.length === 1) {
    return { name: available[0]!, source: 'only-one', available, switchable: true };
  }

  return { name: null, source: 'none', available, switchable: true };
}

/**
 * Take an untrusted stored selection and return a name or null.
 *
 * The same shape of guard the onboarding draft uses, for the same reason: a
 * file on disk is not a source of truth about what this process will accept.
 */
export function sanitiseSelection(candidate: unknown): string | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const value = (candidate as { target?: unknown }).target;
  if (typeof value !== 'string') return null;
  // The same shape `target:new` accepts, so a selection can only ever name
  // something that could be a target directory.
  return /^[a-z0-9][a-z0-9-]{0,60}$/.test(value) ? value : null;
}

/**
 * What the bar says when it cannot be changed, or null when it can.
 *
 * Two strings rather than one. The first version put the whole sentence in a
 * `title` attribute behind the word "fixed", which is invisible to a keyboard
 * and unreliable to a screen reader — and in the case where `TARGET` names
 * something absent, the bar then read "none selected · fixed", which explains
 * nothing at all to anybody who cannot hover.
 */
export function switchingRefusal(selection: Selection): { label: string; detail: string } | null {
  if (selection.switchable) return null;
  return selection.name
    ? {
        label: 'set by TARGET',
        detail: 'TARGET is set in the environment, so this dashboard cannot change it.',
      }
    : {
        label: 'TARGET not found',
        detail: 'TARGET names an application this repository does not have.',
      };
}
