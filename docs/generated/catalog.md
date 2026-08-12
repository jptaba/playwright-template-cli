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

## Fixtures — toolshop

_Added on top of the framework fixtures when TARGET=toolshop._

| Name | Signature | What it does |
|---|---|---|
| `signIn` | `named actions — see the table below` | Signing in and out, and reading what the form reported. |
| `registration` | `named actions — see the table below` | Registering a new customer, and reading per-field validation. |
| `catalog` | `named actions — see the table below` | Browsing, searching, filtering and sorting the storefront. |
| `product` | `named actions — see the table below` | The product detail page: specifications, quantity, cart and favourites. |
| `checkout` | `named actions — see the table below` | The cart and the four-step checkout wizard. |
| `account` | `named actions — see the table below` | The signed-in account area: profile, favourites, invoices. |
| `contact` | `named actions — see the table below` | The contact form. |
| `admin` | `named actions — see the table below` | The administrator's maintenance screens. |
| `authApi` | `named actions — see the table below` | Identity over HTTP. |
| `catalogApi` | `named actions — see the table below` | The catalogue over HTTP: products, categories, brands, specifications. |
| `ordersApi` | `named actions — see the table below` | Carts, invoices, payment and the administrator's reports over HTTP. |
| `engagementApi` | `named actions — see the table below` | Contact messages, favourites and the postcode lookup over HTTP. |
| `endpointInventory` | `DeclaredEndpoint[]` | Every endpoint this pack declares, for the contract project to check. |
| `testData` | `ToolshopTestData` | Builders for the data a spec needs. |

## actions/ — toolshop

_L2 UI vocabulary. Composes locators, returns data, asserts nothing._

| Name | Signature | What it does |
|---|---|---|
| `account.open` | `(page: Page) => Promise<void>` |  |
| `account.currentPage` | `(page: Page) => Promise<string>` | The heading of whichever account page is showing. |
| `account.sections` | `(page: Page) => Promise<string[]>` | The sections the account overview offers, in the order shown. |
| `account.openProfile` | `(page: Page) => Promise<void>` |  |
| `account.readProfile` | `(page: Page) => Promise<ProfileDetails>` |  |
| `account.twoFactorSetup` | `(page: Page) => Promise<"offered" \| "refused" \| "absent">` | What the profile's two-factor panel currently offers this account: `offered` when setup is available, `refused` when the deployment declines it for this login, `absent` when the panel is not there at all. |
| `account.twoFactorRefusal` | `(page: Page) => Promise<string \| null>` | The refusal text, when the deployment declines two-factor for this login. |
| `account.openFavourites` | `(page: Page) => Promise<void>` |  |
| `account.readFavourites` | `(page: Page) => Promise<string[]>` | The product names currently saved as favourites. |
| `account.removeFavourite` | `(page: Page, productName: string) => Promise<void>` |  |
| `account.openInvoices` | `(page: Page) => Promise<void>` |  |
| `account.countInvoiceRows` | `(page: Page) => Promise<number>` | How many invoice rows the current page lists. |
| `account.openFirstInvoice` | `(page: Page) => Promise<void>` |  |
| `account.openUserMenu` | `(page: Page) => Promise<void>` | The account links the user menu offers once opened. |
| `admin.openDashboard` | `(page: Page) => Promise<void>` |  |
| `admin.openProducts` | `(page: Page) => Promise<void>` | Every `open*` below waits for the **first maintenance row**, not for the search box or the heading. |
| `admin.openBrands` | `(page: Page) => Promise<void>` |  |
| `admin.openUsers` | `(page: Page) => Promise<void>` |  |
| `admin.currentScreen` | `(page: Page) => Promise<string>` | The heading of whichever maintenance screen is showing. |
| `admin.searchProducts` | `(page: Page, term: string) => Promise<number>` |  |
| `admin.searchBrands` | `(page: Page, term: string) => Promise<number>` |  |
| `admin.hasRow` | `(page: Page, name: string) => Promise<boolean>` | Whether a maintenance row exists for a named record. |
| `admin.countRows` | `(page: Page) => Promise<number>` | How many rows the current maintenance page lists. |
| `catalog.open` | `(page: Page) => Promise<void>` |  |
| `catalog.readCards` | `(page: Page) => Promise<CatalogCard[]>` | Every card on the current page of the listing, in the order shown. |
| `catalog.search` | `(page: Page, term: string) => Promise<CatalogCard[]>` | Search the catalogue, and return what came back. |
| `catalog.clearSearch` | `(page: Page) => Promise<void>` |  |
| `catalog.sortBy` | `(page: Page, order: SortOrder) => Promise<CatalogCard[]>` |  |
| `catalog.filterByCategory` | `(page: Page, category: string) => Promise<CatalogCard[]>` |  |
| `catalog.filterByBrand` | `(page: Page, brand: string) => Promise<CatalogCard[]>` |  |
| `catalog.goToPage` | `(page: Page, number: number) => Promise<CatalogCard[]>` |  |
| `catalog.cartCount` | `(page: Page) => Promise<number>` | How many items the cart badge reports, or 0 when it shows nothing. |
| `checkout.openCart` | `(page: Page) => Promise<void>` |  |
| `checkout.readCart` | `(page: Page) => Promise<CartContents>` | Everything the cart currently holds, read line by line. |
| `checkout.changeQuantity` | `(page: Page, productName: string, quantity: number) => Promise<void>` |  |
| `checkout.removeLine` | `(page: Page, productName: string) => Promise<void>` |  |
| `checkout.proceedToPayment` | `(page: Page, address: BillingAddress) => Promise<void>` | Advance the wizard as far as the billing step, filling the address on the way. |
| `checkout.readPaymentMethods` | `(page: Page) => Promise<string[]>` | The payment methods this deployment offers, as a shopper sees them. |
| `checkout.payWith` | `(page: Page, method: PaymentMethod) => Promise<string \| null>` | Pay, and return whatever the confirmation panel said. |
| `checkout.currentStep` | `(page: Page) => Promise<string>` | Which wizard step is on screen, by the heading it renders. |
| `contact.open` | `(page: Page) => Promise<void>` |  |
| `contact.send` | `(page: Page, enquiry: ContactEnquiry) => Promise<void>` |  |
| `contact.submitEmpty` | `(page: Page) => Promise<void>` | Submit with nothing filled in, to see what the form insists on. |
| `contact.fieldError` | `(page: Page, field: string) => Promise<string \| null>` | The validation message under one field, or null when it is satisfied. |
| `contact.readConfirmation` | `(page: Page) => Promise<string \| null>` | The confirmation the application announces after a successful send. |
| `contact.readSubjects` | `(page: Page) => Promise<string[]>` | The subjects this deployment offers, as a customer sees them. |
| `product.open` | `(page: Page, productName: string) => Promise<void>` |  |
| `product.readDetail` | `(page: Page) => Promise<ProductDetail>` | Everything the detail page states about the product. |
| `product.addToCart` | `(page: Page, quantity?: number) => Promise<number>` | Put the open product in the cart and return the badge count afterwards. |
| `product.addToFavourites` | `(page: Page) => Promise<string \| null>` | Save the open product to favourites, and return what the application announced — "Product added to your favorites list." on success, or the refusal when it is already there. |
| `product.readQuantity` | `(page: Page) => Promise<number>` | The quantity currently shown in the stepper on the detail page. |
| `product.increaseQuantity` | `(page: Page, times?: number) => Promise<void>` |  |
| `product.decreaseQuantity` | `(page: Page, times?: number) => Promise<void>` |  |
| `product.readNotification` | `(page: Page) => Promise<string \| null>` | The message the application announces after an action, or null. |
| `registration.open` | `(page: Page) => Promise<void>` |  |
| `registration.register` | `(page: Page, customer: NewCustomer) => Promise<void>` |  |
| `registration.submitEmpty` | `(page: Page) => Promise<void>` | Submit an empty form, to see which fields the application insists on. |
| `registration.fieldError` | `(page: Page, field: string) => Promise<string \| null>` | The validation message under one field, or null when it is satisfied. |
| `registration.errors` | `(page: Page) => Promise<Record<string, string>>` | Every field currently reporting a problem, in document order. |
| `signIn.withCredentials` | `(page: Page, credentials: Credentials) => Promise<void>` |  |
| `signIn.isSignedIn` | `(page: Page) => Promise<boolean>` | Whether the page currently carries a session. |
| `signIn.signedInAs` | `(page: Page) => Promise<string \| null>` | The name the user menu shows, or null when signed out. |
| `signIn.readError` | `(page: Page) => Promise<string \| null>` | The error the form reported, or null when it reported none. |
| `signIn.signOut` | `(page: Page) => Promise<void>` |  |
| `signIn.requestPasswordReset` | `(page: Page, email: string) => Promise<void>` | Ask for a password-reset mail. |
| `signIn.readPasswordResetOutcome` | `(page: Page) => Promise<string>` | Whatever the application said in answer to a reset request — the announced message, or the empty string when it said nothing. |

## api/ — toolshop

_L2 HTTP vocabulary. Typed clients with response-schema validation._

| Name | Signature | What it does |
|---|---|---|
| `authApi.login` | `(credentials: LoginRequest) => Promise<AccessToken>` |  |
| `authApi.signInAs` | `(credentials: LoginRequest) => Promise<AccessToken>` | Sign in, and keep this client signed in for the rest of the test. |
| `authApi.signOutClient` | `() => void` | Drop the credential, so the next call is made as an anonymous caller. |
| `authApi.me` | `() => Promise<CurrentUser>` |  |
| `authApi.statusWithoutCredential` | `() => Promise<number>` | Call an endpoint expecting to be refused. |
| `catalogApi.listProducts` | `(query?: { page?: number \| undefined; limit?: number \| undefined; }) => Promise<Page<Product>>` |  |
| `catalogApi.searchProducts` | `(term: string) => Promise<Page<Product>>` |  |
| `catalogApi.readProduct` | `(productId: string) => Promise<Product>` |  |
| `catalogApi.firstProduct` | `() => Promise<Product>` | A product id read from the service, for specs that need one to work with. |
| `catalogApi.relatedProducts` | `(productId: string) => Promise<Product[]>` |  |
| `catalogApi.productSpecs` | `(productId: string) => Promise<ProductSpec[]>` |  |
| `catalogApi.listCategories` | `() => Promise<Category[]>` |  |
| `catalogApi.categoryTree` | `() => Promise<Category[]>` |  |
| `catalogApi.listBrands` | `() => Promise<Brand[]>` |  |
| `catalogApi.readBrand` | `(brandId: string) => Promise<Brand>` |  |
| `catalogApi.createBrand` | `(brand: { name: string; slug: string; }) => Promise<Brand>` | Create a brand, and register it for deletion at the end of the test. |
| `catalogApi.listProductsTransport` | `() => Promise<{ status: number; headers: Record<string, string>; }>` | The transport-level facts about the product list: content type and cache directives. |
| `catalogApi.readMissingProduct` | `(productId: string) => Promise<{ status: number; body: unknown; }>` | Read a product that does not exist, to check how the service refuses. |
| `engagementApi.send` | `(enquiry: { first_name?: string \| undefined; last_name?: string \| undefined; email: string; subject: string; message: string; }) => Promise<ContactMessage>` |  |
| `engagementApi.listMessages` | `() => Promise<{ data: ContactMessage[]; }>` |  |
| `engagementApi.readMessage` | `(messageId: string) => Promise<ContactMessage>` |  |
| `engagementApi.listFavourites` | `() => Promise<Favorite[]>` |  |
| `engagementApi.addFavourite` | `(productId: string) => Promise<Favorite>` |  |
| `engagementApi.createFavouriteStatus` | `(candidates: string[]) => Promise<number>` | Create a favourite against the first candidate the service accepts, and report the status it answered with. |
| `engagementApi.unfavouritedProductId` | `(candidates: string[], skip?: number) => Promise<string>` | A product this account has *not* already favourited. |
| `engagementApi.ensureNotFavourited` | `(productId: string) => Promise<void>` | Make sure a product is not favourited, so an "add" spec starts clean. |
| `engagementApi.removeFavourite` | `(favoriteId: string) => Promise<void>` |  |
| `engagementApi.addDuplicateFavourite` | `(productId: string) => Promise<number>` | How the service refuses a favourite it has already been given. |
| `engagementApi.lookupPostcode` | `(postcode: string, houseNumber: string) => Promise<unknown>` |  |
| `ordersApi.openCart` | `() => Promise<Cart>` |  |
| `ordersApi.addProduct` | `(cartId: string, productId: string, quantity?: number) => Promise<void>` |  |
| `ordersApi.readCart` | `(cartId: string) => Promise<CartContents>` |  |
| `ordersApi.changeQuantity` | `(cartId: string, productId: string, quantity: number) => Promise<void>` |  |
| `ordersApi.removeProduct` | `(cartId: string, productId: string) => Promise<void>` |  |
| `ordersApi.listInvoices` | `(query?: { page?: number \| undefined; }) => Promise<{ data: Invoice[]; total: number; }>` |  |
| `ordersApi.readInvoice` | `(invoiceId: string) => Promise<Invoice>` |  |
| `ordersApi.pdfStatus` | `(invoiceNumber: string) => Promise<PdfStatus>` | Whether the rendered PDF for an invoice is ready yet. |
| `ordersApi.downloadPdfContentType` | `(invoiceNumber: string) => Promise<string>` | The PDF's content type, which is the assertable half of a binary download. |
| `ordersApi.checkPayment` | `(details: Record<string, unknown>) => Promise<{ message?: string \| undefined; }>` |  |
| `ordersApi.totalSalesPerCountry` | `() => Promise<unknown[]>` |  |
| `ordersApi.totalSalesOfYears` | `() => Promise<unknown[]>` |  |
| `ordersApi.topPurchasedProducts` | `() => Promise<unknown[]>` |  |
| `ordersApi.customersByCountry` | `() => Promise<unknown[]>` |  |
| `ordersApi.reportStatusWithoutCredential` | `(report: "totalSalesPerCountry" \| "totalSalesOfYears" \| "averageSalesPerMonth" \| "averageSalesPerWeek" \| "topPurchasedProducts" \|) => Promise<number>` | Call a report without a credential and report how it refuses. |
| `ordersApi.reportStatusForCurrentCaller` | `(report: "totalSalesPerCountry" \| "totalSalesOfYears" \| "averageSalesPerMonth" \| "averageSalesPerWeek" \| "topPurchasedProducts" \|) => Promise<number>` | How a report answers whoever this client is currently signed in as. |
