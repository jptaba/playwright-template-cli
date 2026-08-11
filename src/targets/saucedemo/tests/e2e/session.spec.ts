import { expect, test } from '../../fixtures';

/**
 * Signing *out* belongs here rather than in the auth-flows project: it starts
 * from an established session, which is exactly what the e2e project provides.
 * Only specs that must start signed out — tagged `@auth` — live in the
 * login/mfa/password files, and `auth-project-boundary` enforces the split.
 */
test(
  'SD-060 · A shopper can sign out and the session ends @smoke',
  { annotation: [{ type: 'practitest', description: '5150' }] },
  async ({ authedPage, inventory, auth }) => {
    await inventory.open(authedPage);
    expect(await auth.isSignedIn(authedPage)).toBe(true);

    await auth.signOut(authedPage);

    expect(await auth.isSignedIn(authedPage)).toBe(false);
  },
);

test(
  'SD-061 · The signed-in area is not reachable after signing out @smoke',
  { annotation: [{ type: 'practitest', description: '5151' }] },
  async ({ authedPage, inventory, auth }) => {
    await inventory.open(authedPage);
    await auth.signOut(authedPage);

    // Navigating straight back to a deep link must not restore access — a
    // client-side-only sign-out is a real and common defect.
    await authedPage.goto('/inventory.html');

    expect(await auth.isSignedIn(authedPage)).toBe(false);
    expect(await auth.readSignInError(authedPage)).toContain('can only access');
  },
);
