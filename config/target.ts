import type { TargetProfile } from './targets/types';
import { saucedemo } from './targets/saucedemo';
import { internalApp } from './targets/internal-app';

/**
 * TARGET → profile resolution. Resolved once in `playwright.config.ts` and
 * injected everywhere else through the `target` fixture. No spec, action or
 * locator ever names a host (§04).
 */
const PROFILES: Record<string, TargetProfile> = {
  [saucedemo.name]: saucedemo,
  [internalApp.name]: internalApp,
};

export const DEFAULT_TARGET = saucedemo.name;

export function targetNames(): string[] {
  return Object.keys(PROFILES);
}

export function resolveTarget(name = process.env.TARGET ?? DEFAULT_TARGET): TargetProfile {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown TARGET '${name}'. Known targets: ${targetNames().join(', ')}. ` +
        `Add a profile under config/targets/ and register it in config/target.ts.`,
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
