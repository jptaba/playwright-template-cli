import { expect, test } from '../../fixtures';

/**
 * L4 — password recovery. `auth-flows`, so signed out.
 */

test(
  'TS-E06 · A password reset answers the same for a known and an unknown address @auth',
  { annotation: [{ type: 'practitest', description: '9006' }] },
  async ({ page, signIn, secrets }) => {
    const { username } = await secrets.account('customer');

    await signIn.requestPasswordReset(page, username ?? '');
    const known = await signIn.readPasswordResetOutcome(page);

    await signIn.requestPasswordReset(page, 'nobody-has-this-address@example.invalid');
    const unknown = await signIn.readPasswordResetOutcome(page);

    // Same reason as TS-E03: a different answer here enumerates accounts.
    expect(unknown).toBe(known);
  },
);
