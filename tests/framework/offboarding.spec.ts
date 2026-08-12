import { expect, test } from '@playwright/test';
import {
  confirmationMatches,
  describeOffboard,
  isRemovable,
  planOffboard,
  OffboardError,
  type OffboardFacts,
} from '../../src/support/onboarding/offboard';

/**
 * Offboarding is the one destructive operation in the framework, so it gets
 * the most tests per line of any module here. Everything below is a rule about
 * what it must *not* delete, or about what a person must be told before it
 * deletes anything.
 */

function facts(overrides: Partial<OffboardFacts> = {}): OffboardFacts {
  return {
    knownTargets: ['example-app', 'acme-shop'],
    packExists: true,
    packFiles: ['fixtures.ts', 'locators/sign-in.ts', 'tests/e2e/orders.spec.ts'],
    secretKeys: [
      'qa/acme-shop/pools/workforce/standard/1',
      'qa/example-app/pools/workforce/standard/1',
    ],
    storageStateFiles: ['acme-shop.standard.json', 'example-app.standard.json'],
    pointsAtPlaceholderHost: false,
    untrackedPaths: [],
    ...overrides,
  };
}

test('removes the profile, the pack, the credentials and the sessions — and nothing else', () => {
  const plan = planOffboard('acme-shop', facts());

  expect(plan.removeFiles).toContain('config/targets/acme-shop.ts');
  expect(plan.removeFiles).toContain('src/targets/acme-shop/fixtures.ts');
  expect(plan.removeDirectories).toEqual(['src/targets/acme-shop']);
  expect(plan.removeSecretKeys).toEqual(['qa/acme-shop/pools/workforce/standard/1']);
  expect(plan.removeStorageStates).toEqual(['acme-shop.standard.json']);
  expect(isRemovable(plan)).toBe(true);
});

test('never touches another target that merely shares a prefix', () => {
  /*
     `qa/acme-shop-staging/...` is a different application's credentials, and a
     substring match would take them with it. Credentials are the one thing
     here a person typed in by hand.
  */
  const plan = planOffboard(
    'acme-shop',
    facts({
      knownTargets: ['acme-shop', 'acme-shop-staging'],
      secretKeys: [
        'qa/acme-shop/pools/workforce/standard/1',
        'qa/acme-shop-staging/pools/workforce/standard/1',
      ],
      storageStateFiles: ['acme-shop.standard.json', 'acme-shop-staging.standard.json'],
    }),
  );

  expect(plan.removeSecretKeys).toEqual(['qa/acme-shop/pools/workforce/standard/1']);
  expect(plan.removeStorageStates).toEqual(['acme-shop.standard.json']);
});

test('deletes deepest first, so a directory is empty by the time it goes', () => {
  const plan = planOffboard('acme-shop', facts());
  const depths = plan.removeFiles.map((file) => file.split('/').length);
  expect(depths).toEqual([...depths].sort((a, b) => b - a));
});

test('says which files git cannot bring back, and does not refuse over them', () => {
  /*
     Refusing was the first design and it was wrong for the case this exists to
     serve: a target scaffolded on `main` to try an application out is never
     committed, so every file of it is untracked. A refusal would block the
     whole workflow, and the way round it — commit a target you are about to
     delete — is worse than what it was protecting against.
  */
  const plan = planOffboard(
    'acme-shop',
    facts({
      untrackedPaths: ['config/targets/acme-shop.ts', 'src/targets/acme-shop/fixtures.ts'],
    }),
  );

  expect(isRemovable(plan)).toBe(true);
  expect(plan.warnings.join(' ')).toContain('never been committed');
  expect(plan.warnings.join(' ')).toContain('2 of these');
});

test('untracked files belonging to other targets are not counted', () => {
  const plan = planOffboard(
    'acme-shop',
    facts({ untrackedPaths: ['src/targets/other-app/fixtures.ts', 'docs/scratch.md'] }),
  );
  expect(plan.warnings.join(' ')).not.toContain('never been committed');
});

test('warns when the profile was never pointed at a running application', () => {
  // How the shipped template is recognised without naming it — a constant
  // holding its name would be exactly the coupling `no-target-coupling` bans.
  const plan = planOffboard('example-app', facts({ pointsAtPlaceholderHost: true }));
  expect(plan.warnings.join(' ')).toContain('reserved by RFC 2606');
  expect(isRemovable(plan), 'warned, not refused — git restores it').toBe(true);
});

test('says when this was the last target', () => {
  const plan = planOffboard('acme-shop', facts({ knownTargets: ['acme-shop'] }));
  expect(plan.warnings.join(' ')).toContain('agnostic framework again');
});

test('a target that is not there is a no-op, not an error', () => {
  const plan = planOffboard('never-existed', facts({ packExists: false, packFiles: [] }));
  expect(plan.alreadyGone).toBe(true);
  expect(plan.removeFiles).toEqual([]);
  expect(isRemovable(plan)).toBe(false);
  expect(describeOffboard(plan)[0]).toContain('Nothing to remove');
});

test('a nameless removal is refused outright', () => {
  expect(() => planOffboard('   ', facts())).toThrow(OffboardError);
});

test.describe('the confirmation', () => {
  test('is the name typed back, exactly', () => {
    expect(confirmationMatches('acme-shop', 'acme-shop')).toBe(true);
    expect(confirmationMatches('acme-shop', ' acme-shop ')).toBe(true);
  });

  test('is not satisfied by a near miss, a blank, or a different target', () => {
    // A confirmation a stray keystroke can satisfy is not a confirmation.
    for (const typed of ['', '   ', 'acme', 'ACME-SHOP', 'example-app', null, undefined, 'yes']) {
      expect(confirmationMatches('acme-shop', typed), `'${String(typed)}' is refused`).toBe(false);
    }
  });

  test('cannot be satisfied for a nameless target', () => {
    expect(confirmationMatches('', '')).toBe(false);
  });
});
