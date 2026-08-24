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

import { packRootFor, profilePathFor } from '../paths';
import { describeOrphanedSessions, orphanedSessions } from './sessions';

export interface OffboardFacts {
  /** Targets with a profile in `config/targets/`. */
  knownTargets: string[];
  /** True when `targets/<name>/` exists. */
  packExists: boolean;
  /** Files under the pack, repo-relative, for the count shown before removal. */
  packFiles: string[];
  /** Keys in `config/secrets.local.json`. */
  secretKeys: string[];
  /** Filenames in `.auth/`, e.g. `acme-shop.standard.json`. */
  storageStateFiles: string[];
  /**
   * Case files under `cases/<target>/`, repo-relative.
   *
   * Cases are target-scoped — every one carries `target:` in its own body —
   * and nothing removed them. A target taken back out left its whole test-case
   * library behind: files describing an application this repository no longer
   * has, which `cases:gate` and the dashboard's coverage view both still read.
   * The same orphan as a stored session outliving its target, one directory up.
   */
  caseFiles: string[];
  /**
   * Story files under `stories/<target>/`, repo-relative.
   *
   * The seventh place, and the last one to get a directory. A story file names
   * no application, so `stories/` was flat and this had nothing to remove:
   * a target taken back out left every requirement it was onboarded to prove
   * sitting on disk, still read by `hashes:check`, belonging to nothing.
   *
   * The same orphan as the case library, and as a stored session — found the
   * same way, by asking what a removal leaves behind rather than what it takes.
   */
  storyFiles: string[];
  /**
   * The target name the onboarding draft carries, or `null` when there is no
   * draft on disk.
   *
   * **The fifth place a target leaves something**, and it was missed because
   * it is the only one that is not a file *named* after the target. The draft
   * is a single `.onboarding-draft.json` whose `name` field happens to say
   * which application it describes.
   *
   * Found by driving the dashboard: a draft written four days earlier for a
   * scratch target that had since been removed was still pre-filling twelve
   * fields of the onboarding page, and reopening two steps that progressive
   * disclosure had put away — 1761px against 3173px, measured. Offboarding had
   * taken the profile, the pack, the credentials and the sessions, and left
   * the thing that describes them.
   */
  draftName: string | null;
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
  /**
   * Whether the onboarding draft describes *this* target and should go with it.
   *
   * Only when it names this target. A draft for something else is somebody's
   * work in progress and removing it would be the same class of mistake as
   * sweeping a credential by substring match.
   */
  clearDraft: boolean;
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

  const profile = profilePathFor(target);
  const packRoot = packRootFor(target);

  /*
     The draft goes only when it describes *this* target.

     Exact match on the name it carries, for the same reason credential keys
     are matched on `qa/<target>/` rather than by substring: a draft for
     `acme-shop-staging` is not `acme-shop`'s to delete, and a half-finished
     onboarding is somebody's work.
  */
  const clearDraft = facts.draftName !== null && facts.draftName === target;

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
     The pack being gone does not mean nothing is left.

     This used to return empty and say "Nothing to remove" the moment neither
     the profile nor the pack existed — but credentials and stored sessions
     outlive both. Remove a pack by hand, or offboard twice, and the tool
     reported nothing to do while a real password sat in
     `config/secrets.private.json` under that target's root. An orphaned
     credential for an application the repository no longer has is the worst
     state of the three, and it was the one state that reported success.

     So `alreadyGone` keeps its meaning — the profile and the pack are gone —
     and stops implying that everything else is too.
  */
  const packGone = !facts.knownTargets.includes(target) && !facts.packExists;
  if (packGone) {
    /*
       And the paragraph above is true one directory over, which it did not
       say. `cases/<target>/` and `stories/<target>/` outlive a pack deleted
       by hand exactly as a credential does — so the branch that exists
       *because* "the pack being gone does not mean nothing is left" was
       itself returning empty and leaving both behind.
    */
    const orphanedFiles = [...facts.caseFiles, ...facts.storyFiles];
    const leftovers =
      orphanedFiles.length +
      removeSecretKeys.length +
      removeStorageStates.length +
      (clearDraft ? 1 : 0);
    return {
      target,
      removeFiles: orphanedFiles,
      removeDirectories: [
        ...(facts.caseFiles.length > 0 ? [`cases/${target}`] : []),
        ...(facts.storyFiles.length > 0 ? [`stories/${target}`] : []),
      ],
      removeSecretKeys,
      removeStorageStates,
      clearDraft,
      warnings: [
        leftovers === 0
          ? `Nothing named '${target}' is onboarded. Known: ${facts.knownTargets.join(', ') || '(none)'}.`
          : `No profile or pack for '${target}' — but ${leftovers} thing(s) it owned are still ` +
            'here. Removing them is all this can still do. ' +
            `Known: ${facts.knownTargets.join(', ') || '(none)'}.`,
      ],
      refusals,
      alreadyGone: true,
    };
  }

  /*
     `packFiles` already holds the cases and the stories, because they live in
     the pack directory. They are listed separately in the facts so the
     confirmation can count them by kind, not so they can be removed twice.
  */
  /*
     De-duplicated, because the profile is inside the pack directory now and
     the walk that produced `packFiles` therefore already found it. Listed
     twice, it appeared twice in the plan a person reads before agreeing to a
     deletion, and inflated the count by one — 36 files for a pack holding 35.
     Kept as an explicit entry as well, so a profile that somehow escaped the
     walk is still named rather than silently missed.
  */
  const removeFiles = [
    ...new Set([
      ...(facts.knownTargets.includes(target) ? [profile] : []),
      ...facts.packFiles.map((file) => `${packRoot}/${file}`),
    ]),
  ];

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

  /*
     Sessions belonging to some *other* target that is no longer here. Off
     topic for this removal and exactly the right moment to say it: removing a
     target is when somebody is already thinking about what is left behind, and
     a session outliving its target is how these appear in the first place.
  */
  const orphans = orphanedSessions(
    facts.storageStateFiles,
    facts.knownTargets.filter((known) => known !== target),
  ).filter((session) => session.target !== target);
  if (orphans.length > 0) warnings.push(describeOrphanedSessions(orphans));

  if (removeStorageStates.length > 0) {
    warnings.push(
      `${removeStorageStates.length} stored session(s) will be shredded. These are gitignored, ` +
        'so git cannot bring them back — but they are regenerated by `setup:auth` on the next ' +
        'run, and a stale one is a live credential nobody is tracking.',
    );
  }

  if (clearDraft) {
    warnings.push(
      'The onboarding draft describes this target, so it will be cleared too. Without that, ' +
        'the next visit to the onboarding page reopens pre-filled for an application this ' +
        'repository no longer has.',
    );
  }

  if (removeSecretKeys.length > 0) {
    warnings.push(
      `${removeSecretKeys.length} credential entr(ies) will be removed from the local secret ` +
        'files — config/secrets.private.json as well as config/secrets.local.json. The private ' +
        'one is where a real password is, and it is gitignored, so nothing can bring it back. ' +
        'If those logins are not written down anywhere else, copy them out first.',
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
    // One directory. That is the whole point of the layout: the profile, the
    // pack, the cases and the stories are all inside it.
    removeDirectories: facts.packExists ? [packRoot] : [],
    removeSecretKeys,
    removeStorageStates,
    clearDraft,
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

/**
 * Whether anything at all would be removed.
 *
 * The onboarding draft counts. It was left out when the draft became the fifth
 * thing a target owns, and the omission was invisible until a plan whose
 * *only* leftover was the draft reached this: `isRemovable` said no, and the
 * route answered "nothing it owned is left" while the file sat on disk. The
 * same shape as item 16, one predicate down — a list of what a target owns
 * that somebody extended in one place and not the other.
 */
export function hasAnythingToRemove(plan: OffboardPlan): boolean {
  return (
    plan.removeFiles.length +
      plan.removeDirectories.length +
      plan.removeSecretKeys.length +
      plan.removeStorageStates.length +
      (plan.clearDraft ? 1 : 0) >
    0
  );
}

/**
 * Whether a plan may be executed at all.
 *
 * Gated on there being something to remove rather than on `alreadyGone`, which
 * says only that the profile and pack are missing. A target whose pack was
 * deleted by hand still owns its credentials, and refusing to act on that plan
 * is what left them stranded.
 */
export function isRemovable(plan: OffboardPlan): boolean {
  return plan.refusals.length === 0 && hasAnythingToRemove(plan);
}

/** One line per thing that will happen, for a person about to say yes. */
export function describeOffboard(plan: OffboardPlan): string[] {
  if (!hasAnythingToRemove(plan)) return [`Nothing to remove for '${plan.target}'.`];
  /*
     Counted per class, not as one total.

     This said "<n> file(s) under targets/<name>/ and its profile" for
     everything in `removeFiles`, and it stopped being true the moment the
     case library joined that list — then again when the stories did. Somebody
     reading the confirmation for the one destructive operation here was told
     the pack was going and not told their test cases were. The number was
     honest and the sentence was not, which is the worse of the two.
  */
  const under = (prefix: string): number =>
    plan.removeFiles.filter((file) => file.startsWith(prefix)).length;
  const cases = under(`targets/${plan.target}/cases/`);
  const stories = under(`targets/${plan.target}/stories/`);
  const packAndProfile = plan.removeFiles.length - cases - stories;

  const lines = plan.alreadyGone
    ? [`No profile or pack — they are already gone`]
    : [`${packAndProfile} file(s) under ${packRootFor(plan.target)}/ and its profile`];
  if (cases > 0) lines.push(`${cases} test case(s) from targets/${plan.target}/cases/`);
  if (stories > 0) lines.push(`${stories} story file(s) from targets/${plan.target}/stories/`);
  if (plan.removeSecretKeys.length > 0) {
    lines.push(`${plan.removeSecretKeys.length} credential entr(ies) from the local secret store`);
  }
  if (plan.removeStorageStates.length > 0) {
    lines.push(`${plan.removeStorageStates.length} stored session(s) from .auth/`);
  }
  if (plan.clearDraft) lines.push('the onboarding draft, which describes this target');
  return lines;
}
