import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import { readFixtureInterfaces, readVocabulary, type CatalogEntry } from '../catalog/extract';
import { REPO_ROOT } from '../paths';
import type { Vocabulary } from './spec-author';

/**
 * What a spec may reach for, for one application — read from the AST.
 *
 * The same two extractors `tools/build-catalog.ts` uses, deliberately: the
 * closed set a spec author selects from and the catalog a human reads have to
 * be the same set, and the only way to guarantee that is to derive both from
 * the same code. Reading `docs/generated/catalog.md` instead would work until
 * somebody regenerated one and not the other.
 *
 * Loaded on demand. ts-morph carries the TypeScript compiler, which is a fifth
 * of a second nothing that does not author a spec should pay — the same reason
 * `specs.ts` compares node kinds by name instead of importing it as a value.
 */
/**
 * The same vocabulary, with signatures and doc lines kept.
 *
 * `vocabularyFor` returns names because that is all verification needs. A
 * *prompt* needs more: a verb name with no signature is an invitation to guess
 * the arguments, and guessed arguments are the failure the catalog exists to
 * prevent one level up from guessed verbs.
 */
export function vocabularyEntries(target: string): {
  fixtures: CatalogEntry[];
  verbs: CatalogEntry[];
} {
  const project = loadProject();
  const fixtures: CatalogEntry[] = [];
  const verbs: CatalogEntry[] = [];

  const base = project.getSourceFile(path.join(REPO_ROOT, 'src', 'fixtures', 'base.ts'));
  if (base) {
    fixtures.push(
      ...readFixtureInterfaces(base, /^Framework(WorkerFixtures|TestFixtures|Options)$/),
    );
  }

  const targetRoot = path.join(REPO_ROOT, 'targets', target);
  const targetFixtures = project.getSourceFile(path.join(targetRoot, 'fixtures.ts'));
  if (targetFixtures) {
    fixtures.push(...readFixtureInterfaces(targetFixtures, /Fixtures$|TestData$/));
  }

  for (const layer of ['actions', 'api', 'db'] as const) {
    const dir = path.join(targetRoot, layer);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()) {
      const source = project.getSourceFile(path.join(dir, file));
      if (source) verbs.push(...readVocabulary(source));
    }
  }

  return { fixtures, verbs };
}

function loadProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(REPO_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });
}

export function vocabularyFor(target: string): Vocabulary {
  const project = new Project({
    tsConfigFilePath: path.join(REPO_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });

  const fixtures: string[] = [];
  const verbs: string[] = [];

  const base = project.getSourceFile(path.join(REPO_ROOT, 'src', 'fixtures', 'base.ts'));
  if (base) {
    for (const entry of readFixtureInterfaces(base, /^Framework(WorkerFixtures|TestFixtures|Options)$/)) {
      fixtures.push(entry.name);
    }
  }

  const targetRoot = path.join(REPO_ROOT, 'targets', target);
  const targetFixtures = project.getSourceFile(path.join(targetRoot, 'fixtures.ts'));
  if (targetFixtures) {
    for (const entry of readFixtureInterfaces(targetFixtures, /Fixtures$|TestData$/)) {
      fixtures.push(entry.name);
    }
  }

  for (const layer of ['actions', 'api', 'db'] as const) {
    const dir = path.join(targetRoot, layer);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()) {
      const source = project.getSourceFile(path.join(dir, file));
      if (source) for (const entry of readVocabulary(source)) verbs.push(entry.name);
    }
  }

  return {
    target,
    fixtures: [...new Set(fixtures)].sort(),
    verbs: [...new Set(verbs)].sort(),
  };
}
