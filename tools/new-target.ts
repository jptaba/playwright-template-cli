#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/support/paths';
import { parseScaffoldArgs, planScaffold } from '../src/support/onboarding/scaffold';

/**
 * `npm run target:new -- --name=<app> --url=<base-url>` — onboarding, step one.
 *
 * Writes the profile and the whole four-layer pack, and stops. It never
 * overwrites: onboarding is additive, and a scaffolder that can clobber a real
 * target pack is a scaffolder nobody runs twice.
 *
 * There is no registration step. Profiles are discovered from
 * `config/targets/`, so dropping the file in is the whole of it.
 */
const USAGE = `Usage:
  npm run target:new -- --name=<app> --url=<base-url> [options]

Required:
  --name=<app>            lower-case, hyphen-separated: <one>-<two>
  --url=<base-url>        base URL of the TEST environment, never production

Options:
  --roles=a,b             roles that get a storage state (default: standard)
  --test-id=<attribute>   attribute getByTestId reads (default: data-testid)
  --env=<name>            which deployment this profile points at (default: staging)
  --secrets=vault|local   where credentials resolve from (default: vault)
  --with=api,db,contracts,a11y   optional layers to scaffold as well
  --api-url=<url>         service API base URL; required with --with=api
  --a11y-standard=<name>  accessibility standard, e.g. wcag22aa (default), en301549
  --allow=a.com,b.com     host suffixes this target may drive (default: from --url)
  --dry-run               list what would be written, write nothing`;

/**
 * A local secret store entry is a placeholder, never a value. The agent writes
 * the reference; a human puts the credential in (§11).
 */
function addLocalSecretStubs(credentialPaths: readonly string[]): string[] {
  const file = path.join(REPO_ROOT, 'config', 'secrets.local.json');
  if (!fs.existsSync(file)) return [];

  const store = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const added: string[] = [];
  for (const credentialPath of credentialPaths) {
    if (credentialPath in store) continue;
    store[credentialPath] = { username: 'replace-me', password: 'replace-me' };
    added.push(credentialPath);
  }
  if (added.length > 0) {
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }
  return added;
}

function main(): number {
  const { options, dryRun } = parseScaffoldArgs(process.argv.slice(2), USAGE);
  const plan = planScaffold(options);

  const existing = plan.files
    .map((file) => file.path)
    .filter((relative) => fs.existsSync(path.join(REPO_ROOT, relative)));
  if (existing.length > 0) {
    console.error(
      `Refusing to overwrite ${existing.length} existing file(s):\n` +
        existing.map((file) => `  ${file}`).join('\n') +
        `\n\nPick a different --name, or delete what is there if it was a false start.`,
    );
    return 1;
  }

  if (dryRun) {
    console.log(`Would write ${plan.files.length} file(s):`);
    for (const file of plan.files) console.log(`  ${file.path}`);
    return 0;
  }

  for (const file of plan.files) {
    const absolute = path.join(REPO_ROOT, file.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.contents, 'utf8');
    console.log(`  wrote ${file.path}`);
  }

  const stubs =
    options.secretSource === 'local' ? addLocalSecretStubs(plan.credentialPaths) : [];
  for (const stub of stubs) {
    console.log(`  stubbed config/secrets.local.json → ${stub}`);
  }

  console.log(`\nTarget '${options.name}' scaffolded. No registration step: profiles are`);
  console.log('discovered from config/targets/, so it is already selectable.\n');
  console.log('Next:');
  plan.nextSteps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  console.log(
    '\nThe scaffold is a starting shape, not a working test. Every locator in it is a ' +
      'guess, and\nguessed locators are the largest single source of dead-on-arrival tests — ' +
      'explore first.',
  );
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
