import fs from 'node:fs';
import path from 'node:path';
import type { TargetProfile } from './targets/types';

/**
 * TARGET → profile resolution. Resolved once in `playwright.config.ts` and
 * injected everywhere else through the `target` fixture. No spec, action or
 * locator ever names a host (§04).
 *
 * Profiles are **discovered**, not registered. Every `.ts` file in
 * `config/targets/` other than `types.ts` is read, and any export shaped like a
 * `TargetProfile` becomes a selectable target.
 *
 * That is deliberate. Adding an application used to mean editing this file —
 * the one step in onboarding that reached outside the new target's own
 * directory, and the one people forgot, producing "Unknown TARGET" for a
 * profile that was sitting right there. Onboarding is now entirely additive:
 * drop a profile in, drop a pack in, and both are found.
 */
const TARGETS_DIR = path.join(__dirname, 'targets');

/** Not a profile: the shared type declarations every profile imports. */
const NOT_A_PROFILE = /^(types|index)\.(ts|js)$/;

function isProfile(value: unknown): value is TargetProfile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TargetProfile>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.baseURL === 'string' &&
    typeof candidate.testIdAttribute === 'string' &&
    typeof candidate.capabilities === 'object' &&
    candidate.capabilities !== null &&
    Array.isArray(candidate.hostAllowlist)
  );
}

let discovered: Map<string, TargetProfile> | null = null;

/**
 * Read every profile module once. Discovery is cached because it runs in each
 * worker process, and a `readdir` per fixture resolution would be silly.
 */
function profiles(): Map<string, TargetProfile> {
  if (discovered) return discovered;

  const found = new Map<string, TargetProfile>();
  if (!fs.existsSync(TARGETS_DIR)) {
    throw new Error(
      `No ${path.relative(process.cwd(), TARGETS_DIR)} directory. The application under test is ` +
        'configuration: every target needs a profile there. Run `npm run target:new` to create one.',
    );
  }

  const files = fs
    .readdirSync(TARGETS_DIR)
    .filter((file) => /\.(ts|js)$/.test(file) && !file.endsWith('.d.ts') && !NOT_A_PROFILE.test(file))
    .sort();

  for (const file of files) {
    const modulePath = path.join(TARGETS_DIR, file);
    let module: Record<string, unknown>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = require(modulePath) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `config/targets/${file} could not be loaded: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const exported = Object.values(module).filter(isProfile);
    if (exported.length === 0) {
      throw new Error(
        `config/targets/${file} exports no TargetProfile. A profile must export an object with ` +
          'at least name, baseURL, testIdAttribute, capabilities and hostAllowlist — see ' +
          'config/targets/types.ts. If this file is a helper rather than a profile, move it out ' +
          'of config/targets/.',
      );
    }

    for (const profile of exported) {
      const existing = found.get(profile.name);
      if (existing) {
        throw new Error(
          `Two profiles both claim the name '${profile.name}'. A target name selects a profile, a ` +
            'pack under src/targets/ and a storage-state file, so it has to be unique.',
        );
      }
      found.set(profile.name, profile);
    }
  }

  /*
     An empty directory is not an error here. "Which applications are in this
     repository?" has a valid answer of "none" — it is the state the repository
     ships in, and the state `target:remove` leaves behind when the last target
     goes. Discovery that threw instead took `npm run catalog:build` with it,
     which is the very command offboarding tells you to run next, and
     `npm run verify` with that. Selection is where the absence matters, so
     that is where it is raised.
  */
  discovered = found;
  return found;
}

/**
 * Raised when no target has been *selected* — as opposed to a target being
 * selected and wrong. The distinction matters: `playwright.config.ts` treats
 * "nothing selected" as "run the framework's own tests only", and lets every
 * other failure through. A misconfigured allowlist must never degrade quietly
 * into a green run that skipped the whole suite.
 */
export class TargetSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetSelectionError';
  }
}

/**
 * Which profile is used when `TARGET` is unset. With one profile present that
 * is unambiguous; with several, the environment has to choose rather than
 * alphabetical order silently deciding which application gets tested.
 */
export function defaultTarget(): string {
  const names = targetNames();
  if (names.length === 0) {
    throw new TargetSelectionError(
      'No target profiles found in config/targets/. Run `npm run target:new -- --name=<app> ' +
        '--url=<base-url>` to scaffold one.',
    );
  }
  const only = names[0];
  if (names.length === 1 && only) return only;
  const preferred = process.env.DEFAULT_TARGET;
  if (preferred && names.includes(preferred)) return preferred;
  throw new TargetSelectionError(
    `${names.length} target profiles are registered (${names.join(', ')}) and TARGET is not set. ` +
      'Set TARGET=<name> for this run, or DEFAULT_TARGET=<name> in the environment. Guessing ' +
      'which application to test is how a suite ends up pointed at the wrong one.',
  );
}

export function targetNames(): string[] {
  return [...profiles().keys()];
}

/** Test seam: forget the discovered profiles so a new file on disk is picked up. */
export function resetTargetDiscovery(): void {
  discovered = null;
}

export function resolveTarget(name = process.env.TARGET ?? undefined): TargetProfile {
  const wanted = name ?? defaultTarget();
  const profile = profiles().get(wanted);
  if (!profile) {
    throw new Error(
      `Unknown TARGET '${wanted}'. Known targets: ${targetNames().join(', ')}. ` +
        'A profile is any file under config/targets/ exporting a TargetProfile — ' +
        '`npm run target:new` writes one for you.',
    );
  }
  assertNonProductionHost(profile);
  return profile;
}

/**
 * Generation and exploration run against test environments only, never
 * production and never an environment seeded from a production copy — and this
 * is enforced by configuration rather than convention (§17).
 *
 * The allowlist is the union of the profile's own `hostAllowlist` and the
 * comma-separated `GENERATION_HOST_ALLOWLIST` environment variable, so a
 * pipeline can widen it for its environment without editing a profile.
 * Loopback is always permitted: an in-process server is not an environment.
 */
const ALWAYS_ALLOWED = ['localhost', '127.0.0.1', '::1'];

export function assertNonProductionHost(profile: TargetProfile): void {
  const fromEnv = (process.env.GENERATION_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = [...ALWAYS_ALLOWED, ...profile.hostAllowlist, ...fromEnv];

  if (allowed.length === ALWAYS_ALLOWED.length) {
    throw new Error(
      `Target '${profile.name}' declares no permitted hosts. Set hostAllowlist on the ` +
        `profile, or GENERATION_HOST_ALLOWLIST, to the test-environment hosts this ` +
        `framework may drive. An empty allowlist is not permission to drive anything (§17).`,
    );
  }

  let host: string;
  try {
    host = new URL(profile.baseURL).hostname;
  } catch {
    throw new Error(`Target '${profile.name}' has an unparseable baseURL: ${profile.baseURL}`);
  }

  const ok = allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!ok) {
    throw new Error(
      `Target '${profile.name}' resolves to host '${host}', which is not in the ` +
        `non-production allowlist [${allowed.join(', ')}]. Set GENERATION_HOST_ALLOWLIST ` +
        `to the test-environment hosts this framework may drive. See §17.`,
    );
  }
}
