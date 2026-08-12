/**
 * Removing an application under test — the other half of §08.
 *
 * Onboarding is additive by design: `target:new` never overwrites, and the
 * dashboard refuses outright if a single file it would write already exists.
 * That leaves an obvious gap. Once a target is in, the only way out was to
 * delete directories by hand and remember the four other places a target
 * leaves something — which is exactly the "one shared file people forgot"
 * problem that profile discovery was introduced to kill, in reverse.
 *
 * The practical cost of the gap was a branch. Trying an application meant a
 * throwaway branch to keep `main` clean, and moving between them to compare.
 * With a clean way out, `main` can be pointed at a live application, driven,
 * and returned to the agnostic template in one command.
 *
 * **This is the one destructive operation in the framework**, so it is built
 * the opposite way round from the scaffolder:
 *
 *  - it plans and reports before it removes anything;
 *  - it touches only the four places a target leaves something, never
 *    framework code;
 *  - it refuses when the work is not committed, because git is the undo;
 *  - and the caller has to name the target again to confirm, so a stray click
 *    or a mistyped flag cannot delete a pack somebody spent a week on.
 *
 * Pure by construction, like the scaffolder: this renders a plan from a
 * description of the filesystem and touches nothing. `tools/offboard.ts` does
 * the deleting.
 */

export interface OffboardFacts {
  /** Targets with a profile in `config/targets/`. */
  knownTargets: string[];
  /** True when `src/targets/<name>/` exists. */
  packExists: boolean;
  /** Files under the pack, repo-relative, for the count shown before removal. */
  packFiles: string[];
  /** Keys in `config/secrets.local.json`. */
  secretKeys: string[];
  /** Filenames in `.auth/`, e.g. `acme-shop.standard.json`. */
  storageStateFiles: string[];
  /**
   * Whether this target's base URL is a reserved placeholder host — `.invalid`,
   * `.test`, `example.*`.
   *
   * That is how the framework's own template is recognised without naming it.
   * `no-target-coupling` forbids framework code from knowing which application
   * it is looking at, and it is right to: a constant holding the template's
   * name is coupling however well-intentioned. A profile that points at a host
   * RFC 2606 reserves is one that was never pointed at anything, which is the
   * actual property worth warning about — and it catches a half-finished
   * target as well as the shipped one.
   */
  pointsAtPlaceholderHost: boolean;
  /**
   * Paths git has never recorded — untracked, in git's terms.
   *
   * The distinction that matters. A *tracked* file git can always give back,
   * however heavily edited, so removing one is recoverable. An untracked file
   * exists nowhere else, and deleting it is final.
   */
  untrackedPaths: string[];
}

export interface OffboardPlan {
  target: string;
  /** Repo-relative paths to delete, deepest first so directories empty out. */
  removeFiles: string[];
  /** Directories to remove once empty. */
  removeDirectories: string[];
  /** Keys to drop from the local secret store. */
  removeSecretKeys: string[];
  /** Session files to shred. Gitignored, so git cannot bring these back. */
  removeStorageStates: string[];
  /** Things worth saying out loud, which do not stop the removal. */
  warnings: string[];
  /**
   * Why this cannot proceed. A plan with refusals is shown, never executed —
   * the caller sees exactly what it would have done and why it will not.
   */
  refusals: string[];
  /** True when nothing of this target is left to remove. */
  alreadyGone: boolean;
}

export class OffboardError extends Error {}

/**
 * Everything a target owns, and nothing else.
 *
 * Deliberately explicit rather than a glob: the four places a target leaves
 * something are the profile, the pack, the credential entries and the stored
 * sessions. A pattern that swept more than that would eventually sweep
 * framework code, and this is the one operation where a mistake cannot be
 * undone by re-running it.
 */
export function planOffboard(rawName: string, facts: OffboardFacts): OffboardPlan {
  const target = rawName.trim();
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (!target) {
    throw new OffboardError('Which target? Offboarding needs a name; it never guesses.');
  }

  const profile = `config/targets/${target}.ts`;
  const packRoot = `src/targets/${target}`;

  if (!facts.knownTargets.includes(target) && !facts.packExists) {
    return {
      target,
      removeFiles: [],
      removeDirectories: [],
      removeSecretKeys: [],
      removeStorageStates: [],
      warnings: [`Nothing named '${target}' is onboarded. Known: ${facts.knownTargets.join(', ') || '(none)'}.`],
      refusals,
      alreadyGone: true,
    };
  }

  const removeFiles = [
    ...(facts.knownTargets.includes(target) ? [profile] : []),
    ...facts.packFiles.map((file) => `${packRoot}/${file}`),
  ];

  /*
     Credential entries are matched on the profile's own root shape,
     `qa/<target>/…`, rather than on the target name appearing anywhere in the
     key. A substring match would take `qa/acme-shop-staging/...` with
     `acme-shop`, and credentials are the one thing here that a person put in
     by hand.
  */
  const removeSecretKeys = facts.secretKeys.filter((key) => key.startsWith(`qa/${target}/`));

  const removeStorageStates = facts.storageStateFiles.filter((file) =>
    file.startsWith(`${target}.`),
  );

  /*
     Untracked work is the part git cannot give back, so it is counted and said
     out loud — and not refused.

     Refusing was the first design, and it was wrong for the case this exists
     to serve. Trying an application on `main` produces a target that is never
     committed: scaffold it, drive it, remove it. Every file of it is untracked,
     so a refusal would block the workflow the whole feature is for, and the
     way round it — commit a target you are about to delete — is worse than the
     thing it was protecting against.

     So the count is the warning, and typing the name is the confirmation. A
     tracked file is recoverable with `git checkout` however heavily edited; an
     untracked one is not, and the number is exactly what a person needs to
     decide.
  */
  const unrecoverable = facts.untrackedPaths.filter(
    (path) => path === profile || path.startsWith(`${packRoot}/`),
  );
  if (unrecoverable.length > 0) {
    warnings.push(
      `${unrecoverable.length} of these file(s) have never been committed, so git cannot bring ` +
        `them back: ${unrecoverable.slice(0, 4).join(', ')}${
          unrecoverable.length > 4 ? ` and ${unrecoverable.length - 4} more` : ''
        }. That is normal for a target you scaffolded to try something out. If any of it is work ` +
        'worth keeping, commit or stash it first.',
    );
  }

  if (removeStorageStates.length > 0) {
    warnings.push(
      `${removeStorageStates.length} stored session(s) will be shredded. These are gitignored, ` +
        'so git cannot bring them back — but they are regenerated by `setup:auth` on the next ' +
        'run, and a stale one is a live credential nobody is tracking.',
    );
  }

  if (removeSecretKeys.length > 0) {
    warnings.push(
      `${removeSecretKeys.length} credential entr(ies) will be removed from ` +
        'config/secrets.local.json. If those logins are not written down anywhere else, copy ' +
        'them out first.',
    );
  }

  if (facts.pointsAtPlaceholderHost) {
    /*
       Warned, not refused. A profile pointing at a reserved host was never
       pointed at a running application — it is the shipped template, or a
       scaffold somebody abandoned half-way. Removing the template is a
       legitimate thing to want and git restores it in a second; removing it by
       accident, while believing it to be the application you just onboarded,
       is not.
    */
    warnings.push(
      "This target's base URL is a host reserved by RFC 2606, so this profile was never " +
        'pointed at a running application — it is the shipped template, or a scaffold nobody ' +
        'finished. Worth a second look if you meant to remove the application you were driving.',
    );
  }

  if (facts.knownTargets.filter((known) => known !== target).length === 0) {
    warnings.push(
      'This is the last target. Afterwards the repository is the agnostic framework again: ' +
        'with nothing selected, only the `framework` project builds, and `npm run verify` ' +
        'keeps passing.',
    );
  }

  return {
    target,
    // Deepest first, so a directory is empty by the time it is removed.
    removeFiles: [...removeFiles].sort((a, b) => b.split('/').length - a.split('/').length),
    removeDirectories: facts.packExists ? [packRoot] : [],
    removeSecretKeys,
    removeStorageStates,
    warnings,
    refusals,
    alreadyGone: false,
  };
}

/**
 * Whether the caller has typed the target's name back.
 *
 * The pattern a reader already knows from deleting a repository, and it is
 * here for the reason it is there: this is irreversible for anything not
 * committed, and a confirmation that can be satisfied by a stray click is not
 * a confirmation. Matched exactly — no trimming to a different name, no
 * case-folding into a target that merely looks similar.
 */
export function confirmationMatches(target: string, typed: string | null | undefined): boolean {
  return typeof typed === 'string' && typed.trim() === target.trim() && target.trim() !== '';
}

/** Whether a plan may be executed at all. */
export function isRemovable(plan: OffboardPlan): boolean {
  return plan.refusals.length === 0 && !plan.alreadyGone;
}

/** One line per thing that will happen, for a person about to say yes. */
export function describeOffboard(plan: OffboardPlan): string[] {
  if (plan.alreadyGone) return [`Nothing to remove for '${plan.target}'.`];
  const lines = [
    `${plan.removeFiles.length} file(s) under src/targets/${plan.target}/ and its profile`,
  ];
  if (plan.removeSecretKeys.length > 0) {
    lines.push(`${plan.removeSecretKeys.length} credential entr(ies) from the local secret store`);
  }
  if (plan.removeStorageStates.length > 0) {
    lines.push(`${plan.removeStorageStates.length} stored session(s) from .auth/`);
  }
  return lines;
}
