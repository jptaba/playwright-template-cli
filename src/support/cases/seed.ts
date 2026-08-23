import type { SpecFact } from './specs';

/**
 * What the fake services should hold, derived from the suite on disk — items
 * 46 and 48.
 *
 * **The seed used to be a constant naming one application's ids.**
 * `tools/fake-services.ts` carried `TF-RB-01…04` and three `RB-*` stories, so
 * `npm run app:journey` reached its traceability stage green for
 * `restful-booker` and reported *"nothing traced"* for every other
 * application. Four of five suites could not complete the journey this
 * repository exists to demonstrate, and the reason was a literal in a tool.
 *
 * It is derived now, from the annotations the specs already carry — the same
 * ones `triage:measure` scores and `publish:practitest` pushes against. So a
 * newly onboarded application is seeded by the same command with no framework
 * change, which is the property that made `triage-ground-truth` an annotation
 * rather than an export in the first place.
 *
 * **This is a fake standing in for somebody's Jira, and deriving a story from
 * the specs is backwards on purpose.** In real life the story comes first and
 * the specs implement it; here there is no real Jira, and the choice is
 * between a story derived from what the suite claims and a story invented for
 * one application. The derived one at least cannot describe work nobody did.
 */

export interface SeededCase {
  id: string;
  name: string;
}

export interface SeededStory {
  key: string;
  summary: string;
  /** One per spec citing the story — what the suite claims it proves. */
  criteria: string[];
}

/** Tags and the case reference are noise in a sentence a person reads. */
export function readableTitle(title: string): string {
  return title
    .replace(/@[\w-]+/g, '')
    .replace(/^\s*[\w-]+\s+·\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A case per spec that names one.
 *
 * A ground-truth spec's category is put in the case name, because that is
 * where the deliberate failures were stated before this was derived and it is
 * genuinely useful there: reading the seed tells you what the measurement
 * expects without opening a spec.
 */
export function casesFor(specs: SpecFact[]): SeededCase[] {
  const byId = new Map<string, SeededCase>();
  for (const spec of specs) {
    if (!spec.caseId) continue;
    const title = readableTitle(spec.title) || spec.caseId;
    byId.set(spec.caseId, {
      id: spec.caseId,
      name: spec.groundTruth ? `${title} → ${spec.groundTruth}` : title,
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * A story per distinct `jira` key, with the specs citing it as its acceptance
 * criteria.
 *
 * The **Acceptance Criteria** heading is load-bearing: `pull-story` looks for
 * it and refuses a story without one rather than guessing, which is the rule
 * this seed exists to exercise.
 */
export function storiesFor(specs: SpecFact[]): SeededStory[] {
  const byKey = new Map<string, SeededStory>();
  for (const spec of specs) {
    if (!spec.jiraKey) continue;
    const story = byKey.get(spec.jiraKey) ?? {
      key: spec.jiraKey,
      summary: `What ${spec.jiraKey} is meant to do`,
      criteria: [],
    };
    const criterion = readableTitle(spec.title);
    if (criterion && !story.criteria.includes(criterion)) story.criteria.push(criterion);
    byKey.set(spec.jiraKey, story);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The Jira issue body `pull-story` expects, from a derived story. */
export function storyFields(story: SeededStory): Record<string, unknown> {
  return {
    summary: story.summary,
    description: [
      `The specs citing ${story.key}, as the criteria they claim to prove.`,
      '',
      'Acceptance Criteria',
      ...story.criteria.map((criterion) => `* ${criterion}`),
    ].join('\n'),
    status: { name: 'In Progress' },
    issuetype: { name: 'Story' },
  };
}
