import fs from 'node:fs';
import path from 'node:path';
import { signIn } from '../actions/sign-in';
import { AUTH_DIR, storageStatePath } from '../../../support/paths';
import { expect, test as setup } from '../../../fixtures/base';

/**
 * The `setup:auth` project — TEMPLATE, and a required file rather than an
 * optional one: without it no storage state is ever written, and every spec
 * taking `authedPage` fails with "No storage state for role", which points at
 * the wrong thing entirely. `npm run target:doctor` reports its absence as an
 * error for exactly that reason.
 *
 * Authenticate once per role and reuse the session everywhere else. Driving a
 * login form before every test is slow, and worse, it makes every test in the
 * suite fail when login breaks: one defect, four hundred red results, and a
 * triage report that tells you nothing (§13).
 *
 * This project runs signed out, so it uses `page`, never `authedPage`.
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

    await signIn.withCredentials(page, { username, password });

    // Fail here, loudly, rather than writing a storage state that carries no
    // session and producing a hundred confusing failures downstream.
    await expect
      .poll(() => signIn.isSignedIn(page), {
        message: `Sign-in for role '${role}' did not establish a session`,
      })
      .toBe(true);

    const statePath = storageStatePath(role, target.name);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await page.context().storageState({ path: statePath });
  }
});
