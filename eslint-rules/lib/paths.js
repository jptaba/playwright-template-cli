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

/**
 * Where a target's pack lives, repo-relative. One statement of it.
 *
 * The layout was written out in every rule that needed it, and again on the
 * TypeScript side in `src/support/paths.ts` — which cannot be imported here,
 * because a lint rule runs in plain CommonJS. Two copies is the arrangement
 * this repository keeps finding defects in, so this one is exported and a
 * framework test asserts the two agree. That test is what catches the halves
 * of a layout change going in separately.
 */
const TARGET_PACK_ROOT = 'src/targets';

/** `<pack root>/<target>/<tail>` as a pattern. The target is not captured. */
const packPattern = (tail) => new RegExp('^' + TARGET_PACK_ROOT + '/[^/]+/' + tail);

const TARGET_OF = new RegExp('^' + TARGET_PACK_ROOT + '/([^/]+)/');

/** Which target's pack a file belongs to, or null for framework code. */
function targetOf(relativePath) {
  const match = TARGET_OF.exec(relativePath);
  return match ? match[1] : null;
}

const LAYERS = {
  /** L1 primitives: named locators, endpoint descriptors, named SQL. */
  primitive: packPattern('(locators|endpoints|queries)/'),
  /** L2 vocabularies: UI actions, typed HTTP clients, read-only queries. */
  vocabulary: packPattern('(actions|api|db)/'),
  /** L3 the injectable surface. */
  fixtures: new RegExp('^(src/fixtures/|' + TARGET_PACK_ROOT + '/[^/]+/fixtures[.]ts$)'),
  /** L4 specs — every assertion lives here. */
  spec: packPattern('tests/'),
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
  const match = packPattern('tests/([^/]+)/').exec(relativePath);
  return match ? match[1] : null;
}

/**
 * The framework's default set of files the `auth-flows` project owns. Must stay
 * in step with `playwright.config.ts`.
 *
 * `register` and `forgot` are in the default because signing up and recovering
 * a password are signed-out journeys on essentially every application that has
 * them — leaving them out meant the commonest override was one every target had
 * to discover for itself, by watching a registration spec redirect away from
 * the form it was trying to fill in.
 */
const DEFAULT_AUTH_FLOW_PATTERN = /(login|mfa|password|register|signup|forgot)\.spec\.ts$/;

/**
 * The pattern a target's own profile declares, if it declares one.
 *
 * A profile may override `authFlowPattern`, and `playwright.config.ts` honours
 * it — so a lint rule carrying its own hardcoded copy will disagree with the
 * runtime the moment anyone uses the override. That disagreement is the worst
 * kind: the rule rejects a file the runner would have handled correctly, and
 * the message tells the author to undo the thing that made it work.
 *
 * Read textually rather than by importing the profile, because profiles are
 * TypeScript and a lint rule runs in plain CommonJS. A profile that computes
 * the pattern instead of writing it as a literal falls back to the default,
 * which is the safe direction: the rule then asks for more than the runtime
 * does rather than less.
 */
function authFlowPatternFor(relativePath) {
  const target = targetOf(relativePath);
  if (!target) return DEFAULT_AUTH_FLOW_PATTERN;

  const profile = path.join(REPO_ROOT, 'config', 'targets', `${target}.ts`);
  if (!fs.existsSync(profile)) return DEFAULT_AUTH_FLOW_PATTERN;

  const declared = /authFlowPattern\s*:\s*\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)/.exec(
    fs.readFileSync(profile, 'utf8'),
  );
  if (!declared) return DEFAULT_AUTH_FLOW_PATTERN;

  try {
    return new RegExp(declared[1], declared[2]);
  } catch {
    return DEFAULT_AUTH_FLOW_PATTERN;
  }
}

/**
 * Whether this file's target declares itself a deployment shared with
 * strangers.
 *
 * Read textually for the same reason `authFlowPatternFor` is: profiles are
 * TypeScript and a lint rule runs in plain CommonJS.
 *
 * **The fallback direction is the opposite one here, and it is deliberate.**
 * An unreadable auth-flow pattern falls back to asking for *more* than the
 * runtime does, which is safe. This one falls back to `false`, which is the
 * quieter answer rather than the safer one — but a rule that fired on every
 * target the moment a profile computed this flag would be wrong on the
 * majority of them, and `sharedEnvironment` is a plain boolean nobody has any
 * reason to compute. If that ever stops being true, the fix is for the rule to
 * read the profile properly, not for it to guess.
 */
function isSharedEnvironment(relativePath) {
  const target = targetOf(relativePath);
  if (!target) return false;

  const profile = path.join(REPO_ROOT, 'config', 'targets', `${target}.ts`);
  if (!fs.existsSync(profile)) return false;

  return /sharedEnvironment\s*:\s*true/.test(fs.readFileSync(profile, 'utf8'));
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
  [/^@targets\//, TARGET_PACK_ROOT + '/'],
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
  TARGET_PACK_ROOT,
  relPath,
  targetNames,
  targetOf,
  layerOf,
  isFramework,
  isSpec,
  projectOf,
  resolveImport,
  authFlowPatternFor,
  isSharedEnvironment,
  DEFAULT_AUTH_FLOW_PATTERN,
};
