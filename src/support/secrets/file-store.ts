import fs from 'node:fs';
import path from 'node:path';
import { PRIVATE_STORE_FILE, SHARED_STORE_FILE } from '../../integrations/secrets/local-store';
import type { CredentialLocation } from './locations';

/**
 * Writing a credential into one of the two local files — §11.
 *
 * Separate from `LocalSecretStore`, which reads. A store that could write
 * would be a store a spec could write with, and the whole point of the
 * `secrets` fixture is that a spec holds a reference and never a value.
 *
 * The write is deliberately dull: read, set one key, write back with the
 * formatting intact. No merging, no versioning, no backup — a credential file
 * that quietly keeps old passwords is a credential file that leaks one.
 */

export function fileFor(location: CredentialLocation): string {
  switch (location) {
    case 'private-file':
      return PRIVATE_STORE_FILE;
    case 'shared-file':
      return SHARED_STORE_FILE;
    default:
      throw new Error(
        `'${location}' is not a file this can write. Vault is written by a person with Vault ` +
          'access; the environment is set by whatever runs the suite.',
      );
  }
}

function read(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function save(file: string, contents: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
}

/** Set one account. Creates the file if it is not there yet. */
export function writeCredential(input: {
  location: CredentialLocation;
  path: string;
  username: string;
  password: string;
}): { file: string } {
  const file = fileFor(input.location);
  const contents = read(file);
  contents[input.path] = { username: input.username, password: input.password };
  save(file, contents);
  return { file };
}

/** Remove one account. Absent is not an error — the end state is the same. */
export function forgetCredential(input: { location: CredentialLocation; path: string }): {
  file: string;
} {
  const file = fileFor(input.location);
  const contents = read(file);
  delete contents[input.path];
  save(file, contents);
  return { file };
}
