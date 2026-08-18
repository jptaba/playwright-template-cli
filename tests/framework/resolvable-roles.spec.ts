import { expect, test } from '@playwright/test';
import { resolvableRoles } from '../../src/support/secrets/resolvable';
import type { SecretDescription } from '../../src/integrations/secrets';

/**
 * Which roles a store can resolve, asked rather than assumed.
 *
 * The panel the dashboard shows after Create used to contradict the screen
 * above it: the connection check had found the credential, **Sign in once**
 * had signed in with it, and then the result warned that credentials could not
 * be checked and told the operator to write a value to the path it had just
 * read from, twice. The flag behind that warning was hardcoded.
 *
 * What is *not* relaxed is the rule the old comment was defending. `describe`
 * returns existence and field names; nothing here can return a value, and
 * there is no argument that changes that.
 */

const PROFILE = {
  roles: ['standard', 'admin'],
  credentials: { root: 'qa/shop', accountType: 'pools' },
} as unknown as Parameters<typeof resolvableRoles>[0];

/** A store that answers for the paths it was given, and 404s for the rest. */
function aStore(known: Record<string, string[]>, onAsk?: (path: string) => void) {
  return {
    describe: (path: string): Promise<SecretDescription> => {
      onAsk?.(path);
      const fields = known[path];
      if (!fields) return Promise.resolve({ path, exists: false, fields: [] });
      return Promise.resolve({ path, exists: true, fields });
    },
  };
}

test('asks the path the profile implies, once per role', async () => {
  const asked: string[] = [];
  await resolvableRoles(PROFILE, aStore({}, (path) => asked.push(path)));

  expect(asked, 'the shape every store shares, built from the profile').toEqual([
    'qa/shop/pools/standard/1',
    'qa/shop/pools/admin/1',
  ]);
});

test('a credential that is there and complete resolves', async () => {
  const result = await resolvableRoles(
    PROFILE,
    aStore({
      'qa/shop/pools/standard/1': ['username', 'password'],
      'qa/shop/pools/admin/1': ['username', 'password'],
    }),
  );

  expect(result).toEqual({ resolvableRoles: ['standard', 'admin'], credentialsChecked: true });
});

test('a credential whose fields are named something else does not', async () => {
  /*
     The failure "does it exist" cannot see, and the one the connection check
     exists to catch — so losing it one screen later would be strange. `user`
     resolves as present and then fails at sign-in.
  */
  const result = await resolvableRoles(
    PROFILE,
    aStore({
      'qa/shop/pools/standard/1': ['user', 'pass'],
      'qa/shop/pools/admin/1': ['username', 'password'],
    }),
  );

  expect(result.resolvableRoles).toEqual(['admin']);
  expect(result.credentialsChecked, 'the store answered, so it was checked').toBe(true);
});

test('one path that throws does not stop the others being named', async () => {
  /*
     "Credentials are missing" that stops at the first role is two more runs to
     find the other two.
  */
  const store = {
    describe: (path: string): Promise<SecretDescription> =>
      path.includes('standard')
        ? Promise.reject(new Error('nothing at that path'))
        : Promise.resolve({ path, exists: true, fields: ['username', 'password'] }),
  };

  const result = await resolvableRoles(PROFILE, store);
  expect(result).toEqual({ resolvableRoles: ['admin'], credentialsChecked: true });
});

test('a store that answers nothing at all is unchecked, not empty', async () => {
  /*
     The distinction the doctor's two messages rest on: a store that is not
     there wants "check your Vault", and credentials that are not written want
     "write this path". Reporting the first as the second sends somebody to
     write a credential into a Vault they cannot reach.
  */
  const unreachable = {
    describe: (): Promise<SecretDescription> => Promise.reject(new Error('ECONNREFUSED')),
  };

  const result = await resolvableRoles(PROFILE, unreachable);
  expect(result).toEqual({ resolvableRoles: [], credentialsChecked: false });
});

test('a profile with no roles has nothing to check and says so', async () => {
  const result = await resolvableRoles(
    { ...PROFILE, roles: [] } as typeof PROFILE,
    aStore({}),
  );
  expect(result).toEqual({ resolvableRoles: [], credentialsChecked: true });
});

test('non-authenticating roles are checked too', async () => {
  /*
     They have credentials and no storage state. A run that needs one and
     cannot resolve it fails the same way, so leaving them out would make the
     panel right about half the profile.
  */
  const asked: string[] = [];
  await resolvableRoles(
    { ...PROFILE, nonAuthenticatingRoles: ['api-only'] } as typeof PROFILE,
    aStore({}, (path) => asked.push(path)),
  );

  expect(asked).toContain('qa/shop/pools/api-only/1');
});
