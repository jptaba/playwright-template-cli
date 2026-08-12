#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../src/support/paths';
import {
  confirmationMatches,
  describeOffboard,
  isRemovable,
  planOffboard,
  OffboardError,
  type OffboardFacts,
  type OffboardPlan,
} from '../src/support/onboarding/offboard';

/**
 * `npm run target:remove` — take an application back out, and leave the
 * agnostic framework behind.
 *
 * The reason this exists is that trying an application used to mean a branch:
 * scaffold it somewhere `main` could not see, drive it, then move back and
 * forth to compare. With a clean way out, `main` is the place to do it.
 *
 * Dry by default. It prints the plan and stops unless `--confirm=<name>`
 * repeats the target's own name back — the pattern from deleting a repository,
 * for the same reason: this is irreversible for anything not committed, and a
 * confirmation a stray keystroke can satisfy is not a confirmation.
 */
const USAGE = `Usage:
  npx tsx tools/offboard.ts --name=<app>                 # plan only, removes nothing
  npx tsx tools/offboard.ts --name=<app> --confirm=<app> # actually remove it

Options:
  --name=<app>       the target to remove
  --confirm=<app>    repeat the name to go ahead; anything else plans only
  --keep-secrets     leave config/secrets.local.json alone`;

export function gatherFacts(target: string): OffboardFacts {
  const targetsDir = path.join(REPO_ROOT, 'config', 'targets');
  const knownTargets = fs.existsSync(targetsDir)
    ? fs
        .readdirSync(targetsDir)
        .filter((file) => file.endsWith('.ts') && file !== 'types.ts')
        .map((file) => file.replace(/\.ts$/, ''))
    : [];

  const packRoot = path.join(REPO_ROOT, 'src', 'targets', target);
  const packFiles: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
      else packFiles.push(relative);
    }
  };
  const packExists = fs.existsSync(packRoot);
  if (packExists) walk(packRoot, '');

  const secretsFile = path.join(REPO_ROOT, 'config', 'secrets.local.json');
  const secretKeys = fs.existsSync(secretsFile)
    ? Object.keys(JSON.parse(fs.readFileSync(secretsFile, 'utf8')) as Record<string, unknown>)
    : [];

  const authDir = path.join(REPO_ROOT, '.auth');
  const storageStateFiles = fs.existsSync(authDir) ? fs.readdirSync(authDir) : [];

  return {
    knownTargets,
    packExists,
    packFiles,
    secretKeys,
    storageStateFiles,
    pointsAtPlaceholderHost: pointsAtPlaceholderHost(target),
    untrackedPaths: untrackedPaths(),
  };
}

/**
 * Whether a profile's base URL is a host RFC 2606 reserves.
 *
 * Read from the profile's source rather than by importing it: loading a
 * profile runs its module, and this tool is often pointed at one that is
 * half-written or about to be deleted. A regular expression over the text
 * cannot throw.
 */
function pointsAtPlaceholderHost(target: string): boolean {
  const profile = path.join(REPO_ROOT, 'config', 'targets', `${target}.ts`);
  if (!fs.existsSync(profile)) return false;
  const declared = /baseURL:[^\n]*?['"`](https?:\/\/[^'"`]+)['"`]/.exec(
    fs.readFileSync(profile, 'utf8'),
  );
  if (!declared?.[1]) return false;
  try {
    const { hostname } = new URL(declared[1]);
    return /\.(invalid|example|test|localdomain)$|^example\./i.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Files git has never recorded.
 *
 * `--others` is the whole point. A tracked file, however heavily edited, can be
 * restored with `git checkout`, so removing one is recoverable. An untracked
 * file exists nowhere else. Only the second kind is worth warning about, and
 * conflating the two is what made the first version of this refuse to remove
 * exactly the throwaway targets it was built for — every file of a
 * scaffolded-to-try-something target is untracked.
 *
 * Outside a repository nothing is recoverable, and that is said rather than
 * guessed at.
 */
function untrackedPaths(): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return ['<not a git repository: nothing here can be restored>'];
  }
}

export function removeTarget(plan: OffboardPlan, options: { keepSecrets?: boolean } = {}): string[] {
  const done: string[] = [];

  for (const relative of plan.removeFiles) {
    const full = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(full)) continue;
    fs.rmSync(full);
    done.push(`removed ${relative}`);
  }

  for (const relative of plan.removeDirectories) {
    const full = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(full)) continue;
    // Recursive, because empty directories are left behind by the file pass
    // and an empty `src/targets/<app>/tests/e2e` is still a target on disk.
    fs.rmSync(full, { recursive: true, force: true });
    done.push(`removed ${relative}/`);
  }

  if (!options.keepSecrets && plan.removeSecretKeys.length > 0) {
    const file = path.join(REPO_ROOT, 'config', 'secrets.local.json');
    const store = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const key of plan.removeSecretKeys) delete store[key];
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    done.push(`removed ${plan.removeSecretKeys.length} credential entr(ies)`);
  }

  for (const file of plan.removeStorageStates) {
    const full = path.join(REPO_ROOT, '.auth', file);
    if (!fs.existsSync(full)) continue;
    fs.rmSync(full);
    done.push(`shredded .auth/${file}`);
  }

  return done;
}

function main(argv: readonly string[]): number {
  const flags = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(argument);
    if (!match?.[1]) {
      console.error(`Unrecognised argument '${argument}'.\n\n${USAGE}`);
      return 2;
    }
    flags.set(match[1], match[2] ?? 'true');
  }

  const name = flags.get('name');
  if (!name) {
    console.error(`--name is required.\n\n${USAGE}`);
    return 2;
  }

  const plan = planOffboard(name, gatherFacts(name));

  console.log(`\nOffboarding '${plan.target}'\n${'─'.repeat(20 + plan.target.length)}`);
  for (const line of describeOffboard(plan)) console.log(`  · ${line}`);
  for (const warning of plan.warnings) console.log(`\n  NOTE  ${warning}`);
  for (const refusal of plan.refusals) console.log(`\n  STOP  ${refusal}`);

  if (plan.alreadyGone) return 0;
  if (!isRemovable(plan)) {
    console.log('\nNothing was removed.\n');
    return 1;
  }

  if (!confirmationMatches(plan.target, flags.get('confirm'))) {
    console.log(
      `\nPlan only — nothing has been removed.\n` +
        `To go ahead, repeat the name:\n\n  npx tsx tools/offboard.ts --name=${plan.target} --confirm=${plan.target}\n`,
    );
    return 0;
  }

  const done = removeTarget(plan, { keepSecrets: flags.has('keep-secrets') });
  for (const line of done) console.log(`  ${line}`);
  console.log(
    `\nDone. Run \`npm run catalog:build\` to drop '${plan.target}' from the capability ` +
      'catalog, then commit.\n',
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof OffboardError ? error.message : error);
    process.exit(2);
  }
}
