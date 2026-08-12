import fs from 'node:fs';
import path from 'node:path';
import { signIn } from '../actions/sign-in';
import { AUTH_DIR, storageStatePath } from '../../../support/paths';
import { expect, test as setup } from '../../../fixtures/base';

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
 * **Each role gets its own browser context.** The generated version of this
 * file looped over the roles in the single `page` the fixture provides, which
 * means role two signs in while role one's session is still live. On this
 * application that fails outright — `/auth/login` redirects to `/account` when
 * a session exists, so the email field never appears — but the dangerous
 * version is the application that renders the form anyway and quietly ignores
 * the submit. There, the storage state written for `admin` holds `customer`'s
 * session, every administrator test runs with customer rights, and the ones
 * that assert a permission boundary pass for precisely the wrong reason.
 */
setup('Establish a session for each role', async ({ browser, target, secrets }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const role of target.roles) {
    const credentials = await secrets.account(role);
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

         "Sign-in for role 'customer' did not establish a session" is true and
         useless. The run that produced it had locked the account, and the
         application was saying so on screen: "Account locked, too many failed
         attempts." Twenty-one specs failed across five features before anyone
         read the screenshot. Quoting the form turns that into one line.
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

      // And prove the session belongs to the role we asked for. Without this,
      // a context that silently kept the previous role's cookies writes a
      // storage state under the wrong name and nothing downstream can tell.
      const signedInAs = await signIn.signedInAs(page);
      expect(signedInAs, `the session established for '${role}' names the wrong user`).not.toBeNull();

      const statePath = storageStatePath(role, target.name);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
    } finally {
      await context.close();
    }
  }
});
