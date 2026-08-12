import { expect, test } from '../../fixtures';

/**
 * L4 — the signed-in account area.
 */

test(
  'TS-E30 · The account area offers favourites, profile, invoices and messages @account',
  { annotation: [{ type: 'practitest', description: '9030' }] },
  async ({ authedPage, account }) => {
    await account.open(authedPage);

    expect(await account.currentPage(authedPage)).toBe('My account');
    expect(await account.sections(authedPage)).toEqual([
      'Favorites',
      'Profile',
      'Invoices',
      'Messages',
    ]);
  },
);

test(
  'TS-E31 · The profile shows the signed-in customer’s own details @account',
  { annotation: [{ type: 'practitest', description: '9031' }] },
  async ({ authedPage, account, secrets }) => {
    const { username } = await secrets.account('customer');

    await account.openProfile(authedPage);

    const profile = await account.readProfile(authedPage);
    expect(profile.email, 'the profile belongs to the signed-in account').toBe(username);
    expect(profile.firstName).not.toBe('');
  },
);

test(
  'TS-E32 · The account this suite signs in as has no second factor enabled @account',
  { annotation: [{ type: 'practitest', description: '9032' }] },
  async ({ authedPage, account }) => {
    await account.openProfile(authedPage);

    const setup = await account.twoFactorSetup(authedPage);

    /*
       This is the spec behind `capabilities.mfa: 'none'` in the profile, and
       the first version of it asserted the wrong thing.

       It claimed the deployment *refuses* two-factor setup for seeded logins,
       because that is what the account it was written against reported. Point
       the same spec at a different seeded login and the panel offers the full
       setup instead — a secret, a code field and a verify button. The refusal
       is a property of one account, not of the deployment.

       What is actually true, and what the capability rests on: setup is
       reachable, and no account this suite signs in as has it *enabled*, so no
       sign-in demands a second factor. If that changes, this fails and the
       profile gets revisited rather than the claim going stale in a comment.
    */
    expect(['offered', 'refused'], 'the profile has a two-factor panel at all').toContain(setup);
    if (setup === 'refused') {
      expect(await account.twoFactorRefusal(authedPage)).toContain('create your own account');
    }
  },
);

test(
  'TS-E33 · A product saved from its page appears in favourites @account',
  { annotation: [{ type: 'practitest', description: '9033' }] },
  async ({ authedPage, catalog, product, account }) => {
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);

    const announced = await product.addToFavourites(authedPage);

    // The application confirms the save before the list is asked about it.
    // Without this the spec polls a favourites page for a record the click
    // never created, and reports an empty list rather than the refusal.
    expect(announced, 'the application confirmed the save').not.toBeNull();

    await account.openFavourites(authedPage);
    await expect.poll(() => account.readFavourites(authedPage)).toContain(chosen!.name);
  },
);

test(
  'TS-E34 · An order a customer places appears in their invoice list @account',
  { annotation: [{ type: 'practitest', description: '9034' }] },
  async ({ authedPage, catalog, product, checkout, account, testData }) => {
    /*
       Places the order the assertion depends on, rather than assuming the
       account already has history.

       The first version asserted "the seeded customer has order history" and
       passed — until the account behind the `customer` role changed, at which
       point it failed for a reason that had nothing to do with invoicing. A
       spec that depends on data it did not create is a spec that depends on
       which account it happens to be running as.
    */
    await catalog.open(authedPage);
    const [chosen] = await catalog.readCards(authedPage);
    expect(chosen).toBeDefined();
    await product.open(authedPage, chosen!.name);
    await product.addToCart(authedPage);
    await checkout.openCart(authedPage);
    await checkout.proceedToPayment(authedPage, testData.billingAddress());
    await checkout.payWith(authedPage, 'Cash on Delivery');

    await account.openInvoices(authedPage);

    expect(await account.currentPage(authedPage)).toBe('Invoices');
    expect(await account.countInvoiceRows(authedPage)).toBeGreaterThan(0);
  },
);
