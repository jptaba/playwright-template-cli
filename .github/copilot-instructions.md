<!-- GENERATED FILE — DO NOT EDIT.
     Source: docs/CONVENTIONS.md (sha256 aa904a746dafe80b)
     Regenerate: npm run instructions:build
     Verified in CI by: npm run instructions:check -->

# Test framework conventions — for GitHub Copilot

These instructions apply to every file in this repository. Prefer the fixtures and actions listed in `docs/generated/catalog.md`; the lint rules named below run on every merge request and will reject code that ignores them.

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

Ground locators in a real page, not in priors:

```bash
npx playwright-cli open <url>      # from the target profile, never typed in
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

1. `config/targets/<app>.ts` — base URL, credential refs, capability matrix,
   `testIdAttribute`, `hostAllowlist`. Register it in `config/target.ts`.
2. `src/targets/<app>/{locators,actions}/` — explore the running app with
   `playwright-cli` first; write L1 from the snapshot.
3. `src/targets/<app>/fixtures.ts` — extend the framework `test` with this
   target's named actions and its `testData` builders.
4. `src/targets/<app>/tests/{e2e,api,contract}/` — specs.
5. `TARGET=<app> npx playwright test`.

Steps 1–4 are the whole surface. If you find yourself editing anything under
`src/fixtures/`, `src/integrations/`, `src/support/` or `tools/` to make a new
application work, that is a framework bug: the thing you need is a capability,
not a special case.

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
