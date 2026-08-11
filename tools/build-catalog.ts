#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import { REPO_ROOT } from '../src/support/paths';
import { targetNames } from '../config/target';
import {
  readFixtureInterfaces,
  readVocabulary,
  type CatalogEntry,
} from '../src/support/catalog/extract';

/**
 * The generated capability catalog — §07.
 *
 * "The agent is instructed to select from this file and to stop and ask if the
 * needed action is absent. This is what stops helper-method hallucination, and
 * it cannot go stale because it is derived from code."
 *
 * Derived, therefore checked: `--check` fails the build when the committed
 * catalog no longer matches the source, because a stale catalog lists verbs
 * that no longer exist.
 *
 * This file is I/O and layout only; the extraction lives in
 * `src/support/catalog/extract.ts`, where it is unit-tested.
 */
const OUTPUT = path.join(REPO_ROOT, 'docs', 'generated', 'catalog.md');

interface Group {
  title: string;
  subtitle: string;
  entries: CatalogEntry[];
}

function build(): string {
  const project = new Project({
    tsConfigFilePath: path.join(REPO_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });

  const groups: Group[] = [];

  const base = project.getSourceFile(path.join(REPO_ROOT, 'src', 'fixtures', 'base.ts'));
  if (base) {
    groups.push({
      title: 'Fixtures — every target',
      subtitle: 'Target-agnostic. Available in every spec, whichever application is under test.',
      entries: readFixtureInterfaces(base, /^Framework(WorkerFixtures|TestFixtures|Options)$/),
    });
  }

  for (const target of targetNames()) {
    const targetRoot = path.join(REPO_ROOT, 'src', 'targets', target);
    if (!fs.existsSync(targetRoot)) continue;

    const fixtures = project.getSourceFile(path.join(targetRoot, 'fixtures.ts'));
    if (fixtures) {
      groups.push({
        title: `Fixtures — ${target}`,
        subtitle: `Added on top of the framework fixtures when TARGET=${target}.`,
        entries: readFixtureInterfaces(fixtures, /Fixtures$|TestData$/),
      });
    }

    for (const layer of ['actions', 'api', 'db'] as const) {
      const dir = path.join(targetRoot, layer);
      if (!fs.existsSync(dir)) continue;

      const entries: CatalogEntry[] = [];
      for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()) {
        const source = project.getSourceFile(path.join(dir, file));
        if (source) entries.push(...readVocabulary(source));
      }
      if (entries.length === 0) continue;

      groups.push({
        title: `${layer}/ — ${target}`,
        subtitle:
          layer === 'actions'
            ? 'L2 UI vocabulary. Composes locators, returns data, asserts nothing.'
            : layer === 'api'
              ? 'L2 HTTP vocabulary. Typed clients with response-schema validation.'
              : 'L2 read vocabulary. Named, parameterised queries. Read-only.',
        entries,
      });
    }
  }

  const lines: string[] = [
    '<!-- GENERATED FILE — DO NOT EDIT.',
    '     Built from the TypeScript AST by: npm run catalog:build',
    '     Verified in CI by:                npm run catalog:check -->',
    '',
    '# Capability catalog',
    '',
    'Everything a spec is allowed to reach for. Select from this file.',
    '',
    '**If what you need is not here, stop and say so.** Do not invent a helper method and do',
    'not reach for `page.locator` to work around the gap — a missing verb is a design',
    'question, and the answer is usually a new action added deliberately, once.',
    '',
  ];

  for (const group of groups) {
    lines.push(`## ${group.title}`, '', `_${group.subtitle}_`, '');
    if (group.entries.length === 0) {
      lines.push('_None._', '');
      continue;
    }
    lines.push('| Name | Signature | What it does |', '|---|---|---|');
    for (const entry of group.entries) {
      lines.push(
        `| \`${entry.name}\` | \`${escapePipes(entry.signature)}\` | ${escapePipes(entry.doc)} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function main(): number {
  const check = process.argv.includes('--check');
  const built = build();

  if (check) {
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (committed === built) {
      console.log('Capability catalog is current.');
      return 0;
    }
    console.error(
      'docs/generated/catalog.md is stale. Run `npm run catalog:build` and commit the result.\n' +
        'A stale catalog lists verbs that no longer exist, which is exactly the ' +
        'hallucination it was built to prevent (§07).',
    );
    return 1;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, built, 'utf8');
  console.log(`wrote ${path.relative(REPO_ROOT, OUTPUT)}`);
  return 0;
}

process.exit(main());
