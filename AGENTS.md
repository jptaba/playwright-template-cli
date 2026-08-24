<!-- GENERATED FILE — DO NOT EDIT.
     Source: docs/CONVENTIONS.md (sha256 9117bd64747ebbc6)
     Regenerate: npm run instructions:build
     Verified in CI by: npm run instructions:check -->

# Testbench conventions — for any agent following the AGENTS.md convention

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

## Rule zero: fix the framework, never the application's pack

**This is compulsory and non-negotiable, and it outranks every other rule in
this document.** When something is broken, wrong, flaky or hard to diagnose,
the fix goes into the **application-agnostic framework** — and is validated end
to end from there, through onboarding, `target:doctor`, and a run.

**Never troubleshoot by editing an application's own artifacts.** That means no
hand-fix to `config/targets/<app>.ts`, to anything under `src/targets/<app>/`,
or to an application's specs and docs, as a way of making a problem go away.

A target pack is an **output**. `npm run onboard` writes it, `target:doctor`
checks it, healing and triage act on it. Editing the output fixes one
application and leaves the generator, the preflight and the rules exactly as
wrong as they were — so the next application onboarded meets the identical
problem, and nobody finds out until it does.

The question to ask about any fix is **"which mechanism produced this artifact,
and is that mechanism right?"** Then fix the mechanism, regenerate or re-onboard
with the tool, and validate the journey rather than the one file.

**The single exception is authoring *new* coverage.** Specs, and the locators
and actions they need, are written in the pack by design — that is what a pack
is for. The rule governs *troubleshooting*: if you are changing a pack to make
an existing failure stop, stop and go and find the mechanism.

Worked through, with the table of symptom → mechanism, under
[*Fix the framework, never the target pack*](#fix-the-framework-never-the-target-pack).

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

## Fix the framework, never the target pack

**Rule zero in full. Compulsory, non-negotiable, and it applies across the
board — every task, every run, every contributor, human or agent.**

**When troubleshooting, the fix goes in the application-agnostic framework and
is validated end to end from there — through onboarding, the doctor, a run.
Application-specific artifacts are not touched.** That means no hand-edit to
`config/targets/<app>.ts`, `src/targets/<app>/**` or an application's specs and
docs as a way of making a problem go away.

If the framework genuinely cannot express the fix, that is the finding: raise
it as framework work and say what is missing. "It was quicker in the pack" is
not a reason, and neither is "only this application has the problem" — the
second one is nearly always false and is exactly how it stays hidden.

The rule exists because a target pack is an **output**. `npm run onboard`
writes it, `target:doctor` checks it, healing and triage act on it. Editing the
output fixes one application and leaves the generator, the preflight and the
triage rules exactly as wrong as they were — so the next application onboarded
meets the identical problem, and nobody finds out until it does.

Worked example, and it is the reason this is written down. A sign-in error
banner was read with `getByRole('alert')`, which matched nothing on an
application whose banner carries no `role` attribute. `readError` returned
null, so a failed run reported *"the form reported no error … check the
signed-in locator rather than the credential"* while the application was
saying *"Account locked, too many failed attempts"* on screen. Editing that
one target's locator would have taken a minute and taught the framework
nothing: the scaffolder would still emit the same guess for the next
application, the doctor would still not preflight it, and triage would still
have no rule for a lockout.

So the question to ask about any fix is **"which mechanism produced this
artifact, and is that mechanism right?"**:

| Symptom in a pack | Where the fix belongs |
|---|---|
| A scaffolded locator that cannot match | The probe that derives it, or the scaffold template |
| A profile value that is wrong or missing | The onboarding step that reads it, and `target:doctor` |
| A failure nobody can diagnose from the message | The action or reporter that produces the message |
| A condition a run should have caught earlier | `target:doctor` preflight, healing, or a triage rule |
| A verb a spec needs and cannot find | A new action, added deliberately (§ *When the vocabulary is missing*) |

Then regenerate or re-onboard the pack with the tool, and validate the whole
journey rather than the one file — the framework's own tests, `target:doctor`,
`setup:auth`, the live suites.

**The narrow exception is writing *new* application coverage**: specs, and the
locators and actions they need, are authored in the pack by design — that is
what a target pack is for. The rule is about *troubleshooting*. If you are
changing a pack to make an existing failure stop, stop and find the mechanism.

## A defect in the application is a failure, and it stays one

**Never change this framework to make an application's defect pass.** If the
application under test is broken, the honest output is a red spec naming what
broke — that is what the suite is *for*. Tailoring a locator, loosening an
assertion, adding a retry or teaching a verb to tolerate wrong behaviour all
convert a finding into silence, and the team stops hearing about a real defect.

The distinction that matters, because two things look alike from a stack trace:

- **A defect in the application** — it does the wrong thing, or does it
  unreliably. Report it. Leave it failing. File it. A spec that fails every run
  for a known, filed defect is doing its job, and `@known-failure` handling
  belongs in triage and the report, never in the code under the assertion.
- **Contention this suite creates** — two of our own workers or projects on one
  identity, a spec asserting on data another spec is mutating, a fixed wait
  racing a render. That is ours, and it must be fixed here.

Ask which one it is *before* touching anything, and say which in the commit.
The evidence is usually cheap: run the failing thing with nothing else running.
If it still fails, no change in this repository will honestly fix it.

**A known failure is declared, never inverted.** — `known-failures-declared`
`test.fail()` inverts the *whole* test, so a spec marked that way is reported
as **passing** the moment it fails for some other reason — an outage, a moved
locator, an expired session. On an application with known defects, which is
also the kind that falls over upstream, that is the normal case. Say instead
what the failure should contain, and leave the assertion alone:

```ts
annotation: [
  { type: 'practitest', description: 'PB-2-01' },
  { type: 'known-failure', description: 'a bank accepted a negative transfer' },
]
```

`npm run suites:live` then reports it three ways rather than one — still
failing as declared (counted as expected, not red), failing for something else
(an ordinary failure, because it has stopped testing what it claims), or
passing, which means the defect may be fixed and the marker can go.

**Provider drift is the one recorded exception, and it is not a code change.**
An accepted difference between a published document and a running service goes
in the profile as a `ContractWaiver`, with a reason and a review date the
doctor enforces — a decision somebody has to revisit, not an assertion somebody
deleted. Accessibility waivers work the same way and for the same reason.

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
- **`serverState` answers two questions, and they are not the same question.**
  It says "data this suite creates needs cleaning up" — and `workerCeiling`
  *also* reads it to decide whether two workers may share an account. So
  `serverState: true` with no pool caps a target at **one worker**: the whole
  suite runs serially, and declaring a pool of three is what buys the
  parallelism back, which is backwards from how it reads. Four of the first
  five applications onboarded here paid that, every one still carrying the
  scaffolder's `// does state need cross-test cleanup?` verbatim.

  Say which you mean. `sharedIdentitySafe: true` keeps `serverState` about
  cleanup and lifts the cap; leaving it unset keeps the cap, which is the safe
  default and stays the default. **Answer it with a measurement, never a
  guess** — `npm run pool:measure` runs the suite at the cap and again at the
  width lifting the cap would actually produce, with every worker on one
  identity, and reports both arms. `target:doctor` reports an application
  paying the cap without having answered, and stops once the profile says
  either way — "yes, it is earned" is an answer worth recording, because it
  stops the next person re-measuring it.

  **A clean measurement is not the whole answer, and this was learned the hard
  way.** Three applications measured 5/5 green above their cap; two of them
  then failed once the cap was actually lifted — one on two different room-list
  specs across three live passes, the other on its audit spec at five workers.
  Both were reverted the same day. The reason is worth carrying: sharing an
  identity and running wide are different questions, and they come apart the
  moment an application has **global** state. A room list or a user list is not
  owned by whoever signed in, so concurrent workers collide over the *data*
  long before they collide over the login — and the specs that break are the
  ones asserting what a list contains. So lift a cap only after running the
  live suites a few times with it lifted, and expect an application that
  creates records in a shared list to keep its cap.
- **Negative authentication specs spend the account's lockout budget.** Two
  specs asserting "a wrong password is refused" locked the shared account every
  other spec signed in as, and twenty-one unrelated tests failed. Declare
  `sharedEnvironment: true` in the profile of a deployment shared with
  strangers, and `no-lockout-on-shared` then refuses **a real account's
  username paired with a made-up password** — the shape that actually spends
  the budget.

  **Negative authentication itself stays**, and the narrowness is the point: a
  framework that quietly stopped running tests would be worse than the mistake
  it prevents. Two identities cost nothing and both are already in use here —
  an address nobody registered, unique per run, and an account the application
  publishes *in order to* refuse it, signed in with its own real credential.
  Neither generates a failed-password attempt against an identity anyone else
  is using.

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

## "Run the application end to end" means all of it

**When somebody asks for an application to be run end to end, that is the whole
journey and not the suite.** The suite is one stage of six. Anything short of
the list below is a partial run and should say which stages it skipped.

| # | Stage | What proves it |
|---|---|---|
| 1 | **Onboarding** | the pack exists and `target:doctor --sign-in` passes — a credential that resolves *and* signs in |
| 2 | **Stories or cases** | a story pulled from Jira, **or** cases pulled from PractiTest — the suite is traceable to something a person asked for |
| 3 | **Coverage** | all five kinds present: happy path, negative, idempotency, audit, boundary |
| 4 | **Run** | the live suites execute against the real deployment |
| 5 | **Triage** | a run **containing a real failure**, clustered and classified |
| 6 | **Publish** | results pushed back to PractiTest, and the report posted to Teams *and* sent by email |

**PractiTest is both directions**, and stage 2 and stage 6 are the two halves
of it: cases come *out* of it so a spec is traceable to a case somebody wrote,
and results go *back into* it so the case's history is what the run actually
did. Pulling without pushing leaves the case looking untested; pushing without
pulling leaves a result attached to nothing.

**The failures are injected in the seeded cases and stories, not invented in a pack.** `npm run fakes:serve` seeds PractiTest with deliberate-failure cases — each named for the triage category it should produce — and a Jira story that states them as acceptance criteria. The pack's `tests/triage-fixture/` specs *implement* those cases, and `publish:practitest` pushes their results back against the same ids. A case is where a person says what should happen, so a case describing a known-cause failure is where the cause belongs.

**Stage 5 needs a failure on purpose, and that is the stage people skip.**
Triage classifies failures; a green run exercises none of it. So an application
is not end-to-end tested until it carries a **triage ground-truth fixture** —
specs written to fail a stated way, each annotated with the category it should
produce — and `npm run triage:measure` has scored the rules against them. A
green suite plus a green triage report is two claims where only one was
checked.

**None of this requires owning Jira, PractiTest, Teams or a mail relay.**
`npm run fakes:serve` stands all four up locally and prints the environment to
export. Real instances change nothing about the journey; they change whose
channel it lands in.

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
- **A scan waits for the page to stop changing, and a green scan of a page that
  had not finished rendering is the worst result this suite can produce.** The
  fixture does the waiting — it watches the DOM and scans once it has been
  still, rather than trusting `load`, which on a single-page application fires
  long before the application renders. Measured before it did: one dashboard
  reported a single waived violation immediately after `goto` and **seventeen
  across four rules, four of them critical**, once the tree went quiet. A false
  green here is worse than no accessibility suite at all, because somebody
  reads it as evidence. `scan.settled` is `false` when the page never went
  quiet — a clock or a carousel will do that forever — and a spec that cares
  should say so rather than treat the result as equivalent.
- **A result is a result when scanning again says the same thing.** Waiting for
  quiet is a proxy, and under load the proxy and the fact come apart: a page
  between render phases is easily still for the quiet period because it is
  starved or waiting, not because it has finished — and the scan then answers
  for a shell **with `settled: true`**, because by its own definition it had
  settled. Measured: one application's landing page green three times out of
  three run alone, and red under full-suite load with `[critical] label` on
  three nodes. So the fixture scans, settles and scans again, and accepts the
  findings only when two consecutive scans agree. `scan.stable` is `false` when
  they never did — the findings are still returned, because the last attempt is
  the best answer available, but they describe a moving page and a spec should
  assert `stable` rather than treat the two as the same result. Raising the
  quiet period is **not** the fix: it widens the window without improving the
  signal, slows every scan on every application, and still loses whenever
  contention is worse than the number somebody guessed.
  A spec that scans and never reads `stable` is refused.
  — `a11y-scan-stability`
  Any reading satisfies it, not one prescribed assertion: a spec may report on
  an unstable page so long as it says so. What is refused is silence.
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

Two ways in, onto the same scaffolder. **The dashboard is the shorter one:**

```bash
npm run onboard        # opens a local page; reads the application, then writes everything
```

It drives a browser at the running system and fills in what a person would
otherwise have to look up: which attribute `getByTestId` reads here, the
**accessible names** on the sign-in form, and whether the service publishes an
OpenAPI document. It then writes the profile, the pack, the vendored contract
document and the credential entries in one go, and offers to sign in once to
prove the locators work — which also derives `signedInMarker`, the one locator
that cannot be read from a page at rest.

The intended outcome is that `setup:auth` passes with **no file edited by
hand**. What it cannot read it says so about, rather than guessing.

The CLI is unchanged and does the same job without a browser:

```bash
npm run target:new -- --name=<app> --url=<base-url>   # profile + four-layer pack
TARGET=<app> npm run explore                          # open it, snapshot to disk
TARGET=<app> npm run target:doctor                    # profile vs pack vs credentials
TARGET=<app> npx playwright test --project=setup:auth # prove sign-in works
```

On Windows, run the CLI form from bash — npm's PowerShell shim eats the `--`
separator and the flags never reach the script. `npx tsx tools/new-target.ts
--name=… --url=…` works in every shell, and the tool says so when it happens.

### Taking an application back out

```bash
npm run target:remove -- --name=<app>                   # plan only, removes nothing
npm run target:remove -- --name=<app> --confirm=<app>   # actually remove it
```

Also in the dashboard, collapsed at the bottom under **Remove an application**.

It removes the four places a target leaves something — the profile, the pack,
the credential entries and the stored sessions — and nothing else. Framework
code is never touched.

This is what makes it reasonable to point `main` at a live application: try
one, drive it, and put the repository back the way it was, with no branch to
move between. Afterwards, with nothing selected, only the `framework` project
builds and `npm run verify` keeps passing.

**It is the one destructive operation here, so it is built the other way round
from the scaffolder.** It plans and reports before it removes anything; it says
how many of the files git has never seen and therefore cannot bring back; and
it does nothing at all until the target's own name is typed back. A
confirmation a stray click can satisfy is not a confirmation.

Removing a target does not touch `docs/generated/catalog.md` — run
`npm run catalog:build` afterwards, which the tool reminds you to do.

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

- **Troubleshoot by editing a target's own artifacts** — `config/targets/<app>.ts`,
  `src/targets/<app>/**`, an application's specs or docs. Fix the mechanism that
  produced them. See rule zero; it is non-negotiable
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

Each spec declares the category it is meant to produce, as an annotation:

```ts
annotation: [
  { type: 'practitest', description: '5904' },
  { type: 'triage-ground-truth', description: 'network-infrastructure' },
]
```

```bash
npm run triage:measure              # run the fixture, triage it, report agreement
npm run triage:measure -- --reuse   # measure a run you already have
```

That is the agreement measurement §20 asks for, and it is available on day one
rather than after weeks of real failures with confirmed verdicts. It reports
three outcomes and they are not the same thing:

- **Agreed** — a rule settled it as the fixture says.
- **Contradicted** — a rule settled it as something else. Exactly one of the
  two is wrong, and it is usually the rule. This is the only outcome that
  fails the command.
- **Declined** — no rule matched. **Correct**, where the cause is a genuine
  judgement call: the model exists for those, and a rule that invented a
  category would be the actual defect.

A ground-truth spec that *passes* is reported separately: the fixture has
stopped reproducing a cause it claims, so its category is unmeasured rather
than agreed.

The expected category is an annotation rather than something the pack exports
because framework code may not import a target pack. Annotations already reach
`run-result.json` verbatim, so a fixture added to any target is measured by the
same command with no framework change.

## When the vocabulary is missing

If the action, fixture or client you need does not exist in
`docs/generated/catalog.md`: **stop and say so.** Do not invent a helper, and do
not reach for `page.locator` to work around the gap. A missing verb is a design
question — the answer is usually a new action, and it should be added
deliberately, once, rather than inlined into a spec that then diverges.
