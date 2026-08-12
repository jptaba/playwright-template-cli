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
| `a11y` | `A11yScanner` | Accessibility scanning against the standard the target declares. |

## Fixtures — example-app

_Added on top of the framework fixtures when TARGET=example-app._

| Name | Signature | What it does |
|---|---|---|
| `signIn` | `named actions — see the table below` | Signing in, and reading what the form reported. |
| `testData` | `ExampleTestData` | Builders for the data a spec needs. |

## actions/ — example-app

_L2 UI vocabulary. Composes locators, returns data, asserts nothing._

| Name | Signature | What it does |
|---|---|---|
| `signIn.withCredentials` | `(page: Page, credentials: Credentials) => Promise<void>` | Submit the sign-in form. |
| `signIn.isSignedIn` | `(page: Page) => Promise<boolean>` | Whether the page currently carries a session. |
| `signIn.readError` | `(page: Page) => Promise<string \| null>` | The error the form reported, or null when it reported none. |

## api/ — example-app

_L2 HTTP vocabulary. Typed clients with response-schema validation._

| Name | Signature | What it does |
|---|---|---|
| `ordersApi.create` | `(order: NewOrder) => Promise<Order>` | Create an order and register it for cleanup at the end of the test. |
| `ordersApi.get` | `(id: string) => Promise<Order>` | Read one order. |
| `ordersApi.cancel` | `(id: string) => Promise<void>` | Cancel an order. |

## db/ — example-app

_L2 read vocabulary. Named, parameterised queries. Read-only._

| Name | Signature | What it does |
|---|---|---|
| `ledgerDb.entryFor` | `(reference: string) => Promise<LedgerEntry \| null>` | The ledger posting for an order reference, or null when nothing has posted yet. |
