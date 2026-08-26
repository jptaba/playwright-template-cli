import { expect, test } from '@playwright/test';
import { typecheckSpec } from '../../src/support/cases/typecheck';

/**
 * The compiler, actually consulted.
 *
 * Every design note in this programme calls `tsc` the authority that makes a
 * generated spec safe — an invented verb or a wrong argument cannot compile.
 * Nothing ran it. The pipeline printed "Verified" and wrote the file, and the
 * gap was invisible while the drafts were hand-written, because a person
 * drafting reads the real signatures as they go.
 *
 * The first draft a real model produced had six type errors, every one of them
 * a verb that exists used with a shape it does not have — which is precisely
 * the class the vocabulary check cannot see, since the *name* was right.
 *
 * These run against `orangehrm`, whose pack is real and whose types are the
 * ones a draft has to satisfy. A synthetic fixture would prove the function
 * runs; only a real pack proves it is checking what a draft is checked against.
 */

const SPEC_PATH = 'targets/orangehrm/tests/e2e/__typecheck-probe.spec.ts';

function spec(body: string): string {
  return `import { expect, test } from '../../fixtures';

test('X-1 · probe @admin', {
  annotation: [{ type: 'practitest', description: 'X-1' }],
}, async ({ authedPage, users, testData }) => {
${body}
});
`;
}

test.describe('typechecking a rendered spec', () => {
  test('a spec using the pack correctly reports nothing', () => {
    const findings = typecheckSpec(
      SPEC_PATH,
      spec(`  const username = testData.username();
  const result = await users.add(authedPage, {
    username,
    password: 'Pas5wrd',
    role: 'ESS',
    status: 'Enabled',
  });
  expect(result.saved, 'not created').toBe(true);
  await users.remove(authedPage, username);`),
    );
    expect(findings).toEqual([]);
  });

  /*
     The exact shape the first real draft got wrong: NewUser needs role and
     status, and a draft that supplies two of four fields names a verb that
     exists and calls it in a way that cannot work.
  */
  test('catches a verb called with the wrong argument shape', () => {
    const findings = typecheckSpec(
      SPEC_PATH,
      spec(`  const result = await users.add(authedPage, { username: 'x', password: 'y' });
  expect(result.saved, 'not created').toBe(true);`),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.severity).toBe('blocker');
    expect(findings[0]!.check).toBe('typecheck');
    expect(findings.map((finding) => finding.detail).join(' ')).toContain('NewUser');
  });

  test('catches a field the result type does not have', () => {
    const findings = typecheckSpec(
      SPEC_PATH,
      spec(`  const found = await users.searchByUsername(authedPage, 'x');
  expect(found.count, 'wrong field').toBe(1);`),
    );
    expect(findings.map((finding) => finding.detail).join(' ')).toContain("'count'");
  });

  test('reports the line, so a reviewer can find it', () => {
    const findings = typecheckSpec(
      SPEC_PATH,
      spec(`  const found = await users.searchByUsername(authedPage, 'x');
  expect(found.count, 'wrong field').toBe(1);`),
    );
    expect(findings[0]!.detail).toMatch(/__typecheck-probe\.spec\.ts:\d+/);
  });

  test('names the catalog in its remedy, since that is what a draft ignored', () => {
    const findings = typecheckSpec(
      SPEC_PATH,
      spec(`  const found = await users.searchByUsername(authedPage, 'x');
  expect(found.count, 'wrong field').toBe(1);`),
    );
    expect(findings[0]!.remedy).toContain('catalog');
  });

  /*
     The project is shared across calls so the tsconfig is loaded once. A
     rendered spec left behind in it would be compiled as part of the next
     file's programme, and a refused draft would go on producing errors
     attributed to whatever came after it.
  */
  test('leaves nothing behind, so one bad draft cannot poison the next check', () => {
    typecheckSpec(SPEC_PATH, spec(`  const r = await users.add(authedPage, { username: 'x' });`));
    const clean = typecheckSpec(
      SPEC_PATH,
      spec(`  const username = testData.username();
  const result = await users.add(authedPage, {
    username,
    password: 'Pas5wrd',
    role: 'ESS',
    status: 'Enabled',
  });
  expect(result.saved, 'not created').toBe(true);`),
    );
    expect(clean).toEqual([]);
  });

  test('reports unparseable source as a blocker rather than throwing', () => {
    const findings = typecheckSpec(SPEC_PATH, 'const = = = ;');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.severity === 'blocker')).toBe(true);
  });
});
