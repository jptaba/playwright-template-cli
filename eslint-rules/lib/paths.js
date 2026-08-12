'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Repo-relative, forward-slashed path for the file being linted. */
function relPath(context) {
  const filename = context.filename ?? context.getFilename();
  return path.relative(REPO_ROOT, filename).split(path.sep).join('/');
}

/**
 * Target names are discovered from `config/targets/*.ts` rather than listed
 * here, so adding a target never means editing a lint rule.
 */
function targetNames() {
  const dir = path.join(REPO_ROOT, 'config', 'targets');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && file !== 'types.ts')
    .map((file) => file.replace(/\.ts$/, ''));
}

/** Which target's pack a file belongs to, or null for framework code. */
function targetOf(relativePath) {
  const match = /^src\/targets\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

const LAYERS = {
  /** L1 primitives: named locators, endpoint descriptors, named SQL. */
  primitive: /^src\/targets\/[^/]+\/(locators|endpoints|queries)\//,
  /** L2 vocabularies: UI actions, typed HTTP clients, read-only queries. */
  vocabulary: /^src\/targets\/[^/]+\/(actions|api|db)\//,
  /** L3 the injectable surface. */
  fixtures: /^(src\/fixtures\/|src\/targets\/[^/]+\/fixtures\.ts$)/,
  /** L4 specs — every assertion lives here. */
  spec: /^src\/targets\/[^/]+\/tests\//,
};

function layerOf(relativePath) {
  for (const [layer, pattern] of Object.entries(LAYERS)) {
    if (pattern.test(relativePath)) return layer;
  }
  return null;
}

/** Framework code: must work for any application under test. */
const FRAMEWORK_PATTERNS = [
  /^src\/fixtures\//,
  /^src\/integrations\//,
  /^src\/support\//,
  /^tools\//,
];

function isFramework(relativePath) {
  return FRAMEWORK_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function isSpec(relativePath) {
  return layerOf(relativePath) === 'spec';
}

/** Which Playwright project a spec belongs to, from its path. */
function projectOf(relativePath) {
  const match = /^src\/targets\/[^/]+\/tests\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

/**
 * Directories a non-relative specifier can point into and still be this
 * repository's own code. Anything else is a package.
 */
const REPO_ROOTS = ['src/', 'config/', 'tools/', 'tests/', 'eslint-rules/'];

/**
 * Aliases that have existed, or could plausibly be re-added, in tsconfig's
 * `paths`. Listed here so the layer rules keep working if one comes back.
 *
 * They were removed from tsconfig.json because nothing used them and they were
 * a silent hole in `layer-boundaries`: this function only understood relative
 * specifiers, so `import { x } from '@targets/app/locators/y'` in a spec
 * resolved to nothing, matched no layer, and passed a rule whose entire job is
 * to forbid it. Deleting the aliases makes such an import a type error, and
 * handling them here means the rule catches it either way.
 */
const ALIASES = [
  [/^@targets\//, 'src/targets/'],
  [/^@fixtures\//, 'src/fixtures/'],
  [/^@integrations\//, 'src/integrations/'],
  [/^@support\//, 'src/support/'],
  [/^@config\//, 'config/'],
];

/**
 * Resolve an import specifier to a repo-relative path.
 *
 * Import specifiers carry no extension, but the layer patterns are written
 * against real filenames — so `../fixtures` is normalised to `fixtures.ts`,
 * and a directory import to its `index.ts`.
 */
function resolveImport(relativePath, specifier) {
  let joined = null;

  if (specifier.startsWith('.')) {
    const dir = path.posix.dirname(relativePath);
    joined = path.posix.normalize(path.posix.join(dir, specifier));
  } else {
    const alias = ALIASES.find(([pattern]) => pattern.test(specifier));
    if (alias) {
      joined = specifier.replace(alias[0], alias[1]);
    } else if (REPO_ROOTS.some((root) => specifier.startsWith(root))) {
      joined = path.posix.normalize(specifier);
    }
  }

  if (joined === null) return null;

  const last = joined.split('/').pop() ?? '';
  if (last.includes('.')) return joined;
  // Try the file first; callers only pattern-match, so offering both is wrong.
  // `<name>.ts` is the overwhelmingly common case in this repository.
  return `${joined}.ts`;
}

module.exports = {
  REPO_ROOT,
  relPath,
  targetNames,
  targetOf,
  layerOf,
  isFramework,
  isSpec,
  projectOf,
  resolveImport,
};
