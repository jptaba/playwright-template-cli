import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the admin room list and the form that adds to it.
 *
 * Every name here was read off the running application at `/admin`, from the
 * accessibility snapshot and the DOM together, and the two disagree in a way
 * worth writing down: **this application has almost no accessible names.** The
 * form's four fields carry ids and no labels, the room rows are bare
 * paragraphs, and the delete control is an icon `<span>`. So `getByRole` is
 * available for exactly one control on the page — the Create button — and the
 * rest resolve by id with the justification the rule requires.
 *
 * That is the application's defect rather than the framework's, and it is
 * recorded here rather than worked around: a form whose fields a screen reader
 * cannot name is a WCAG 1.3.1/4.1.2 failure. If it ever gains labels, delete
 * the justifications and use them.
 */
export const roomLocators = {
  /**
   * The banner the form shows when it refuses, present only when it has.
   *
   * **Not `getByRole('alert')`, and the reason is worth keeping.** That
   * matched *something* — Playwright reported exactly one node — and reading
   * it returned an empty string, so a spec asserting on the refusal text got
   * `""` while the message sat plainly on screen. Checked against the DOM
   * directly rather than inferred: `querySelectorAll('[role="alert"]')` finds
   * **nothing** on this page, before or after a refusal. The accessibility
   * tree was reporting a node that is not this banner.
   *
   * So the honest handle is the Bootstrap class, and here it is the better
   * one anyway: it is absent until the form refuses, which is what lets a
   * verb wait for "listed *or* refused" instead of timing out on one of them.
   */
  // locator-justification: the refusal banner carries no role, id or test id — checked in the DOM.
  errors: (page: Page): Locator => page.locator('div.alert-danger'),

  /**
   * One message per line, rather than the banner's own text.
   *
   * The banner concatenates its children with no separator, so two failures
   * read as `Room name must be setmust be greater than or equal to 1` — one
   * unreadable string where there are two findings.
   */
  // locator-justification: messages are bare paragraphs inside the refusal banner.
  errorMessages: (page: Page): Locator => page.locator('div.alert-danger p'),

  /** The Create button, and the only control here with an accessible name. */
  create: (page: Page): Locator => page.getByRole('button', { name: 'Create' }),

  /**
   * The room-name field, which is also the one element carrying a test id.
   *
   * `getByTestId` resolves to the *input* only — the room rows do not carry
   * the attribute, so this cannot accidentally match a listed room.
   */
  name: (page: Page): Locator => page.getByTestId('roomName'),

  // locator-justification: the type select has an id and no label or accessible name.
  type: (page: Page): Locator => page.locator('#type'),
  // locator-justification: the accessible select has an id and no label or accessible name.
  accessible: (page: Page): Locator => page.locator('#accessible'),
  // locator-justification: the price field has an id and no label or accessible name.
  price: (page: Page): Locator => page.locator('#roomPrice'),

  /**
   * One listed room, by the name it was created with.
   *
   * **Derived, never transcribed.** The application builds the paragraph's id
   * as `roomName<name>`, so the locator is computed from the value the spec
   * supplied rather than from an id read off a screen — which is the rule
   * about internal identifiers, and the reason this does not break when the
   * demo is reseeded.
   */
  /*
     An attribute selector rather than `#id`, and `CSS.escape` is not the
     answer: locators are built in Node, where that browser global does not
     exist — it threw `ReferenceError: CSS is not defined` on the first run.
     Matching the attribute exactly needs no escaping, and naming the `p`
     keeps it off the create form's own input, whose id is `roomName`.
  */
  // locator-justification: rooms render as bare paragraphs whose only handle is the derived id.
  listed: (page: Page, name: string): Locator => page.locator(`p[id="roomName${name}"]`),

  /**
   * The row a listed room sits in.
   *
   * Bootstrap columns with no row container of their own, so the row is found
   * as the `.row` *containing* this room's name — the same "scope to the thing
   * that makes the answer unambiguous" move the cart locators make, and the
   * reason deleting one room cannot delete another.
   */
  row: (page: Page, name: string): Locator =>
    // locator-justification: rows are Bootstrap columns with no semantic row element.
    page.locator('.row').filter({ has: roomLocators.listed(page, name) }),

  /**
   * The per-room delete control.
   *
   * An icon-only `<span>` with no accessible name, no test id and no button
   * role — so there is genuinely nothing else to address it by, and it is
   * scoped to its own row so it can never remove a different room.
   */
  remove: (page: Page, name: string): Locator =>
    // locator-justification: icon-only span with no accessible name, test id or role.
    roomLocators.row(page, name).locator('span.roomDelete'),
};
