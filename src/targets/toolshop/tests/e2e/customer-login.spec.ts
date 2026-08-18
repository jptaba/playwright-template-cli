import { expect, test } from '../../fixtures';

/**
 * TOOL-2 — signing in and out.
 *
 * `*login.spec.ts`, so the signed-out `auth-flows` project picks these up, and
 * they take `page` rather than `authedPage`: a spec about signing in that
 * starts from an established session is not testing signing in.
 *
 * The wrong-password case uses **a disposable address**, never the real
 * account. Two specs asserting "a wrong password is refused" against the
 * shared account locked it on a previous target, and twenty-one unrelated
 * specs went red. On a deployment shared with strangers there is no way to
 * unlock it either.
 *
 * The two that *do* sign in ask for `signInAccount`, not `account`. This
 * project has no `dependencies`, so it runs concurrently with `e2e` — and
 * `account('customer')` defaults to index 1, the account an `e2e` worker is
 * signed in as and mutating a cart with. The profile reserves one identity
 * for this project precisely so these specs cannot collide with it.
 */

test(
  'TOOL-2-01 · A registered customer signs in and reaches their account @smoke @auth',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-2-01' },
      { type: 'jira', description: 'TOOL-2' },
    ],
  },
  async ({ page, signIn, secrets }) => {
    /*
       Read by name rather than passed through: a secret payload can carry more
       than a login, and an action's parameters say what it actually needs.
    */
    const account = await secrets.signInAccount('customer');
    await signIn.withCredentials(page, {
      username: account.username ?? '',
      password: account.password ?? '',
    });

    await expect(page).toHaveURL(/\/account/);
    /*
       Polled, not read once. `isSignedIn` is deliberately a non-waiting read —
       it is called after signing *out* too, where waiting would cost fifteen
       seconds to be told the truth — so the spec supplies the waiting, which
       is what `expect.poll` is for. The URL changes a moment before the
       navigation re-renders with the account menu in it.
    */
    await expect
      .poll(() => signIn.isSignedIn(page), { message: 'no session was established' })
      .toBe(true);
  },
);

test(
  'TOOL-2-02 · A wrong password does not establish a session @auth',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-2-02' },
      { type: 'jira', description: 'TOOL-2' },
    ],
  },
  async ({ page, signIn, run }) => {
    /*
       An address nobody registered, unique per run. The account this would
       otherwise spend is the one every other spec signs in as, and lockout
       budgets are not shared politely.
    */
    await signIn.withCredentials(page, {
      username: `${run.unique('nobody')}@practicesoftwaretesting.invalid`,
      password: 'not-the-password',
    });

    expect(await signIn.isSignedIn(page), 'a refused sign-in established a session').toBe(false);
    await expect(page).toHaveURL(/\/auth\/login/);
  },
);

test(
  'TOOL-2-03 · Signing out returns the navigation to its signed-out state @auth',
  {
    annotation: [
      { type: 'practitest', description: 'TOOL-2-03' },
      { type: 'jira', description: 'TOOL-2' },
    ],
  },
  async ({ page, signIn, secrets }) => {
    const account = await secrets.signInAccount('customer');
    await signIn.withCredentials(page, {
      username: account.username ?? '',
      password: account.password ?? '',
    });
    await expect.poll(() => signIn.isSignedIn(page)).toBe(true);

    await signIn.signOut(page);

    expect(await signIn.isSignedIn(page), 'the session survived signing out').toBe(false);
  },
);
