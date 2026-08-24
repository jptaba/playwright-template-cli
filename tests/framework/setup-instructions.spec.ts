import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { repoPath } from '../../src/support/paths';

/**
 * The setup a newcomer is told to run has to be the setup that works.
 *
 * It stopped being, quietly and in two places. `npm run verify` runs the
 * `dashboard` project, which drives a real Chromium, and no Playwright package
 * here ships a postinstall of its own — so `npm install` downloaded no browser.
 * The README's quickstart said three lines under its own install command that
 * verify "needs no browser"; the handbook's five-minutes-to-green never
 * mentioned one at all, so following it ended at `browserType.launch:
 * Executable doesn't exist`.
 *
 * Both claims were true when they were written. The `dashboard` project joined
 * `test:framework` two days afterwards, and nothing noticed that one of them
 * had stopped being — which is the argument for pinning it here rather than
 * writing it down again and hoping.
 *
 * `npm install` now brings the browser with it, so what these check is the
 * chain that makes the quickstart true: install installs a browser, and verify
 * is what needs one.
 */

const read = (file: string): string =>
  fs.readFileSync(repoPath(file), 'utf8').replace(/\r\n/g, '\n');

const scripts = (): Record<string, string> =>
  (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

/** The two documents a person is pointed at before they have run anything. */
const QUICKSTARTS = ['README.md', 'docs/handbook.html'];

/** Shell blocks, from either markdown fences or the handbook's `pre`/`code`. */
function commandBlocks(file: string): string[] {
  const text = read(file);
  const blocks = file.endsWith('.md')
    ? [...text.matchAll(/```bash\n([\s\S]*?)```/g)]
    : [...text.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)];
  return blocks.map((match) => match[1]!.replace(/<[^>]+>/g, ''));
}

function carriesInOrder(block: string, steps: string[]): boolean {
  let at = 0;
  for (const step of steps) {
    const found = block.indexOf(step, at);
    if (found === -1) return false;
    at = found + step.length;
  }
  return true;
}

/** `verify` with every `npm run <script>` it reaches expanded into it. */
function verifyChain(): string {
  const all = scripts();
  const expand = (name: string, seen: Set<string>): string => {
    if (seen.has(name)) return '';
    seen.add(name);
    return (all[name] ?? '').replace(
      /npm run ([\w:-]+)/g,
      (whole, referenced: string) => `${whole} ${expand(referenced, seen)}`,
    );
  };
  return expand('verify', new Set());
}

test.describe('setup instructions', () => {
  test('npm install brings down the browser, so the quickstart is two commands', () => {
    const postinstall = scripts()['postinstall'] ?? '';
    expect(postinstall, 'nothing installs a browser after npm install').toContain(
      'tools/install-browsers.ts',
    );

    // What that script actually does, rather than what its name suggests.
    const tool = read('tools/install-browsers.ts');
    expect(tool).toContain("'playwright'");
    expect(tool).toContain("'install', 'chromium'");
  });

  for (const file of QUICKSTARTS) {
    test(`${file} gets you from a clone to a green build`, () => {
      const found = commandBlocks(file).some((block) =>
        carriesInOrder(block, ['npm install', 'npm run verify']),
      );

      expect(found, `${file} has no command block running npm install → npm run verify`).toBe(true);
    });
  }

  test('and the browser is there because verify really does drive one', () => {
    // The reason any of this is here, checked rather than assumed. If verify
    // stops reaching a browser project this fails — and the answer is to
    // revisit the postinstall and the two quickstarts, not to delete the test
    // that noticed.
    expect(verifyChain()).toContain('--project=dashboard');

    const config = read('playwright.config.ts');
    const dashboard = config.slice(config.indexOf("name: 'dashboard'"));
    expect(dashboard.slice(0, 200), 'the dashboard project no longer declares a browser').toContain(
      "devices['Desktop Chrome']",
    );
  });
});
