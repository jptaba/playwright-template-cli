import { expect, test } from '@playwright/test';
import {
  applyManagedLines,
  formatUpgrade,
  optionsFromProfile,
  planUpgrade,
} from '../../src/support/onboarding/upgrade';
import { planScaffold } from '../../src/support/onboarding/scaffold';
import type { TargetProfile } from '../../config/targets/types';

/**
 * How far a pack has drifted from the templates that would write it today.
 *
 * Rule zero sends every troubleshooting fix into the framework rather than a
 * target pack, which is right, and leaves a gap: a scaffolder improvement
 * reaches applications onboarded *afterwards* and no others — so a fix lands
 * everywhere except the applications that exposed the defect.
 *
 * This reports and does not rewrite. The tests below are mostly about the one
 * thing it may write, and the three things it may not.
 */

function profile(overrides: Partial<TargetProfile> = {}): TargetProfile {
  return {
    name: 'demo',
    baseURL: 'https://demo.internal.corp',
    environment: 'staging',
    credentials: { source: 'local', root: 'qa/demo/pools', accountType: 'workforce' },
    capabilities: {
      mfa: 'none',
      accountPool: 'static',
      serverState: true,
      api: { enabled: false },
      db: { enabled: false },
      contracts: { enabled: false, spec: null },
      a11y: { enabled: false, standard: 'wcag22aa' },
    },
    testIdAttribute: 'data-testid',
    hostAllowlist: ['internal.corp'],
    suites: ['smoke'],
    roles: ['standard'],
    ...overrides,
  };
}

/** Exactly what the templates would write, as they would write it. */
function freshPack(target = profile()): Map<string, string> {
  return new Map(
    planScaffold(optionsFromProfile(target)).files.map((file) => [file.path, file.contents]),
  );
}

test.describe('comparing a pack against the templates', () => {
  test('a pack straight from the scaffolder is entirely current', () => {
    const plan = planUpgrade(profile(), freshPack());

    expect(plan.diverged, 'nothing differs').toEqual([]);
    expect(plan.addable, 'nothing is missing').toEqual([]);
    expect(plan.current.length).toBeGreaterThan(0);
  });

  test('a file somebody rewrote is reported and never queued for writing', () => {
    const disk = freshPack();
    const locators = 'src/targets/demo/locators/sign-in.ts';
    disk.set(locators, '// read off the real application\nexport const signInLocators = {};\n');

    const plan = planUpgrade(profile(), disk);

    expect(plan.diverged.map((file) => file.path)).toContain(locators);
    expect(plan.addable.map((file) => file.path)).not.toContain(locators);
  });

  test('line endings and a trailing newline are not drift', () => {
    // Otherwise every file on a Windows checkout reports as diverged, and a
    // report that is wrong about everything is ignored about everything.
    const disk = new Map(
      [...freshPack()].map(([path, contents]) => [path, `${contents.replace(/\n/g, '\r\n')}\n\n`]),
    );

    expect(planUpgrade(profile(), disk).diverged).toEqual([]);
  });

  test('a file absent from an empty directory is offered', () => {
    const disk = freshPack();
    const fixtures = 'src/targets/demo/fixtures.ts';
    disk.delete(fixtures);

    const plan = planUpgrade(profile(), disk);
    const offered = plan.addable.find((file) => file.path === fixtures);

    expect(offered, 'the pack genuinely lacks it').toBeDefined();
    expect(offered?.contents, 'and the contents come along, or it cannot be written').toBeTruthy();
  });
});

test.describe('a starter the pack replaced under a better name', () => {
  /*
     The state that exists because running the first version showed the flaw.
     toolshop swapped the scaffolder's invented `endpoints/orders.ts` for a
     real `catalogue.ts`; without this the tool called it "missing, safe to
     add" and `--apply` would have injected endpoints for orders into an
     application that has none.
  */
  const withApi = profile({
    capabilities: {
      ...profile().capabilities,
      api: { enabled: true, baseURL: 'https://api.demo.internal.corp' },
    },
  });

  test('is superseded, not missing, when the directory holds other work', () => {
    const disk = freshPack(withApi);
    disk.delete('src/targets/demo/endpoints/orders.ts');
    disk.set('src/targets/demo/endpoints/catalogue.ts', 'export const catalogueEndpoints = {};\n');

    const plan = planUpgrade(withApi, disk);

    expect(plan.superseded.map((file) => file.path)).toContain(
      'src/targets/demo/endpoints/orders.ts',
    );
    expect(plan.addable.map((file) => file.path)).not.toContain(
      'src/targets/demo/endpoints/orders.ts',
    );
  });

  test('a .gitkeep is not work, so a placeholder directory is still empty', () => {
    // Otherwise the scaffolder's own placeholder would suppress the starter
    // it was written to hold a place for.
    const disk = freshPack(withApi);
    disk.delete('src/targets/demo/endpoints/orders.ts');
    disk.set('src/targets/demo/endpoints/.gitkeep', '');

    expect(planUpgrade(withApi, disk).addable.map((file) => file.path)).toContain(
      'src/targets/demo/endpoints/orders.ts',
    );
  });

  test('work in a subdirectory does not count as work in this one', () => {
    const disk = freshPack(withApi);
    disk.delete('src/targets/demo/endpoints/orders.ts');
    disk.set('src/targets/demo/endpoints/v2/things.ts', 'export const things = {};\n');

    expect(planUpgrade(withApi, disk).addable.map((file) => file.path)).toContain(
      'src/targets/demo/endpoints/orders.ts',
    );
  });
});

test('the report frames a divergence as information, not as a fault', () => {
  /*
     On any pack anybody has worked on, diverged is the healthy majority —
     locators read off a real page, actions carrying business verbs. A tool
     that framed those as drift to correct would be arguing for undoing the
     work, and would be ignored for good reason.
  */
  const disk = freshPack();
  disk.set('src/targets/demo/locators/sign-in.ts', '// mine\n');
  const report = formatUpgrade(planUpgrade(profile(), disk)).join('\n');

  expect(report).toContain('Not touched, and mostly should not be');
  expect(report).toContain('cannot tell those apart, so it reports and stops');
});

test('the options are rebuilt from the profile, including the optional layers', () => {
  const options = optionsFromProfile(
    profile({
      capabilities: {
        ...profile().capabilities,
        api: { enabled: true, baseURL: 'https://api.demo.internal.corp' },
        contracts: { enabled: true, spec: 'src/targets/demo/contracts/openapi.json' },
      },
    }),
  );

  expect(options.include).toMatchObject({ api: true, contracts: true, db: false, a11y: false });
  expect(options.apiBaseURL).toBe('https://api.demo.internal.corp');
  expect(options.credentialRoot).toBe('qa/demo/pools');
  // The probe-derived sign-in names are deliberately absent: nothing in the
  // profile records them, which is exactly why locators come back diverged
  // and are never rewritten.
  expect(options.signIn).toBeUndefined();
});

test.describe('lines the template owns inside a file somebody else works in', () => {
  /*
     The gap `diverged` left behind, and it is not hypothetical: the scaffolder
     emitted `getByRole('alert')` as the sign-in error locator into every pack
     it ever wrote, it matched nothing on an application whose banner carries
     no role, and fixing the template reached none of the four packs already on
     disk. The corrected line had to be pasted into each by hand.
  */
  const LOCATORS = 'src/targets/demo/locators/sign-in.ts';

  /** The pack's file, with the marked line put back to an older rendering. */
  const withOldLine = (): Map<string, string> => {
    const disk = freshPack();
    const current = disk.get(LOCATORS)!;
    expect(current, 'the template marks the line this suite is about').toContain(
      '// @template:sign-in-error',
    );
    disk.set(
      LOCATORS,
      current.replace(
        /^.*\/\/ @template:sign-in-error$/m,
        "  error: (page: Page): Locator => page.getByRole('alert'), // @template:sign-in-error",
      ),
    );
    return disk;
  };

  test('a marked line the template moved on from is reported, with both renderings', () => {
    const plan = planUpgrade(profile(), withOldLine());

    expect(plan.staleLines).toHaveLength(1);
    expect(plan.staleLines[0]!.key).toBe('sign-in-error');
    expect(plan.staleLines[0]!.path).toBe(LOCATORS);
    expect(plan.staleLines[0]!.template).toContain('getByTestId');
    expect(plan.staleLines[0]!.onDisk).not.toContain('getByTestId');
  });

  test('deleting the marker is how a pack keeps its own line, and it is respected', () => {
    /*
       The documented escape hatch, and the reason the tool can be trusted to
       write at all: a pack that has said out loud "this line is mine" stops
       being asked about. parabank's error locator is exactly this case — a CSS
       selector with a written justification, for an application whose banner
       is neither an alert nor a test id.
    */
    const disk = withOldLine();
    disk.set(LOCATORS, disk.get(LOCATORS)!.replace(' // @template:sign-in-error', ''));

    expect(planUpgrade(profile(), disk).staleLines).toEqual([]);
  });

  test('a locator read off a real application is never a managed line', () => {
    // The whole file differs, and none of it is the template's to move. This
    // is the case that makes `diverged` unwritable, and it must stay that way.
    const disk = freshPack();
    disk.set(LOCATORS, '// read off the real application\nexport const signInLocators = {};\n');
    const plan = planUpgrade(profile(), disk);

    expect(plan.diverged.map((file) => file.path)).toContain(LOCATORS);
    expect(plan.staleLines).toEqual([]);
  });

  test('a file that matches the templates has nothing stale in it', () => {
    expect(planUpgrade(profile(), freshPack()).staleLines).toEqual([]);
  });

  test('applying moves the marked line and nothing else, to the byte', () => {
    const disk = withOldLine();
    const before = disk.get(LOCATORS)!;
    const plan = planUpgrade(profile(), disk);

    const after = applyManagedLines(before, plan.staleLines);

    expect(after).toBe(freshPack().get(LOCATORS)!);
    // And the proof that it is a line edit rather than a re-render: exactly
    // one line of the file changed.
    const changed = before
      .split('\n')
      .filter((line, index) => line !== after.split('\n')[index]);
    expect(changed).toHaveLength(1);
  });

  test('the report says what would change and how to refuse it', () => {
    const report = formatUpgrade(planUpgrade(profile(), withOldLine())).join('\n');

    expect(report).toContain('sign-in-error');
    expect(report).toContain('--apply');
    expect(report, 'the escape hatch is stated where it is needed').toContain(
      'delete its `// @template:` marker',
    );
  });
});
