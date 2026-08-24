import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  authorCases,
  buildCoverage,
  normaliseStory,
  quoteIsVerbatim,
  renderCoverage,
  storyContentHash,
  type CaseAuthorModel,
  type DraftedCase,
  type NormalisedStory,
} from '../../src/support/cases/author';
import {
  StoryValidationError,
  loadStories,
  parseStory,
  saveStory,
} from '../../src/support/cases/stories';
import { decidePublish, publishPayload } from '../../src/support/cases/publish';
import type { TestCase } from '../../src/support/cases/schema';

/**
 * §22 ranks this the sharpest risk in the draft: "An AI-authored case can
 * invent a requirement, and then it has authority."
 *
 * So the tests are written against invention, not against the happy path.
 */

const story: NormalisedStory = normaliseStory({
  key: 'FIN-2210',
  summary: 'Expense claims above the approval limit are rejected',
  description: 'A claim above a submitter approval limit must be refused with a clear message.',
  acceptanceCriteria: [
    'Claims over 10,000 are rejected',
    'The rejection message names the approval limit',
  ],
});

const wellFormedDraft: DraftedCase = {
  title: 'A claim over the limit is rejected',
  coversAC: ['AC-1'],
  acQuoted: 'Claims over 10,000 are rejected',
  preconditions: ['A submitter with an approval limit of 10,000'],
  steps: [{ action: 'Submit a claim for 15,000', expected: 'The claim is rejected' }],
  assertions: ['The claim status is "Rejected"'],
  priority: 'high',
  type: 'negative',
};

function modelReturning(drafts: DraftedCase[]): CaseAuthorModel {
  return { identity: 'test-model-1', draft: async () => drafts };
}

test.describe('the case author', () => {
  test('accepts a case that cites and quotes a real criterion', async () => {
    const result = await authorCases(story, modelReturning([wellFormedDraft]), 'demo');

    expect(result.accepted).toHaveLength(1);
    expect(result.speculative).toHaveLength(0);
    expect(result.accepted[0]!.source).toMatchObject({
      type: 'jira-story',
      key: 'FIN-2210',
      authoredBy: 'test-model-1',
    });
    // The hash of the story travels with the case, so drift is detectable.
    expect(result.accepted[0]!.source.contentHash).toBe(story.contentHash);
  });

  test('quarantines an invented requirement instead of publishing it', async () => {
    // The dangerous case: fluent, well-formatted, and about behaviour nobody
    // specified. Indistinguishable from a real case by inspection.
    const invented: DraftedCase = {
      ...wellFormedDraft,
      title: 'A claim over the limit notifies the submitter by SMS',
      coversAC: [],
      acQuoted: '',
    };

    const result = await authorCases(story, modelReturning([invented]), 'demo');

    expect(result.accepted).toHaveLength(0);
    expect(result.speculative).toHaveLength(1);
    expect(result.speculative[0]!.reason).toContain('cites no acceptance criterion');
    expect(result.speculative[0]!.case.speculative).toBe(true);
  });

  test('quarantines a case citing a criterion the story does not contain', async () => {
    const result = await authorCases(
      story,
      modelReturning([{ ...wellFormedDraft, coversAC: ['AC-9'] }]),
      'demo',
    );

    expect(result.speculative[0]!.reason).toContain('does not contain');
  });

  test('quarantines a paraphrase, because that is how a requirement changes meaning', async () => {
    const paraphrased: DraftedCase = {
      ...wellFormedDraft,
      acQuoted: 'Claims above ten thousand should usually be declined',
    };

    const result = await authorCases(story, modelReturning([paraphrased]), 'demo');

    expect(result.accepted).toHaveLength(0);
    expect(result.speculative[0]!.reason).toContain('verbatim');
  });

  test('a quote survives reflowed whitespace but not edited words', () => {
    expect(quoteIsVerbatim('Claims  over\n10,000 are rejected', story)).toBe(true);
    expect(quoteIsVerbatim('Claims over 10,000 are refused', story)).toBe(false);
    expect(quoteIsVerbatim('', story)).toBe(false);
  });

  test('reports criteria with no case behind them', async () => {
    const result = await authorCases(story, modelReturning([wellFormedDraft]), 'demo');

    expect(result.coverage.gaps).toEqual(['AC-2']);
    expect(renderCoverage(result.coverage)).toContain('GAP AC-2');
  });

  test('coverage counts a case against every criterion it cites', () => {
    const both: TestCase = {
      ...(wellFormedDraft as unknown as TestCase),
      coversAC: ['AC-1', 'AC-2'],
      title: 'Rejected with the limit named',
    };
    const matrix = buildCoverage(story, [both]);
    expect(matrix.gaps).toEqual([]);
  });
});

test.describe('publishing cases', () => {
  const publishable: TestCase = {
    id: null,
    target: 'demo',
    title: 'A claim over the limit is rejected',
    source: {
      type: 'jira-story',
      key: 'FIN-2210',
      contentHash: 'abc123',
      authoredBy: 'test-model-1',
    },
    coversAC: ['AC-1'],
    acQuoted: 'Claims over 10,000 are rejected',
    preconditions: ['A submitter with an approval limit of 10,000'],
    steps: [{ action: 'Submit a claim for 15,000', expected: 'The claim is rejected' }],
    assertions: ['The claim status is "Rejected"'],
    priority: 'high',
    type: 'negative',
  };

  const context = (existing: { id: string; lastEditedBy: string | null } | null) => ({
    serviceAccount: 'qa-automation',
    lookup: async () => existing,
  });

  test('creates a case that does not exist yet', async () => {
    const decision = await decidePublish(publishable, context(null));
    expect(decision.action).toBe('create');
  });

  test('updates its own case rather than creating a duplicate', async () => {
    // Publication has to be idempotent: A6 will be re-run, on an edited story,
    // after a partial failure, or by someone who forgot they already ran it.
    const decision = await decidePublish(
      publishable,
      context({ id: 'pt-1', lastEditedBy: 'qa-automation' }),
    );

    expect(decision.action).toBe('update');
    expect(decision.existingId).toBe('pt-1');
  });

  test('never touches a case a human has edited', async () => {
    const decision = await decidePublish(
      publishable,
      context({ id: 'pt-1', lastEditedBy: 'a.tester' }),
    );

    expect(decision.action).toBe('skip-human-owned');
    expect(decision.reason).toContain('a.tester');
  });

  test('never publishes a speculative case', async () => {
    const decision = await decidePublish({ ...publishable, speculative: true }, context(null));
    expect(decision.action).toBe('skip-speculative');
  });

  test('carries provenance so AI-authored cases stay countable', () => {
    const payload = publishPayload(publishable) as {
      'custom-fields': Record<string, string>;
      steps: unknown[];
    };

    expect(payload['custom-fields']).toMatchObject({
      source: 'ai-authored',
      authoredBy: 'test-model-1',
      storyKey: 'FIN-2210',
      contentHash: 'abc123',
    });
    expect(payload['custom-fields']['case-identity']).toBeTruthy();
    expect(payload.steps).toHaveLength(1);
  });

  test('a human-written case is marked as such', () => {
    const payload = publishPayload({
      ...publishable,
      source: { ...publishable.source, authoredBy: null },
    }) as { 'custom-fields': Record<string, string> };

    expect(payload['custom-fields'].source).toBe('human-authored');
  });
});


/**
 * Hop 1's hash, from both ends.
 *
 * There were two definitions of it. `tools/check-hashes.ts` declared its own
 * story shape with a `title` field, and a story file's field is `summary` —
 * so it hashed an empty title, could never reproduce a recorded `contentHash`,
 * and reported all ten cases in the repository as derived from stories that
 * had changed. It ran that way in CI, and no edit to any story or case could
 * have cleared it.
 *
 * A hash that disagrees looks exactly like drift, which is what the check
 * exists to report — so the failure was indistinguishable from success at
 * doing its job. That is why this is pinned from both sides rather than left
 * to one shared function being obviously shared.
 */
test.describe('the story hash', () => {
  const STORY = {
    key: 'FIN-2210',
    summary: 'Transfer money between two accounts',
    description: 'A customer moves funds and both balances settle.',
    acceptanceCriteria: [
      'The source account is debited by the amount transferred.',
      'The destination account is credited by the same amount.',
    ],
  };

  test('the authoring side and the checking side agree, through a real file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-'));
    try {
      const authored = normaliseStory(STORY);
      saveStory(authored, dir);

      const loaded = loadStories(dir);
      expect(loaded).toHaveLength(1);

      // What the checker recomputes, against what the author recorded.
      expect(loaded[0]!.contentHash).toBe(authored.contentHash);
      expect(storyContentHash(loaded[0]!)).toBe(authored.contentHash);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a story that has lost a hashed field is refused, not hashed as empty', () => {
    const { summary: _dropped, ...withoutSummary } = normaliseStory(STORY);

    // Defaulting the missing field to '' is precisely what hid the original
    // bug: it produced a confident hash for a story that cannot be hashed.
    expect(() => parseStory(JSON.stringify(withoutSummary), 'broken.json')).toThrow(
      StoryValidationError,
    );
    expect(() => parseStory(JSON.stringify(withoutSummary), 'broken.json')).toThrow(/summary/);
  });

  test('every committed story still verifies against its own recorded hash', () => {
    // Deliberately not asserting there are any: with no application onboarded
    // this repository has no stories, and a framework test that needs one
    // would be the suite coupling itself to whatever happens to be committed.
    for (const story of loadStories()) {
      expect(
        storyContentHash(story),
        `${story.key} no longer hashes to the value recorded in its own file`,
      ).toBe(story.contentHash);
    }
  });
});
