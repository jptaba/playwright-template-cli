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
| D · Selection is not configuration | Unit-only when nothing is selected | `main` |

Every framework fix above ships with a unit test that fails without it. That is
the point of writing them down here rather than in a commit message: the next
target will find the next six, and this file is where they go.
