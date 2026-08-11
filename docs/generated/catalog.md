<!-- GENERATED FILE — DO NOT EDIT.
     Built from the TypeScript AST by: npm run catalog:build
     Verified in CI by:                npm run catalog:check -->

# Capability catalog

Everything a spec is allowed to reach for. Select from this file.

**If what you need is not here, stop and say so.** Do not invent a helper method and do
not reach for `page.locator` to work around the gap — a missing verb is a design
question, and the answer is usually a new action added deliberately, once.

## Fixtures — every target

_Target-agnostic. Available in every spec, whichever application is under test._

| Name | Signature | What it does |
|---|---|---|
| `role` | `string` | Which role's session `authedPage` uses. |
| `target` | `TargetProfile` | The resolved target profile: base URL, capabilities, environment, roles. |
| `run` | `RunContext` | Run identity and unique-value helpers, so created records are traceable. |
| `secrets` | `SecretsFixture` | Credential lookup by reference. |
| `secretStore` | `SecretStore` | The underlying store. |
| `accounts` | `AccountsFixture` | Leases an account for this worker — atomic and TTL'd on a pooled target. |
| `otp` | `OtpProvider` | Resolves an OTP however this target does MFA — or refuses, with a reason. |
| `inbox` | `MailInbox \| null` | The mail sink, when one is configured. |
| `authedPage` | `Page` | A page already carrying the role's session. |
| `api` | `ApiClient` | The shared HTTP client, with response-schema validation inside it — so every API call in every test, including the setup calls inside UI tests, is a contract check for free (§05). |
| `db` | `DbReader` | Read-only database access. |
| `contracts` | `ContractRegistry \| null` | The vendored contract document, when the target publishes one. |

## Fixtures — saucedemo

_Added on top of the framework fixtures when TARGET=saucedemo._

| Name | Signature | What it does |
|---|---|---|
| `taxRate` | `number` | The tax rate the store is specified to apply. |
| `auth` | `named actions — see the table below` | Signing in and out, and reading what the sign-in form said. |
| `inventory` | `named actions — see the table below` | The product listing: browsing, sorting, and adding to the cart. |
| `checkout` | `named actions — see the table below` | The cart and the three checkout steps, up to placing the order. |
| `testData` | `SaucedemoTestData` | Builders for the data a spec needs. |

## actions/ — saucedemo

_L2 UI vocabulary. Composes locators, returns data, asserts nothing._

| Name | Signature | What it does |
|---|---|---|
| `auth.signIn` | `(page: Page, credentials: Credentials) => Promise<void>` | Submit the sign-in form. |
| `auth.isSignedIn` | `(page: Page) => Promise<boolean>` | Whether the current page is inside the signed-in area. |
| `auth.currentSectionTitle` | `(page: Page) => Promise<string>` | The heading of the current signed-in page, e.g. "Products". |
| `auth.readSignInError` | `(page: Page) => Promise<string \| null>` | The sign-in error banner text, or null when the form reported no error. |
| `auth.signOut` | `(page: Page) => Promise<void>` | Sign out through the burger menu, ending the session. |
| `auth.resetApplicationState` | `(page: Page) => Promise<void>` | Discard cart and sort state through the application's own menu action. |
| `checkout.openCart` | `(page: Page) => Promise<void>` | Open the cart from the header badge. |
| `checkout.readCartContents` | `(page: Page) => Promise<string[]>` | Product names currently in the cart, in display order. |
| `checkout.proceedToCheckout` | `(page: Page) => Promise<void>` | Leave the cart and start the checkout flow. |
| `checkout.provideDeliveryDetails` | `(page: Page, customer: Customer) => Promise<void>` | Fill checkout step one and continue to the order overview. |
| `checkout.readCheckoutError` | `(page: Page) => Promise<string \| null>` | The checkout error banner text, or null when the step reported no error. |
| `checkout.readOrderTotals` | `(page: Page) => Promise<OrderTotals>` | The three figures on the overview step, as numbers. |
| `checkout.completeThroughOverview` | `(page: Page, customer: Customer) => Promise<OrderTotals>` | Cart → delivery details → overview, stopping before the order is placed. |
| `checkout.placeOrder` | `(page: Page) => Promise<OrderConfirmation>` | Confirm the order and return the confirmation the store displayed. |
| `inventory.open` | `(page: Page) => Promise<void>` | Go to the product listing and wait for it to be ready. |
| `inventory.readDisplayedProducts` | `(page: Page) => Promise<CatalogItem[]>` | Every product currently displayed, in display order. |
| `inventory.addToCart` | `(page: Page, names: readonly string[]) => Promise<CatalogItem[]>` | Add named products to the cart and return what was added, with the price the store displayed at the time — so a totals assertion compares against observed prices rather than a hard-coded number that drifts. |
| `inventory.removeFromCart` | `(page: Page, name: string) => Promise<void>` | Remove a named product from the cart, from the listing page. |
| `inventory.sortBy` | `(page: Page, option: "Name (A to Z)" \| "Name (Z to A)" \| "Price (low to high)" \| "Price (high to low)") => Promise<void>` | Reorder the listing using the store's own sort control. |
| `inventory.cartCount` | `(page: Page) => Promise<number>` | The number on the cart badge, or 0 when no badge is rendered — the store removes the element entirely at zero rather than showing "0". |

## api/ — internal-app

_L2 HTTP vocabulary. Typed clients with response-schema validation._

| Name | Signature | What it does |
|---|---|---|
| `ordersApi.create` | `(order: NewOrder) => Promise<Order>` | Create an order and register it for cleanup. |
| `ordersApi.get` | `(id: string) => Promise<Order>` | Read one order by id, validated against the published schema. |
| `ordersApi.listForCustomer` | `(customerId: string) => Promise<Order[]>` | Every order a customer has placed, newest first as the service returns them. |
| `ordersApi.cancel` | `(id: string) => Promise<void>` | Cancel an order. |
| `ordersApi.attemptCreateInvalid` | `(order: Partial<NewOrder>) => Promise<{ status: number; body: unknown; }>` | A deliberate negative call: the spec asserts the status, not this. |

## db/ — internal-app

_L2 read vocabulary. Named, parameterised queries. Read-only._

| Name | Signature | What it does |
|---|---|---|
| `ledgerDb.entryFor` | `(reference: string) => Promise<LedgerEntry \| null>` | The ledger posting for a claim reference, or null when nothing has posted yet. |
| `ledgerDb.auditTrailFor` | `(orderId: string) => Promise<{ action: string; actor: string; at: string; }[]>` | Audit rows the overnight batch writes, which no API exposes. |
