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

/**
 * The shapes the verbs take and return, rendered for a prompt.
 *
 * **The gap behind most of the type errors a real model produced.** The
 * catalog publishes `users.add: (page, user: NewUser) => Promise<UserSaveResult>`
 * and then says nothing whatever about what a `NewUser` or a `UserSaveResult`
 * *is*. So a draft knows the verb exists, knows it returns something with a
 * name, and guesses the fields: `.error` for `errors`, `.count` for `total`,
 * a two-field object where four are required. Every one of those was caught by
 * the compiler, and every one cost an attempt that need not have been spent.
 *
 * Interfaces only, and only the pack's own. Framework types are reachable
 * through fixtures whose signatures already name them, and pulling in the
 * transitive closure of Playwright's types would bury the four shapes that
 * actually matter.
 */
export function vocabularyTypes(target: string): string[] {
  const project = loadProject();
  const targetRoot = path.join(REPO_ROOT, 'targets', target);
  const shapes: string[] = [];
  const seen = new Set<string>();

  for (const layer of ['actions', 'api', 'db'] as const) {
    const dir = path.join(targetRoot, layer);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()) {
      const source = project.getSourceFile(path.join(dir, file));
      if (!source) continue;

      for (const declaration of source.getInterfaces()) {
        if (!declaration.isExported()) continue;
        const name = declaration.getName();
        if (seen.has(name)) continue;
        seen.add(name);

        const members = [
          ...declaration.getProperties().map((member) => {
            const optional = member.hasQuestionToken() ? '?' : '';
            return `  ${member.getName()}${optional}: ${member.getType().getText(member)};`;
          }),
          ...declaration.getMethods().map((method) => `  ${method.getName()}(…);`),
        ];
        if (members.length > 0) shapes.push(`interface ${name} {\n${members.join('\n')}\n}`);
      }
    }
  }

  return shapes;
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
