import { test, type Page } from '@playwright/test';
import { pollUntil } from '../../../support/poll';
import { accountLocators, favoritesLocators, invoiceLocators, profileLocators } from '../locators/account';
import { navigationLocators } from '../locators/navigation';

export interface ProfileDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
}

/**
 * L2 — the signed-in account area.
 *
 * Reads return data and nothing here asserts. `readProfile` in particular
 * returns the whole record so a spec can say which field it cares about,
 * rather than the vocabulary deciding that on its behalf.
 */
export const account = {
  async open(page: Page): Promise<void> {
    await test.step('Open my account', async () => {
      await page.goto('/account');
      await accountLocators.pageTitle(page).waitFor();
    });
  },

  /** The heading of whichever account page is showing. */
  async currentPage(page: Page): Promise<string> {
    return (await accountLocators.pageTitle(page).textContent())?.trim() ?? '';
  },

  /**
   * The sections the account overview offers, in the order shown.
   *
   * Returned as data so a spec can assert on the set without reaching for a
   * locator itself. The first version of the spec used
   * `getByRole('link', { name: 'Favorites' })` inline and failed: these render
   * with the `button` role, not `link`. A spec that guesses a role is a spec
   * that guesses; the vocabulary reads the page.
   */
  async sections(page: Page): Promise<string[]> {
    return test.step('Read the sections my account offers', async () => {
      const names = await Promise.all(
        [
          accountLocators.favorites(page),
          accountLocators.profile(page),
          accountLocators.invoices(page),
          accountLocators.messages(page),
        ].map(async (locator) => ((await locator.textContent()) ?? '').trim()),
      );
      return names.filter(Boolean);
    });
  },

  async openProfile(page: Page): Promise<void> {
    await test.step('Open my profile', async () => {
      await page.goto('/account/profile');
      await profileLocators.firstName(page).waitFor();
      /*
         The inputs render empty and are populated a second or two later, when
         the profile request returns. Waiting for the field to *exist* is not
         waiting for it to hold anything, so `readProfile` came back with a row
         of empty strings and the spec reported that the account's email was
         "" — which reads as a defect in the application rather than as a read
         taken too early.
      */
      await pollUntil(() => profileLocators.email(page).inputValue(), {
        description: 'the profile fields to be populated from the account',
        timeoutMs: 15_000,
        until: (value) => value.length > 0,
      });
    });
  },

  async readProfile(page: Page): Promise<ProfileDetails> {
    return test.step('Read my profile details', async () => ({
      firstName: await profileLocators.firstName(page).inputValue(),
      lastName: await profileLocators.lastName(page).inputValue(),
      email: await profileLocators.email(page).inputValue(),
      phone: await profileLocators.phone(page).inputValue(),
      street: await profileLocators.street(page).inputValue(),
      postcode: await profileLocators.postcode(page).inputValue(),
      city: await profileLocators.city(page).inputValue(),
      state: await profileLocators.state(page).inputValue(),
      country: await profileLocators.country(page).inputValue(),
    }));
  },

  /**
   * What the profile's two-factor panel currently offers this account:
   * `offered` when setup is available, `refused` when the deployment declines
   * it for this login, `absent` when the panel is not there at all.
   *
   * Returned as a state rather than as a boolean because all three are real,
   * and which one appears depends on the account rather than the deployment —
   * the fact that decides whether `capabilities.mfa` can honestly be anything
   * other than `'none'`.
   */
  async twoFactorSetup(page: Page): Promise<'offered' | 'refused' | 'absent'> {
    return test.step('Read what two-factor setup offers this account', async () => {
      if (await profileLocators.totpError(page).isVisible()) return 'refused';
      if (await profileLocators.totpSecret(page).isVisible()) return 'offered';
      return 'absent';
    });
  },

  /** The refusal text, when the deployment declines two-factor for this login. */
  async twoFactorRefusal(page: Page): Promise<string | null> {
    const panel = profileLocators.totpError(page);
    if (!(await panel.isVisible())) return null;
    return (await panel.textContent())?.trim() ?? null;
  },

  async openFavourites(page: Page): Promise<void> {
    await test.step('Open my favourites', async () => {
      await page.goto('/account/favorites');
      await accountLocators.pageTitle(page).waitFor();
    });
  },

  /** The product names currently saved as favourites. */
  async readFavourites(page: Page): Promise<string[]> {
    return test.step('Read my saved favourites', async () => {
      const cards = favoritesLocators.cards(page);
      const count = await cards.count();
      const names: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const name = await favoritesLocators.cardName(cards.nth(index)).textContent();
        names.push(name?.trim() ?? '');
      }
      return names;
    });
  },

  async removeFavourite(page: Page, productName: string): Promise<void> {
    await test.step(`Remove ${productName} from my favourites`, async () => {
      const card = favoritesLocators.card(page, productName);
      await favoritesLocators.cardRemove(card).click();
      await page.waitForLoadState('networkidle');
    });
  },

  async openInvoices(page: Page): Promise<void> {
    await test.step('Open my invoices', async () => {
      await page.goto('/account/invoices');
      await accountLocators.pageTitle(page).waitFor();
      /*
         The heading renders before the table does, and `count()` does not
         auto-wait — so waiting only for the heading hands back a page whose
         rows have not arrived, and the count is a truthful zero.

         Tolerated rather than required: an account with no orders yet has no
         rows at all, and that is a state the page legitimately has.
      */
      await invoiceLocators.rows(page).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    });
  },

  /** How many invoice rows the current page lists. */
  async countInvoiceRows(page: Page): Promise<number> {
    return invoiceLocators.rows(page).count();
  },

  async openFirstInvoice(page: Page): Promise<void> {
    await test.step('Open the most recent invoice', async () => {
      const row = invoiceLocators.rows(page).first();
      await invoiceLocators.rowDetails(row).click();
    });
  },

  /** The account links the user menu offers once opened. */
  async openUserMenu(page: Page): Promise<void> {
    await test.step('Open the account menu', async () => {
      await navigationLocators.userMenu(page).click();
      await navigationLocators.signOut(page).waitFor();
    });
  },
};
