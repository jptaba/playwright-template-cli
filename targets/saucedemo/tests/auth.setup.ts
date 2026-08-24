import fs from 'node:fs';
import path from 'node:path';
import { signIn } from '../actions/sign-in';
import { AUTH_DIR, poolSizeFor, storageStatePath } from '../../../src/support/paths';
import { expect, test as setup } from '../../../src/fixtures/base';

/**
 * The `setup:auth` project — §13.
 *
 * Authenticate once per role and reuse the session everywhere else. Driving a
 * login form before every test is slow, and worse, it makes every test in the
 * suite fail when login breaks: one defect, four hundred red results, and a
 * triage report that tells you nothing.
 *
 * This project runs signed out, so it uses `page`, never `authedPage`.
 *
 * **Each role gets its own browser context.** Looping over the roles in one
 * page means role two signs in while role one's session is still live. Some
 * applications fail that outright; the dangerous ones render the form anyway
 * and quietly ignore the submit, so the storage state written for `admin`
 * holds the customer's session, every administrator test runs with customer
 * rights, and the specs asserting a permission boundary pass for exactly the
 * wrong reason.
 */
setup('Establish a session for each role', async ({ browser, target, secrets }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  /*
     Every account, not every role. A target declaring poolSize 3 has three
     accounts per role and workers are partitioned across them, so a session
     per role would hand two of the three workers cookies belonging to an
     account they were not given — partitioned in name and sharing one
     identity in fact.
  */
  for (const role of target.roles) {
   for (let index = 1; index <= poolSizeFor(target.credentials.poolSize, role); index += 1) {
    const credentials = await secrets.account(role, index);
    const username = credentials.username;
    const password = credentials.password;
    if (!username || !password) {
      throw new Error(
        `Credential payload for role '${role}' is missing username or password. ` +
          `Present fields: ${Object.keys(credentials).join(', ') || '(none)'}.`,
      );
    }

    const context = await browser.newContext({ baseURL: target.baseURL });
    const page = await context.newPage();
    try {
      await signIn.withCredentials(page, { username, password });

      /*
         Fail here, loudly, rather than writing a storage state that carries no
         session and producing a hundred confusing failures downstream — and
         say *what the form reported*, not merely that no session appeared.

         "Sign-in did not establish a session" is true and useless. The run
         that first produced it had locked the account, and the application was
         saying so on screen; twenty-one specs failed across five features
         before anyone opened the screenshot.
      */
      const established = await expect
        .poll(() => signIn.isSignedIn(page), {
          message: `Sign-in for role '${role}' did not establish a session`,
        })
        .toBe(true)
        .then(() => true)
        .catch(async (error: unknown) => {
          const reported = await signIn.readError(page);
          throw new Error(
            `Sign-in for role '${role}' did not establish a session.` +
              (reported
                ? `\nThe application said: "${reported}"`
                : '\nThe form reported no error, so the credential was accepted but no session ' +
                  'marker appeared — check the signed-in locator rather than the credential.') +
              `\n\n${error instanceof Error ? error.message : String(error)}`,
          );
        });
      expect(established).toBe(true);

      const statePath = storageStatePath(role, target.name, index);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
    } finally {
      await context.close();
    }
   }
  }
});
