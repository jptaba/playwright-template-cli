import fs from 'node:fs';
import path from 'node:path';
import { auth } from '../actions/auth';
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
 * This project runs signed out (`role: ''`), so it uses `page`, not
 * `authedPage`.
 */
setup('Establish a session for each role', async ({ page, target, secrets }) => {
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

    await auth.signIn(page, { username, password });

    // Fail here, loudly, rather than writing a storage state that carries no
    // session and producing a hundred confusing failures downstream.
    await expect
      .poll(() => auth.isSignedIn(page), {
        message: `Sign-in for role '${role}' did not establish a session`,
      })
      .toBe(true);

    const statePath = storageStatePath(role, target.name);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await page.context().storageState({ path: statePath });
  }
});
