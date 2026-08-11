import { registerSecret } from './redact';

/**
 * The one place a credential may be read from the process environment (§11).
 *
 * Integration tokens arrive this way in CI: GitLab's `secrets:` keyword pulls
 * them from Vault with the job's own OIDC identity and exposes them as job
 * variables. That is fine — what is not fine is a value entering the process
 * without being registered for redaction, because from there it reaches a
 * trace, and from a trace it reaches a PractiTest attachment (§22).
 *
 * `secrets-via-fixture` exempts this file and nothing else.
 */
export function credentialFromEnv(name: string, label = `env:${name}`): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  registerSecret(value, label);
  return value;
}

/** Same, but fails loudly with what to do about it rather than returning undefined. */
export function requireCredentialFromEnv(name: string, purpose: string): string {
  const value = credentialFromEnv(name);
  if (!value) {
    throw new Error(
      `${name} is not set, so ${purpose} cannot authenticate. In CI this comes from the ` +
        '`secrets:` block in .gitlab-ci.yml, which resolves it from Vault with the job\'s own ' +
        'identity. Locally, export it from a short-lived token — never commit it.',
    );
  }
  return value;
}
