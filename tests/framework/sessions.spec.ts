import { expect, test } from '@playwright/test';
import {
  describeOrphanedSessions,
  orphanedSessions,
  parseSessionFile,
} from '../../src/support/onboarding/sessions';
import { planOffboard, type OffboardFacts } from '../../src/support/onboarding/offboard';

/**
 * Stored sessions belonging to nothing.
 *
 * `target:remove` shreds the sessions of the target it removes. Nothing looked
 * at the ones belonging to a target that had already gone — and two were found
 * in this repository, for applications it had not known about for weeks. A
 * storage state is a live credential; one attached to no application is a
 * login with no reason for anybody to think about it.
 */

test.describe('reading a session filename', () => {
  test('splits the target from the role', () => {
    expect(parseSessionFile('acme-shop.standard.json')).toEqual({
      file: 'acme-shop.standard.json',
      target: 'acme-shop',
      role: 'standard',
    });
    expect(parseSessionFile('shop2.admin.json')?.target).toBe('shop2');
  });

  test('leaves alone anything that is not a session', () => {
    /*
       `.auth/` is gitignored, which makes it a place people put things. A
       scratch file there must not be reported as a stray credential — and must
       certainly never be offered up for deletion.
    */
    for (const file of [
      'notes.txt',
      'README.md',
      '.gitignore',
      'acme-shop.json',
      'Acme-Shop.standard.json',
      'acme.shop.standard.json',
      '.DS_Store',
      'standard.json',
    ]) {
      expect(parseSessionFile(file), file).toBeNull();
    }
  });
});

test.describe('finding the orphans', () => {
  test('names sessions whose target is not onboarded', () => {
    const orphans = orphanedSessions(
      [
        'example-app.standard.json',
        'dash-demo.customer.json',
        'saucedemo.standard.json',
      ],
      ['example-app'],
    );
    expect(orphans.map((session) => session.file)).toEqual([
      'dash-demo.customer.json',
      'saucedemo.standard.json',
    ]);
  });

  test('a target with several roles keeps all of them', () => {
    expect(
      orphanedSessions(['shop.standard.json', 'shop.admin.json'], ['shop']),
    ).toEqual([]);
  });

  test('and loses all of them when it goes', () => {
    expect(
      orphanedSessions(['shop.standard.json', 'shop.admin.json'], []).map((s) => s.role),
    ).toEqual(['standard', 'admin']);
  });

  test('an empty .auth is not a finding', () => {
    expect(orphanedSessions([], ['example-app'])).toEqual([]);
  });

  test('no targets at all makes every session an orphan, which is correct', () => {
    // The state after removing the last application. Everything in .auth is
    // then a credential for something this repository no longer knows about.
    expect(orphanedSessions(['shop.standard.json'], [])).toHaveLength(1);
  });

  test('the description says what to do and that nothing is lost', () => {
    const said = describeOrphanedSessions(orphanedSessions(['gone.standard.json'], []));
    expect(said).toContain('gone.standard.json');
    expect(said).toContain('live credential');
    expect(said).toContain('setup:auth');
  });

  test('a long list is summarised rather than dumped', () => {
    const many = Array.from({ length: 9 }, (_, i) => `app${i}.standard.json`);
    const said = describeOrphanedSessions(orphanedSessions(many, []));
    expect(said).toContain('9 stored session(s)');
    expect(said).toContain('and 5 more');
  });
});

// ---------------------------------------------------------------------------
// Where it gets reported
//
// The doctor's half lives beside the other `diagnose` tests in
// onboarding.spec.ts, where the profile and facts fixtures already are.
// ---------------------------------------------------------------------------

test.describe('the removal plan', () => {
  const offboardFacts = (over: Partial<OffboardFacts> = {}): OffboardFacts => ({
    knownTargets: ['shop', 'example-app'],
    packExists: true,
    packFiles: ['fixtures.ts'],
    untrackedPaths: [],
    secretKeys: [],
    caseFiles: [],
    storyFiles: [],
    draftName: null,
    storageStateFiles: ['shop.standard.json'],
    pointsAtPlaceholderHost: false,
    ...over,
  });

  test('mentions sessions left by some other target that has gone', () => {
    /*
       Off topic for this removal and the right moment to say it: removing a
       target is when somebody is already thinking about what gets left behind,
       and a session outliving its target is how these appear.
    */
    const plan = planOffboard(
      'shop',
      offboardFacts({
        storageStateFiles: ['shop.standard.json', 'long-gone.standard.json'],
      }),
    );
    expect(plan.warnings.join(' ')).toContain('long-gone.standard.json');
  });

  test('does not report the sessions it is about to remove itself as orphans', () => {
    // They belong to the target being removed, they are in `removeStorageStates`,
    // and saying both would be the same file counted twice under two headings.
    const plan = planOffboard('shop', offboardFacts());
    expect(plan.removeStorageStates).toEqual(['shop.standard.json']);
    expect(plan.warnings.join(' ')).not.toContain('belong to no application');
  });
});
