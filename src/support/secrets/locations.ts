/**
 * Where a target's test-user credentials live, and what each choice costs —
 * §11.
 *
 * There was one local option and it was **committed**: `config/secrets.local.json`
 * is tracked, so anything written there goes into git. That is correct for the
 * case it was built for — a vendor demo whose logins are printed on its own
 * login page — and it is the wrong default for everything else. Somebody
 * onboarding a real application had nowhere to put a real password except a
 * tracked file or a Vault they may not have yet.
 *
 * So the choice is named, and each option states plainly what it does with the
 * value. A person choosing where a password goes should not have to infer the
 * answer from a `.gitignore`.
 */

export type CredentialLocation = 'vault' | 'private-file' | 'shared-file' | 'environment';

export interface LocationDescription {
  id: CredentialLocation;
  label: string;
  /** Where the value ends up, in words. */
  where: string;
  /** True when a value put here cannot reach the repository. */
  gitSafe: boolean;
  /** Whether the dashboard can write here, and why not when it cannot. */
  writable: boolean;
  /** How a value gets in. */
  howToSet: string;
  /** How the framework gets it back out at run time. */
  howToRead: string;
  /** How it changes when the password rotates. */
  howToUpdate: string;
  /** When this is the right choice. */
  suitedTo: string;
  /** Said out loud where the choice is made, when there is a catch. */
  caution?: string;
}

/**
 * The four options, most private first.
 *
 * Order is the recommendation. A reader picking the top one is picking the
 * safest thing that can work, and each step down trades privacy for
 * convenience in a way the description states rather than implies.
 */
export const CREDENTIAL_LOCATIONS: readonly LocationDescription[] = [
  {
    id: 'vault',
    label: 'Vault',
    where: 'HashiCorp Vault, at the path the profile names',
    gitSafe: true,
    writable: false,
    howToSet:
      'A person with Vault access writes it once, at ' +
      '<root>/<accountType>/<role>/<n>. This page never writes to Vault: the agent writes ' +
      'the reference and a human writes the value, which is the whole rule (§11).',
    howToRead:
      'Read per worker at run time through the `secrets` fixture. Nothing is cached to disk ' +
      'and the token is revoked in teardown.',
    howToUpdate:
      'Rotate in Vault, or run `npm run rotate:passwords`, which changes the application first ' +
      'and Vault second so a half-finished rotation leaves the credential that still works.',
    suitedTo: 'Anything real. The only option that supports leased account pools and TOTP.',
  },
  {
    id: 'private-file',
    label: 'A private file on this machine',
    where: 'config/secrets.private.json — gitignored',
    gitSafe: true,
    writable: true,
    howToSet: 'Type it here, or edit the file. It is created on first write.',
    howToRead:
      'Read like any other local secret, and it takes precedence over the shared file — so a ' +
      'real password here quietly overrides a placeholder committed there.',
    howToUpdate: 'Set it again here. The previous value is overwritten, never versioned.',
    suitedTo:
      'A real credential on a developer machine, before Vault is available or where Vault is ' +
      'more ceremony than the work deserves.',
    caution:
      'It is on disk in plain text and it is not backed up. Gitignored is not encrypted — this ' +
      'protects against committing a password, not against anything reading the file.',
  },
  {
    id: 'shared-file',
    label: 'The shared file, committed to git',
    where: 'config/secrets.local.json — tracked',
    gitSafe: false,
    writable: true,
    howToSet: 'Type it here, or edit the file. It is committed with everything else.',
    howToRead: 'Read like any other local secret, unless the private file overrides it.',
    howToUpdate: 'Set it again here, and commit the change like any other file.',
    suitedTo:
      'Credentials that are already public — a vendor demo that prints its logins on its own ' +
      'login page. Nothing else.',
    caution:
      'This file is in git. Anything written here is in the history of every clone, and a ' +
      'password removed later is still in the history. Choose it only when the value is already ' +
      'published somewhere anybody can read.',
  },
  {
    id: 'environment',
    label: 'The environment',
    where: 'environment variables, or a gitignored .env',
    gitSafe: true,
    writable: false,
    howToSet:
      'Exported by whatever runs the suite — a CI secret store, a shell profile, a .env file ' +
      'that .gitignore already covers. This page cannot write to it, because the thing that ' +
      'sets it is not this machine.',
    howToRead:
      'Read through `src/support/env-credentials.ts`, which is the one place `process.env` may ' +
      'be used for a credential — and which registers every value it reads for redaction, so it ' +
      'cannot reach a log, a trace or an attachment.',
    howToUpdate: 'Change it wherever it is set. Nothing in the repository changes.',
    suitedTo: 'CI, and any machine where the secret arrives from the pipeline rather than a person.',
  },
];

export function describeLocation(id: CredentialLocation): LocationDescription {
  const found = CREDENTIAL_LOCATIONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown credential location: ${id}`);
  return found;
}

/** The locations this page is able to write to, in the order to offer them. */
export const WRITABLE_LOCATIONS: readonly CredentialLocation[] = CREDENTIAL_LOCATIONS.filter(
  (entry) => entry.writable,
).map((entry) => entry.id);

/**
 * The credential path for one account, in the shape every store shares.
 *
 * One function, because the shape is a contract between the profile, Vault,
 * the local files and the dashboard — and four copies of a string template is
 * how they drift.
 */
export function credentialPath(
  refs: { root: string; accountType: string },
  role: string,
  index = 1,
): string {
  return `${refs.root}/${refs.accountType}/${role}/${index}`;
}
