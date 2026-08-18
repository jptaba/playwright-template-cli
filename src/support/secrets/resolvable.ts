import type { TargetProfile } from '../../../config/targets/types';
import type { SecretStore } from '../../integrations/secrets';
import { credentialPath } from './locations';

/**
 * Which of a profile's roles a store can actually resolve — §11.
 *
 * Written for the panel the dashboard shows after Create, which used to
 * contradict the screen above it. The connection check had found the
 * credential, **Sign in once** had signed in with it, and then the result
 * reported `credentials-unchecked` and told the operator to write a value to
 * the exact path it had just read from, twice.
 *
 * The code that produced that had a comment saying credentials are never read
 * back, which is a good rule and was the wrong conclusion. Nothing here reads a
 * value: `describe` returns existence and field names and there is no flag that
 * changes that — it is the same call the connection check makes, for the same
 * reason. The honest answer is to **ask**, rather than to assume the worst and
 * print a warning the page has already disproved.
 *
 * Takes the store rather than building one, so the decision is testable against
 * a fake and the tool keeps the job of deciding which store a profile means.
 */

export interface ResolvedRoles {
  /** Roles whose credential exists and carries what the fixture reads. */
  resolvableRoles: string[];
  /**
   * Whether the store could be asked at all.
   *
   * False only when the store itself is unreachable — which is what the
   * doctor's "could not check" warning was written for, and is now the only
   * thing that produces it.
   */
  credentialsChecked: boolean;
}

/** The two field names the `secrets` fixture reads. */
const REQUIRED_FIELDS = ['username', 'password'] as const;

export async function resolvableRoles(
  profile: Pick<TargetProfile, 'roles' | 'nonAuthenticatingRoles' | 'credentials'>,
  store: Pick<SecretStore, 'describe'>,
): Promise<ResolvedRoles> {
  const roles = [...profile.roles, ...(profile.nonAuthenticatingRoles ?? [])];
  if (roles.length === 0) return { resolvableRoles: [], credentialsChecked: true };

  const found: string[] = [];
  let asked = false;

  for (const role of roles) {
    try {
      const described = await store.describe(credentialPath(profile.credentials, role));
      asked = true;
      /*
         Present is not enough. The fixture reads `username` and `password`,
         and a credential carrying `user` resolves as existing and then fails
         at sign-in — which is precisely the failure the connection check
         exists to catch, so losing it one screen later would be strange.
      */
      const complete = REQUIRED_FIELDS.every((field) => described.fields.includes(field));
      if (described.exists && complete) found.push(role);
    } catch {
      /*
         One path that will not resolve is an answer about that path. Keep
         going, so the doctor can name every role that is missing rather than
         the first — "credentials are missing" that stops at the first role is
         two more runs to find the other two.
      */
    }
  }

  /*
     Nothing answered at all, for any role. That is a store which is not there
     rather than credentials which are not written, and the two want different
     sentences: one says check your Vault, the other says write this path.
  */
  return asked ? { resolvableRoles: found, credentialsChecked: true } : { resolvableRoles: [], credentialsChecked: false };
}
