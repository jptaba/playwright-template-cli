<!-- GENERATED FILE — DO NOT EDIT.
     Source: docs/CONVENTIONS.md (sha256 0b3af474b3ebce53)
     Regenerate: npm run instructions:build
     Verified in CI by: npm run instructions:check -->

# Test framework conventions — for any agent following the AGENTS.md convention

Before writing a spec, read `docs/generated/catalog.md` for the fixtures and actions available. If what you need is not in it, stop and say so rather than inventing a helper or reaching for `page.locator`.

---
# Conventions

Single source of truth for how tests are written in this repository.
`tools/sync-instructions.ts` renders this file into `CLAUDE.md`, `AGENTS.md` and
`.github/copilot-instructions.md`. **Edit this file; never edit those three.** CI
fails if they drift.

Every rule below is enforced by a lint rule, a type, or a failing test wherever
that is possible. Documentation is the fallback for the rest — if you find a
rule here that a machine could have checked, that is a bug in the rule, not in
the person who broke it.

---

## The loop

```
write  →  npm run lint && npx tsc --noEmit && npx playwright test  →  structured errors  →  repair
```

Anything a human has to catch by eye is a convention that has not been
finished.

---

## The four layers

| Layer | Directory | Job | May not |
|---|---|---|---|
| **L1** | `src/targets/<app>/locators/` | Named locators. `getByRole` → `getByLabel` → `getByTestId`. | Contain logic, waits or assertions |
| **L1** | `src/targets/<app>/endpoints/` | Typed endpoint descriptors | Contain logic |
| **L1** | `src/targets/<app>/queries/` | Named, parameterised SQL | Write anything, ever |
| **L2** | `src/targets/<app>/actions/` | UI business verbs | Assert outcomes |
| **L2** | `src/targets/<app>/api/` | Typed HTTP clients | Assert outcomes |
| **L2** | `src/targets/<app>/db/` | Read-only query vocabulary | Write, or assert |
| **L3** | `src/fixtures/`, `src/targets/<app>/fixtures.ts` | The injectable surface | Name a host or a selector |
| **L4** | `src/targets/<app>/tests/` | Specs. **Every assertion lives here.** | Import from L1 |

Rules that execute:

- Specs never import from `locators/`. If a spec needs an element, the missing
  thing is an action. — `layer-boundaries`
- Actions never assert outcomes. They compose primitives and **return data**.
- One target may not import another target's code. — `layer-boundaries`
- Framework code (`src/fixtures/`, `src/integrations/`, `src/support/`,
  `tools/`) may not import a target pack, and may not name one.
  — `layer-boundaries`, `no-target-coupling`
- A spec body should be readable aloud to a manual tester and match their test
  case step for step.

## Locators

Priority order, and it is not a preference:

1. `getByRole(role, { name })` — how a user and a screen reader find it
2. `getByLabel`, `getByPlaceholder`, `getByText`
3. `getByTestId` — the attribute is declared per target (`testIdAttribute`)
4. Raw CSS — only with `// locator-justification: <reason>` on the line above
5. XPath — never

**Scope a locator to its container when a test id is reused.** Applications
reuse test ids across pages more often than the priority order implies. An
unscoped locator that matches on two pages does not fail — it answers the wrong
question with a plausible result:

```ts
// no  — matches cart rows AND listing cards, depending on the page
items: (page) => page.getByTestId('inventory-item'),
// yes — unambiguous wherever it is called
items: (page) => cartLocators.list(page).getByTestId('inventory-item'),
```

**Derive internal identifiers; never write them down.** If a vocabulary needs
an id, slug or key belonging to the application, read it from the running
application. A transcribed internal id is a hallucinated locator wearing a
different hat, and it fails silently — the wrong data is used and the test
carries on.

**Scope a container locator to the container you mean.** `getByRole('table')`
is not "the cart" — it is whichever table is on screen. On one application it
matched the *product specifications* table on the page a cart click started
from, so the action waited for "a table", found the one it was already looking
at, decided the cart had arrived, and read five rows of specifications as cart
lines. No error and no timeout: an empty cart and a plausible total. Scope to
the thing that makes the answer unambiguous — the cart is *the table containing
the total cell*.

**Ground locators in the accessibility tree, not in a DOM dump.** The snapshot
`npx playwright-cli snapshot` writes is what `getByRole` and a screen reader
both read. A DOM dump is not: a script that fell back to the `placeholder`
attribute reported `Your email` for a field whose accessible name is
`Email address *`, and every locator written from it failed as a bare
fifteen-second timeout on a field plainly on screen.

**The same rule applies to values, not only to selectors.** A country chosen
from memory — `Netherlands` — matched nothing in a list using UN naming
(`Netherlands (the)`). `selectOption` with a label that matches nothing does
not fail fast: Playwright retries the whole action and times out reporting
*"waiting for element to be visible and enabled"*, which describes the select
rather than the missing option.

Ground locators in a real page, not in priors:

```bash
npm run explore                    # opens the profile's host — never a typed URL
npm run explore -- /checkout       # a path on it, resolved against the profile
npx playwright-cli snapshot        # accessibility tree to disk as YAML
npx playwright-cli find "Checkout" # search the snapshot
```

Locator hallucination is the largest single source of dead-on-arrival
generated tests. Exploration is the only real fix.

## Waiting

- No `waitForTimeout`. No hand-rolled `sleep`. — `no-hard-waits`
- Web-first assertions (`await expect(locator).toHaveText(...)`) wait for you.
- For genuinely asynchronous facts — a batch posting, a queue — use
  `expect.poll(fn, { timeout })`. It is the only acceptable answer to eventual
  consistency, and it fails as a clear assertion rather than a hung test.
- **`Locator.count()` does not wait.** Every other read auto-waits; `count()`
  answers for the DOM as it is at that instant. An action that returns a count
  must first anchor on something that *does* wait, or it reports a truthful
  zero for a table that has not rendered — and the assertion then reads
  "expected > 0, received 0", which points at the application.
- Wait for the fact, not for the network. `networkidle` returned while a
  removed cart row was still in the table; `row.waitFor({ state: 'detached' })`
  waits for the thing the step was actually about.

## State the suite does not own

- **A vocabulary must be able to express every state the application has.** A
  cart reader that could only describe a non-empty cart made the spec that
  empties the cart fail at the step confirming it had worked.
- **Never assert on data the spec did not create.** "The seeded customer has
  order history" passes until the account behind the role changes, then fails
  for a reason unrelated to what it tests. Place the order you assert about.
- **A static account pool plus `serverState: true` means every parallel worker
  shares one identity.** The failures do not look like contention — they look
  like a 409 from an endpoint, or a cart with one item too many, landing on
  whichever spec lost the race. Partition per worker with `run.workerIndex`, or
  write the verb to tolerate contention rather than assume it owns the account.
  Note that worker indices repeat across *projects*: `api` worker 0 and
  `contract` worker 0 pick the same slot.
- **Negative authentication specs spend the account's lockout budget.** Two
  specs asserting "a wrong password is refused" locked the shared account every
  other spec signed in as, and twenty-one unrelated tests failed. Use a
  disposable identity — and on a deployment shared with strangers, declare
  `sharedEnvironment: true` in the profile and skip them entirely.

## Specs

```ts
import { expect, test } from '../../fixtures';   // the only import a spec needs

test(
  'SD-012 · Checkout totals include tax @smoke @checkout',
  {
    annotation: [
      { type: 'practitest', description: '5104' },
      { type: 'jira', description: 'FIN-2210' },   // optional
    ],
  },
  async ({ authedPage, inventory, checkout, testData }) => {
    const items = testData.catalogItems({ count: 2 });

    await inventory.open(authedPage);
    await inventory.addToCart(authedPage, items.map((i) => i.name));
    const totals = await checkout.completeThroughOverview(authedPage, testData.customer());

    expect(totals.tax).toBeCloseTo(totals.subtotal * testData.taxRate, 2);
  },
);
```

- Title: `<case ref> · <what it proves> @tags`.
- Every spec carries a `practitest` annotation. — `require-case-id`
  (The `contract` project is exempt: it verifies a published schema, not a
  scripted case.)
- Tags are the suite selectors: `@smoke` runs on every merge request.
- One spec per managed test case.

## Step titles are the report

`test.step()` titles become the narrative a product owner reads. Name them for
intent, never mechanics. — `step-naming`

```ts
await test.step('Submit the expense claim', ...)   // yes
await test.step('click #submit-btn', ...)          // no
```

## Sessions

- Storage state is the default. Only `@auth`-tagged specs drive a login form.
- `@auth` specs live in `*login|mfa|password.spec.ts` so the signed-out
  `auth-flows` project picks them up, and they take `page`, never `authedPage`.
  — `auth-project-boundary`
- A storage state file is a live credential. Gitignored, never a CI artifact,
  never attached to a test result, regenerated per run.

## Secrets

- Credentials resolve at runtime through the `secrets` fixture. The agent
  writes the *reference*, never the value.
- No `process.env` for credentials anywhere. — `secrets-via-fixture`
  The single exception is `src/support/env-credentials.ts`, which registers
  every value it reads for redaction.
- No `process.env` at all inside a target pack: base URL, credentials and
  capabilities all arrive through the `target` and `secrets` fixtures.
- Never log a credential, never write one to disk, never copy one into a
  snapshot or an attachment.

## What kind of test goes where

This suite does **not** contain unit tests. A unit test reaches into the code
under test; Playwright drives an application from the outside, and the two are
different jobs done with different tools by different people. What lives here:

| Kind | Where | Project | Asserts |
|---|---|---|---|
| Functional / end-to-end | `tests/e2e/` | `e2e`, `auth-flows` | A user journey through the UI |
| Integration | `tests/e2e/`, `tests/api/` | `e2e`, `api` | A journey that spans UI, service and data — reported as `mixed` |
| Contract | `tests/contract/` | `contract` | A running service against its published schema |
| Accessibility | `tests/a11y/` | `a11y` | The application against the standard its profile declares |
| Performance budget | `tests/e2e/`, tagged `@performance` | `e2e` | A journey the suite already drives finishes inside a stated ceiling |

`tests/framework/` is a separate thing: **the framework testing itself** — the
lint rules, the adapters against in-process fakes, the reporters, triage,
onboarding. It runs in the `framework` project, needs no browser, no network
and no target, and it is deliberately not called `unit`, because a project of
that name sitting beside `e2e` reads as unit-testing the application, which is
not what any of it does.

Accessibility is a declared capability, not a tag, because "is this application
held to WCAG 2.2 AA?" is a property of the application rather than of a spec —
and an accessibility suite with no stated standard argues about every finding.
Waivers live in the profile with a reason and a review date: a known exception
should be a recorded decision, not a test somebody quietly deleted.

The standard is chosen at onboarding (`--a11y-standard=`, default `wcag22aa`)
and overridable per environment afterwards (`A11Y_STANDARD`), like every other
profile value that can differ between deployments. **Any string is accepted.**
`target:doctor` warns when it does not recognise one, which catches a typo
without holding a target to the list this repository happens to know — WCAG 2.2
became a Recommendation in 2023 and 3.0 is in draft, and adopting a newer
standard must never require an edit to framework code.

## Accessibility

- The `a11y` fixture runs axe against the rule tags the profile's standard
  resolves to, applies the profile's waivers, and **returns findings**. It
  asserts nothing: "no critical violations" and "none at all" are different
  products' answers, and that call belongs in a spec a reviewer can read.
- WCAG conformance is cumulative. `wcag22aa` means every A and AA criterion
  from 2.0 and 2.1 as well, and the tag mapping says so — testing only the
  criteria 2.2 added would be a much smaller claim wearing the same name.
- `scan.incomplete` is not a pass. Those are checks axe could not decide, and
  a spec that ignores them overstates its result.
- Scan a page a user actually reaches. Landing pages pass nearly everywhere;
  the dialogs, tables and multi-step forms are where the problems are.
- A permanent exception is a **waiver in the profile**, with a reason and a
  review date — never a deleted assertion or a `disableRules` that outlives
  the pull request. The scan still counts waived nodes, so an exception
  accepted for three cannot quietly become ninety, and `target:doctor` reports
  a waiver whose review date has passed.

## API, contract and database work

- Specs call typed clients. No raw `request.*`, no `fetch`, no inline SQL.
  — `typed-clients-only`
- Assert through the UI if the user can see it, through the API if a service
  exposes it, and through the database **only** when neither does.
- The database vocabulary is read-only. Test data is created through the API or
  the UI so the application's caches, events and derived state stay consistent.
- Everything created gets cleaned up, tagged with `run.runId`.

## The application under test is configuration

Nothing outside `config/targets/` may name a host. — `no-hardcoded-urls`

Framework code branches on **declared capabilities**, never on a target name:

```ts
if (target.capabilities.mfa === 'none') …    // yes — holds for any such app
if (target.name === 'acme-shop') …           // no  — `no-target-coupling`
```

### Adding an application under test

```bash
npm run target:new -- --name=<app> --url=<base-url>   # profile + four-layer pack
TARGET=<app> npm run explore                          # open it, snapshot to disk
TARGET=<app> npm run target:doctor                    # profile vs pack vs credentials
TARGET=<app> npx playwright test --project=setup:auth # prove sign-in works
```

`target:new` writes `config/targets/<app>.ts` and the whole of
`src/targets/<app>/` — locators, actions, fixtures and `tests/auth.setup.ts` —
and stops. It never overwrites. Add `--with=api,db,contracts,a11y` for the
optional layers; the api layer also needs `--api-url`.

**There is no registration step.** Profiles are discovered from
`config/targets/`, so a new file is selectable the moment it lands.

Then the work that cannot be generated:

1. Credentials at `<root>/<accountType>/<role>/1` — Vault for anything real,
   `config/secrets.local.json` only where they are genuinely public.
2. Rewrite `locators/` from the snapshot `npm run explore` produced. **Every
   locator in the scaffold is a guess**, and guessed locators are the largest
   single source of dead-on-arrival tests.
3. Name the real business verbs in `actions/`, and expose them from
   `fixtures.ts`.
4. Specs in `tests/{e2e,api,contract,a11y}/`, then `npm run catalog:build`.

`target:doctor` is the preflight, and it is worth running after each of those.
It checks the profile's claims against what is actually on disk and what the
secret store can resolve — an enabled API with no base URL, a declared role with
no credentials, a missing `auth.setup.ts`, `mfa: 'totp'` against a store that
cannot issue codes, a leased pool that will silently degrade to a shared login.
Every finding names the file to fix. Errors block a run; warnings are smells.

Those steps are the whole surface. If you find yourself editing anything under
`src/fixtures/`, `src/integrations/`, `src/support/` or `tools/` to make a new
application work, that is a framework bug: the thing you need is a capability,
not a special case.

With more than one application in the repository, `TARGET` selects. Unset, and
with several to choose from, only the framework's own `framework` project is built —
alphabetical order does not get to decide which application gets tested.

## Never

- `waitForTimeout`, `sleep`, or any fixed delay
- XPath; CSS without a justification comment
- A URL or hostname literal outside `config/targets/`
- `process.env` for a credential
- An assertion inside an action
- An import from `locators/` inside a spec
- Cross-target imports
- A target name inside framework code
- A test that depends on another test having run first
- Committing `.auth/`, a storage state, or any real credential

## Performance: budgets, not load testing

Load and performance testing are refused — they need different tooling and a
dedicated environment, and numbers from a shared runner under unknown
contention are not actionable.

A **budget** is in scope: an assertion that a journey the suite already drives
finishes inside a stated ceiling. Tag it `@performance`, state the ceiling in
the failure message, and keep it loose — a tight budget on a shared runner is a
flake generator, and a flaky performance test teaches a team to ignore
performance tests.

```ts
expect(elapsed, `the listing took ${elapsed}ms against a ${budget}ms budget`)
  .toBeLessThan(budget);
```

A budget met by an empty page is not a budget met: assert the content arrived,
then assert the time.

## The triage ground-truth fixture

`src/targets/<app>/tests/triage-fixture/` holds specs that are **meant to
fail**, with causes known in advance. They do not run in the normal suite — the
`triage-fixture` project exists only when `TRIAGE_FIXTURE=true` — so a green
pipeline stays green.

```bash
TRIAGE_FIXTURE=true npx playwright test --project=triage-fixture
npm run triage:cluster && npm run triage:rules
```

Compare what the rules settled against the expected category recorded beside
each spec. That comparison is the agreement measurement §20 asks for, and it is
available on day one rather than after weeks of real failures with confirmed
verdicts.

Rules that classify something the fixture says is a different category are
wrong and should be tightened. Rules that decline to classify a genuine
judgement call are **correct** — the model exists for those.

## When the vocabulary is missing

If the action, fixture or client you need does not exist in
`docs/generated/catalog.md`: **stop and say so.** Do not invent a helper, and do
not reach for `page.locator` to work around the gap. A missing verb is a design
question — the answer is usually a new action, and it should be added
deliberately, once, rather than inlined into a spec that then diverges.
