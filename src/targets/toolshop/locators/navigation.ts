import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the chrome that is on every page: the main menu, the cart badge, the
 * signed-in user menu.
 *
 * Written from the accessibility snapshot `npm run explore` produced, not from
 * memory. Every name below appears verbatim in that snapshot.
 */
export const navigationLocators = {
  menu: (page: Page): Locator => page.getByRole('menubar', { name: 'Main menu' }),

  home: (page: Page): Locator => page.getByTestId('nav-home'),
  categories: (page: Page): Locator => page.getByTestId('nav-categories'),
  contact: (page: Page): Locator => page.getByTestId('nav-contact'),
  signIn: (page: Page): Locator => page.getByTestId('nav-sign-in'),

  /**
   * The user menu is the signed-in marker: it renders the account holder's
   * name where `Sign in` sits when signed out.
   */
  userMenu: (page: Page): Locator => page.getByTestId('nav-menu'),

  /*
     The sign-out link, and the account links beside it, only exist once the
     user menu is open — they are scoped to nothing else on the page, so an
     unscoped test id is unambiguous here.
  */
  signOut: (page: Page): Locator => page.getByTestId('nav-sign-out'),
  myAccount: (page: Page): Locator => page.getByTestId('nav-my-account'),
  myFavorites: (page: Page): Locator => page.getByTestId('nav-my-favorites'),
  myProfile: (page: Page): Locator => page.getByTestId('nav-my-profile'),
  myInvoices: (page: Page): Locator => page.getByTestId('nav-my-invoices'),
  myMessages: (page: Page): Locator => page.getByTestId('nav-my-messages'),

  cart: (page: Page): Locator => page.getByTestId('nav-cart'),
  /** The number beside the cart icon. Absent entirely when the cart is empty. */
  cartQuantity: (page: Page): Locator => page.getByTestId('cart-quantity'),

  languageSelect: (page: Page): Locator => page.getByTestId('language-select'),
  /** One entry per locale in the language menu: `lang-de`, `lang-nl`, … */
  language: (page: Page, code: string): Locator => page.getByTestId(`lang-${code}`),

  /**
   * The site-wide banner at the top of every page ("View the Documentation for
   * this application").
   *
   * Named for what it is. It was called `notification` and used as the place
   * success messages appear, which is wrong: it is static furniture, always
   * present, and reading it returned the banner text for every assertion about
   * a confirmation. The test id says `notification-bar`; the accessibility tree
   * says otherwise, and the accessibility tree is right.
   */
  siteBanner: (page: Page): Locator => page.getByTestId('notification-bar'),

  /**
   * The transient message the application announces after an action — "Thanks
   * for your message! We will contact you shortly.", "Product added to shopping
   * cart." It carries `role="alert"`, which is both how a screen reader hears
   * it and the only thing that distinguishes it from the banner above.
   */
  toast: (page: Page): Locator => page.getByRole('alert'),
};
