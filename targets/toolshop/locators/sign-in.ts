import type { Locator, Page } from '@playwright/test';

/**
 * L1 — named locators, and nothing else. No logic, no waits, no assertions.
 *
 * Every name here was read off the running application at `/auth/login`, from
 * the accessibility snapshot rather than from the DOM. That distinction is not
 * academic on this application: the two fields are labelled `Email address *`
 * and `Password *`, and their *placeholders* say `Your email` and
 * `Your password`. A pack written from the placeholders — which is what a DOM
 * dump gives you — fails as a bare fifteen-second timeout on a field plainly
 * on screen.
 */
export const signInLocators = {
  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Email address *' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password *' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Login' }),
  /**
   * The refusal banner.
   *
   * **Brought in line with the corrected scaffold template**, which used to
   * emit a bare `getByRole('alert')` into every pack. That matched nothing on
   * an application whose banner carries no role, and `readError` then returned
   * null — a null indistinguishable from "the form reported no error", which
   * is the one failure mode that sends people to the wrong file.
   *
   * Role first because that is what a screen reader hears, this target's own
   * test id second because that is what applications actually ship. The
   * template carries the full reasoning.
   */
  error: (page: Page): Locator => page.getByRole('alert').or(page.getByTestId('error')), // @template:sign-in-error

  /**
   * Something only a signed-in page shows. Used to verify a session, never to
   * assert an outcome.
   *
   * A test id rather than a role and a name, which is third in the priority
   * order and deliberate here. The account control this replaces is
   * `button "Jane Doe"` for the customer and `button "John Doe"` for the
   * admin — it carries *the signed-in person's own name*, so a marker written
   * as `getByRole('button', { name: 'Jane Doe' })` establishes one role's
   * session and reports every other role as signed out. `nav-menu` is the same
   * control, named by something that does not change with who is looking.
   *
   * Sign-out is excluded on purpose even though it is equally stable: this is
   * called after signing out too, and a marker that is the sign-out button
   * reports a session that has just ended.
   */
  signedInMarker: (page: Page): Locator => page.getByTestId('nav-menu'),

  /** The signed-out state, for the specs that prove a sign-out worked. */
  signInLink: (page: Page): Locator =>
    page.getByRole('navigation').getByRole('link', { name: 'Sign in' }),

  /** Inside the account menu, and only reachable once it is open. */
  signOut: (page: Page): Locator => page.getByTestId('nav-sign-out'),
};
