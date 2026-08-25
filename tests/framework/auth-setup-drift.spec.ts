import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { planScaffold } from '../../src/support/onboarding/scaffold';
import { optionsFromProfile } from '../../src/support/onboarding/upgrade';
import { resolveTarget, targetNames } from '../../config/target';
import { REPO_ROOT } from '../../src/support/paths';

/**
 * `auth.setup.ts` is the one scaffolded file that should never diverge.
 *
 * Most of a pack legitimately does. `target:upgrade` says so in its own report
 * — locators rewritten from a real page, actions carrying business verbs — and
 * it reports drift rather than correcting it precisely because it cannot tell
 * somebody's work from a template that has moved on.
 *
 * This file is the exception, and the reason is that it contains **no
 * application-specific content at all**: it loops the roles the profile
 * declares, calls the pack's own `signIn`, and writes storage states. Every
 * line of it is framework plumbing that happens to live in the pack because
 * Playwright needs it there.
 *
 * **Why this test exists.** `toolshop`'s copy had quietly become *better* than
 * the template — it named which pooled account failed, where the template said
 * only which role. Four packs and the template did not have that improvement,
 * so on a target with `poolSize: 3` the message named one of three accounts and
 * left you to guess. Nothing surfaced it: `target:upgrade` reported the file as
 * "differs", which is its healthy majority state and reads as information
 * rather than as a defect.
 *
 * A pack improving past its template is invisible to a tool built to expect the
 * opposite. So the fix goes both ways — the template absorbed the improvement,
 * and this holds every pack to it from now on.
 *
 * If this fails: **do not edit the pack.** Change `AUTH_SETUP` in
 * `src/support/onboarding/scaffold.ts` and regenerate, so the next application
 * onboarded gets the fix too. That is rule zero, and this file is the check
 * that makes it hard to skip.
 */
test.describe('auth.setup.ts matches the template in every pack', () => {
  const targets = targetNames();

  test('there is at least one pack to check', () => {
    // Otherwise this suite passes vacuously on a repository with no targets,
    // which is exactly the shape of a check nobody notices has stopped working.
    expect(targets.length).toBeGreaterThan(0);
  });

  for (const name of targets) {
    test(`${name} carries the scaffolder's auth.setup.ts unchanged`, () => {
      const profile = resolveTarget(name);
      const planned = planScaffold(optionsFromProfile(profile)).files.find((file) =>
        file.path.endsWith('/tests/auth.setup.ts'),
      );
      expect(planned, `the scaffolder plans no auth.setup.ts for ${name}`).toBeTruthy();

      const full = path.join(REPO_ROOT, planned!.path);
      expect(fs.existsSync(full), `${planned!.path} is missing`).toBe(true);

      // Line endings and a trailing newline are not drift — the same
      // normalisation `planUpgrade` applies before calling a file diverged.
      const normalise = (text: string): string => text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
      expect(
        normalise(fs.readFileSync(full, 'utf8')),
        `${planned!.path} has drifted from the template. Fix AUTH_SETUP in ` +
          'src/support/onboarding/scaffold.ts and regenerate — never the pack.',
      ).toBe(normalise(planned!.contents));
    });
  }
});

test.describe('what the template promises about a failed sign-in', () => {
  const template = planScaffold(optionsFromProfile(resolveTarget(targetNames()[0]!))).files.find(
    (file) => file.path.endsWith('/tests/auth.setup.ts'),
  )!.contents;

  test('names which pooled account failed, not just the role', () => {
    // With `poolSize: 3` a message naming only the role leaves three
    // candidates, and the account is the thing you need to reproduce it.
    expect(template).toContain('(account ${index})');
  });

  /*
     The finding that produced this file. The old text asserted a cause —
     "check the signed-in locator rather than the credential" — and it sent
     somebody to a locator that was correct while the application was
     transiently failing to complete a sign-in at all.
  */
  test('reports where the browser landed rather than asserting a cause', () => {
    expect(template).toContain('page.url()');
    expect(template).toContain('Still on the sign-in page');
    expect(template).not.toContain('check the signed-in locator rather than the credential');
  });

  test('still says what the application reported, when it reported anything', () => {
    expect(template).toContain('The application said');
  });
});
