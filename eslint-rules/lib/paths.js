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
 * Resolve an import specifier to a repo-relative path when it is relative.
 *
 * Import specifiers carry no extension, but the layer patterns are written
 * against real filenames — so `../fixtures` is normalised to `fixtures.ts`,
 * and a directory import to its `index.ts`.
 */
function resolveImport(relativePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const dir = path.posix.dirname(relativePath);
  const joined = path.posix.normalize(path.posix.join(dir, specifier));
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
