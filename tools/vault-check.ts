#!/usr/bin/env tsx
import { resolveTarget } from '../config/target';
import { createSecretStore } from '../src/integrations/secrets';

/**
 * `npm run vault:check -- <path> [...]` — §22.
 *
 * "Make the safe path easier than the unsafe one — a `vault:check` CLI that
 * reports whether a path resolves and what shape it has, without ever printing
 * values. Most debugging needs the existence check, not the secret."
 *
 * This tool cannot print a secret. It calls `describe`, which returns field
 * names only, and there is no flag that changes that.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const target = resolveTarget();
  const store = createSecretStore(target);

  const { root, accountType } = target.credentials;
  const paths =
    args.length > 0
      ? args
      : [
          ...target.roles.map((role) => `${root}/${accountType}/${role}/1`),
          ...(target.nonAuthenticatingRoles ?? []).map(
            (role) => `${root}/${accountType}/${role}/1`,
          ),
        ];

  console.log(`Target   : ${target.name} (${target.environment})`);
  console.log(`Source   : ${target.credentials.source}`);
  console.log(`Checking : ${paths.length} path(s)\n`);

  let missing = 0;
  for (const path of paths) {
    try {
      const described = await store.describe(path);
      if (described.exists) {
        const version = described.version ? ` v${described.version}` : '';
        console.log(`  OK      ${path}${version}  fields: ${described.fields.join(', ')}`);
      } else {
        missing++;
        console.log(`  MISSING ${path}`);
      }
    } catch (error) {
      missing++;
      console.log(`  ERROR   ${path}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await store.close();

  if (missing > 0) {
    console.log(
      `\n${missing} path(s) did not resolve. On Vault, check the namespace and the KV mount ` +
        'before the path itself — an Enterprise namespace prefixes every API call (§17).',
    );
  }
  return missing === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
