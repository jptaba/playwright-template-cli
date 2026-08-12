import { expect, test } from '../../fixtures';

/**
 * L4 — signing in. Runs in the `auth-flows` project, signed out, so these
 * specs take `page` and never `authedPage`: a spec about establishing a
 * session must not inherit one.
 *
 * **Every spec here that submits a deliberately wrong password does so against
 * a disposable identity it registered itself, never against the role the rest
 * of the suite signs in as.**
 *
 * That is not fastidiousness. The first version of this file asserted "a wrong
 * password is refused" against the shared `customer` account, twice. This
 * application locks an account after a few failed attempts, so those two specs
 * locked the identity every other spec depends on — and the next run failed
 * twenty-one tests across account, cart, checkout, contact and admin, none of
 * which had anything to do with authentication. `setup:auth` reported only
 * that no session appeared. The account is still locked; it needs an
 * administrator or a reseed.
 *
 * A negative authentication test spends the account's failed-attempt budget.
 * Spend a disposable one — and on a deployment shared with strangers, do not
 * spend one at all: moving these onto freshly registered accounts still locked
 * a second seeded login, so the counter is not purely per-account. Those specs
 * now skip while `sharedEnvironment` is true.
 */

/** Skips the specs whose blast radius is somebody else's next test run. */
function onlyOnAnOwnedEnvironment(shared: boolean | undefined): void {
  test.skip(
    shared !== false,
    'This deployment is shared with strangers and this spec spends its ' +
      'failed-attempt budget. Run it against a deployment the team owns ' +
      '(SHARED_ENVIRONMENT=false against a local docker compose).',
  );
}

test(
  'TS-E01 · Valid credentials sign a customer in @smoke @auth',
  { annotation: [{ type: 'practitest', description: '9001' }] },
  async ({ page, signIn, secrets }) => {
    const { username, password } = await secrets.account('customer');

    await signIn.withCredentials(page, { username: username ?? '', password: password ?? '' });

    await expect.poll(() => signIn.isSignedIn(page)).toBe(true);
    expect(await signIn.signedInAs(page)).not.toBeNull();
  },
);

test(
  'TS-E02 · A wrong password is refused with a message @auth',
  { annotation: [{ type: 'practitest', description: '9002' }] },
  async ({ page, signIn, registration, testData, target }) => {
    onlyOnAnOwnedEnvironment(target.sharedEnvironment);
    // Disposable: this account is about to spend a failed attempt, and it must
    // not be one anything else needs.
    const disposable = testData.newCustomer();
    await registration.open(page);
    await registration.register(page, disposable);

    await signIn.withCredentials(page, {
      username: disposable.email,
      password: 'not-the-right-password',
    });

    expect(await signIn.readError(page)).toBe('Invalid email or password');
    expect(await signIn.isSignedIn(page)).toBe(false);
  },
);

test(
  'TS-E03 · An unknown address is refused in the same words as a wrong password @auth',
  { annotation: [{ type: 'practitest', description: '9003' }] },
  async ({ page, signIn, registration, testData, target }) => {
    onlyOnAnOwnedEnvironment(target.sharedEnvironment);
    const disposable = testData.newCustomer();
    await registration.open(page);
    await registration.register(page, disposable);

    // The point of the spec: the two refusals must be indistinguishable, or the
    // form tells an attacker which addresses have accounts behind them.
    await signIn.withCredentials(page, { username: disposable.email, password: 'wrong-password' });
    const wrongPassword = await signIn.readError(page);

    await signIn.withCredentials(page, {
      username: 'nobody-has-this-address@example.invalid',
      password: 'wrong-password',
    });
    const unknownAddress = await signIn.readError(page);

    expect(unknownAddress, 'the two refusals must not be distinguishable').toBe(wrongPassword);
  },
);

test(
  'TS-E04 · Signing out ends the session @auth',
  { annotation: [{ type: 'practitest', description: '9004' }] },
  async ({ page, signIn, secrets }) => {
    const { username, password } = await secrets.account('customer');
    await signIn.withCredentials(page, { username: username ?? '', password: password ?? '' });
    await expect.poll(() => signIn.isSignedIn(page)).toBe(true);

    await signIn.signOut(page);

    await expect.poll(() => signIn.isSignedIn(page)).toBe(false);
  },
);

test(
  'TS-E05 · The sign-in form offers registration and password recovery @auth',
  { annotation: [{ type: 'practitest', description: '9005' }] },
  async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByRole('link', { name: 'Register your account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot your Password?' })).toBeVisible();
  },
);

test(
  'TS-E45 · Repeated wrong passwords lock the account rather than allowing unlimited guesses @auth @security',
  { annotation: [{ type: 'practitest', description: '9045' }] },
  async ({ page, signIn, registration, testData, target }) => {
    onlyOnAnOwnedEnvironment(target.sharedEnvironment);
    /*
       The behaviour that broke this suite, now tested deliberately and on an
       account created for the purpose. It is worth a spec: an application that
       refuses a wrong password forever without ever locking is one an attacker
       can grind, and this is the only place the suite can say so.
    */
    const disposable = testData.newCustomer();
    await registration.open(page);
    await registration.register(page, disposable);

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await signIn.withCredentials(page, { username: disposable.email, password: `wrong-${attempt}` });
      lastError = await signIn.readError(page);
      if (lastError?.toLowerCase().includes('locked')) break;
    }

    expect(lastError?.toLowerCase(), 'the account locks after repeated failures').toContain('locked');
  },
);
