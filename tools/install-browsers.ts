#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

/**
 * `postinstall` — bring down the browser `npm run verify` needs (§01).
 *
 * `verify` runs the `dashboard` project, which drives a real Chromium, and no
 * Playwright package here ships a postinstall of its own: `@playwright/test`,
 * `playwright` and `playwright-core` all declare empty `scripts`. So
 * `npm install` alone left a newcomer at `browserType.launch: Executable
 * doesn't exist`, and the handbook's five-minutes-to-green did not mention it.
 *
 * This is a script rather than `playwright install chromium` inline because
 * the inline form has no way out. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` guards
 * the *package* postinstall path only — an explicit `playwright install`
 * ignores it and starts on 190MB regardless, which was measured rather than
 * assumed. On a network that 403s the CDN, which this repository already
 * documents as something that happens, that would turn `npm install` into
 * something you cannot complete at all.
 *
 * So the download is skippable and the failure is diagnosable, and it is loud
 * in every other case: a browser that silently did not arrive is the failure
 * this script exists to stop.
 */

const SKIP = 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD';

function main(): number {
  if (process.env[SKIP]) {
    console.log(`${SKIP} is set — skipping the browser download.`);
    console.log(
      '`npm run verify` drives one for its dashboard tests. Run ' +
        '`npx playwright install chromium` when the network allows it.',
    );
    return 0;
  }

  // npm puts node_modules/.bin on PATH for a lifecycle script; `shell` is what
  // finds the .cmd shim on Windows.
  const result = spawnSync('playwright', ['install', 'chromium'], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status === 0) return 0;

  console.error(
    '\nThe browser download failed, so `npm run verify` cannot run its dashboard tests.\n\n' +
      'Behind a proxy or an interception appliance, the download is the call that ' +
      'breaks first:\n' +
      '  HTTPS_PROXY=…               route it\n' +
      '  PLAYWRIGHT_DOWNLOAD_HOST=…  an internal mirror of the CDN\n\n' +
      'Or install without it and pick the browser up when you can:\n' +
      `  ${SKIP}=1 npm install\n` +
      '  npx playwright install chromium\n',
  );
  return result.status ?? 1;
}

process.exit(main());
