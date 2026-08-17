import { expect, test } from '@playwright/test';
import {
  resolveSelection,
  sanitiseSelection,
  switchingRefusal,
} from '../../src/support/ui/selection';

/**
 * Which application every dashboard page is scoped to.
 *
 * The behaviour this replaces: the top bar said "none selected" on every page
 * always, because it asked `resolveTarget()` and that throws when several
 * profiles are registered and nothing has chosen. Meanwhile four pages each
 * filled a `<select>` from `/api/targets` and let the browser take the first
 * option — alphabetical order deciding which application gets tested, which
 * the conventions refuse in as many words at the CLI.
 *
 * So the rules are here, pure, where they can be read without a filesystem.
 */

const available = ['saucedemo', 'toolshop'];

test.describe('what decides', () => {
  test('the environment wins, because CI is what sets it', () => {
    const selection = resolveSelection({ fromEnvironment: 'toolshop', stored: 'saucedemo', available });
    expect(selection.name).toBe('toolshop');
    expect(selection.source).toBe('environment');
    expect(selection.switchable, 'a click must not override the run it is about to start').toBe(
      false,
    );
  });

  test('then whatever was chosen in the bar', () => {
    const selection = resolveSelection({ stored: 'saucedemo', available });
    expect(selection.name).toBe('saucedemo');
    expect(selection.source).toBe('chosen');
    expect(selection.switchable).toBe(true);
  });

  test('one application is not a choice, so it needs no choosing', () => {
    const selection = resolveSelection({ available: ['toolshop'] });
    expect(selection.name).toBe('toolshop');
    expect(selection.source).toBe('only-one');
  });

  test('several and nothing chosen is none — not the first one', () => {
    /*
       The whole point. "Alphabetical order does not get to decide which
       application gets tested" is the conventions' own sentence about the CLI,
       and the dashboard was one click from doing exactly that.
    */
    const selection = resolveSelection({ available });
    expect(selection.name).toBe(null);
    expect(selection.source).toBe('none');
    expect(selection.available).toEqual(available);
  });

  test('nothing onboarded is none, and says nothing else', () => {
    expect(resolveSelection({ available: [] }).name).toBe(null);
  });
});

test.describe('a selection that no longer names anything', () => {
  test('a stored choice for an offboarded application is dropped', () => {
    /*
       Offboarding removes profiles and this file outlives them. A selection
       that survived its target would scope every page to something gone, and
       the bar would name it confidently.
    */
    const selection = resolveSelection({ stored: 'removed-last-week', available });
    expect(selection.name).toBe(null);
    expect(selection.source).toBe('none');
  });

  test('but a TARGET naming one is reported, not quietly replaced', () => {
    // The one case where falling through would hide a broken TARGET behind a
    // page that looks fine.
    const selection = resolveSelection({
      fromEnvironment: 'typo-shop',
      stored: 'saucedemo',
      available,
    });
    expect(selection.name).toBe(null);
    expect(selection.switchable).toBe(false);
    expect(switchingRefusal(selection)?.detail).toContain('does not have');
  });
});

test.describe('what may be stored', () => {
  test('takes a target name and nothing else', () => {
    expect(sanitiseSelection({ target: 'acme-shop' })).toBe('acme-shop');
    expect(sanitiseSelection({ target: '' })).toBe(null);
    expect(sanitiseSelection({ target: 'Acme Shop' }), 'not a directory name').toBe(null);
    expect(sanitiseSelection({ target: '../../etc/passwd' })).toBe(null);
    expect(sanitiseSelection({ target: 42 })).toBe(null);
    expect(sanitiseSelection(null)).toBe(null);
    expect(sanitiseSelection('toolshop'), 'a bare string is not the shape stored').toBe(null);
  });
});

test('a switchable selection has nothing to explain', () => {
  expect(switchingRefusal(resolveSelection({ stored: 'toolshop', available }))).toBe(null);
  expect(switchingRefusal(resolveSelection({ available }))).toBe(null);
});
