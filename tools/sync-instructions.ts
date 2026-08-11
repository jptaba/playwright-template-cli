#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `docs/CONVENTIONS.md` → the per-client instruction files — §07.
 *
 * "The three generated instruction files are byte-derived from
 * docs/CONVENTIONS.md and verified in CI. This is the only defence against
 * Copilot and Claude Code slowly diverging into two different house styles."
 *
 * Both clients are first-class, which doubles the surface that can rot (§22).
 * Generating the text from one source keeps the *words* aligned; lint, types
 * and the test run are what keep the *code* aligned.
 */

const SOURCE = path.join(REPO_ROOT, 'docs', 'CONVENTIONS.md');

interface Client {
  /** Repo-relative output path. */
  file: string;
  label: string;
  preamble: string;
}

const CLIENTS: Client[] = [
  {
    file: 'CLAUDE.md',
    label: 'Claude Code',
    preamble: [
      'Explore the running application with `npx playwright-cli` before writing a spec —',
      'snapshots are written to disk and read on demand, which is roughly 4x cheaper in',
      'tokens than streaming them through the MCP server (§08). The MCP server is installed',
      'too; reach for it when a human is interactively poking at a stubborn page.',
    ].join(' '),
  },
  {
    file: 'AGENTS.md',
    label: 'any agent following the AGENTS.md convention',
    preamble: [
      'Before writing a spec, read `docs/generated/catalog.md` for the fixtures and actions',
      'available. If what you need is not in it, stop and say so rather than inventing a',
      'helper or reaching for `page.locator`.',
    ].join(' '),
  },
  {
    file: '.github/copilot-instructions.md',
    label: 'GitHub Copilot',
    preamble: [
      'These instructions apply to every file in this repository. Prefer the fixtures and',
      'actions listed in `docs/generated/catalog.md`; the lint rules named below run on',
      'every merge request and will reject code that ignores them.',
    ].join(' '),
  },
];

const BANNER = (client: Client, hash: string): string =>
  [
    `<!-- GENERATED FILE — DO NOT EDIT.`,
    `     Source: docs/CONVENTIONS.md (sha256 ${hash})`,
    `     Regenerate: npm run instructions:build`,
    `     Verified in CI by: npm run instructions:check -->`,
    '',
    `# Test framework conventions — for ${client.label}`,
    '',
    client.preamble,
    '',
    '---',
    '',
  ].join('\n');

function render(client: Client, conventions: string, hash: string): string {
  // Byte-derived: the body is the source verbatim, so the only way the files
  // can disagree with each other is if someone edits a generated file.
  return `${BANNER(client, hash)}${conventions.trimStart()}`;
}

function main(): number {
  const check = process.argv.includes('--check');

  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing ${path.relative(REPO_ROOT, SOURCE)} — the single source of truth.`);
    return 2;
  }
  const conventions = fs.readFileSync(SOURCE, 'utf8');
  const hash = crypto.createHash('sha256').update(conventions).digest('hex').slice(0, 16);

  const stale: string[] = [];
  for (const client of CLIENTS) {
    const target = path.join(REPO_ROOT, client.file);
    const expected = render(client, conventions, hash);
    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    if (check) {
      if (actual !== expected) stale.push(client.file);
      continue;
    }

    if (actual !== expected) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, expected, 'utf8');
      console.log(`wrote ${client.file}`);
    }
  }

  if (check) {
    if (stale.length === 0) {
      console.log(`Instruction files are in sync with docs/CONVENTIONS.md (${hash}).`);
      return 0;
    }
    console.error(
      `Stale instruction file(s): ${stale.join(', ')}\n` +
        'These are generated from docs/CONVENTIONS.md. Edit the conventions, then run ' +
        '`npm run instructions:build` and commit the result. A stale instruction file ' +
        'degrades generation silently, which is why this fails the build (§07).',
    );
    return 1;
  }

  return 0;
}

process.exit(main());
