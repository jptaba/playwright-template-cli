#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run agents:check` — §22, "Both Playwright agent tools are pre-1.0".
 *
 * "The agent definitions are explicitly meant to be regenerated whenever
 * Playwright updates... add a CI check that both agent definition sets were
 * regenerated against the installed Playwright version, since a stale set
 * fails silently."
 *
 * Two clients are supported equally, so there are two definition sets to keep
 * current — `--loop=claude` and `--loop=vscode`.
 */

const LOOPS = [
  { name: 'claude', dir: '.claude/agents', install: 'npx playwright init-agents --loop=claude' },
  { name: 'vscode', dir: '.github/agents', install: 'npx playwright init-agents --loop=vscode' },
];

function installedPlaywrightVersion(): string {
  const manifest = path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'package.json');
  if (!fs.existsSync(manifest)) return 'unknown';
  return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version: string }).version;
}

function pinnedPlaywrightVersion(): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { devDependencies?: Record<string, string> };
  return manifest.devDependencies?.['@playwright/test'] ?? 'unset';
}

/** Any version string a generated definition mentions. */
function versionsIn(dir: string): Set<string> {
  const found = new Set<string>();
  const full = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(full)) return found;
  for (const entry of fs.readdirSync(full)) {
    if (!/\.(md|chatmode\.md|yml|yaml|json)$/.test(entry)) continue;
    const text = fs.readFileSync(path.join(full, entry), 'utf8');
    for (const match of text.matchAll(/(?:playwright[^\d\n]{0,20})(\d+\.\d+\.\d+)/gi)) {
      found.add(match[1]!);
    }
  }
  return found;
}

function main(): number {
  const installed = installedPlaywrightVersion();
  const pinned = pinnedPlaywrightVersion();

  console.log(`Playwright pinned: ${pinned}   installed: ${installed}`);

  if (pinned !== installed && installed !== 'unknown' && !pinned.startsWith('^') && !pinned.startsWith('~')) {
    console.error(
      `package.json pins @playwright/test at ${pinned} but ${installed} is installed. ` +
        'Both agent packages are pre-1.0 and their command surface moves — pin exact versions ' +
        'and treat upgrades as deliberate, tested changes (§22).',
    );
    return 1;
  }

  let stale = 0;
  let installedSets = 0;

  for (const loop of LOOPS) {
    const versions = versionsIn(loop.dir);
    if (!fs.existsSync(path.join(REPO_ROOT, loop.dir))) {
      console.log(`  --loop=${loop.name}: not installed (${loop.install})`);
      continue;
    }
    installedSets++;
    if (versions.size === 0) {
      console.log(`  --loop=${loop.name}: present, no version marker found — cannot verify freshness`);
      continue;
    }
    if (!versions.has(installed)) {
      stale++;
      console.error(
        `  --loop=${loop.name}: definitions mention ${[...versions].join(', ')} but ${installed} ` +
          `is installed. Regenerate with \`${loop.install}\` and commit the result.`,
      );
      continue;
    }
    console.log(`  --loop=${loop.name}: current (${installed})`);
  }

  if (installedSets === 0) {
    console.log(
      '\nNo agent definitions installed yet. Generation runs through Playwright\'s own ' +
        'planner/generator/healer agents — install them before phase 2 measurement (§10).',
    );
  }

  return stale > 0 ? 1 : 0;
}

process.exit(main());
