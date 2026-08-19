/**
 * The six stages of running an application end to end.
 *
 * **The definition, made executable rather than remembered.** "Run it end to
 * end" had come to mean "run the suite", which is one stage of six — and the
 * five it skipped are the ones nobody notices are missing, because a green
 * suite looks like a finished job.
 *
 * Pure: stages in, a report out. `tools/run-journey.ts` does the spawning.
 */

export type StageName =
  | 'onboarding'
  | 'stories-or-cases'
  | 'coverage'
  | 'run'
  | 'triage'
  | 'publish';

export type StageState =
  /** Did what it claims. */
  | 'done'
  /** Ran, and the application or the configuration said no. */
  | 'failed'
  /** Could not run — usually a service this machine has no address for. */
  | 'skipped';

export interface StageResult {
  stage: StageName;
  state: StageState;
  /** One line a person can act on. Never a stack trace. */
  detail: string;
}

/** The stages, in the order they have to happen, with what each one proves. */
export const STAGES: Array<{ stage: StageName; proves: string }> = [
  { stage: 'onboarding', proves: 'the pack exists and a credential can actually sign in' },
  { stage: 'stories-or-cases', proves: 'the suite is traceable to something a person asked for' },
  { stage: 'coverage', proves: 'all five kinds of coverage are present' },
  { stage: 'run', proves: 'the suite executes against the real deployment' },
  { stage: 'triage', proves: 'a real failure is clustered and classified' },
  { stage: 'publish', proves: 'results reach PractiTest, and the report reaches Teams and email' },
];

/** The five kinds every application is held to. Tags, because that is how they are found. */
export const COVERAGE_KINDS = [
  { kind: 'happy path', tag: '@smoke' },
  { kind: 'negative', tag: '@negative' },
  { kind: 'idempotency', tag: '@idempotency' },
  { kind: 'audit', tag: '@audit' },
  { kind: 'boundary', tag: '@boundary' },
] as const;

/**
 * Which coverage kinds a pack's spec sources carry.
 *
 * Read from the tags rather than from filenames or a checklist: the tag is
 * what the suite itself selects on, so this cannot drift from what actually
 * runs. A kind claimed in a directory name and missing from every title would
 * pass a filename check and fail here, which is the right way round.
 */
export function coveragePresent(specSources: string[]): Array<{ kind: string; tag: string; present: boolean }> {
  const all = specSources.join('\n');
  return COVERAGE_KINDS.map(({ kind, tag }) => ({ kind, tag, present: all.includes(tag) }));
}

/**
 * Whether the journey can be called complete.
 *
 * **A skipped stage is not a pass.** The whole reason this exists is that "run
 * it end to end" quietly meant "run the suite", so a report that treats an
 * unreachable PractiTest as fine would reintroduce exactly that. Skipped
 * stages are listed by name and the journey is reported incomplete.
 */
export function journeyComplete(results: readonly StageResult[]): boolean {
  return results.length === STAGES.length && results.every((result) => result.state === 'done');
}

export function formatJourney(target: string, results: readonly StageResult[]): string[] {
  const symbol = { done: '✓', failed: '✗', skipped: '·' };
  const lines = [`\nEnd-to-end journey — ${target}`, '─'.repeat(24 + target.length)];

  for (const { stage, proves } of STAGES) {
    const result = results.find((entry) => entry.stage === stage);
    if (!result) {
      lines.push(`  · ${stage.padEnd(18)} not reached — ${proves}`);
      continue;
    }
    lines.push(`  ${symbol[result.state]} ${stage.padEnd(18)} ${result.detail}`);
  }

  const failed = results.filter((result) => result.state === 'failed');
  const skipped = results.filter((result) => result.state === 'skipped');
  lines.push('');

  if (journeyComplete(results)) {
    lines.push('  All six stages completed.');
    return lines;
  }

  lines.push(
    `  Incomplete: ${failed.length} failed, ${skipped.length} skipped, ` +
      `${STAGES.length - results.length} not reached.`,
  );
  if (skipped.length > 0) {
    lines.push(
      `  Skipped is not passed — ${skipped.map((result) => result.stage).join(', ')}. ` +
        '`npm run fakes:serve` stands up every service this needs.',
    );
  }
  return lines;
}
