import { expect, test } from '@playwright/test';
import { casesFor, readableTitle, storiesFor, storyFields } from '../../src/support/cases/seed';
import type { SpecFact } from '../../src/support/cases/specs';

/**
 * What the fake services hold, derived from the suite — items 46 and 48.
 *
 * `tools/fake-services.ts` carried one application's ids as constants, so
 * `npm run app:journey` traced green for `restful-booker` and reported
 * "nothing traced" for the other four. Four of five suites could not complete
 * the journey this repository exists to demonstrate, because of a literal in
 * a tool.
 */
function spec(overrides: Partial<SpecFact> = {}): SpecFact {
  return {
    file: 'src/targets/demo/tests/e2e/thing.spec.ts',
    title: 'DEMO-1-01 · A shopper can sign in @smoke @auth',
    caseId: null,
    casePath: null,
    caseHash: null,
    jiraKey: null,
    groundTruth: null,
    ...overrides,
  };
}

test.describe('turning a spec title into something a person reads', () => {
  test('drops the tags and the case reference, keeps the sentence', () => {
    expect(readableTitle('DEMO-1-01 · A shopper can sign in @smoke @auth')).toBe(
      'A shopper can sign in',
    );
  });

  test('leaves a title that carries neither alone', () => {
    expect(readableTitle('A room a manager creates appears in the list')).toBe(
      'A room a manager creates appears in the list',
    );
  });
});

test.describe('cases', () => {
  test('one per spec that names a case, keyed by the id the spec claims', () => {
    // The ids come from the specs rather than a list here, so a newly
    // onboarded application is seeded with no change to the framework.
    const cases = casesFor([
      spec({ caseId: 'DEMO-1-01' }),
      spec({ caseId: 'DEMO-1-02', title: 'DEMO-1-02 · A wrong password is refused @negative' }),
    ]);

    expect(cases).toEqual([
      { id: 'DEMO-1-01', name: 'A shopper can sign in' },
      { id: 'DEMO-1-02', name: 'A wrong password is refused' },
    ]);
  });

  test('a ground-truth spec carries its category into the case name', () => {
    /*
       The owner's instruction, kept: the failures are stated in the cases
       rather than invented in a pack, so reading the seed tells you what the
       measurement expects without opening a spec.
    */
    const [seeded] = casesFor([
      spec({
        caseId: 'TF-DEMO-01',
        title: 'TF-DEMO-01 · A control that is not on the page',
        groundTruth: 'locator-drift',
      }),
    ]);

    expect(seeded?.name).toBe('A control that is not on the page → locator-drift');
  });

  test('a spec with no case id seeds nothing', () => {
    expect(casesFor([spec()])).toEqual([]);
  });

  test('two specs citing one case seed it once', () => {
    // A case can legitimately be implemented by more than one spec; seeding
    // it twice would make the count a lie.
    expect(casesFor([spec({ caseId: 'DEMO-1-01' }), spec({ caseId: 'DEMO-1-01' })])).toHaveLength(1);
  });
});

test.describe('stories', () => {
  test('one per jira key, with the specs citing it as its criteria', () => {
    const stories = storiesFor([
      spec({ jiraKey: 'DEMO-1', title: 'DEMO-1-01 · A shopper can sign in @smoke' }),
      spec({ jiraKey: 'DEMO-1', title: 'DEMO-1-02 · A wrong password is refused @negative' }),
      spec({ jiraKey: 'DEMO-2', title: 'DEMO-2-01 · The cart totals its lines @smoke' }),
    ]);

    expect(stories.map((story) => story.key)).toEqual(['DEMO-1', 'DEMO-2']);
    expect(stories[0]?.criteria).toEqual([
      'A shopper can sign in',
      'A wrong password is refused',
    ]);
  });

  test('the acceptance-criteria heading is present, because pull-story requires it', () => {
    // `pull-story` refuses a story without the heading rather than guessing,
    // which is the rule this seed exists to exercise.
    const [story] = storiesFor([spec({ jiraKey: 'DEMO-1' })]);
    const fields = storyFields(story!);

    expect(String(fields.description)).toContain('Acceptance Criteria');
    expect(String(fields.description)).toContain('* A shopper can sign in');
  });

  test('a spec citing no story seeds none', () => {
    expect(storiesFor([spec()])).toEqual([]);
  });
});
