#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../config/target';
import { resolveExploreUrl } from '../src/support/onboarding/explore-url';

/**
 * `npm run explore [-- /path]` — open the target under test and snapshot it.
 *
 * The URL comes from the resolved profile, so nobody types a host. That is not
 * ceremony: `resolveTarget` runs the non-production allowlist check on the way
 * through, which means exploration is subject to exactly the same guard as a
 * test run (§17). A typed URL bypasses it.
 *
 * `@playwright/cli` writes the accessibility tree to disk and reads it on
 * demand, which is roughly four times cheaper in tokens than streaming
 * snapshots through the MCP server — and exploration is the only real fix for
 * locator hallucination, so it wants to be cheap enough to do every time.
 */
function main(): number {
  const target = resolveTarget();
  const [pathArgument] = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
  const url = resolveExploreUrl(target.baseURL, pathArgument);

  console.log(`Target : ${target.name} (${target.environment})`);
  console.log(`Opening: ${url}`);
  console.log(
    `\nThen, in another shell:\n` +
      `  npx playwright-cli snapshot            # accessibility tree to disk as YAML\n` +
      `  npx playwright-cli find "Sign in"      # search that snapshot\n` +
      `\nWrite L1 locators from what the snapshot says, not from what you expect it to say.\n`,
  );

  const result = spawnSync('npx', ['playwright-cli', 'open', url], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(
      `Could not start playwright-cli: ${result.error.message}\n` +
        'It ships as a dependency of this repository — try `npm install` first.',
    );
    return 2;
  }
  return result.status ?? 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
