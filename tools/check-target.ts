#!/usr/bin/env tsx
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { AUTH_DIR, REPO_ROOT } from '../src/support/paths';
import { ContractRegistry } from '../src/support/contracts/validator';
import { resolveTarget, targetNames } from '../config/target';
import { createSecretStore } from '../src/integrations/secrets';
import { diagnose, isRunnable, type TargetFacts } from '../src/support/onboarding/diagnose';
import {
  interpretSignInCheck,
  type SignInVerdict,
} from '../src/support/onboarding/sign-in-check';
import type { TargetProfile } from '../config/targets/types';

/**
 * `npm run target:doctor` — onboarding, the last step and the one that saves
 * the time.
 *
 * A target profile is a set of claims about an application: it has an API, it
 * uses TOTP, these roles can sign in. Nothing checks those claims against the
 * pack and the secret store until a spec runs and fails somewhere unhelpful —
 * "No storage state for role 'standard'" when the real problem is a missing
 * auth.setup.ts three directories away.
 *
 * This reads the profile, looks at what is actually on disk, asks the secret
 * store what it can resolve, and prints the disagreements with the file to fix.
 * It never prints a credential: existence and field names only.
 */
/**
 * `METHOD /path` for every endpoint descriptor in the pack's `endpoints/`.
 *
 * Read by loading the modules rather than by parsing them: a descriptor is
 * plain data, the files are already TypeScript this process can require, and a
 * regular expression over source would miss anything built rather than
 * written.
 */
function declaredEndpoints(targetName: string): string[] {
  const directory = path.join(REPO_ROOT, 'src', 'targets', targetName, 'endpoints');
  if (!fs.existsSync(directory)) return [];

  const found: string[] = [];
  for (const file of fs.readdirSync(directory).filter((entry) => entry.endsWith('.ts'))) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require(path.join(directory, file)) as Record<string, unknown>;
      for (const exported of Object.values(module)) {
        if (typeof exported !== 'object' || exported === null) continue;
        for (const descriptor of Object.values(exported as Record<string, unknown>)) {
          const entry = descriptor as { method?: unknown; path?: unknown };
          if (typeof entry?.method === 'string' && typeof entry?.path === 'string') {
            found.push(`${entry.method.toUpperCase()} ${entry.path}`);
          }
        }
      }
    } catch {
      // A pack that does not compile has louder problems than this check.
    }
  }
  return [...new Set(found)];
}

/** `METHOD /path` for every operation the vendored document describes. */
function documentedOperations(profile: TargetProfile): string[] {
  const spec = profile.capabilities.contracts.spec;
  if (!profile.capabilities.contracts.enabled || !spec) return [];
  const full = path.join(REPO_ROOT, spec);
  if (!fs.existsSync(full)) return [];

  try {
    return ContractRegistry.fromFile(full)
      .operations()
      .map((operation) => `${operation.method.toUpperCase()} ${operation.path}`);
  } catch {
    return [];
  }
}

function listPack(targetName: string): { exists: boolean; files: string[] } {
  const root = path.join(REPO_ROOT, 'src', 'targets', targetName);
  if (!fs.existsSync(root)) return { exists: false, files: [] };

  const files: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(directory, entry.name), relative);
      } else {
        files.push(relative);
      }
    }
  };
  walk(root, '');
  return { exists: true, files };
}

/**
 * Every coverage tag the pack's specs carry.
 *
 * Read from the sources, because the tag in a title is what the suite selects
 * on: a kind claimed in a directory name and missing from every title would
 * satisfy a filename check and be reported as covered.
 */
function packSpecTags(targetName: string): string[] {
  const root = path.join(REPO_ROOT, 'src', 'targets', targetName, 'tests');
  if (!fs.existsSync(root)) return [];

  const found = new Set<string>();
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) {
        for (const tag of fs.readFileSync(full, 'utf8').match(/@[a-z][a-z0-9-]*/g) ?? []) {
          found.add(tag);
        }
      }
    }
  };
  walk(root);
  return [...found];
}

/**
 * Ask the store which roles resolve. `describe` returns existence and field
 * names — there is no code path here that can reach a value.
 */
async function checkCredentials(
  profile: TargetProfile,
): Promise<{ checked: boolean; resolvable: string[]; note: string | null }> {
  const roles = [...profile.roles, ...(profile.nonAuthenticatingRoles ?? [])];
  if (roles.length === 0) return { checked: true, resolvable: [], note: null };

  const { root, accountType } = profile.credentials;
  let store;
  try {
    store = createSecretStore(profile);
  } catch (error) {
    return {
      checked: false,
      resolvable: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }

  const resolvable: string[] = [];
  try {
    for (const role of roles) {
      const described = await store.describe(`${root}/${accountType}/${role}/1`);
      const hasBoth =
        described.exists &&
        described.fields.includes('username') &&
        described.fields.includes('password');
      if (hasBoth) resolvable.push(role);
    }
  } catch (error) {
    // An unreachable Vault is not a broken profile, and reporting it as one
    // would train people to ignore the checker.
    return {
      checked: false,
      resolvable,
      note: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await store.close();
  }
  return { checked: true, resolvable, note: null };
}

function heading(text: string): void {
  console.log(`\n${text}`);
  console.log('─'.repeat(text.length));
}

/**
 * Prove a credential can sign in, by running the project that already does it.
 *
 * Opt-in, because it drives a real browser at a real deployment and costs
 * ~20 seconds per target — a preflight that slow by default is one people stop
 * running. It is `setup:auth` rather than a second sign-in path of its own:
 * framework code may not import a target pack, and a separate implementation
 * could disagree with the one the suite actually uses.
 */
function checkSignIn(targetName: string): SignInVerdict {
  const run = spawnSync('npx', ['playwright', 'test', '--project=setup:auth'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, TARGET: targetName },
  });

  if (run.error) {
    return interpretSignInCheck({ status: 2, output: run.error.message });
  }
  return interpretSignInCheck({
    status: run.status ?? 1,
    output: `${run.stdout ?? ''}\n${run.stderr ?? ''}`,
  });
}

async function main(): Promise<number> {
  const names = process.env.TARGET ? [process.env.TARGET] : targetNames();
  const provingSignIn = process.argv.includes('--sign-in');
  let worstExit = 0;

  console.log(`Checking ${names.length} target(s): ${names.join(', ')}`);
  if (!provingSignIn) {
    /*
       Said every time, because the distinction is the one this checker was
       silently wrong about: a credential that resolves is not a credential
       that works. A locked account describes perfectly and fails every run.
    */
    console.log(
      'Credentials are checked for existence, not for use. `--sign-in` proves one real\n' +
        'authentication per role, which is the only thing that catches a locked or expired account.',
    );
  }

  for (const name of names) {
    let profile: TargetProfile;
    try {
      profile = resolveTarget(name);
    } catch (error) {
      heading(name);
      console.log(`  ERROR    ${error instanceof Error ? error.message : String(error)}`);
      worstExit = 1;
      continue;
    }

    const pack = listPack(name);
    const credentials = await checkCredentials(profile);

    const facts: TargetFacts = {
      packExists: pack.exists,
      packFiles: pack.files,
      specTags: packSpecTags(name),
      resolvableRoles: credentials.resolvable,
      credentialsChecked: credentials.checked,
      contractSpecExists: Boolean(
        profile.capabilities.contracts.spec &&
          fs.existsSync(path.join(REPO_ROOT, profile.capabilities.contracts.spec)),
      ),
      declaredEndpoints: declaredEndpoints(name),
      documentedOperations: documentedOperations(profile),
      /*
         Repository-wide rather than pack-wide, and the only two facts here
         that are. A session belonging to no target is invisible to every
         per-target check by definition, and this is the thing people run.
      */
      storageStateFiles: fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [],
      knownTargets: targetNames(),
      env: {
        MAIL_API_URL: process.env.MAIL_API_URL,
        GENERATION_HOST_ALLOWLIST: process.env.GENERATION_HOST_ALLOWLIST,
      },
    };

    const diagnostics = diagnose(profile, facts);

    heading(`${name} · ${profile.environment}`);
    console.log(`  base URL     ${profile.baseURL}`);
    console.log(`  test id      ${profile.testIdAttribute}`);
    console.log(`  roles        ${profile.roles.join(', ') || '(none)'}`);
    console.log(`  credentials  ${profile.credentials.source}`);
    const a11y = profile.capabilities.a11y;
    console.log(
      `  capabilities mfa=${profile.capabilities.mfa} pool=${profile.capabilities.accountPool} ` +
        `api=${profile.capabilities.api.enabled} db=${profile.capabilities.db.enabled} ` +
        `contracts=${profile.capabilities.contracts.enabled} ` +
        `a11y=${a11y.enabled ? a11y.standard : 'false'}`,
    );
    console.log(`  pack         ${pack.exists ? `${pack.files.length} file(s)` : 'MISSING'}`);
    if (credentials.note) console.log(`  secret store ${credentials.note}`);

    if (provingSignIn) {
      console.log('\n  Proving sign-in (running setup:auth)…');
      const verdict = checkSignIn(name);
      console.log(`  ${verdict.ok ? 'OK     ' : 'ERROR  '} [${verdict.code}] ${verdict.message}`);
      if (!verdict.ok) {
        console.log(`           → ${verdict.fix}`);
        // A credential that cannot sign in stops a run, so it is an error
        // rather than a smell — the whole point of proving it.
        worstExit = 1;
      }
    }

    if (diagnostics.length === 0) {
      console.log(
        provingSignIn
          ? '\n  Profile, pack and credentials agree.'
          : '\n  OK — profile, pack and credentials agree. Nothing to fix.',
      );
      continue;
    }

    console.log('');
    for (const diagnostic of diagnostics) {
      const label = diagnostic.level === 'error' ? 'ERROR  ' : 'WARN   ';
      console.log(`  ${label} [${diagnostic.code}] ${diagnostic.message}`);
      console.log(`           → ${diagnostic.fix}`);
    }

    const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
    const warnings = diagnostics.length - errors;
    console.log(`\n  ${errors} error(s), ${warnings} warning(s).`);
    if (!isRunnable(diagnostics)) worstExit = 1;
  }

  if (worstExit === 0) {
    console.log('\nAll checked targets are runnable.');
  } else {
    console.log(
      '\nAt least one target cannot run as configured. Every error above names the file to ' +
        'fix;\nwarnings are smells that will not stop a run.',
    );
  }
  return worstExit;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
