import { test, type Page } from '@playwright/test';

/**
 * L2 — the persisted-state vocabulary for this target.
 *
 * This application has no server: the cart lives in `localStorage`, which is
 * why the profile declares `serverState: false`. That store is the closest
 * thing it has to a backend, so reading it is how a spec verifies *where the
 * fact actually lands* rather than only what the screen shows — the same
 * reasoning as a database read against a real target, arriving at the only
 * store this one has.
 *
 * Seeding through it is the analogue of API-driven setup: seconds rather than
 * a click-through, for tests whose subject is what happens *after* the cart
 * has items.
 *
 * The product ids are **derived from the rendered listing**, never hard-coded.
 * A guessed internal id is exactly the brittle coupling this framework exists
 * to prevent, and getting it wrong is silent: the cart fills with the wrong
 * products and the test still runs.
 */
const STORAGE_KEY = 'cart-contents';

/** Requires the product listing to be open — that is where the ids are. */
async function catalogIds(page: Page): Promise<Map<string, number>> {
  const pairs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-test="inventory-item"]')).map((card) => {
      const link = card.querySelector('a[id^="item_"]');
      const id = Number(/item_(\d+)_/.exec(link?.id ?? '')?.[1] ?? '-1');
      const name = card.querySelector('[data-test="inventory-item-name"]')?.textContent?.trim() ?? '';
      return { id, name };
    }),
  );

  const byName = new Map<string, number>();
  for (const pair of pairs) {
    if (pair.id >= 0 && pair.name) byName.set(pair.name, pair.id);
  }
  if (byName.size === 0) {
    throw new Error(
      'No catalogue ids found. The persisted-cart vocabulary reads them from the product ' +
        'listing, so open the listing before seeding or reading.',
    );
  }
  return byName;
}

export const cartState = {
  /**
   * Product names currently persisted, whatever the screen is showing.
   * Returned sorted, because the store's order is an implementation detail
   * and asserting on it would make this brittle for no benefit.
   */
  async readPersisted(page: Page): Promise<string[]> {
    return test.step('Read the persisted cart', async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      const ids = raw ? (JSON.parse(raw) as number[]) : [];
      if (ids.length === 0) return [];

      const byName = await catalogIds(page);
      const byId = new Map([...byName].map(([name, id]) => [id, name]));
      return ids
        .map((id) => byId.get(id))
        .filter((name): name is string => Boolean(name))
        .sort();
    });
  },

  /**
   * Put products in the cart without driving the UI, then reload so the
   * application renders from the state it was given.
   */
  async seed(page: Page, names: readonly string[]): Promise<void> {
    await test.step(`Seed the cart with ${names.length} product(s)`, async () => {
      const byName = await catalogIds(page);
      const ids = names.map((name) => {
        const id = byName.get(name);
        if (id === undefined) throw new Error(`No catalogue product named '${name}'.`);
        return id;
      });

      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key as string, value as string),
        [STORAGE_KEY, JSON.stringify(ids)] as const,
      );
      await page.reload();
    });
  },
};
