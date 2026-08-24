import { targetOfSpec, type SpecFact } from './specs';

/**
 * Which application a story belongs to — item 73.
 *
 * **The problem.** A story file carries `key`, `summary`, `description`,
 * `acceptanceCriteria` and a content hash. **Nothing in it says which
 * application it is about.** With `stories/` flat, "the stories" therefore
 * meant "every story on disk", and with one application's stories committed
 * that is what every application was shown: the Stories page offered *"Search
 * the catalogue for a tool by name"* and *"Put a tool in the cart"* with
 * `orangehrm` selected in the bar.
 *
 * That was first fixed by deriving the link — asking the target's own specs
 * which story they cite, because the `jira` annotation is the only statement
 * in this repository of which story a spec is for. Deriving needed no
 * migration and no new field, which is why it was the right first move.
 *
 * **It could not answer for a story nobody had written a spec against yet**,
 * and that story is the whole point of the page. So the rule was "cited by
 * nobody → show it to everyone", which is the original defect narrowed rather
 * than closed: a freshly pulled story still appeared under every application.
 * Nothing on disk could say otherwise, and `target:remove` had nothing to
 * remove.
 *
 * So stories are now scoped by directory too — `stories/<app>/<KEY>.json` —
 * and the two facts answer different questions:
 *
 * - **The directory** says which application a story was pulled *for*. It is
 *   true the moment the story lands, before any spec exists.
 * - **The citations** say which suites actually *prove* it. A requirement two
 *   applications both cover is a real state, not an error, and one directory
 *   cannot express it.
 *
 * A story is shown to an application when either says so. That is one rule
 * with two inputs, and it is strictly narrower than what it replaced: nothing
 * is now visible to an application that neither owns it nor cites it.
 */

/**
 * Story key → the applications whose specs cite it.
 *
 * A key cited by more than one application is a real state rather than an
 * error — two suites may prove parts of one requirement — so this is a list
 * and not a single owner.
 */
export function storyClaims(specs: readonly SpecFact[]): Map<string, string[]> {
  const claims = new Map<string, string[]>();
  for (const spec of specs) {
    if (!spec.jiraKey) continue;
    const target = targetOfSpec(spec.file);
    if (!target) continue;
    const existing = claims.get(spec.jiraKey) ?? [];
    if (!existing.includes(target)) existing.push(target);
    claims.set(spec.jiraKey, existing);
  }
  return claims;
}

/**
 * Whether a story should be shown while `target` is selected.
 *
 * - **In this application's directory** — pulled for it. Show it, spec or no
 *   spec. This is the story somebody has just read out of Jira, which is
 *   precisely the workflow the page exists for.
 * - **Cited by this application's specs** — it proves that requirement, even
 *   though the file was pulled under another application. Show it.
 * - **Neither** — somebody else's requirement. Hide it.
 *
 * With nothing selected, everything is shown: the page is then not making a
 * claim about any application, and a list that emptied itself would say the
 * repository has no stories.
 */
export function storyVisibleTo(
  key: string,
  ownedBy: string,
  target: string | null,
  claims: ReadonlyMap<string, string[]>,
): boolean {
  if (!target) return true;
  if (ownedBy === target) return true;
  return (claims.get(key) ?? []).includes(target);
}

/** The subset of `stories` this application should see, in the order given. */
export function storiesVisibleTo<T extends { target: string; story: { key: string } }>(
  stories: readonly T[],
  target: string | null,
  claims: ReadonlyMap<string, string[]>,
): T[] {
  return stories.filter((owned) =>
    storyVisibleTo(owned.story.key, owned.target, target, claims),
  );
}
