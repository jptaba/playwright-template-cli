import { targetOfSpec, type SpecFact } from './specs';

/**
 * Which application a story belongs to — item 73.
 *
 * **The problem.** `stories/` is a flat directory of `<KEY>.json`, and a story
 * file carries `key`, `summary`, `description`, `acceptanceCriteria` and a
 * content hash. **Nothing in it says which application it is about.** So "the
 * stories" has always meant "every story on disk", and with one application's
 * stories committed that is what every application was shown: the Stories page
 * offered *"Search the catalogue for a tool by name"* and *"Put a tool in the
 * cart"* with `orangehrm` selected in the bar.
 *
 * **This is the same defect `run-journey.ts` fixed, and the same fix.** Stage 2
 * of the journey took the first `stories/*.json` on disk and duly reported
 * *"story TOOL-1 pulled from Jira"* for whichever application asked — a
 * traceability claim satisfied by a different product's requirement. It was
 * fixed by asking the target's own specs which story they cite, because the
 * `jira` annotation is the only statement in this repository of which story a
 * spec is for. The dashboard was never given that fix; this is it.
 *
 * Deriving the link rather than storing it also means no migration and no new
 * field somebody has to remember to set: every spec that cites a story already
 * says so.
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
 * Three cases, and the middle one is why this is not simply "cited by this
 * target":
 *
 * - **Cited by this application** — its own requirement. Show it.
 * - **Cited by nobody** — unclaimed. Show it. This is the story somebody has
 *   just pulled from Jira and has not written a spec against yet, which is
 *   precisely the workflow the page exists for. Hiding it would fix the
 *   reported defect and break the feature.
 * - **Cited only by other applications** — somebody else's requirement. Hide
 *   it. This is the whole finding.
 *
 * With nothing selected, everything is shown: the page is then not making a
 * claim about any application, and a list that emptied itself would say the
 * repository has no stories.
 */
export function storyVisibleTo(
  key: string,
  target: string | null,
  claims: ReadonlyMap<string, string[]>,
): boolean {
  if (!target) return true;
  const claimedBy = claims.get(key);
  if (!claimedBy || claimedBy.length === 0) return true;
  return claimedBy.includes(target);
}

/** The subset of `stories` this application should see, in the order given. */
export function storiesVisibleTo<T extends { key: string }>(
  stories: readonly T[],
  target: string | null,
  claims: ReadonlyMap<string, string[]>,
): T[] {
  return stories.filter((story) => storyVisibleTo(story.key, target, claims));
}
