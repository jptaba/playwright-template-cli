# What testing a real application taught the framework

The framework was built against a plan and proven against in-process fakes.
Then it was pointed at a real, running application — `www.saucedemo.com` — and
asked to do every kind of testing that target can honestly support.

> That application's target pack lives on the `saucedemo/extensive-coverage`
> branch, not on `main`. `main` is the application-agnostic template: the
> framework, its guardrails, and one `example-app` scaffold to copy. The fixes
> below are the part of that exercise which was true of *any* application, and
> they are on `main`.

That exercise found **six defects and three missing conventions in the
framework itself**. This file records each one: what it cost, what fixed it,
and where the fix belongs.

The rule that decides where a fix lands:

> **A learning that is true of *any* application under test belongs on `main`.
> A learning that is true of *this* application belongs in its target pack.**

Nothing in `src/fixtures/`, `src/integrations/`, `src/support/` or `tools/` may
know which application it is testing — so a fix in those directories is a
framework fix by definition, and a fix that needs a target's name is not a
framework fix at all.

---

## Framework defects found

### 1. Triage could not recognise a browser network failure

**Symptom.** A deliberately unreachable environment produced
`page.goto: net::ERR_CONNECTION_REFUSED`. The triage rules left it
unclassified.

**Cause.** `transport-failure` matched Node's error codes — `ECONNREFUSED`,
`ENOTFOUND`, `ETIMEDOUT` — because it was written against the integration
adapters, which use Node's HTTP stack. Chromium reports network failures as
`net::ERR_*`, which shares no substring with any of them.

**Why it mattered.** A browser suite against a dead environment produces
`net::ERR_*` almost exclusively. The single commonest infrastructure failure in
the suite was the one case the rules could not see — so every such night would
have gone to the model, or to a human, as "unclassified".

**Fix.** `TRANSPORT_ERROR` now reads both vocabularies. → **`main`**

### 2. A TLS failure was classified as a credentials problem

**Symptom.** `net::ERR_CERT_AUTHORITY_INVALID` was classified
`environment-config` with the summary "every executed test failed at
authentication".

**Cause.** The auth rule tested for the substring `auth`. `AUTHORITY` contains
it.

**Why it mattered.** Worse than no classification: a confident, wrong verdict
that routes a certificate problem to whoever owns credentials. This is exactly
the failure mode §22 warns about — "a wrong verdict is stated fluently next to
correct ones and is indistinguishable from them".

**Fix.** Word-boundary matching (`\bauth\b`), and the rule order changed so
`transport-failure` runs first. Evidence must not be pre-empted by inference:
"the text mentions auth" is a guess, "the connection was refused" is a fact.
→ **`main`**

### 3. ANSI escape codes reached the report, Jira and the cluster signature

**Symptom.** Cluster summaries read
`Error: [2mexpect([22m[31mreceived[39m...`.

**Cause.** Playwright colourises assertion errors for the terminal. The
reporter captured `error.message` verbatim.

**Why it mattered.** Invisible in a console, very visible in a report cell, a
Jira description and a PractiTest run output. Worse, colour is part of the
clustering signature, so **the same failure could cluster differently depending
on where it ran** — quietly defeating the deduplication that the whole triage
design rests on.

**Fix.** `stripAnsi` in `src/support/text.ts`, applied once at the reporter so
no downstream consumer has to remember. → **`main`**

### 4. The API client discarded every response header

**Symptom.** The first HTTP-surface test — assert a content type — could not be
written at all.

**Cause.** `ApiClient.call()` returned `{ status, body, drift }`.

**Why it mattered.** A large class of real contracts lives only in headers:
content type, cache directives, `Location` on a redirect, rate-limit budgets,
correlation ids. None of them were assertable. No unit test caught this because
the fakes were only ever asked for bodies — a gap that a real target found
immediately.

**Fix.** `ApiResponse` carries `headers`. → **`main`**

### 5. A locator answered the wrong question, silently

**Symptom.** `checkout.readCartContents()` returned the entire product
catalogue instead of the cart.

**Cause.** This application reuses `data-test="inventory-item"` for cards on
the listing *and* rows in the cart. The cart locator was unscoped, so on the
wrong page it matched the listing and returned a plausible, wrong answer.

**Why it mattered.** No error, no timeout — a populated array of real product
names. A test written against it would pass for the wrong reason.

**Fix.** The cart locators are scoped to their container. Target-specific code,
but the rule generalises. → **target pack**, plus a convention on **`main`**

### 6. A state vocabulary hard-coded the application's internal ids

**Symptom.** Seeding the cart put the wrong products in it. The test failed on
an assertion that looked unrelated.

**Cause.** The persisted-cart vocabulary mapped product names to the store's
internal numeric ids with a hand-written table. The table was guessed.

**Why it mattered.** The same class of error as a hallucinated locator, in a
different place: an invented internal identifier that the application happily
accepts. It fails silently — the wrong data is seeded and the test proceeds.

**Fix.** Ids are derived from the rendered listing at run time. → **target
pack**, plus a convention on **`main`**

---

## Conventions the exercise added

### A. Scope a locator to its container when a test id is reused

Applications reuse test ids across pages far more often than the priority-order
guidance implies. An unscoped locator that matches on two pages does not fail —
it answers the wrong question with a straight face. Scope to the container that
makes the answer unambiguous. (From defect 5.)

### B. Derive internal identifiers, never write them down

If a vocabulary needs an id, a slug or a key that belongs to the application,
read it from the running application rather than transcribing it. A guessed
internal id is a hallucinated locator wearing a different hat. (From defect 6.)

### C. Performance means budgets here, and load testing stays refused

§05 refuses load testing, and that stands: it needs different tooling and a
dedicated environment, and numbers from a shared runner under unknown
contention are not actionable.

What *is* in scope is a budget — an assertion that a journey the suite already
drives finishes inside a stated ceiling. It costs one assertion on a test that
was running anyway and it catches the order-of-magnitude regression a user
would notice. Keep the ceilings loose: a tight budget on a shared runner is a
flake generator, and a flaky performance test teaches a team to ignore
performance tests.

---

## Findings about the design that needed no change

**The capability matrix was expressive enough.** This target has an HTTP
surface but no service API and no JSON schema, which is the combination
`api: enabled` + `contracts: disabled` describes exactly. No new capability
was needed, and the report says "not applicable" for the database rather than
showing a silent zero.

**Testing below the browser earns its place, even here.** `/inventory.html`
returns **404** from the host: the site is a single-page app on static hosting,
and a shim rewrites the URL in the browser. Every UI test passes; anything
consuming the site over HTTP — a monitor, a crawler, a link checker — sees a
404. One API-layer test makes that visible, and no amount of UI testing would.

**The reference target's limits are real.** It has no database, so the
data-assertion path stays capability-off and unproven. It has no service API,
so schema conformance and contract drift cannot be exercised against it beyond
the unit tests. This is the §22 warning arriving on schedule: green here
demonstrates the wiring works, and nothing more.

---

## What onboarding the second application taught the framework

Stripping the target packs off `main` and putting one back exposed a category
the first exercise could not: the friction is not in writing tests, it is in
the hour before you can write the first one.

**7 · The one step outside your own directory was the one people forgot.**
Adding an application meant editing `config/target.ts` to register the profile
— a shared file, unrelated to the new target, and the only step in a
four-step process that reached outside the new pack. Forget it and you get
`Unknown TARGET 'your-app'` for a profile sitting right there in
`config/targets/`.

*Fix:* profiles are **discovered**. Every file in `config/targets/` exporting a
`TargetProfile` is selectable. Onboarding is now entirely additive.

**8 · A profile is a set of claims, and nothing checked them.**
`capabilities.api.enabled` with no `baseURL`; `mfa: 'totp'` against a store
that cannot issue codes; roles declared with no credentials behind them; a
contract document declared but never vendored. Each of these is a clear
statement in one file contradicted by another file, and every one of them was
discovered at test time, as a failure whose message pointed somewhere else. The
worst was a missing `tests/auth.setup.ts` — nothing writes a storage state, and
every spec taking `authedPage` fails with "No storage state for role", three
directories from the cause.

*Fix:* `npm run target:doctor`. It reads the profile, looks at what is on disk,
asks the secret store what resolves, and prints each disagreement with the file
to fix. The rules are pure functions over a profile and a description of the
filesystem, so all of them are unit-tested with no target, no Vault and no
network.

**9 · One failure mode was silent rather than loud.** `accountPool: 'leased'`
with `credentials.source: 'local'` does not fail — leasing needs
compare-and-swap that only the Vault store provides, so it quietly falls back
to a plain read. Every worker then shares one identity with no lease and no
TTL. Everything passes until two workers collide, and the collision looks like
a flaky test.

*Fix:* a named warning, `leasing-degrades-silently`. A configuration that
degrades rather than fails is worth more noise than one that stops.

**10 · A scaffold that produces errors is worse than no scaffold.** The first
version of `target:new` happily wrote a profile with `api.enabled: true` and no
base URL, which the doctor then reported as an error a minute later.

*Fix:* the scaffolder refuses at the point where the message can say what to
pass (`--api-url`), and ships the contracts capability **off** with its path
declared — the doctor notices the moment the document lands and says to switch
it on. A unit test runs the scaffolder's output through the diagnostics: a
scaffold that fails its own preflight fails the build.

**11 · The tool that enforces a guard went around it.** `npm run explore`
takes its host from the profile precisely so that exploring runs through the
non-production allowlist check. It also accepted an optional path — and
`new URL(argument, base)` silently replaces the origin when the argument parses
as an absolute URL. A smoke test found it immediately: Git Bash on Windows
rewrites a leading `/checkout` into `C:/Program Files/Git/checkout` before the
process sees it, and that mangled value parsed as a URL with its own scheme.
The tool cheerfully opened it.

*Fix:* resolve the argument, then assert the origin still matches the profile's
and refuse with a message that explains the shell behaviour. The check is a
pure function with its own unit test. The general lesson is worth more than the
bug: a convenience wrapper around a guard is a place the guard can be lost, and
it is worth a test asserting the guard still holds *through* the wrapper.

**D · Selection is not configuration.** With two applications in one repository
and `TARGET` unset, picking alphabetically means silently testing the wrong
one. Throwing means `npm run verify` breaks for everyone the day a second
application is onboarded.

*Convention:* no selection builds only the framework's own `unit` project, and
says why. Only *selection* degrades that way — a target that is selected and
misconfigured throws, because a suite that quietly skipped itself and reported
green is worse than one that failed to start.

---

## What a reader of the diagram caught

Drawing the framework turned out to be a review of it. Two things a hundred
pages of prose had not surfaced:

**12 · A project called `unit` was a claim nobody was making.** The
framework's own tests — lint rules, the Vault adapter against an in-process
fake, reporters, triage — ran in a Playwright project named `unit`, invoked by
`npm run test:unit`, and reported as `kind: 'unit'` in the run model beside
`ui`, `api` and `contract`. Nothing in it touches the application under test.
But a reader seeing `unit` next to `e2e` in a project list reasonably concludes
this suite unit-tests the product, which is a different job done with different
tools by the people who own that code.

*Fix:* the project, the directory, the script and the reported kind are all
`framework` now. The name says what the tests are for, and the flow diagram
puts them inside `npm run verify` — a gate on this repository — rather than
beside the projects that drive the application.

**13 · The taxonomy had a hole in it.** Functional, integration, contract and
performance were all covered — as `e2e`, the mixed kind, `contract`, and
`@performance` budgets. Accessibility was not covered anywhere, in any form.

*Fix:* `a11y` is a capability, a project, a spec directory and a reported kind.
A capability rather than a tag, because "is this application held to WCAG 2.2
AA?" is a property of the application and its contract with its users, not a
property of a spec — and the profile carries the standard, so an accessibility
suite cannot exist without someone having said which bar it measures against.
Waivers live beside it with a reason and a review date, and the doctor reports
one whose date has passed: a waiver nobody revisits is a defect with better
paperwork.

**14 · A new capability was less configurable than every old one.** The
accessibility standard shipped as a hardcoded `'wcag22aa'` in a closed type
union. Every other value in a profile that can differ between deployments —
base URL, environment, test-id attribute, secret source, API host — reads from
the environment with a default; this one did not. Worse, adopting a standard
the union did not list would have meant editing a shared type in this
repository, which is precisely the thing onboarding is supposed to never
require.

*Fix:* `--a11y-standard=` at scaffold time, `A11Y_STANDARD` afterwards, and an
*open* union — the known names give autocomplete and the doctor spell-checks
against them, but any string is accepted. Standards outlive frameworks: WCAG
2.2 became a Recommendation in 2023 and 3.0 is in draft, and a target must
never wait on this repository to adopt one.

**F · A flag nobody ran is a flag that does not work.** `--a11y-standard`
was rejected as an unrecognised argument by a parser matching flag names with
`[a-z-]+` — no digits — while the CLI printed that exact flag in its own usage
text. The unit tests called the planner directly and could not have caught it,
because the parser lived in a file that runs `process.exit` on import.

*Convention:* argument parsing moved to `src/support/onboarding/scaffold.ts`
where it is testable, and the tool is I/O only. If a CLI's logic cannot be
imported, it cannot be tested, and the usage text becomes the only place the
flag exists.

**15 · A capability with no engine behind it is worse than no capability.**
The `a11y` project, the spec directory, the reported kind and the declared
standard all shipped before anything could actually check a WCAG rule. That
reads as coverage from the outside — a project named `a11y` in the run report,
green — while checking nothing at all.

*Fix:* `@axe-core/playwright` is a framework dependency, for exactly the reason
Ajv already is. Contract validation puts the engine here and the schema in the
target; accessibility puts the engine here and the standard in the profile.
WCAG rules are identical for every application, which is the definition of
something that belongs in framework code. Everything that decides *what gets
checked* — the cumulative tag ladder, the waivers, the shaping of a result —
is pure and tested without a browser; only the injection is not.

**16 · A convenience alias was a hole in the guardrail.** `tsconfig.json`
declared five `paths` aliases — `@targets/*`, `@fixtures/*`, `@support/*` and
so on. Nothing in the repository used any of them. But `layer-boundaries`
resolves an import by path, and its resolver only understood specifiers
starting with `.`, so `import { l } from '@targets/app/locators/x'` inside a
spec resolved to nothing, matched no layer, and passed the rule whose entire
purpose is to forbid exactly that. It compiled cleanly too. The single most
important boundary in the framework had an unused, undocumented bypass.

*Fix:* the aliases are gone, which turns such an import into a type error, and
the resolver now understands non-relative specifiers that point into this
repository anyway — so the rule holds if anyone re-adds them. Both gates were
checked against a real probe file rather than reasoned about.

*General lesson:* a rule that works by matching paths is only as good as its
path resolution. Every alternative spelling of an import — alias, repo-rooted,
index import — is a way past it, and dead configuration is not harmless when
it is dead configuration that disables a check.

**17 · The repository's own toolchain was on a deprecated setting.**
`moduleResolution: "Node"` — the option TypeScript renamed to `node10` — is
deprecated and stops functioning in TypeScript 7. The pinned compiler here
(5.9.3) accepts it silently, so nothing in the gate said a word; a newer
TypeScript in an editor is what surfaced it.

*Fix:* `nodenext` for both `module` and `moduleResolution`. This package has
no `"type": "module"`, so nodenext still treats every `.ts` file as
CommonJS — which is exactly what tsx and Playwright's loader produce — and
`noEmit` means the compiler only type-checks either way. What changes is that
TypeScript now models a dependency's ESM/CJS boundary properly rather than
assuming pre-Node-10 resolution, so an ESM-only package is reported at
type-check time instead of at run time.

*General lesson:* a pinned toolchain hides its own deprecations. The gate can
only be as current as the compiler in it, so a warning from a newer one is
worth acting on rather than silencing.

**E · A diagram is a test of the design.** Neither of the above was found by
reading code. Both were found by drawing the boxes and having someone ask why
one of them was there. Worth remembering the next time a diagram feels like
documentation overhead.

---

## What landed where

| Learning | Change | Lands on |
|---|---|---|
| 1 · Browser network errors | `TRANSPORT_ERROR` reads both vocabularies | `main` |
| 2 · TLS misfiled as auth | `\bauth\b`, and evidence before inference | `main` |
| 3 · ANSI in captured text | `stripAnsi` at the reporter | `main` |
| 4 · Headers discarded | `ApiResponse.headers` | `main` |
| 5 · Unscoped locator | Scoped cart locators | target pack |
| 6 · Hard-coded ids | Ids derived from the page | target pack |
| A · Scope reused test ids | `docs/CONVENTIONS.md` | `main` |
| B · Derive identifiers | `docs/CONVENTIONS.md` | `main` |
| C · Budgets, not load | `docs/CONVENTIONS.md` | `main` |
| — · Ground-truth fixture | Opt-in `triage-fixture` project | `main` |
| 7 · Forgotten registration | Profile discovery in `config/target.ts` | `main` |
| 8 · Unchecked profile claims | `npm run target:doctor` | `main` |
| 9 · Silent leasing fallback | `leasing-degrades-silently` warning | `main` |
| 10 · Scaffold that fails its own check | `npm run target:new` guards | `main` |
| 11 · Guard lost in its own wrapper | `resolveExploreUrl` origin check | `main` |
| 12 · `unit` project misnamed | `framework` project, directory and kind | `main` |
| 13 · No accessibility testing | `a11y` capability, project and kind | `main` |
| 14 · A capability less configurable than the rest | `--a11y-standard`, `A11Y_STANDARD`, open union | `main` |
| F · CLI logic must be importable | `parseScaffoldArgs` in `src/support/` | `main` |
| 15 · a11y capability with no engine | `@axe-core/playwright` + `a11y` fixture | `main` |
| 16 · Path aliases bypassed `layer-boundaries` | aliases removed, resolver hardened | `main` |
| 17 · Deprecated module resolution | `nodenext` in `tsconfig.json` | `main` |
| E · A diagram tests the design | — | `main` |
| D · Selection is not configuration | Unit-only when nothing is selected | `main` |

Every framework fix above ships with a unit test that fails without it. That is
the point of writing them down here rather than in a commit message: the next
target will find the next six, and this file is where they go.

---

## What onboarding a third application taught the framework

The third target was **Toolshop** (`practicesoftwaretesting.com`): an Angular
storefront over a Laravel REST API, with a published OpenAPI 3.2 document, an
administrator area, five payment methods and 56 documented endpoints. It was
chosen because it is the rare demo application that can exercise *every* layer
this framework has — UI, typed HTTP clients, schema conformance and
accessibility — rather than only the first.

> Its target pack lives on `live-target/onboarding`. The framework fixes below
> are on `main`, and each ships with a unit test in
> `tests/framework/learnings-toolshop.spec.ts` that fails without it.

It found **eleven framework defects, one design decision that was wrong, and
one profile field that did not exist**. It also found three genuine defects in
the application under test, which is the point of the exercise.

### Framework defects found

**18 · The documented onboarding command silently lost its arguments.**
Every command in the handbook is `npm run target:new -- --name=x --url=y`. Under
PowerShell on Windows — the platform this session ran on — npm's shim drops the
`--` separator, swallows the flags as its own config, and hands the script an
empty `argv`. The tool then reported "`--name` and `--url` are both required"
while the user was looking at a command line containing both. It works under
bash, which is why nobody had seen it.

*Fix:* the CLI detects the swallowed-argument case and names the shell, rather
than repeating a usage message that appears to contradict what was typed.
→ **`main`**

**19 · The scaffolded `auth.setup.ts` established every role in one browser
context.** The generated loop signs in as role one, saves its storage state,
then signs in as role two *in the same context*, where role one's session is
still live. On this application it fails outright. The dangerous version is the
application that renders the login form anyway and ignores the submit: the
storage state written for `admin` then holds the customer's session, every
administrator test runs with customer rights, and the specs asserting a
permission boundary pass for exactly the wrong reason.

*Fix:* one context per role, closed after use, and a check that the session
established actually names somebody. → **`main`** (scaffold template)

**20 · `setup:auth` reported that no session appeared, and not why.**
"Sign-in for role 'customer' did not establish a session" is true and useless.
The run that produced it had locked the account, and the application was saying
so on screen. Twenty-one specs failed across five features before anyone opened
the screenshot.

*Fix:* the setup quotes what the form reported — `The application said:
"Account locked, too many failed attempts."` — and says explicitly when the form
reported nothing, which points at the signed-in locator instead of the
credential. → **`main`** (scaffold template)

**21 · The API client could not authenticate.** `ApiClient` had
`defaultHeaders` and nothing that set them, so a target with a bearer token had
no way to attach one through the shared client — the client that carries schema
validation, cleanup tracking and the trace.

*Fix:* `setAuth(provider)`, resolved **per call** rather than captured once.
This service issues five-minute tokens; a client that captured the header would
start answering 401 part-way through any longer run, and the failure reads as a
broken endpoint rather than an expired token. → **`main`**

**22 · Cleanup could not authenticate either, and guessed the URL.** The `api`
fixture deleted tracked records with a bare `request.fetch` against a URL built
by splitting the creating endpoint's path. Unauthenticated, and wrong for any
nested resource. On an API that needs a token to delete, every cleanup answered
401, the cleanup logger swallowed it, and the environment filled with orphans
behind a green run.

*Fix:* deletion goes through the client, so it carries the same credential, base
URL and trace. `track()` takes an optional delete endpoint — the target saying
how its own records are removed rather than the framework assuming REST
conventions — and the placeholder is read from that endpoint rather than assumed
to be `{id}`. Real documents name it `{brandId}`, and `fillPath` throws on a
placeholder it was given no value for, so assuming `{id}` turned every cleanup
into an exception the logger then swallowed. → **`main`**

**23 · Contract drift failed the wrong tests.** Drift threw in every project
except `e2e`, on the reasoning that failing a UI journey on a provider's schema
change hides what the test was about. That reasoning is not about browsers. It
is about the difference between a spec asserting *behaviour* and one asserting
*conformance*. A real drift proved it: the service returns `null` where its own
document promises a number, and "a customer can list their invoices" went red
for a reason that had nothing to do with the claim it makes — four behavioural
specs failed and one contract spec failed, and only the last was informative.

*Fix:* drift throws in the `contract` project and is recorded-and-attached
everywhere else. → **`main`**

**24 · Accessibility waivers were blindfolds.** A waiver was matched by rule id
alone, so accepting one unlabelled button in a third-party widget suppressed
`button-name` on every page the suite would ever scan, including pages added
next month. The documentation promised that "an exception accepted for three
cannot quietly become ninety"; the implementation dropped the whole violation
the moment the rule id matched, so it could.

*Fix:* waivers carry optional `urlPattern` and `selector`, and are applied
**per node**. The nodes a waiver covers stay waived and counted; every other
node the rule fires on is still a failure. An unscoped waiver still covers the
whole rule, because sometimes that genuinely is the decision — it should be a
decision rather than a default. → **`main`**

**25 · `require-case-id` could not tell a test from a conditional skip.**
`test.skip(condition, 'reason')` inside a body declares nothing, has no title
and cannot carry an annotation. The rule treated it as a nameless test and
demanded a case id — so any spec that skipped itself when its precondition was
absent failed lint, which is precisely what a data-dependent or
capability-gated spec is supposed to do.

*Fix:* a declaration ends in a function; a modifier does not. → **`main`**

**26 · The lint rule and the runner disagreed about which files are
signed-out.** `auth-project-boundary` carried its own hardcoded copy of the
auth-flow pattern and ignored the documented `authFlowPattern` override that
`playwright.config.ts` honours. Using the override made the rule reject a file
the runner handled correctly, and the message told the author to undo the thing
that made it work.

*Fix:* the rule reads the selecting target's profile. The default gained
`register`, `signup` and `forgot`, because registering and recovering a password
are signed-out journeys on essentially every application that has them —
leaving them out made the commonest possible override into something every
target had to discover by watching a registration spec get redirected away from
the form it was filling in. The two copies of the pattern are now held identical
by a test rather than by a comment on each. → **`main`**

**27 · `ContractRegistry` could not be asked what a document promises.**
Response validation only runs for a status the document has a schema for — so a
service answering 201 where its document declares only 200 is never
schema-checked at all, and the gap is invisible from inside `validate()`, which
correctly reports no failures for a response it has no schema for.

*Fix:* `statusesFor(method, path)`, so a contract suite can ask directly. The
Toolshop pack uses it to turn exactly that mismatch into a reported finding
rather than a comment in an endpoint descriptor. → **`main`**

**28 · A profile could not say "this environment is shared with strangers".**
`serverState` says data needs cleaning up. Nothing said the *environment* can be
damaged for other people. See learning 31 below for what that cost.

*Fix:* `sharedEnvironment` on the profile, gating the specs whose blast radius
is somebody else's next test run. → **`main`**

### A check that was written and then withdrawn

**29 · A warning that fires on the default configuration is noise.** Parallel
workers on a `static` account pool with `serverState: true` all mutate one
account — a real hazard, hit twice during this exercise. A doctor warning for it
was written, and then removed: that pair is also *the scaffolder's own default*,
so every freshly scaffolded target would have failed its own preflight on day
one. That is the trap learning 10 already recorded, approached from the other
side. Nothing in a profile can distinguish a suite where the pairing is harmless
from one where it is not — that depends on whether two specs touch the same
record, which is a property of the specs.

*Outcome:* a convention in `docs/CONVENTIONS.md`, and the answer lives in the
target's own vocabulary — partition by `run.workerIndex`, or make the verb
tolerate contention rather than assume it owns the account. → **`main`**
(documentation only, deliberately)

### Conventions the exercise added

**G · Ground locators in the accessibility tree, not in a DOM dump.** Every
locator in the first version of the sign-in vocabulary was wrong, because the
exploration script that produced it fell back to the `placeholder` attribute:
it reported `Your email` where the accessible name is `Email address *`. The
failure was a bare fifteen-second timeout on a field plainly on screen.
`npx playwright-cli snapshot` writes what `getByRole` and a screen reader both
read; a DOM dump does not.

**H · The same rule applies to values, not just selectors.** A billing address
built from memory used `Netherlands`; the country list uses UN naming and says
`Netherlands (the)`. `selectOption` with a label matching nothing does not fail
fast — Playwright retries the whole action and times out reporting *"waiting for
element to be visible and enabled"*, which describes the select rather than the
missing option. Three checkout specs spent fifteen seconds each on that message.
A value typed from memory is the same mistake as a locator typed from memory and
fails just as opaquely.

**I · `count()` does not wait.** Every other Playwright read auto-waits;
`Locator.count()` answers for the DOM as it is at that instant. An admin table
renders after its search box, so an action that waited for the box handed back a
page whose rows had not arrived and `countRows()` reported a truthful zero — and
the assertion read "expected > 0, received 0", which points at the application.
An action that returns a count has to leave the page in a state that count can
be trusted in.

**J · Scope a table locator to the table you mean.** `getByRole('table')`
matched the product **specifications** table on the page the cart click started
from, so `openCart` waited for "a table", found the one it was already looking
at, decided the cart had arrived, and read five rows of specifications as cart
lines. No error and no timeout: an empty cart and a plausible total. This is
convention A again, and it recurred in three separate vocabularies in one pack —
which suggests the guidance is not strong enough. Scope to the thing that makes
the answer unambiguous: the cart is *the table containing the total cell*.

**K · A vocabulary must be able to express every state the application has.**
`readCart` could only describe a cart with something in it, so the spec that
emptied the cart failed at the step confirming it had worked — the total cell it
read had stopped existing. An empty cart is a legitimate state.

**L · Do not assert on data the spec did not create.** "The seeded customer has
order history" passed until the account behind the `customer` role changed, then
failed for a reason unrelated to invoicing. The spec now places the order it
asserts about.

### 30 · Three genuine defects in the application under test

The point of all of the above. Each is reproducible against the live service and
each is the kind of thing only the layer that found it could have found.

1. **`GET /invoices` does not match its own published schema.** The document
   declares `subtotal`, `additional_discount_percentage`,
   `additional_discount_amount` and the invoice lines' `discount_percentage` and
   `discounted_price` as `number`; the service returns `null` for all of them.
   Found by schema conformance, on the first run, across every invoice in the
   response.
2. **`POST /favorites` answers 201 where its document declares only 200.**
   Worth more than it looks: because there is no documented 201 response, *no
   response body on that endpoint is schema-checked at all*, and the coverage
   view counts an endpoint nobody is checking.
3. **The forgotten-password form enumerates accounts.** A known address answers
   `page.forgot-password.confirm`; an unknown one answers `The selected email is
   invalid.` An attacker can therefore ask the form which addresses have
   accounts. The first answer is also an **untranslated i18n key rendered to the
   user**, which is a second defect in the same response.

Two accessibility defects were found and waived with reasons and review dates
rather than deleted: an unlabelled password-visibility toggle (WCAG 4.1.2) on
the sign-in and registration forms, and a filter tree nesting `<ul>` outside an
`<li>` (WCAG 1.3.1).

### 31 · The largest finding was about the target, not the framework

**Negative authentication specs spend the account's lockout budget.** Two specs
asserting "a wrong password is refused" ran against the shared `customer`
account. This application locks an account after a few failures, so those two
specs locked the identity every other spec depends on: twenty-one tests failed
across account, cart, checkout, contact and admin, none of them about
authentication, and the lock outlives the run.

Moving them onto disposable, freshly registered accounts was **not** sufficient
— a second seeded account locked as well, so the counter is not purely
per-account. Over one session this target became progressively unusable:

| Account | Outcome |
|---|---|
| `customer@` | locked (HTTP 423) by this suite's own negative specs |
| `customer2@` | locked the same way after the specs were moved to disposables |
| `customer3@` | stopped accepting its documented password — the credentials are published, so anyone may change them |
| a purpose-registered account | wiped within twenty minutes |

The deployment **reseeds on a schedule**: it rotated every product id in the
catalogue twice during the session, restored `customer@`, and deleted the
account the suite had registered for itself. The reseed is also what makes
convention B non-negotiable here — an id transcribed at the start of a session
is wrong by the end of it.

*What this is evidence for:* a vendor's public demonstration site is a fine
target for exploration and for read-only checks, and a poor one for an
authenticated suite that owns state. The same application ships a
`docker compose` deployment with a seeded MariaDB, which is where this pack
belongs — and where `capabilities.db` becomes true and the fourth layer gets
exercised for the first time. `sharedEnvironment: true` is the profile saying
so out loud, and the framework change it forced is the one worth keeping.

### What landed where

| Learning | Change | Lands on |
|---|---|---|
| 18 · Documented CLI loses its arguments under PowerShell | shell-aware diagnostic in `tools/new-target.ts` | `main` |
| 19 · Multi-role auth setup shared one context | one context per role in the scaffold template | `main` |
| 20 · Sign-in failure did not say why | `auth.setup.ts` quotes what the form reported | `main` |
| 21 · API client could not authenticate | `ApiClient.setAuth`, resolved per call | `main` |
| 22 · Cleanup was unauthenticated and guessed URLs | `ApiClient.remove`, `track(…, remove)` | `main` |
| 23 · Drift failed behavioural specs | throw only in the `contract` project | `main` |
| 24 · Waivers suppressed whole rules | per-node waivers with `urlPattern`/`selector` | `main` |
| 25 · `require-case-id` misread `test.skip` | declaration detected by its function body | `main` |
| 26 · Lint rule ignored `authFlowPattern` | rule reads the profile; default widened; held by a test | `main` |
| 27 · No way to ask what a document promises | `ContractRegistry.statusesFor` | `main` |
| 28 · No way to declare a shared environment | `TargetProfile.sharedEnvironment` | `main` |
| 29 · Warning fired on the default config | withdrawn; convention instead | `main` (docs) |
| G · Ground locators in the accessibility tree | `docs/CONVENTIONS.md` | `main` |
| H · Ground *values* in the page too | `docs/CONVENTIONS.md` | `main` |
| I · `count()` does not wait | `docs/CONVENTIONS.md` | `main` |
| J · Scope a table locator | `docs/CONVENTIONS.md` | `main` |
| K · Express every state the application has | `docs/CONVENTIONS.md` | `main` |
| L · Never assert on data you did not create | `docs/CONVENTIONS.md` | `main` |
| 30 · Three defects in the application | reported; two a11y findings waived with dates | target pack |
| 31 · Shared demo is not a home for an authed suite | `sharedEnvironment: true`, specs gated | target pack |

---

## What the manual edits cost, and the dashboard that removed them

Onboarding Toolshop with `npm run target:new` produced a working scaffold and
then needed **eight hand edits** before a single spec could run: the test-id
attribute, the sign-in locators, the sign-in path, vendoring the OpenAPI
document, flipping `contracts.enabled`, correcting the spec's file extension,
the credentials, and `authFlowPattern`. Two of those were got wrong first time
and cost an hour between them.

Every one of the first six is a question the *application can answer*, so
`npm run onboard` asks it.

**32 · The scaffolder could not be given what a probe reads.** `planScaffold`
had no way to accept "here are the real accessible names" or "here is the
published document", so a scaffold was necessarily a set of placeholders.

*Fix:* `ScaffoldOptions.signIn` and `.contractDocument`. The locator file is
generated from names read off the application, the document is written into the
pack, and the contracts capability ships **on** — since the only reason it ever
shipped off was that the document had to be vendored first. → **`main`**

**33 · A probe that reads too early does not fail — it lies.** The first version
navigated with `domcontentloaded` and read immediately. Against the real
application it reported one test-id attribute where there are ninety-six, and
no sign-in form on a page that plainly has one. Both were returned as findings,
with no complaint and no note.

*Fix:* settle on `networkidle`, and anchor the sign-in search on the password
field appearing rather than on a snapshot taken at an arbitrary moment. The
same lesson as convention I, in a new place: the read has to wait for the fact.
→ **`main`**

**34 · "Is the form still there?" is the wrong question.** Asked straight after
the click, it answers *yes* on any single-page application, because the router
has not moved yet — so a correct credential was reported as refused.

*Fix:* wait for the password field to **go**. The fact, not its negation, and
it fails as a timeout rather than as a wrong verdict. → **`main`**

**35 · A signed-in marker derived from one role is specific to that role.**
Diffing a sign-in proposes whatever appeared, and on most applications the new
control is the account menu carrying *the user's name*. It works perfectly for
the role it came from: `button "Jane Doe"` established the customer's session
and then reported that the administrator had not signed in.

*Fix:* identity-shaped candidates rank last and are flagged, and the generated
file carries the warning. The heuristic derives its hints from the credential,
so it catches an account menu labelled from the email address and misses one
whose display name is unrelated — which is why `setup:auth` also checks that the
session it established names somebody. → **`main`**

**M · Onboarding is a probe, not a questionnaire.** The framework already knew
that guessed locators are the largest single source of dead-on-arrival tests,
and its answer was to tell people to explore first. That is correct and it is
not enough: exploration is manual, and the thing it produces has to be
transcribed. The three facts that cost the most — the test-id attribute, the
accessible names, the document's location — are all readable in ten seconds by
something that opens the page. Read them.

| Learning | Change | Lands on |
|---|---|---|
| 32 · Scaffolder could not accept probe results | `signIn` and `contractDocument` options | `main` |
| 33 · Probe read before the application rendered | `settle`, and a password-field anchor | `main` |
| 34 · Sign-in verified by the wrong question | wait for the form to go | `main` |
| 35 · Derived marker was identity-specific | ranked last, flagged, warned in the file | `main` |
| M · Onboarding is a probe | `npm run onboard` | `main` |
