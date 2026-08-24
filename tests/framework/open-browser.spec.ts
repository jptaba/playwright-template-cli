import { expect, test } from '@playwright/test';
import { shouldOpenBrowser } from '../../src/support/ui/open-browser';

/**
 * Whether the dashboard puts a window on somebody's desktop — item 79.
 *
 * It did, always, for every caller. Run 96 measured the cost from the other
 * end: sixty orphaned servers had spawned sixty browser tabs, and those tabs
 * were still holding connections — so the idle watchdog written to reap the
 * servers correctly refused to, because by its own definition somebody was
 * there. The window nobody asked for kept alive the server nobody wanted.
 */

test('a person at a terminal gets a browser, which is the path that was already right', () => {
  expect(shouldOpenBrowser({}, true)).toEqual({ open: true, explain: null });
});

test('something automated does not, and is told why', () => {
  // The case this exists for: a scheduled run, a headless check, this loop.
  const choice = shouldOpenBrowser({}, undefined);

  expect(choice.open).toBe(false);
  expect(choice.explain, 'a window that does not appear must not be a mystery').toContain(
    'DASHBOARD_OPEN=1',
  );
});

test('an explicit yes beats a missing terminal', () => {
  // Someone running it under a wrapper that eats the TTY, who does want the
  // window. The variable is the escape hatch in both directions.
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '1' }, undefined)).toEqual({
    open: true,
    explain: null,
  });
});

test('an explicit no beats a terminal', () => {
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '0' }, true)).toEqual({ open: false, explain: null });
});

test('it takes the words a person would actually type', () => {
  for (const no of ['0', 'false', 'no', 'off', 'FALSE', ' no ']) {
    expect(shouldOpenBrowser({ DASHBOARD_OPEN: no }, true).open, `${no} means no`).toBe(false);
  }
  for (const yes of ['1', 'true', 'yes', 'on']) {
    expect(shouldOpenBrowser({ DASHBOARD_OPEN: yes }, undefined).open, `${yes} means yes`).toBe(
      true,
    );
  }
});

test('a variable set to nothing is not an answer, so the terminal decides', () => {
  /*
     `DASHBOARD_OPEN=` in a shell profile, or a CI runner exporting an empty
     value, is somebody having not chosen — reading it as "no" would silently
     take the browser away from a person at a terminal.
  */
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '' }, true).open).toBe(true);
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '   ' }, true).open).toBe(true);
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '' }, undefined).open).toBe(false);
});

test('explaining is only for the case nobody chose', () => {
  // Saying "no browser, because you said so" back to somebody who said so is
  // noise on every start.
  expect(shouldOpenBrowser({ DASHBOARD_OPEN: '0' }, undefined).explain).toBeNull();
});
