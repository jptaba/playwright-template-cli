#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import { resolveTarget } from '../config/target';
import type { TargetProfile } from '../config/targets/types';
import { createSecretStore } from '../src/integrations/secrets';
import { VaultSecretStore } from '../src/integrations/vault/vault-store';
import { VaultAccountPool } from '../src/integrations/vault/account-pool';
import { AUTH_DIR, REPO_ROOT } from '../src/support/paths';
import { DEFAULT_PASSWORD_POLICY } from '../src/support/rotation/policy';
import { DEFAULT_ROTATION, dueForRotation } from '../src/support/rotation/schedule';
import { RotationRunner, type PasswordChanger } from '../src/support/rotation/runner';

/**
 * `npm run rotate:passwords` — a scheduled pipeline, deliberately never part
 * of the nightly test run (§13).
 *
 * Changing a password is an application flow, so the *how* comes from the
 * target pack: `src/targets/<name>/rotation.ts` exports a `passwordChanger`.
 * The framework owns only the order of operations, which is the part that has
 * to be right everywhere.
 */

interface TargetRotationModule {
  passwordChanger: PasswordChanger;
}

async function loadChanger(profile: TargetProfile): Promise<PasswordChanger> {
  // Resolved from the profile name rather than written in, so this tool stays
  // agnostic of which application it is rotating (§04).
  const modulePath = path.join(REPO_ROOT, 'src', 'targets', profile.name, 'rotation.ts');
  if (!fs.existsSync(modulePath)) {
    throw new Error(
      `Target '${profile.name}' declares a leased account pool but has no ${path.relative(
        REPO_ROOT,
        modulePath,
      )}. Rotation needs an application-specific way to change a password and to verify it — ` +
        'export a `passwordChanger` from that file (§13).',
    );
  }
  const loaded = (await import(modulePath)) as TargetRotationModule;
  if (!loaded.passwordChanger) {
    throw new Error(`${modulePath} does not export \`passwordChanger\`.`);
  }
  return loaded.passwordChanger;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const profile = resolveTarget();
  const config = profile.rotation ?? DEFAULT_ROTATION;

  if (profile.capabilities.accountPool !== 'leased') {
    console.log(
      `Target '${profile.name}' declares accountPool: '${profile.capabilities.accountPool}'. ` +
        'There is nothing to rotate — the whole of §13 is inert for this target.',
    );
    return 0;
  }
  if (!config.enabled) {
    console.log(`Rotation is disabled for '${profile.name}'. Set rotation.enabled in the profile.`);
    return 0;
  }

  const store = createSecretStore(profile);
  if (!(store instanceof VaultSecretStore)) {
    throw new Error('Rotation requires the Vault store: leasing needs compare-and-swap.');
  }

  const { root, accountType } = profile.credentials;
  const poolRoot = `${root}/${accountType}`;
  const poolSize = Number(process.env.ACCOUNT_POOL_SIZE ?? 8);
  const pool = new VaultAccountPool(store, {
    poolRoot,
    size: poolSize,
    leaseTtlMs: 15 * 60_000,
    holder: `rotation/${new Date().toISOString()}`,
  });

  const policy = profile.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;
  const now = Date.now();

  // Which accounts are old enough to be due, respecting both the app's
  // minimum-age rule and the per-account jitter.
  const candidates: Array<{ role: string; index: number; rotatedAt: number }> = [];
  for (const role of profile.roles) {
    for (let index = 1; index <= poolSize; index++) {
      const secretPath = `${poolRoot}/${role}/${index}`;
      const described = await store.describe(secretPath);
      if (!described.exists) continue;
      const payload = await store.read(secretPath);
      candidates.push({ role, index, rotatedAt: Number(payload.rotatedAt ?? 0) });
    }
  }

  const due = dueForRotation(candidates, config, now, policy.minAgeDays);
  console.log(
    `Target ${profile.name} (${profile.environment}): ${candidates.length} account(s), ` +
      `${due.length} due for rotation.`,
  );

  if (dryRun) {
    for (const candidate of due) {
      console.log(`  would rotate ${candidate.role}/${candidate.index}`);
    }
    await store.close();
    return 0;
  }

  const changer = await loadChanger(profile);
  const runner = new RotationRunner({
    pool,
    vault: { write: (path_, data) => store.write(path_, data) },
    changer,
    invalidateSessions: async (role) => {
      // A cached session for the old password is both a stale-failure source
      // and a security exposure (§13).
      const file = path.join(AUTH_DIR, `${profile.name}.${role}.json`);
      await fs.promises.rm(file, { force: true });
    },
    policy,
    config,
    log: (message) => console.log(`  ${message}`),
  });

  let quarantined = 0;
  for (const candidate of due) {
    const secretPath = `${poolRoot}/${candidate.role}/${candidate.index}`;
    const current = await store.read(secretPath);
    const outcome = await runner.rotate({
      role: candidate.role,
      index: candidate.index,
      username: current.username ?? '',
      currentPassword: current.password ?? '',
      secretPath,
    });
    if (outcome.status === 'quarantined') quarantined++;
    if (outcome.status === 'skipped') console.log(`  skipped ${secretPath}: ${outcome.reason}`);
  }

  await store.close();

  if (quarantined > 0) {
    console.error(
      `\n${quarantined} account(s) quarantined. They are out of the pool and need a human: ` +
        'never retry a failed rotation blindly, and tell whoever owns account security (§13).',
    );
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
