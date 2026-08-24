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
    caseFiles: [],
    storyFiles: [],
    // No draft by default — the presence of one is what each draft test states.
    draftName: null,
    storageStateFiles: ['acme-shop.standard.json', 'example-app.standard.json'],
    pointsAtPlaceholderHost: false,
    untrackedPaths: [],
    ...overrides,
  };
}

test('removes the profile, the pack, the credentials and the sessions — and nothing else', () => {
  const plan = planOffboard('acme-shop', facts());

  expect(plan.removeFiles).toContain('targets/acme-shop/profile.ts');
  expect(plan.removeFiles).toContain('targets/acme-shop/fixtures.ts');
  expect(plan.removeDirectories).toEqual(['targets/acme-shop']);
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
      untrackedPaths: ['targets/acme-shop/profile.ts', 'targets/acme-shop/fixtures.ts'],
    }),
  );

  expect(isRemovable(plan)).toBe(true);
  expect(plan.warnings.join(' ')).toContain('never been committed');
  expect(plan.warnings.join(' ')).toContain('2 of these');
});

test('untracked files belonging to other targets are not counted', () => {
  const plan = planOffboard(
    'acme-shop',
    facts({ untrackedPaths: ['targets/other-app/fixtures.ts', 'docs/scratch.md'] }),
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

/**
 * A pack can go without taking what it owned with it.
 *
 * `alreadyGone` used to return an empty plan and report "Nothing to remove" the
 * moment neither profile nor pack existed. Credentials and stored sessions
 * outlive both — remove a pack by hand, or offboard twice, and the tool said
 * there was nothing to do while a real password sat in
 * `config/secrets.private.json` under that target's root. Observed exactly
 * that. An orphaned credential for an application the repository no longer has
 * is the worst of the states here, and it was the one that reported success.
 */
test.describe('when the pack is already gone', () => {
  const orphaned = () => facts({ knownTargets: ['example-app'], packExists: false, packFiles: [] });

  test('the credentials and sessions it owned are still offered', () => {
    const plan = planOffboard('acme-shop', orphaned());

    expect(plan.alreadyGone, 'the profile and pack really are gone').toBe(true);
    expect(plan.removeFiles).toEqual([]);
    expect(plan.removeSecretKeys).toEqual(['qa/acme-shop/pools/workforce/standard/1']);
    expect(plan.removeStorageStates).toEqual(['acme-shop.standard.json']);
  });

  test('and it can actually be executed, which is the whole point', () => {
    // Refusing here is what stranded them. `isRemovable` now asks whether
    // there is anything to remove, not whether the pack survived.
    expect(isRemovable(planOffboard('acme-shop', orphaned()))).toBe(true);
  });

  test('it says the pack is gone rather than that there is nothing to do', () => {
    const plan = planOffboard('acme-shop', orphaned());
    expect(describeOffboard(plan)[0]).toContain('already gone');
    expect(describeOffboard(plan).join(' ')).toContain('credential');
    expect(plan.warnings.join(' ')).toContain('still');
  });

  test('a target with nothing left at all is still a no-op', () => {
    // The other direction, and the one the original behaviour got right.
    const plan = planOffboard('never-existed', orphaned());
    expect(isRemovable(plan)).toBe(false);
    expect(describeOffboard(plan)[0]).toContain('Nothing to remove');
  });

  test('removing leftovers still needs the name typed back', () => {
    // Fewer things to remove is not a reason for a weaker confirmation: a
    // credential is the one thing here a person put in by hand.
    const plan = planOffboard('acme-shop', orphaned());
    expect(confirmationMatches(plan.target, 'acme')).toBe(false);
    expect(confirmationMatches(plan.target, 'acme-shop')).toBe(true);
  });
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

test.describe('the cases and stories a target owns', () => {
  /*
     Cases carry `target:` in their own body and stories carry nothing at all,
     and for a long time neither was removed. Taking a target out left its
     whole test-case library, and every requirement it was onboarded to prove,
     sitting on disk describing an application the repository no longer had.
     The same orphan as a stored session outliving its target.

     Both live inside the target's own directory now, so removing that
     directory takes them — which is what the layout is for. They are still
     counted separately, because the confirmation a person reads has to say
     "10 test case(s)" rather than fold them into a number labelled as the
     pack.
  */
  const withArtifacts = () =>
    facts({
      packFiles: [
        'fixtures.ts',
        'locators/sign-in.ts',
        'cases/AC-1-checkout.yaml',
        'cases/AC-2-refund.yaml',
        'stories/FIN-2210.json',
      ],
      caseFiles: [
        'targets/acme-shop/cases/AC-1-checkout.yaml',
        'targets/acme-shop/cases/AC-2-refund.yaml',
      ],
      storyFiles: ['targets/acme-shop/stories/FIN-2210.json'],
    });

  test('go with it, listed by name, under the one directory', () => {
    const plan = planOffboard('acme-shop', withArtifacts());

    expect(plan.removeFiles).toContain('targets/acme-shop/cases/AC-1-checkout.yaml');
    expect(plan.removeFiles).toContain('targets/acme-shop/cases/AC-2-refund.yaml');
    expect(plan.removeFiles).toContain('targets/acme-shop/stories/FIN-2210.json');
    // One directory, not three.
    expect(plan.removeDirectories).toEqual(['targets/acme-shop']);
  });

  test('the confirmation counts each kind, rather than calling them all pack files', () => {
    /*
       The sentence a person reads before typing the target's name back. It
       counted every file as "under targets/<name>/ and its profile", so the
       one safeguard on a destructive operation told them the pack was going
       and did not tell them their test cases were.
    */
    const described = describeOffboard(planOffboard('acme-shop', withArtifacts())).join('\n');

    expect(described).toContain('3 file(s) under targets/acme-shop/ and its profile');
    expect(described).toContain('2 test case(s) from targets/acme-shop/cases/');
    expect(described).toContain('1 story file(s) from targets/acme-shop/stories/');
  });

  test('a target with neither is not told about them', () => {
    const described = describeOffboard(planOffboard('acme-shop', facts())).join('\n');

    expect(described).not.toContain('test case(s)');
    expect(described).not.toContain('story file(s)');
  });

  test('a pack deleted by hand does not strand them', () => {
    /*
       The branch that exists because "the pack being gone does not mean
       nothing is left" was returning nothing but credentials and sessions.
       Remove a pack by hand, or offboard twice, and the case library and the
       stories stayed behind.
    */
    const plan = planOffboard('ghost-app', {
      ...facts(),
      knownTargets: ['acme-shop'],
      packExists: false,
      packFiles: [],
      caseFiles: ['targets/ghost-app/cases/AC-1.yaml'],
      storyFiles: ['targets/ghost-app/stories/FIN-1.json'],
    });

    expect(plan.alreadyGone).toBe(true);
    expect(plan.removeFiles).toEqual([
      'targets/ghost-app/cases/AC-1.yaml',
      'targets/ghost-app/stories/FIN-1.json',
    ]);
  });
});

/**
 * Item 69 — the fifth place a target leaves something.
 *
 * Offboarding knew about four: the profile, the pack, the credential entries
 * and the stored sessions. The onboarding draft is the fifth, and it was
 * missed because it is the only one not *named* after the target — it is a
 * single file whose `name` field happens to say which application it
 * describes.
 *
 * Found by driving the dashboard: a draft for `fold-scratch`, a target removed
 * four days earlier, was still pre-filling twelve fields of the onboarding
 * page and reopening two steps.
 */
test.describe('the onboarding draft, when a target goes', () => {
  test('a draft describing this target goes with it', () => {
    const plan = planOffboard('acme-shop', facts({ draftName: 'acme-shop' }));

    expect(plan.clearDraft).toBe(true);
    expect(plan.warnings.join(' ')).toContain('onboarding draft describes this target');
  });

  test('a draft describing something else is left alone', () => {
    // Somebody's half-finished onboarding is not this removal's to delete.
    const plan = planOffboard('acme-shop', facts({ draftName: 'other-app' }));

    expect(plan.clearDraft).toBe(false);
    expect(plan.warnings.join(' ')).not.toContain('onboarding draft');
  });

  test('no draft at all is not a draft to clear', () => {
    expect(planOffboard('acme-shop', facts({ draftName: null })).clearDraft).toBe(false);
  });

  test('the match is exact, never a prefix', () => {
    /*
       The same rule credential keys follow, and for the same reason: a draft
       for `acme-shop-staging` is not `acme-shop`'s to delete. Matching loosely
       here would throw away work that names a different application.
    */
    expect(planOffboard('acme-shop', facts({ draftName: 'acme-shop-staging' })).clearDraft).toBe(
      false,
    );
    expect(planOffboard('acme-shop-staging', facts({ draftName: 'acme-shop' })).clearDraft).toBe(
      false,
    );
  });

  test('a draft outlives the pack, so it counts as something left to remove', () => {
    /*
       The `alreadyGone` path used to report "Nothing to remove" the moment the
       profile and pack were absent, and item 16 fixed that for credentials and
       sessions. A draft is the same shape of leftover: remove the pack by
       hand, or offboard twice, and the draft describing it is still there.
    */
    const plan = planOffboard(
      'acme-shop',
      facts({
        knownTargets: ['example-app'],
        packExists: false,
        packFiles: [],
        secretKeys: [],
        storageStateFiles: [],
        draftName: 'acme-shop',
      }),
    );

    expect(plan.alreadyGone).toBe(true);
    expect(plan.clearDraft).toBe(true);
    expect(plan.warnings.join(' ')).not.toContain('Nothing named');
  });
});
