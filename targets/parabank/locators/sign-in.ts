import type { Locator, Page } from '@playwright/test';

/**
 * L1 — signing in, and the marker that says it worked.
 *
 * **Read off the running application, and the reading is the interesting
 * part.** The two credential fields have *no accessible name at all*. The
 * words "Username" and "Password" beside them are `<b>` elements in a layout
 * table, not `<label for>`, so nothing associates them with the inputs: the
 * accessibility tree renders them as bare `textbox` and `textbox`, and
 * `getByLabel('Username')` matches nothing.
 *
 * A DOM dump says otherwise — it happily reports the neighbouring text as if
 * it were a label — which is exactly the failure the conventions warn about,
 * where a field plainly on screen fails as a bare fifteen-second timeout.
 * These were checked in the accessibility tree, which is what `getByRole` and
 * a screen reader both read.
 *
 * So CSS, with the justification the rule requires. Worth saying plainly: an
 * input with no accessible name is a WCAG 4.1.2 failure, so these locators
 * document a defect in the application rather than a gap in the framework. If
 * the form ever gains labels, delete the justifications and use `getByLabel`.
 *
 * Note the justification must be the *single line directly above* the call —
 * the lint rule reads one line, so a two-line comment fails even when it says
 * the right thing. Learned by tripping it thirteen times.
 */
export const signInLocators = {
  // locator-justification: no label, aria-label or test id; `name` is the only handle
  username: (page: Page): Locator => page.locator('input[name="username"]'),

  // locator-justification: as username, and no adjacent text inside the control
  password: (page: Page): Locator => page.locator('input[name="password"]'),

  /** The submit control does have an accessible name, so it uses one. */
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Log In' }),

  /**
   * The signed-in marker — the one locator that cannot be read from a page at
   * rest, because it only exists once a session does.
   *
   * "Log Out" rather than the account table: the overview page is reachable by
   * several routes and one of them renders the heading with an empty shell.
   * The sign-out link exists only when there is a session to end. Verified
   * live against a real sign-in before being written down.
   */
  signedInMarker: (page: Page): Locator => page.getByRole('link', { name: 'Log Out' }),

  /**
   * "Welcome John Smith" in the left panel — who the session belongs to.
   *
   * Separate from the marker on purpose. The marker answers *whether* there is
   * a session and must be the narrowest reliable thing; this answers *whose*,
   * and a spec wanting the name should not have to parse it out of a link that
   * says "Log Out".
   */
  // locator-justification: <p class="smallText"> with no role or accessible name
  welcome: (page: Page): Locator => page.locator('#leftPanel p.smallText'),

  /**
   * The error the form reports for a refused sign-in. Kept separate from the
   * generic page error because a refused *sign-in* and a refused *transfer*
   * are different findings, and a spec that cannot tell them apart reports the
   * wrong one.
   */
  // locator-justification: <p class="error"> with no role or accessible name
  error: (page: Page): Locator => page.locator('#loginPanel p.error, #rightPanel p.error'),
};
