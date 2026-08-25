import { expect, test } from '@playwright/test';
import {
  assertionGaps,
  authorSpec,
  draftFacts,
  renderSpec,
  specPathFor,
  verifyDraft,
  type DraftedSpec,
  type SpecAuthorModel,
  type SpecDraft,
  type Vocabulary,
} from '../../src/support/cases/spec-author';
import {
  irAssertionGaps,
  irFacts,
  renderIrBody,
  renderValue,
  verifyIr,
  type SpecIR,
} from '../../src/support/cases/spec-ir';
import {
  renderPlanComment,
  verifyJourney,
  verifyPreconditions,
  type DraftFacts,
} from '../../src/support/cases/preflight';
import type { TestCase } from '../../src/support/cases/schema';

/**
 * Track C — a case becomes a spec.
 *
 * The thing under test is not "does a model write good TypeScript". It is
 * whether a draft that is wrong in each of the ways a draft can be wrong is
 * *stopped*, and stopped with a message naming the fix. Every check below
 * corresponds to a way a generated spec can look right and be worthless.
 */

const testCase: TestCase = {
  id: 'OHRM-4-01',
  target: 'demo',
  title: 'A username that is already taken is refused',
  source: { type: 'human', key: 'OHRM-4', contentHash: '', authoredBy: null },
  coversAC: ['OHRM-4-AC1'],
  acQuoted: 'A username that is already in use is refused, and the form says so.',
  preconditions: ['An administrator is signed in', 'A system user already exists'],
  steps: [
    { action: 'Open the system user list', expected: 'The list is shown' },
    { action: 'Add a user whose username is already in use', expected: 'The form refuses' },
  ],
  assertions: ['The second user is not saved', 'The form says the username is taken'],
  priority: 'medium',
  type: 'negative',
};

const vocabulary: Vocabulary = {
  target: 'demo',
  fixtures: ['authedPage', 'users', 'testData', 'signIn'],
  verbs: ['users.open', 'users.add', 'users.remove', 'signIn.withCredentials'],
};

const goodPlan = {
  preconditions: [
    { precondition: 1, how: 'fixture' as const, by: 'authedPage' },
    { precondition: 2, how: 'established' as const, by: 'users.add' },
  ],
  journey: [
    { step: 1, calls: ['users.open'] },
    { step: 2, calls: ['users.add'] },
  ],
};

const goodDraft: DraftedSpec = {
  kind: 'spec',
  title: 'A username that is already taken is refused',
  tags: ['@negative'],
  fixtures: ['authedPage', 'users', 'testData'],
  body: [
    'const username = testData.username();',
    'await users.open(authedPage);',
    'const second = await users.add(authedPage, { username });',
    "expect(second.saved, 'the duplicate was accepted').toBe(false);",
    "expect(second.errors.join(' '), 'no reason was given').toMatch(/exists/i);",
    'await users.remove(authedPage, username);',
  ].join('\n'),
  coverage: [
    { assertion: 1, provedBy: 'the duplicate was accepted' },
    { assertion: 2, provedBy: 'no reason was given' },
  ],
  ...goodPlan,
};

const facts: DraftFacts = { fixtures: goodDraft.fixtures, verbs: ['users.open', 'users.add', 'users.remove'] };

function checks(findings: Array<{ check: string }>): string[] {
  return findings.map((finding) => finding.check);
}

test.describe('the free-TypeScript shape', () => {
  test('accepts a draft that uses only what the pack has', () => {
    expect(verifyDraft(goodDraft, { case: testCase, vocabulary })).toEqual([]);
  });

  test('refuses a fixture the application does not expose', () => {
    const draft = { ...goodDraft, fixtures: [...goodDraft.fixtures, 'auditLog'] };
    expect(checks(verifyDraft(draft, { case: testCase, vocabulary }))).toContain('unknown-fixture');
  });

  test('refuses an invented verb, which is the hallucination this exists for', () => {
    const draft = { ...goodDraft, body: 'await users.searchByEmail(authedPage, 1);\nexpect(1).toBe(1);' };
    expect(checks(verifyDraft(draft, { case: testCase, vocabulary }))).toContain('unknown-verb');
  });

  test('refuses a raw locator, a fixed wait and a raw request', () => {
    for (const [body, expected] of [
      ["authedPage.locator('#x');\nexpect(1).toBe(1);", 'raw-locator'],
      ['await authedPage.waitForTimeout(50);\nexpect(1).toBe(1);', 'hard-wait'],
      ["await request.post('/x');\nexpect(1).toBe(1);", 'raw-request'],
    ] as const) {
      expect(checks(verifyDraft({ ...goodDraft, body }, { case: testCase, vocabulary }))).toContain(
        expected,
      );
    }
  });

  test('refuses a body that asserts nothing at all', () => {
    const draft = { ...goodDraft, body: 'await users.open(authedPage);' };
    expect(checks(verifyDraft(draft, { case: testCase, vocabulary }))).toContain('no-assertion');
  });

  /*
     The check that separates covering an assertion from claiming to. A model
     cannot be trusted to enforce its own citation rules, so the message it
     cites is verified as text that is actually in the body.
  */
  test('refuses a citation quoting a message the body never contains', () => {
    const draft = {
      ...goodDraft,
      coverage: [{ assertion: 1, provedBy: 'a message nobody wrote' }, goodDraft.coverage[1]!],
    };
    expect(checks(verifyDraft(draft, { case: testCase, vocabulary }))).toContain(
      'citation-not-verbatim',
    );
  });

  test('refuses a citation naming an assertion the case does not have', () => {
    const draft = { ...goodDraft, coverage: [{ assertion: 9, provedBy: 'the duplicate was accepted' }] };
    expect(checks(verifyDraft(draft, { case: testCase, vocabulary }))).toContain(
      'citation-out-of-range',
    );
  });

  test('reports the case assertions nothing claims to prove', () => {
    expect(assertionGaps(testCase, [{ assertion: 1, provedBy: 'x' }])).toEqual([2]);
    expect(assertionGaps(testCase, goodDraft.coverage)).toEqual([]);
  });

  test('reads the verbs a body calls, in order and with repeats kept', () => {
    const draft = { ...goodDraft, body: 'await users.add(1);\nawait users.open(2);\nawait users.add(3);' };
    expect(draftFacts(draft, vocabulary).verbs).toEqual(['users.add', 'users.open', 'users.add']);
  });
});

test.describe('the IR shape', () => {
  const ir: SpecIR = {
    kind: 'spec-ir',
    title: 'A username that is already taken is refused',
    tags: ['@negative'],
    fixtures: ['authedPage', 'users', 'testData'],
    pageFixture: 'authedPage',
    given: [{ name: 'username', verb: 'testData.username' }],
    setup: [{ verb: 'users.open' }],
    steps: [
      {
        call: {
          verb: 'users.add',
          bind: 'second',
          args: [{ of: 'object', fields: { username: { of: 'ref', name: 'username' } } }],
        },
        assertions: [
          {
            subject: { of: 'path', base: 'second', path: ['saved'] },
            message: 'the duplicate was accepted',
            matcher: 'toBe',
            expected: { of: 'literal', value: false },
            proves: [1],
          },
          {
            subject: { of: 'joined', base: 'second', path: ['errors'], separator: ' ' },
            message: 'no reason was given',
            matcher: 'toMatch',
            expected: { of: 'regex', pattern: 'exists', flags: 'i' },
            proves: [2],
          },
        ],
      },
    ],
    cleanup: [{ verb: 'users.remove', args: [{ of: 'ref', name: 'username' }] }],
    ...goodPlan,
  };

  test('accepts a well-formed draft', () => {
    expect(verifyIr(ir, testCase, vocabulary)).toEqual([]);
  });

  test('renders property shorthand rather than username: username', () => {
    expect(renderValue({ of: 'object', fields: { a: { of: 'ref', name: 'a' } } })).toBe('{ a }');
    expect(renderValue({ of: 'object', fields: { a: { of: 'ref', name: 'b' } } })).toBe('{ a: b }');
  });

  test('renders each value kind the way a person writes it', () => {
    expect(renderValue({ of: 'literal', value: "it's" })).toBe("'it\\'s'");
    expect(renderValue({ of: 'literal', value: 3 })).toBe('3');
    expect(renderValue({ of: 'regex', pattern: 'a b', flags: 'i' })).toBe('/a b/i');
    expect(renderValue({ of: 'path', base: 'r', path: ['a', 'b'] })).toBe('r.a.b');
    expect(renderValue({ of: 'joined', base: 'r', path: ['e'], separator: ', ' })).toBe(
      "r.e.join(', ')",
    );
  });

  /*
     A builder is synchronous on every pack here, so awaiting it would be both
     wrong and the kind of detail a renderer has to be told and a model does not.
  */
  test('does not await a synchronous builder, and does await one that asks', () => {
    expect(renderIrBody({ ...ir, setup: [], steps: [ir.steps[0]!], cleanup: [] })).toContain(
      'const username = testData.username();',
    );
    expect(
      renderIrBody({
        ...ir,
        given: [{ name: 'u', verb: 'testData.username', async: true }],
        setup: [],
        cleanup: [],
      }),
    ).toContain('const u = await testData.username();');
  });

  test('wraps the journey in try/finally when there is cleanup, and not otherwise', () => {
    expect(renderIrBody(ir)).toContain('} finally {');
    expect(renderIrBody({ ...ir, cleanup: [] })).not.toContain('finally');
  });

  test('supplies the page argument so a draft cannot forget it', () => {
    expect(renderIrBody(ir)).toContain('await users.open(authedPage);');
  });

  test('refuses an invented verb by name, before anything renders', () => {
    const bad: SpecIR = { ...ir, setup: [{ verb: 'users.searchByEmail' }] };
    expect(checks(verifyIr(bad, testCase, vocabulary))).toContain('unknown-verb');
  });

  test('refuses a value reading a name nothing binds', () => {
    const bad: SpecIR = { ...ir, given: [] };
    expect(checks(verifyIr(bad, testCase, vocabulary))).toContain('unbound-reference');
  });

  test('refuses a draft with no assertions anywhere', () => {
    const bad: SpecIR = { ...ir, steps: [{ call: { verb: 'users.open' } }] };
    expect(checks(verifyIr(bad, testCase, vocabulary))).toContain('no-assertion');
  });

  test('reports case assertions no expectation proves', () => {
    expect(irAssertionGaps(ir, testCase)).toEqual([]);
    const half: SpecIR = {
      ...ir,
      steps: [{ ...ir.steps[0]!, assertions: [ir.steps[0]!.assertions![0]!] }],
    };
    expect(irAssertionGaps(half, testCase)).toEqual([2]);
  });

  test('reports the verbs it calls in order, cleanup included', () => {
    expect(irFacts(ir).verbs).toEqual(['users.open', 'users.add', 'users.remove']);
  });
});

test.describe('pre-flight: does the spec implement this case', () => {
  test('accepts a plan whose claims check out', () => {
    expect(verifyPreconditions(goodPlan.preconditions, testCase, facts, vocabulary)).toEqual([]);
    expect(verifyJourney(goodPlan.journey, testCase, facts)).toEqual([]);
  });

  test('refuses a draft that says nothing about preconditions or journey', () => {
    expect(checks(verifyPreconditions(undefined, testCase, facts, vocabulary))).toEqual([
      'preconditions-unplanned',
    ]);
    expect(checks(verifyJourney(undefined, testCase, facts))).toEqual(['journey-unmapped']);
  });

  test('refuses a precondition nothing accounts for', () => {
    const plan = [goodPlan.preconditions[0]!];
    expect(checks(verifyPreconditions(plan, testCase, facts, vocabulary))).toContain(
      'precondition-unplanned',
    );
  });

  test('refuses a fixture claim the spec does not take', () => {
    const plan = [{ precondition: 1, how: 'fixture' as const, by: 'signIn' }, goodPlan.preconditions[1]!];
    expect(checks(verifyPreconditions(plan, testCase, facts, vocabulary))).toContain(
      'precondition-fixture-unused',
    );
  });

  test('refuses a fixture claim naming something the pack does not have', () => {
    const plan = [{ precondition: 1, how: 'fixture' as const, by: 'auditLog' }, goodPlan.preconditions[1]!];
    expect(checks(verifyPreconditions(plan, testCase, facts, vocabulary))).toContain(
      'precondition-unknown-fixture',
    );
  });

  test('refuses an "established" claim whose verb is never called', () => {
    const plan = [
      goodPlan.preconditions[0]!,
      { precondition: 2, how: 'established' as const, by: 'signIn.withCredentials' },
    ];
    expect(checks(verifyPreconditions(plan, testCase, facts, vocabulary))).toContain(
      'precondition-not-established',
    );
  });

  test('refuses a claim with nothing named to check it against', () => {
    const plan = [{ precondition: 1, how: 'fixture' as const }, goodPlan.preconditions[1]!];
    expect(checks(verifyPreconditions(plan, testCase, facts, vocabulary))).toContain(
      'precondition-unattributed',
    );
  });

  /*
     A warning, not a blocker — some preconditions genuinely are environmental.
     But never silent: §"State the suite does not own" is the reason, and a
     reviewer needs to see every one of these.
  */
  test('warns rather than blocks when a precondition is taken on trust', () => {
    const plan = [goodPlan.preconditions[0]!, { precondition: 2, how: 'assumed' as const, note: 'seeded' }];
    const findings = verifyPreconditions(plan, testCase, facts, vocabulary);
    expect(checks(findings)).toContain('precondition-assumed');
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true);
  });

  test('sends an unsatisfiable precondition back as a refusal, not a spec', () => {
    const plan = [goodPlan.preconditions[0]!, { precondition: 2, how: 'unsatisfiable' as const }];
    const findings = verifyPreconditions(plan, testCase, facts, vocabulary);
    expect(checks(findings)).toContain('precondition-unsatisfiable');
    expect(findings[0]!.remedy).toContain('needs-vocabulary');
  });

  test('refuses a step nothing carries out', () => {
    expect(checks(verifyJourney([goodPlan.journey[0]!], testCase, facts))).toContain('step-unmapped');
  });

  test('refuses a step citing a verb the spec never calls', () => {
    const journey = [goodPlan.journey[0]!, { step: 2, calls: ['signIn.withCredentials'] }];
    expect(checks(verifyJourney(journey, testCase, facts))).toContain('step-cites-uncalled-verb');
  });

  test('refuses a step mapped to nothing at all', () => {
    const journey = [goodPlan.journey[0]!, { step: 2, calls: [] }];
    expect(checks(verifyJourney(journey, testCase, facts))).toContain('step-no-calls');
  });

  test('refuses a step the case does not have', () => {
    const journey = [...goodPlan.journey, { step: 9, calls: ['users.open'] }];
    expect(checks(verifyJourney(journey, testCase, facts))).toContain('step-out-of-range');
  });

  /*
     The check with no analogue anywhere else: every verb the case lists, all
     called, all real — in the wrong order. A different test that happens to
     touch the same verbs, and every other check here passes it.
  */
  test('refuses a journey that visits the right places in the wrong order', () => {
    const reversed: DraftFacts = { ...facts, verbs: ['users.add', 'users.open'] };
    expect(checks(verifyJourney(goodPlan.journey, testCase, reversed))).toContain(
      'journey-out-of-order',
    );
  });

  test('shows its work in the spec, so a reviewer can hold it beside the case', () => {
    const lines = renderPlanComment(testCase, goodPlan).join('\n');
    expect(lines).toContain('An administrator is signed in — fixture authedPage');
    expect(lines).toContain('established by users.add()');
    expect(lines).toContain('1. Open the system user list — users.open');
    // The trailing separator belongs to the closing line, or it renders `* */`.
    expect(lines.endsWith(' *')).toBe(false);
  });
});

test.describe('authoring end to end', () => {
  const model = (draft: SpecDraft): SpecAuthorModel => ({
    identity: 'test-model',
    draft: async () => draft,
  });

  test('a case the pack cannot express returns the missing verb, and no spec', async () => {
    const result = await authorSpec(
      testCase,
      model({ kind: 'needs-vocabulary', missing: [{ verb: 'users.roleOf', wanted: 'the role shown' }] }),
      vocabulary,
      'cases/x.yaml',
    );
    expect(result.source).toBeNull();
    expect(result.publishable).toBe(false);
    expect(result.refusal?.missing[0]?.verb).toBe('users.roleOf');
  });

  test('a verified draft is publishable and carries the annotation triple', async () => {
    const result = await authorSpec(testCase, model(goodDraft), vocabulary, 'cases/x.yaml');
    expect(result.findings.filter((finding) => finding.severity === 'blocker')).toEqual([]);
    expect(result.publishable).toBe(true);
    expect(result.source).toContain("{ type: 'practitest', description: 'OHRM-4-01' }");
    expect(result.source).toContain("{ type: 'case', description: ");
    expect(result.source).toContain("{ type: 'case-hash', description: ");
  });

  test('a blocker anywhere stops it being publishable', async () => {
    const draft = { ...goodDraft, fixtures: [...goodDraft.fixtures, 'auditLog'] };
    const result = await authorSpec(testCase, model(draft), vocabulary, 'cases/x.yaml');
    expect(result.publishable).toBe(false);
  });

  test('pre-flight runs whichever shape the draft is', async () => {
    const draft = { ...goodDraft, journey: [goodPlan.journey[0]!] };
    const result = await authorSpec(testCase, model(draft), vocabulary, 'cases/x.yaml');
    expect(checks(result.findings)).toContain('step-unmapped');
  });

  test('the title carries the case reference and the tags', () => {
    expect(renderSpec(testCase, goodDraft, { casePath: 'c.yaml', authoredBy: 'm' })).toContain(
      "'OHRM-4-01 · A username that is already taken is refused @negative'",
    );
  });

  test('a spec touching a page belongs in e2e', () => {
    expect(specPathFor(testCase, goodDraft, 'slug')).toBe('targets/demo/tests/e2e/slug.spec.ts');
  });

  test('a spec touching only a service belongs in api', () => {
    const draft = { ...goodDraft, body: "const r = await apis.billing.get('/x');\nexpect(r).toBe(1);" };
    expect(specPathFor(testCase, draft, 'slug')).toBe('targets/demo/tests/api/slug.spec.ts');
  });
});
