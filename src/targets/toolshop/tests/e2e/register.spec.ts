import { expect, test } from '../../fixtures';

/**
 * L4 — customer registration. `auth-flows`, so signed out.
 *
 * The one spec here that creates an account uses an `@example.invalid` address:
 * RFC 2606 reserves that domain so it can never resolve, which means a stray
 * notification from a shared demo environment cannot reach a real mailbox.
 */

test(
  'TS-E07 · An empty registration reports a problem against every required field @auth',
  { annotation: [{ type: 'practitest', description: '9007' }] },
  async ({ page, registration }) => {
    await registration.open(page);

    await registration.submitEmpty(page);

    const errors = await registration.errors(page);
    // Named individually rather than counted: a count passes when the form
    // reports the wrong nine fields.
    expect(Object.keys(errors).sort()).toEqual(
      expect.arrayContaining(['first-name', 'last-name', 'dob', 'street', 'city', 'email', 'password']),
    );
  },
);

test(
  'TS-E08 · Registration refuses a password the policy does not allow @auth',
  { annotation: [{ type: 'practitest', description: '9008' }] },
  async ({ page, registration, testData }) => {
    await registration.open(page);

    await registration.register(page, testData.newCustomer({ password: 'abc' }));

    expect(await registration.fieldError(page, 'password')).not.toBeNull();
  },
);

test(
  'TS-E09 · A new customer can register and then sign in @auth',
  { annotation: [{ type: 'practitest', description: '9009' }] },
  async ({ page, registration, signIn, testData }) => {
    const customer = testData.newCustomer();
    await registration.open(page);

    await registration.register(page, customer);

    // The application takes a newly registered customer to the sign-in form.
    await expect.poll(() => page.url()).toContain('/auth/login');

    await signIn.withCredentials(page, { username: customer.email, password: customer.password });
    await expect.poll(() => signIn.isSignedIn(page)).toBe(true);
  },
);
