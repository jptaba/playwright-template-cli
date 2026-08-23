import { expect, test } from '@playwright/test';
import { Project } from 'ts-morph';
import { casesPageContent } from '../../src/support/ui/cases-page';
import { buildCoverage, type CoverageCase } from '../../src/support/cases/coverage';
import { hashCase } from '../../src/support/cases/store';
import { readSpecFacts, specNeedsCase, type SpecFact } from '../../src/support/cases/specs';
import type { TestCase } from '../../src/support/cases/schema';

/**
 * Coverage is two lists — cases nobody automated, and specs citing a case that
 * is not there (§18). Both are only as good as the matching underneath them,
 * and the failure mode of bad matching is not an error: it is a plausible
 * report with the wrong names in it.
 */

const aCase: TestCase = {
  id: '5104',
  target: 'demo',
  title: 'Checkout totals include tax',
  source: { type: 'jira-story', key: 'FIN-2210', contentHash: 'abc123', authoredBy: 'claude-opus-5' },
  coversAC: ['AC-3'],
  acQuoted: 'Order total must show subtotal, 8% tax and grand total.',
  preconditions: ['A shopper account signed in with an empty cart'],
  steps: [{ action: 'Add two catalogue items to the cart', expected: 'Cart badge shows 2' }],
  assertions: ['Tax equals 8% of the subtotal'],
  priority: 'high',
  type: 'positive',
};

const stored = (overrides: Partial<TestCase> = {}, file = 'cases/demo/tax.yaml'): CoverageCase => ({
  file,
  case: { ...aCase, ...overrides },
});

const spec = (overrides: Partial<SpecFact> = {}): SpecFact => ({
  file: 'src/targets/demo/tests/e2e/tax.spec.ts',
  title: 'SD-012 · Checkout totals include tax @smoke',
  caseId: null,
  casePath: null,
  caseHash: null,
  jiraKey: null,
  groundTruth: null,
  ...overrides,
});

function sourceFor(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile('a.spec.ts', code);
}

test.describe('what a spec cites', () => {
  test('reads the three annotations that link a spec to its case', () => {
    const facts = readSpecFacts(
      sourceFor(`
        import { expect, test } from '../../fixtures';
        test(
          'SD-012 · Checkout totals include tax @smoke',
          {
            annotation: [
              { type: 'practitest', description: '5104' },
              { type: 'case', description: 'cases/demo/tax.yaml' },
              { type: 'case-hash', description: 'a1b2c3d4' },
              { type: 'jira', description: 'FIN-2210' },
            ],
          },
          async ({ authedPage }) => { await expect(authedPage).toHaveURL(/./); },
        );
      `),
      'src/targets/demo/tests/e2e/tax.spec.ts',
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      title: 'SD-012 · Checkout totals include tax @smoke',
      caseId: '5104',
      casePath: 'cases/demo/tax.yaml',
      caseHash: 'a1b2c3d4',
    });
  });

  test('reads it however it was quoted, and wherever it sits', () => {
    // The reason this is a syntax tree and not a regular expression. A spec a
    // person wrote uses whichever quote their editor inserted, and lives
    // inside a describe as often as not — and a citation this failed to read
    // would be reported as a case nobody automated.
    const facts = readSpecFacts(
      sourceFor(`
        test.describe("checkout", () => {
          test("one", { annotation: [{ type: "practitest", description: "5104" }] }, async () => {});
          test('two', { annotation: [{ 'type': 'practitest', 'description': '5105' }] }, async () => {});
        });
      `),
      'src/targets/demo/tests/e2e/checkout.spec.ts',
    );

    expect(facts.map((fact) => fact.caseId)).toEqual(['5104', '5105']);
  });

  test('a conditional skip is not a nameless test citing nothing', () => {
    // `test.skip(condition, 'reason')` declares nothing and cannot carry an
    // annotation. Counting it as a test would put a spec on the orphan list
    // for guarding itself, which is what a capability-gated spec should do.
    const facts = readSpecFacts(
      sourceFor(`
        test('SD-013 · something', { annotation: [{ type: 'practitest', description: '5106' }] }, async () => {
          test.skip(process.env.CI === 'true', 'needs a real mailbox');
        });
      `),
      'src/targets/demo/tests/e2e/thing.spec.ts',
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]!.caseId).toBe('5106');
  });

  test('a spec with no annotation block at all yields no citation, not a crash', () => {
    const facts = readSpecFacts(
      sourceFor(`test('untraced', async () => {});`),
      'src/targets/demo/tests/e2e/loose.spec.ts',
    );
    expect(facts[0]).toMatchObject({ caseId: null, casePath: null, caseHash: null });
  });
});

test.describe('which specs owe a case', () => {
  test('agrees with the lint rule about what is excused', () => {
    expect(specNeedsCase('src/targets/demo/tests/e2e/tax.spec.ts')).toBe(true);
    expect(specNeedsCase('src/targets/demo/tests/api/orders.spec.ts')).toBe(true);
    // A published schema is not a scripted case; a template and a setup file
    // implement nothing.
    expect(specNeedsCase('src/targets/demo/tests/contract/orders.spec.ts')).toBe(false);
    expect(specNeedsCase('src/targets/demo/tests/seed.spec.ts')).toBe(false);
    expect(specNeedsCase('src/targets/demo/tests/auth.setup.ts')).toBe(false);
  });
});

test.describe('the matching', () => {
  test('a spec citing the case id automates it', () => {
    const report = buildCoverage({ cases: [stored()], specs: [spec({ caseId: '5104' })] });

    expect(report.cases[0]).toMatchObject({
      status: 'automated',
      matchedBy: 'case-id',
      specs: ['src/targets/demo/tests/e2e/tax.spec.ts'],
    });
    expect(report.counts).toMatchObject({ cases: 1, automated: 1, noSpec: 0, orphans: 0 });
  });

  test('a case nobody wrote a spec for is the first list', () => {
    const report = buildCoverage({ cases: [stored()], specs: [] });

    expect(report.cases[0]).toMatchObject({ status: 'no-spec', specs: [], matchedBy: null });
    expect(report.counts.noSpec).toBe(1);
  });

  test('a spec citing a case that is not there is the second list', () => {
    // The quiet failure: it runs, it passes, and it reports a result against
    // an id nothing will ever reconcile. Lint checks the annotation exists,
    // not that it points at something.
    const report = buildCoverage({ cases: [stored()], specs: [spec({ caseId: '9999' })] });

    expect(report.orphans).toEqual([
      {
        file: 'src/targets/demo/tests/e2e/tax.spec.ts',
        title: 'SD-012 · Checkout totals include tax @smoke',
        cites: '9999',
        citedAs: 'case id',
      },
    ]);
    expect(report.cases[0]!.status).toBe('no-spec');
  });

  test('the case file links a case that has never been published', () => {
    // Track A writes a case before PractiTest ever sees it, so its id is null
    // and there is nothing to match on but the path.
    const report = buildCoverage({
      cases: [stored({ id: null })],
      specs: [spec({ casePath: 'cases/demo/tax.yaml' })],
    });

    expect(report.cases[0]).toMatchObject({ status: 'automated', matchedBy: 'case-file' });
    expect(report.orphans).toEqual([]);
  });

  test('a spec whose hash is behind the case is drifted, not automated', () => {
    const report = buildCoverage({
      cases: [stored()],
      specs: [spec({ caseId: '5104', caseHash: 'stale-hash' })],
    });

    expect(report.cases[0]!.status).toBe('drifted');
    expect(report.counts).toMatchObject({ automated: 0, drifted: 1 });
  });

  test('a spec carrying the current hash is not', () => {
    const report = buildCoverage({
      cases: [stored()],
      specs: [spec({ caseId: '5104', caseHash: hashCase(aCase) })],
    });

    expect(report.cases[0]!.status).toBe('automated');
  });

  test('the case may name the spec, when nothing cited the case', () => {
    const report = buildCoverage({
      cases: [stored({ id: null, specPath: 'src/targets/demo/tests/e2e/tax.spec.ts' })],
      specs: [spec()],
    });

    expect(report.cases[0]).toMatchObject({ status: 'automated', matchedBy: 'spec-path' });
  });

  test('a specPath naming a file that is not there is said out loud', () => {
    const report = buildCoverage({
      cases: [stored({ id: null, specPath: 'src/targets/demo/tests/e2e/gone.spec.ts' })],
      specs: [],
    });

    expect(report.cases[0]!.status).toBe('no-spec');
    expect(report.cases[0]!.note).toContain('is not there');
  });

  test('a specPath naming a spec that implements another case does not claim it', () => {
    const report = buildCoverage({
      cases: [
        stored({ id: '5104' }, 'cases/demo/tax.yaml'),
        stored({ id: '5105', specPath: 'src/targets/demo/tests/e2e/tax.spec.ts' }, 'cases/demo/other.yaml'),
      ],
      specs: [spec({ caseId: '5104' })],
    });

    const other = report.cases.find((row) => row.id === '5105')!;
    expect(other.status).toBe('no-spec');
    expect(other.note).toContain('implements case 5104');
  });

  test('two cases with one id is reported, because otherwise the report lies twice', () => {
    const report = buildCoverage({
      cases: [stored({}, 'cases/demo/tax.yaml'), stored({}, 'cases/demo/tax-copy.yaml')],
      specs: [spec({ caseId: '5104' })],
    });

    expect(report.cases.every((row) => row.note?.includes('Another case carries the id'))).toBe(true);
    // One of them is matched and one is not, which is exactly the confusion
    // the note exists to explain.
    expect(report.counts).toMatchObject({ automated: 1, noSpec: 1 });
  });

  test('the seed template is not a spec citing a case that does not exist', () => {
    const report = buildCoverage({
      cases: [],
      specs: [spec({ file: 'src/targets/demo/tests/seed.spec.ts', caseId: 'PT-ID' })],
    });

    expect(report.orphans).toEqual([]);
    expect(report.counts.specs).toBe(0);
  });

  test('a spec citing nothing is left to the lint rule that forbids it', () => {
    const report = buildCoverage({ cases: [], specs: [spec()] });
    expect(report.orphans).toEqual([]);
  });

  test('carries the gate verdict, because it is usually why there is no spec', () => {
    const report = buildCoverage({
      cases: [stored({ preconditions: [], assertions: ['it works properly'] })],
      specs: [],
    });

    expect(report.cases[0]!.gate.passed).toBe(false);
    expect(report.cases[0]!.gate.findings.map((finding) => finding.check)).toContain('preconditions');
  });
});

test.describe('the page', () => {
  const page = casesPageContent();

  test('its script is syntactically valid JavaScript', () => {
    // A stray newline in an inlined string once killed every handler on a page
    // at parse time, silently. `new Function` parses without executing.
    expect(() => new Function(page.script!)).not.toThrow();
  });

  test('every element the script reaches for is in the body it ships with', () => {
    /*
       `$('cCounts')` against a body that says `id="counts"` is null at
       runtime and throws inside a handler nobody is watching. The pair is
       checked here rather than in a browser because it costs nothing.
    */
    const referenced = [...page.script!.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]!);
    expect(referenced.length).toBeGreaterThan(5);
    for (const id of new Set(referenced)) {
      expect(page.body, `#${id} is used by the script`).toContain(`id="${id}"`);
    }
  });
});
