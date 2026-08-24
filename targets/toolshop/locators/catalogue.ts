import type { Locator, Page } from '@playwright/test';

/**
 * L1 — the product listing and one product's page.
 *
 * Read off the running application. The listing is a grid of cards; a card's
 * name is `product-name` and its price `product-price`, and both are scoped to
 * the card rather than looked up globally — the product *page* reuses
 * `product-name` and `unit-price`, and an unscoped locator would answer the
 * wrong question with a plausible result depending on which page it ran on.
 */
/**
 * An anchored match on a name, for `filter({ hasText })`.
 *
 * `hasText` with a string takes a **substring**, and this catalogue is full of
 * names that contain one another — "Pliers" is inside "Combination Pliers",
 * "Long Nose Pliers" and "Slip Joint Pliers"; "Hammer" is inside four more.
 * So asking for "Pliers" and taking `.first()` opens whichever the listing
 * happened to order first, which is the wrong product with a plausible result:
 * the spec then reads *that* product's name and price and agrees with itself.
 *
 * Found when a spec started choosing a product by stock rather than by
 * position, and the choice stopped lining up with what opened.
 */
const exactly = (text: string): RegExp =>
  new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

export const catalogueLocators = {
  /**
   * Every product card on the listing.
   *
   * Scoped to a link, and that scoping is the point. `product-name` is reused
   * by the *product page*, where it is the `h1` — so an unscoped locator
   * matches on both pages and answers the wrong question with a plausible
   * result depending on which one it runs on. A card is a product name inside
   * a link; a product heading is not inside anything.
   *
   * The obvious container would have been `getByRole('main')`, and this
   * application has no `main` landmark at all: that version matched nothing
   * and failed as a fifteen-second timeout on a grid plainly on screen.
   */
  cards: (page: Page): Locator => page.getByRole('link').getByTestId('product-name'),

  /** One card, by the name printed on it — exactly that name, see `exactly`. */
  card: (page: Page, name: string): Locator =>
    catalogueLocators.cards(page).filter({ hasText: exactly(name) }),

  /**
   * The whole card, rather than the name inside it.
   *
   * `cards` is deliberately the *name* element, because that is what a caller
   * counting or reading products wants. Stock is a property of the card, so
   * anything asking whether a product can be bought needs the container the
   * badge sits in as well.
   */
  cardLinks: (page: Page): Locator =>
    page.getByRole('link').filter({ has: page.getByTestId('product-name') }),

  /**
   * The cards for products that can actually be added to a cart.
   *
   * Composed as a filter rather than read and sifted in an action, so the
   * result auto-waits like every other locator here — `count()` on a grid
   * part-way through rendering has a truthful and useless answer.
   */
  inStockCards: (page: Page): Locator =>
    catalogueLocators.cardLinks(page).filter({ hasNot: page.getByTestId('out-of-stock') }),

  /**
   * The "Out of stock" badge, which the application renders on the listing
   * card *and* on the product page. That it is on the card is what makes the
   * question cheap: a spec can find a product it is allowed to buy without
   * opening any of them.
   */
  outOfStock: (page: Page): Locator => page.getByTestId('out-of-stock'),

  search: (page: Page): Locator => page.getByTestId('search-query'),
  searchSubmit: (page: Page): Locator => page.getByTestId('search-submit'),
  searchReset: (page: Page): Locator => page.getByTestId('search-reset'),

  /**
   * The "no results" caption. Kept as a locator rather than asserted on a
   * count, because a listing that has not finished rendering has a truthful
   * count of zero and this does not appear until the search has answered.
   */
  noResults: (page: Page): Locator => page.getByTestId('no-results'),

  /**
   * The term the page says it searched for — `Searched for: <term>`.
   *
   * This is the anchor a search waits on, and finding it was the whole
   * difficulty. "Wait until a card is on screen" is already true before the
   * search runs, so the first version returned instantly and read the
   * *unfiltered* listing: the spec then reported that searching for "pliers"
   * returned "Bolt Cutters", which reads as an application defect and is not
   * one. This element does not exist until a search has answered.
   */
  searchedFor: (page: Page): Locator => page.getByTestId('search-term'),

  sort: (page: Page): Locator => page.getByTestId('sort'),
};

/** One product's own page. */
export const productLocators = {
  name: (page: Page): Locator => page.getByTestId('product-name'),
  price: (page: Page): Locator => page.getByTestId('unit-price'),
  description: (page: Page): Locator => page.getByTestId('product-description'),
  quantity: (page: Page): Locator => page.getByTestId('quantity'),
  increaseQuantity: (page: Page): Locator => page.getByTestId('increase-quantity'),
  addToCart: (page: Page): Locator => page.getByTestId('add-to-cart'),

  /** The specifications table, which is *not* the cart — see `cart.ts`. */
  specifications: (page: Page): Locator => page.getByTestId('product-specs'),
};
