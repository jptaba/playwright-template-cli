import { expect, test } from '@playwright/test';
import { storiesVisibleTo, storyClaims, storyVisibleTo } from '../../src/support/cases/story-scope';
import type { SpecFact } from '../../src/support/cases/specs';

/**
 * Which application a story belongs to — item 73.
 *
 * `stories/` is flat and a story file names no application, so "the stories"
 * meant "every story on disk". With one application's stories committed, every
 * application was shown them: the page offered *"Search the catalogue for a
 * tool by name"* and *"Put a tool in the cart"* with `orangehrm` in the bar.
 *
 * The link already exists in every spec that cites a story. This is the same
 * fix `run-journey.ts` was given when its stage 2 reported *"story TOOL-1
 * pulled from Jira"* for whichever application asked.
 */
function spec(file: string, jiraKey: string | null): SpecFact {
  return {
    file,
    title: 'a spec',
    caseId: null,
    casePath: null,
    caseHash: null,
    jiraKey,
    groundTruth: null,
  };
}

test.describe('who cites a story', () => {
  test('a story is claimed by the application whose specs cite it', () => {
    const claims = storyClaims([
      spec('src/targets/toolshop/tests/e2e/search.spec.ts', 'TOOL-1'),
      spec('src/targets/orangehrm/tests/e2e/users.spec.ts', 'OHRM-1'),
    ]);

    expect(claims.get('TOOL-1')).toEqual(['toolshop']);
    expect(claims.get('OHRM-1')).toEqual(['orangehrm']);
  });

  test('two applications may cite one story, and both are recorded', () => {
    // A real state rather than an error: two suites may prove parts of one
    // requirement, so this is a list and not a single owner.
    const claims = storyClaims([
      spec('src/targets/toolshop/tests/e2e/a.spec.ts', 'SHARED-1'),
      spec('src/targets/saucedemo/tests/e2e/b.spec.ts', 'SHARED-1'),
    ]);

    expect(claims.get('SHARED-1')).toEqual(['toolshop', 'saucedemo']);
  });

  test('one application citing a story twice claims it once', () => {
    const claims = storyClaims([
      spec('src/targets/toolshop/tests/e2e/a.spec.ts', 'TOOL-1'),
      spec('src/targets/toolshop/tests/e2e/b.spec.ts', 'TOOL-1'),
    ]);

    expect(claims.get('TOOL-1')).toEqual(['toolshop']);
  });

  test('a spec citing no story claims nothing', () => {
    expect(storyClaims([spec('src/targets/toolshop/tests/e2e/a.spec.ts', null)]).size).toBe(0);
  });

  test('a file outside a target pack claims nothing', () => {
    // Framework tests cite no application's requirements.
    expect(storyClaims([spec('tests/framework/thing.spec.ts', 'TOOL-1')]).size).toBe(0);
  });
});

test.describe('which stories an application should see', () => {
  const claims = storyClaims([
    spec('src/targets/toolshop/tests/e2e/search.spec.ts', 'TOOL-1'),
    spec('src/targets/orangehrm/tests/e2e/users.spec.ts', 'OHRM-1'),
  ]);

  test('its own', () => {
    expect(storyVisibleTo('TOOL-1', 'toolshop', 'toolshop', claims)).toBe(true);
  });

  test('not another application’s — which is the whole finding', () => {
    /*
       Driven before this existed: the bar read `orangehrm` and the page listed
       TOOL-1 to TOOL-5, a catalogue and a cart, on a page whose job is *what
       the work is meant to do*.
    */
    expect(storyVisibleTo('TOOL-1', 'toolshop', 'orangehrm', claims)).toBe(false);
    expect(storyVisibleTo('OHRM-1', 'orangehrm', 'toolshop', claims)).toBe(false);
  });

  test('one nobody cites yet is shown to the application it was pulled for', () => {
    /*
       The case that stops this fix breaking the feature. Pulling a story from
       Jira and then drafting cases from it is the workflow this page exists
       for, and at the moment it is pulled no spec cites it. Hiding it would
       have fixed the reported defect and removed the reason to open the page.

       Citations alone could not answer for it, so the rule used to be "cited
       by nobody, shown to everybody" — the original defect narrowed rather
       than closed, with a freshly pulled story still appearing under every
       application. The directory answers it: a story is pulled *for* one
       application, and that is true before any spec exists.
    */
    expect(storyVisibleTo('FIN-2210', 'toolshop', 'toolshop', claims)).toBe(true);
    expect(storyVisibleTo('FIN-2210', 'toolshop', 'orangehrm', claims)).toBe(false);
  });

  test('a story two applications cite is shown to both', () => {
    const shared = storyClaims([
      spec('src/targets/toolshop/tests/e2e/a.spec.ts', 'SHARED-1'),
      spec('src/targets/saucedemo/tests/e2e/b.spec.ts', 'SHARED-1'),
    ]);

    // Pulled under toolshop, and saucedemo proves it too. One directory
    // cannot express that, which is why the citations did not go away.
    expect(storyVisibleTo('SHARED-1', 'toolshop', 'toolshop', shared)).toBe(true);
    expect(storyVisibleTo('SHARED-1', 'toolshop', 'saucedemo', shared)).toBe(true);
    expect(storyVisibleTo('SHARED-1', 'toolshop', 'orangehrm', shared)).toBe(false);
  });

  test('with nothing selected, everything is shown', () => {
    // The page is then making no claim about any application, and a list that
    // emptied itself would say the repository has no stories.
    expect(storyVisibleTo('TOOL-1', 'toolshop', null, claims)).toBe(true);
    expect(storyVisibleTo('OHRM-1', 'orangehrm', null, claims)).toBe(true);
  });

  test('the list keeps its order and drops only what belongs elsewhere', () => {
    const stories = [
      { target: 'toolshop', story: { key: 'TOOL-1' } },
      { target: 'orangehrm', story: { key: 'FIN-2210' } },
      { target: 'orangehrm', story: { key: 'OHRM-1' } },
    ];

    expect(storiesVisibleTo(stories, 'orangehrm', claims).map((s) => s.story.key)).toEqual([
      'FIN-2210',
      'OHRM-1',
    ]);
  });
});
