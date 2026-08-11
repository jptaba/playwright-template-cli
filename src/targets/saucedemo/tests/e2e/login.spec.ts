import { expect, test } from '../../fixtures';

/**
 * The exception to the storage-state rule — §13.
 *
 * These specs run in the `auth-flows` project, which starts signed out. They
 * take `page`, never `authedPage`: a spec about signing in must not inherit a
 * session it was supposed to establish itself. `auth-project-boundary` fails
 * the build if an `@auth` spec is filed anywhere the auth-flows project would
 * not pick it up.
 */

test(
  'SD-001 · A shopper can sign in @auth @smoke',
  { annotation: [{ type: 'practitest', description: '5101' }] },
  async ({ page, secrets, auth }) => {
    const shopper = await secrets.account('standard');

    await auth.signIn(page, { username: shopper.username!, password: shopper.password! });

    await expect(page.getByTestId('title')).toHaveText('Products');
    expect(await auth.readSignInError(page)).toBeNull();
  },
);

test(
  'SD-002 · A locked-out account is refused with a stated reason @auth',
  { annotation: [{ type: 'practitest', description: '5102' }] },
  async ({ page, secrets, auth }) => {
    const lockedOut = await secrets.account('locked_out');

    await auth.signIn(page, { username: lockedOut.username!, password: lockedOut.password! });

    expect(await auth.readSignInError(page)).toContain('locked out');
    await expect(page.getByTestId('title')).toHaveCount(0);
  },
);

test(
  'SD-003 · A wrong password is refused without revealing which field was wrong @auth',
  { annotation: [{ type: 'practitest', description: '5103' }] },
  async ({ page, secrets, auth }) => {
    const shopper = await secrets.account('standard');

    await auth.signIn(page, { username: shopper.username!, password: 'not-the-password' });

    const error = await auth.readSignInError(page);
    expect(error).toContain('Username and password do not match');
    // The message must not distinguish a bad password from an unknown user —
    // that difference is a user-enumeration disclosure.
    expect(error).not.toMatch(/password is (incorrect|wrong)/i);
  },
);
