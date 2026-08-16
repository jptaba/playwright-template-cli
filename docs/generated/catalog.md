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
| `apis` | `Record<string, ApiClient>` | The other services this application is made of, by name — `apis.billing`, `apis.search`. |
| `db` | `DbReader` | Read-only database access. |
| `contracts` | `ContractRegistry \| null` | The vendored contract document, when the target publishes one. |
| `a11y` | `A11yScanner` | Accessibility scanning against the standard the target declares. |

## Fixtures — toolshop

_Added on top of the framework fixtures when TARGET=toolshop._

| Name | Signature | What it does |
|---|---|---|
| `searchTerm` | `string` | A search term that matches several products, and one that matches none. |
| `termThatMatchesNothing` | `string` |  |
| `signIn` | `named actions — see the table below` |  |
| `catalogue` | `named actions — see the table below` |  |
| `cart` | `named actions — see the table below` |  |
| `shopApi` | `named actions — see the table below` | Read-only catalogue verbs over the typed client. |
| `authApi` | `named actions — see the table below` | Exchanging a credential for a token. |
| `testData` | `ToolshopTestData` |  |

## actions/ — toolshop

_L2 UI vocabulary. Composes locators, returns data, asserts nothing._

| Name | Signature | What it does |
|---|---|---|
| `cart.addOpenProduct` | `(page: Page, quantity?: number) => Promise<string>` | Add whatever product page is open. |
| `cart.open` | `(page: Page) => Promise<void>` |  |
| `cart.isEmpty` | `(page: Page) => Promise<boolean>` | Whether the cart holds nothing. |
| `cart.lines` | `(page: Page) => Promise<CartLine[]>` | Every line in the cart, or an empty list. |
| `cart.total` | `(page: Page) => Promise<number>` | What the application says the order comes to. |
| `cart.remove` | `(page: Page, product: string) => Promise<void>` | Take a product back out, and wait for it to be gone. |
| `cart.empty` | `(page: Page) => Promise<void>` | Leave the cart as it was found — empty. |
| `catalogue.open` | `(page: Page) => Promise<void>` |  |
| `catalogue.productNames` | `(page: Page) => Promise<string[]>` | The names on the listing, in the order shown. |
| `catalogue.foundNothing` | `(page: Page) => Promise<boolean>` | Whether the search reported that nothing matched. |
| `catalogue.search` | `(page: Page, term: string) => Promise<string[]>` | Search, and return what came back. |
| `catalogue.openProduct` | `(page: Page, name: string) => Promise<void>` | Open one product by the name printed on its card. |
| `catalogue.readProduct` | `(page: Page) => Promise<{ name: string; price: number; }>` | What the product page says about itself. |
| `signIn.withCredentials` | `(page: Page, credentials: Credentials) => Promise<void>` | Submit the sign-in form. |
| `signIn.isSignedIn` | `(page: Page) => Promise<boolean>` | Whether the page currently carries a session. |
| `signIn.readError` | `(page: Page) => Promise<string \| null>` | The error the form reported, or null when it reported none. |
| `signIn.signOut` | `(page: Page) => Promise<void>` | End the session. |

## api/ — toolshop

_L2 HTTP vocabulary. Typed clients with response-schema validation._

| Name | Signature | What it does |
|---|---|---|
| `catalogueApi.products` | `() => Promise<Page<Product>>` | One page of the catalogue. |
| `catalogueApi.product` | `(productId: string) => Promise<Product>` | One product, by the id the application uses. |
| `catalogueApi.search` | `(term: string) => Promise<Page<Product>>` | Search, which returns the same envelope as the listing. |
| `catalogueApi.related` | `(productId: string) => Promise<Product[]>` |  |
| `catalogueApi.categories` | `() => Promise<Category[]>` | Categories, which come back as a bare array rather than in the page envelope the products endpoints use. |
| `authApi.signIn` | `(credentials: { email: string; password: string; }) => Promise<{ token: string; }>` | Exchange a credential for a token. |
