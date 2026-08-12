import { test as framework } from '../../fixtures/base';
import { account } from './actions/account';
import { admin } from './actions/admin';
import { catalog } from './actions/catalog';
import { checkout, type BillingAddress } from './actions/checkout';
import { contact } from './actions/contact';
import { product } from './actions/product';
import { registration, type NewCustomer } from './actions/registration';
import { signIn } from './actions/sign-in';
import { authApi } from './api/auth';
import { catalogApi } from './api/catalog';
import { engagementApi } from './api/engagement';
import { endpointInventory, type DeclaredEndpoint } from './api/inventory';
import { ordersApi } from './api/orders';

/**
 * L3 — the one import a spec makes.
 *
 * This file *is* the closed vocabulary for Toolshop: the framework's
 * target-agnostic fixtures plus this target's named verbs, typed clients and
 * data builders. Everything a generated spec may reach for is reachable from
 * here, and `docs/generated/catalog.md` lists it all.
 *
 * Keep the surface small. Resisting a fixture that only one spec wants is the
 * whole discipline — the value is in what a model *cannot* choose.
 */

export interface ToolshopTestData {
  /** A billing address. Deterministic: nothing about it needs to be unique. */
  billingAddress(overrides?: Partial<BillingAddress>): BillingAddress;
  /**
   * A registrable customer, unique per call so parallel workers never collide
   * on an email address the application treats as a natural key.
   */
  newCustomer(overrides?: Partial<NewCustomer>): NewCustomer;
  /** A contact enquiry, long enough to clear the form's minimum length. */
  enquiry(overrides?: Partial<{ subject: string; message: string }>): {
    subject: string;
    message: string;
  };
  /** A brand name carrying the run id, so an orphan traces back to its run. */
  brandName(): string;
}

export interface ToolshopFixtures {
  /** Signing in and out, and reading what the form reported. */
  signIn: typeof signIn;
  /** Registering a new customer, and reading per-field validation. */
  registration: typeof registration;
  /** Browsing, searching, filtering and sorting the storefront. */
  catalog: typeof catalog;
  /** The product detail page: specifications, quantity, cart and favourites. */
  product: typeof product;
  /** The cart and the four-step checkout wizard. */
  checkout: typeof checkout;
  /** The signed-in account area: profile, favourites, invoices. */
  account: typeof account;
  /** The contact form. */
  contact: typeof contact;
  /** The administrator's maintenance screens. */
  admin: typeof admin;

  /** Identity over HTTP. `signInAs` also authenticates the shared client. */
  authApi: ReturnType<typeof authApi>;
  /** The catalogue over HTTP: products, categories, brands, specifications. */
  catalogApi: ReturnType<typeof catalogApi>;
  /** Carts, invoices, payment and the administrator's reports over HTTP. */
  ordersApi: ReturnType<typeof ordersApi>;
  /** Contact messages, favourites and the postcode lookup over HTTP. */
  engagementApi: ReturnType<typeof engagementApi>;
  /** Every endpoint this pack declares, for the contract project to check. */
  endpointInventory: DeclaredEndpoint[];

  /** Builders for the data a spec needs. Never reads the application. */
  testData: ToolshopTestData;
}

export const test = framework.extend<ToolshopFixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  registration: async ({}, use) => {
    await use(registration);
  },
  catalog: async ({}, use) => {
    await use(catalog);
  },
  product: async ({}, use) => {
    await use(product);
  },
  checkout: async ({}, use) => {
    await use(checkout);
  },
  account: async ({}, use) => {
    await use(account);
  },
  contact: async ({}, use) => {
    await use(contact);
  },
  admin: async ({}, use) => {
    await use(admin);
  },

  authApi: async ({ api }, use) => {
    await use(authApi(api));
  },
  catalogApi: async ({ api }, use) => {
    await use(catalogApi(api));
  },
  ordersApi: async ({ api }, use) => {
    await use(ordersApi(api));
  },
  engagementApi: async ({ api }, use) => {
    await use(engagementApi(api));
  },
  endpointInventory: async ({}, use) => {
    await use(endpointInventory());
  },

  testData: async ({ run }, use) => {
    await use({
      billingAddress: (overrides = {}) => ({
        street: 'Test Street',
        houseNumber: '42',
        postcode: '1234AB',
        city: 'Amsterdam',
        state: 'Noord-Holland',
        /*
           "Netherlands (the)", not "Netherlands". The country list uses the UN
           style — "Bahamas (the)", "Netherlands (the)" — and a `selectOption`
           whose label matches nothing does not fail fast: Playwright retries
           the whole action and times out reporting "waiting for element to be
           visible and enabled", which describes the select rather than the
           option that is missing. Three checkout specs spent fifteen seconds
           each on that message.

           A value typed from memory instead of read from the page is the same
           mistake as a locator typed from memory, and it fails just as opaquely.
        */
        country: 'Netherlands (the)',
        ...overrides,
      }),

      newCustomer: (overrides = {}) => {
        const unique = run.unique('cust').toLowerCase();
        return {
          firstName: 'Test',
          lastName: 'Customer',
          dateOfBirth: '1990-01-01',
          street: 'Test Street',
          houseNumber: '42',
          postcode: '1234AB',
          city: 'Amsterdam',
          state: 'Noord-Holland',
          // "(the)", for the same reason as `billingAddress` above.
          country: 'Netherlands (the)',
          phone: '0612345678',
          // Plus-addressed on a domain reserved by RFC 2606, so a stray
          // notification can never reach a real mailbox.
          email: `${unique}@example.invalid`,
          /*
             Unique per call, not a fixed literal.

             The registration endpoint checks the password against a
             breach corpus, and the obvious-looking `Str0ng!Passw0rd` is in
             one: every registration answered 422 with "The given password has
             appeared in a data leak." A generator that produces a value the
             application's own policy rejects fails at the least convenient
             moment — which is the reason `PasswordPolicy` exists in the
             profile type at all.
          */
          password: `Ts-${unique}-Qz7!x`,
          ...overrides,
        };
      },

      enquiry: (overrides = {}) => ({
        subject: 'Customer service',
        message:
          'Automated check from the Toolshop suite. This message is at least fifty ' +
          `characters long because the form requires it. Run ${run.runId}.`,
        ...overrides,
      }),

      brandName: () => run.unique('brand'),
    });
  },
});

export { expect } from '@playwright/test';
