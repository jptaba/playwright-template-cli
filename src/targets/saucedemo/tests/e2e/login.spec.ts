import { expect, test } from '../../fixtures';

/**
 * SD-2 — signing in, and being refused.
 *
 * **Its own file because of where it has to run.** The `auth-flows` project
 * picks up `*login|mfa|password.spec.ts` and runs them signed *out*; anywhere
 * else this would execute in `e2e` with a session already established and pass
 * without testing anything. The `auth-project-boundary` rule caught exactly
 * that when this spec was first written into `coverage.spec.ts`, which is the
 * lint rule doing the job a reviewer would probably not have.
 */

test(
  'SD-2-01 · A locked account is refused, and says so rather than failing silently @negative @auth',
  {
    annotation: [
      { type: 'practitest', description: 'SD-2-01' },
      { type: 'jira', description: 'SD-2' },
    ],
  },
  async ({ page, secrets, signIn }) => {
    /*
       `locked_out_user` is one of the accounts this demo publishes on its own
       login page, and it exists precisely to be refused — so this spends no
       lockout budget belonging to anybody else, which is the hazard that makes
       negative-authentication specs dangerous on a shared deployment.

       The credential still resolves through the `secrets` fixture. A username
       typed into a spec is the one shortcut that would make the whole
       `secrets-via-fixture` rule unenforceable.
    */
    const account = await secrets.account('locked');

    await signIn.withCredentials(page, {
      username: account.username!,
      password: account.password!,
    });

    /*
       Both halves. "No session" alone would pass on an application that
       silently did nothing, and the difference between *refused* and *broken*
       is the entire value of a negative test — so the message is asserted too.
    */
    expect(await signIn.isSignedIn(page), 'a locked account established a session').toBe(false);
    expect(await signIn.readError(page), 'the refusal was silent').toContain('locked out');
  },
);
