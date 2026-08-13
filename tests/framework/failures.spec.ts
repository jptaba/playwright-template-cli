import { expect, test } from '@playwright/test';
import { describeBrowserLaunchFailure } from '../../src/support/ui/failures';

/**
 * A browser that will not start is a real thing that happens, and what
 * Playwright says about it is roughly four thousand characters of Chromium
 * command line. That went to the page whole, and the person reading it
 * reasonably concluded that the setting they had just changed had broken
 * something.
 */

/** Trimmed, but the same shape: first line, then the command line, then a call log. */
const WINDOWS_DEATH = [
  'browserType.launch: Target page, context or browser has been closed',
  'Browser logs:',
  '<launching> C:/dir/chrome-headless-shell.exe --disable-field-trial-config --disable-...',
  '<launched> pid=25680',
  '  - [pid=25680] <process did exit: exitCode=3221225794, signal=null>',
].join('\n');

test('a browser that died at startup is explained, not dumped', () => {
  const advice = describeBrowserLaunchFailure(new Error(WINDOWS_DEATH))!;

  // The two facts and the instruction.
  expect(advice).toContain('0xC0000142');
  expect(advice, 'it was not the operator').toContain('rather than anything to do with this');
  expect(advice).toContain('Close some browser windows');

  // The first line is kept; the command line is not.
  expect(advice).toContain('browserType.launch: Target page, context or browser has been closed');
  expect(advice, 'the arg dump is what made it unreadable').not.toContain(
    '--disable-field-trial-config',
  );
  expect(advice.length, 'short enough to read').toBeLessThan(900);
});

test('a browser that was never installed is told to install it', () => {
  const advice = describeBrowserLaunchFailure(
    new Error(
      "browserType.launch: Executable doesn't exist at C:/dir/chrome.exe\n" +
        'Please run the following command to download new browsers',
    ),
  )!;
  expect(advice).toContain('npx playwright install chromium');
});

test('a failure that is not about launching is left alone', () => {
  // Otherwise every timeout in the dashboard would be answered with advice
  // about installing browsers.
  expect(describeBrowserLaunchFailure(new Error('locator.click: Timeout 15000ms exceeded'))).toBeNull();
  expect(describeBrowserLaunchFailure(new Error('getaddrinfo ENOTFOUND api.example'))).toBeNull();
});
