# Testbench

**An application-agnostic Playwright framework with guardrails that execute.**

Mount any application under test, let AI coding agents author conforming specs
against it, and have failures triaged before a human reads them. The application
is configuration: onboarding one takes minutes, removing one leaves nothing
behind, and no framework code ever names it.

> **Status: the architecture in [docs/plan.html](docs/plan.html) is implemented.**
> The framework, its guardrails and every integration adapter are built and
> tested. What is *not* proven is anything that needs a system this repository
> cannot reach — see [What is proven, and what is not](#what-is-proven-and-what-is-not).

**→ [Read the handbook](docs/handbook.html)** — onboarding, the layers, locators,
secrets, accessibility, triage and every command, in 19 sections. Start there if
you are new; this README is the summary.

**→ [How the pieces fit](docs/architecture.html)** — the boundary between
framework and target pack, how a spec gets its verbs, and the end-to-end flow
from `npm run onboard` to a result back in PractiTest, in diagrams.

**→ [What real testing taught the framework](docs/learnings.md)** — the defects and
conventions that came out of pointing this at a live application, and where each
fix landed. New learnings go there.

```bash
npm install           # brings a chromium down with it — verify drives one
npm run verify        # lint + types + generated-file checks + the framework's own tests
```

`verify` is the whole gate, and it is what CI runs. It needs no credential and
no application — only the chromium `npm install` brought down, which the
dashboard half of the suite drives the authoring UI in. The rest of it needs no
browser, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` installs without one.

`npx playwright test` also drives the browser projects, but only against an
application you have selected. With several onboarded and `TARGET` unset, just
the framework's own project builds — alphabetical order does not get to decide
which application gets tested.

`main` carries the framework plus **five onboarded public demo applications** —
`toolshop`, `saucedemo`, `parabank`, `restful-booker` and `orangehrm` — which
exist so agnosticism is tested continuously rather than assumed. Each is a
worked example of the four layers against a real, live site. Remove any of them
with one command and the repository is back to the template.

---

## What this is trying to solve

Most "AI writes your tests" setups fail in the same two ways: the model invents
locators that do not exist, and it invents helper methods that do not exist.
This template treats both as design problems rather than prompting problems.

- **Locators come from a real page**, not from the model's priors — the agent
  explores the running app via `@playwright/cli` before generating anything.
- **The vocabulary is closed.** A generated test picks from a typed set of
  fixtures and named business actions. It cannot reach for anything else, and
  lint rejects it if it tries.
- **Conventions execute.** A markdown rule saying "prefer `getByRole`" is
  advisory; an ESLint rule that fails the build is a feedback signal the agent
  can act on unaided.

## Design decisions

| Decision | Choice | Why |
|---|---|---|
| Framework shape | Locators → Actions → Fixtures → Specs | Page Object Model's open-ended class surface is what makes LLM output drift |
| Agent tooling | `@playwright/cli` over MCP | ~4x fewer tokens for the same task; Playwright targets it explicitly at coding agents |
| Generation engine | Playwright's built-in agents | `planner` / `generator` / `healer` ship with Playwright 1.56+ — don't hand-roll it |
| Secrets | Vault, runtime only | An authoring agent that *can* read a credential eventually writes one into a file |
| Sessions | `storageState` by default | Only `@auth`-tagged specs drive a login form |
| Reporting | One `run-result.json`, three renderings | Report, email digest and API pushes must never re-derive facts independently |
| Triage | Cluster → rules → model | 40 tests failing on one incident is one problem, not 40 |

---

## The executable conventions

Thirteen custom ESLint rules, each with unit tests. These are the framework's
real guardrails — everything else is documentation.

| Rule | Stops |
|---|---|
| `no-raw-locators` | CSS/XPath without an inline justification comment |
| `no-hard-waits` | `waitForTimeout` and hand-rolled sleeps |
| `layer-boundaries` | Specs importing locators; framework importing a target pack; cross-target imports |
| `no-hardcoded-urls` | Any host literal outside `targets/` |
| `typed-clients-only` | Raw `request.*`, `fetch` and inline SQL in specs |
| `secrets-via-fixture` | `process.env` for credentials anywhere but one registered helper |
| `require-case-id` | Specs with no PractiTest annotation (contract project exempt) |
| `step-naming` | Step titles that describe mechanics rather than intent |
| `auth-project-boundary` | `@auth` specs inheriting a session they were meant to establish |
| `no-target-coupling` | Framework code branching on a target's *name* instead of a capability |
| `known-failures-declared` | `test.fail()`, which reports a spec as passing the moment it fails for some other reason |
| `no-lockout-on-shared` | A real username paired with a made-up password on a deployment shared with strangers |
| `a11y-scan-stability` | An accessibility spec that scans a page and never says whether the result was stable |

## Application-under-test agnostic

The application is configuration. `src/fixtures/`, `src/integrations/`,
`src/support/` and `tools/` never import, name, or special-case a target — and
two lint rules fail the build if they start to.

Onboarding one is scaffolded, and then checked:

```bash
npm run target:new -- --name=<app> --url=<base-url>   # profile + four-layer pack
TARGET=<app> npm run explore                          # open it, snapshot to disk
TARGET=<app> npm run target:doctor                    # profile vs pack vs credentials
TARGET=<app> npx playwright test --project=setup:auth # prove sign-in works
```

`target:new` writes the profile and the whole pack — locators, actions,
fixtures, `auth.setup.ts` — and never overwrites. There is no registration
step: profiles are discovered from `targets/`, so a new file is
selectable the moment it lands. `--with=api,db,contracts,a11y` adds the optional
layers.

What it cannot generate is the part that matters: **every locator in the
scaffold is a guess.** Explore the running application and rewrite L1 from the
snapshot. Then name the real business verbs in `actions/`, expose them from
`fixtures.ts`, and write specs.

`target:doctor` is the preflight. It checks the profile's claims against what is
on disk and what the secret store can resolve — an enabled API with no base URL,
a declared role with no credentials, a missing `auth.setup.ts`, `mfa: 'totp'`
against a store that cannot issue codes, a leased pool that will silently
degrade to a shared login — and names the file to fix for each one. That is
onboarding's whole failure surface, reported before a browser opens rather than
as a confusing test failure three directories from its cause.

If you find yourself editing framework code to make a new application work, that
is a framework bug: the thing you need is a capability, not a special case.

## Layout

```
config/targets/       one profile per application; the only place a host appears
eslint-rules/         the thirteen executable conventions, with tests
src/fixtures/         L3 — the closed vocabulary a generated spec may use
targets/<app>/    L1 locators/endpoints/queries · L2 actions/api/db · L4 tests
src/integrations/     vault · mail · practitest · jira · http · llm · db
src/support/          redaction, cases, contracts, onboarding, reporters, triage, heal
tools/                the CLIs the pipeline and the agents call
tests/framework/      the framework's own tests, incl. the lint rules
targets/<app>/tests/{e2e,api,contract,a11y}/   tests of the application
cases/                the intermediate case format both authoring tracks produce
docs/CONVENTIONS.md   single source of truth → CLAUDE.md, AGENTS.md, copilot
docs/handbook.html    onboarding · the layers · running · triage · commands
docs/architecture.html  how the pieces fit, and the end-to-end flow, in diagrams
docs/learnings.md     what real testing taught the framework, and where fixes landed
docs/plan.html        the original architecture plan and self-critique
docs/generated/       capability catalog + run history (committed, checked in CI)
```

## The commands

```bash
npm run verify              # what CI runs on every merge request
npm run catalog:build       # ts-morph → docs/generated/catalog.md
npm run instructions:build  # CONVENTIONS.md → CLAUDE.md / AGENTS.md / copilot
npm run vault:check         # does a secret path resolve? (never prints values)
npm run story:pull -- KEY   # Jira story → stories/<app>/*.json
npm run cases:author -- KEY # story → cases/*.yaml + coverage matrix
npm run cases:gate          # reject cases too vague to automate
npm run cases:push          # → PractiTest; dry run unless --publish
npm run report:render       # run-result.json → self-contained HTML
npm run notify:email        # Outlook-safe digest
npm run triage:cluster|rules|agent
npm run heal                # healing brief; never edits a spec
npm run rotate:passwords    # scheduled, blackout-aware, quarantine-on-failure
```

---

## What is proven, and what is not

The distinction matters more than the line count, so it is stated plainly.

**Verified by running it.** The four layers, all thirteen lint rules, the target
profile mechanism, session setup, the case format and quality gate, the
capability catalog and instruction sync, the Vault adapter (against an
in-process fake Vault), account-pool leasing under concurrency, both OTP
providers, password rotation ordering, redaction including a canary leak test,
the shared API client and schema conformance, read-only query enforcement, the
PractiTest and Jira clients (against in-process fakes, including their rate
limits and DC's Bearer-auth behaviour), Track A's invention guards, the run
model, the HTML report, the email digest's Outlook constraints, triage
clustering and rules, the healing brief's refusal to touch assertions, and the
drift harness — the last of these against the live applications onboarded on
`main`.

**Not proven, and cannot be from here.** No real PractiTest, Jira, mail tool,
GitLab runner or internal application has been reachable. (Vault is the one
that came off this list: the adapter has since been driven against a real
`hashicorp/vault` dev server, which is one `docker run` away, and a Vault
target now reaches a passing `setup:auth` with no file edited by hand.) The adapters are
written against their documented contracts and exercised against fakes that
encode those contracts; first contact with the real systems will still find
things. `.gitlab-ci.yml` has never executed. The generation hit rate in §21
phase 2 — the plan's riskiest assumption — is unmeasured, because measuring it
needs the real cases and the real application.

**Deliberate deviations from the plan.** Two. The canonical `run-result.json`
reporter was built in phase 3 rather than phase 5, because the PractiTest
publisher reads it. Allure is documented as the recommended parallel reporter
but not installed, since it cannot be verified without a run to feed it.

## Not included, deliberately

The plan targets a specific stack — HashiCorp Vault, PractiTest, Jira Data
Center, GitLab CI, an internal SMTP mock. Those integrations are **adapters
behind interfaces**, so the architecture holds if you swap any of them. Unit
tests belong in the application repositories; consumer-driven contract testing
belongs in the services' own pipelines. Both are refused with a reason.

## Reading order

If you only read three sections of [the plan](docs/plan.html):

1. **§02 — What "AI-legible" actually means.** The argument the rest depends on.
2. **§06 — Agent tooling: CLI over MCP.** With the benchmark that decided it.
3. **§19 — Self-critique.** Written adversarially against the plan.

## License

MIT
