import { expect, test } from '@playwright/test';
import {
  closeOnFailure,
  describeBrowserLaunchFailure,
  isTransientLaunchFailure,
  launchBrowser,
} from '../../src/support/ui/failures';

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

// ---------------------------------------------------------------------------
// Giving a transient failure a second chance
// ---------------------------------------------------------------------------

test.describe('launching a browser', () => {
  /** Never actually waits: the pause is injected so the test does not sit through it. */
  const noPause = async () => undefined;

  test('a browser that starts is not retried', async () => {
    let attempts = 0;
    const browser = await launchBrowser(async () => {
      attempts += 1;
      return 'a browser';
    }, noPause);

    expect(browser).toBe('a browser');
    expect(attempts).toBe(1);
  });

  test('0xC0000142 gets one more chance, because it is a state of the machine', async () => {
    /*
       The desktop heap is fixed in size and shared by every process with a
       window. A launch that fails against it is failing against how full the
       machine happens to be, not against anything about the request — so the
       same call a second later often just works.
    */
    let attempts = 0;
    const browser = await launchBrowser(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error(WINDOWS_DEATH);
      return 'a browser';
    }, noPause);

    expect(browser).toBe('a browser');
    expect(attempts).toBe(2);
  });

  test('one more chance, not a loop', async () => {
    // Five attempts would turn a clear failure into a hang.
    let attempts = 0;
    await expect(
      launchBrowser(async () => {
        attempts += 1;
        throw new Error(WINDOWS_DEATH);
      }, noPause),
    ).rejects.toThrow('0xC0000142');
    expect(attempts).toBe(2);
  });

  test('a missing browser is not retried, because it will fail identically forever', async () => {
    let attempts = 0;
    await expect(
      launchBrowser(async () => {
        attempts += 1;
        throw new Error(
          "browserType.launch: Executable doesn't exist at C:/dir/chrome.exe\n" +
            'Please run the following command to download new browsers',
        );
      }, noPause),
    ).rejects.toThrow('npx playwright install chromium');
    expect(attempts, 'retrying only doubles the wait before the answer').toBe(1);
  });

  test('whatever comes out carries the advice, not the wall of command line', async () => {
    const failed = await launchBrowser(async () => {
      throw new Error(WINDOWS_DEATH);
    }, noPause).catch((error: Error) => error);

    expect(failed.message).toContain('Close some browser windows');
    expect(failed.message).not.toContain('--disable-field-trial-config');
  });

  test('a failure that is not about launching is passed through untouched', async () => {
    const original = new Error('getaddrinfo ENOTFOUND api.example');
    const failed = await launchBrowser(async () => {
      throw original;
    }, noPause).catch((error: Error) => error);

    expect(failed, 'the same error object, not a rewrite of it').toBe(original);
  });

  test('which failures are worth retrying is decided by the failure, not by hope', () => {
    expect(isTransientLaunchFailure(new Error(WINDOWS_DEATH))).toBe(true);
    expect(isTransientLaunchFailure(new Error('exit code 0xC0000142'))).toBe(true);
    expect(isTransientLaunchFailure(new Error("Executable doesn't exist"))).toBe(false);
    expect(isTransientLaunchFailure(new Error('locator.click: Timeout'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Never leaving a browser nobody can close
// ---------------------------------------------------------------------------

test.describe('the gap between launching and holding the handle', () => {
  /** A browser that records whether anybody closed it. */
  const aBrowser = () => {
    const state = { closed: 0 };
    return { state, browser: { close: async () => void (state.closed += 1) } };
  };

  test('setup that succeeds leaves the browser open, for the caller to own', async () => {
    const { state, browser } = aBrowser();
    const session = await closeOnFailure(browser, async () => 'a session', () => 'unused');

    expect(session).toBe('a session');
    expect(state.closed, 'the caller holds it now').toBe(0);
  });

  test('setup that fails closes the browser rather than orphaning it', async () => {
    /*
       This is the defect behind the 0xC0000142 people were reporting. The
       assisted sign-in launched a *headed* browser, then navigated, then
       stored the handle — and a wrong sign-in path or an unreachable host made
       the middle step throw. Nothing could close it afterwards: `assistCancel`
       had nothing to cancel, and the window outlived the request. One per
       failed attempt, until the desktop heap ran out and the next launch died.
    */
    const { state, browser } = aBrowser();

    await expect(
      closeOnFailure(
        browser,
        async () => {
          throw new Error('net::ERR_NAME_NOT_RESOLVED');
        },
        (error) => `could not reach it: ${(error as Error).message}. It has been closed again.`,
      ),
    ).rejects.toThrow('It has been closed again');

    expect(state.closed, 'exactly once').toBe(1);
  });

  test('the reason it failed is what comes out, not the closing', async () => {
    const { browser } = aBrowser();
    const failed = await closeOnFailure(
      browser,
      async () => {
        throw new Error('net::ERR_NAME_NOT_RESOLVED');
      },
      (error) => `check the base URL — ${(error as Error).message}`,
    ).catch((error: Error) => error);

    expect(failed.message).toContain('check the base URL');
    expect(failed.message).toContain('ERR_NAME_NOT_RESOLVED');
  });

  test('a close that itself fails does not hide why setup failed', async () => {
    // A browser that is already gone throws on close. The useful failure is
    // still the first one.
    const browser = {
      close: async () => {
        throw new Error('Target page, context or browser has been closed');
      },
    };

    await expect(
      closeOnFailure(browser, async () => {
        throw new Error('the page timed out');
      }, (error) => `setup failed: ${(error as Error).message}`),
    ).rejects.toThrow('setup failed: the page timed out');
  });
});
