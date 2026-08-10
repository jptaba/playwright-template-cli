# playwright-template-cli

An architecture template for a Playwright end-to-end test framework designed so that
AI coding agents can **generate conforming tests from written test cases**, and so that
failures get triaged automatically before a human reads them.

> **Status: architecture plan, pre-implementation.** This repository currently holds the
> design and a reference CI pipeline. No framework code yet.

**→ [Read the full plan](docs/plan.html)** (20 sections, including an adversarial self-critique)

---

## What this is trying to solve

Most "AI writes your tests" setups fail in the same two ways: the model invents locators
that do not exist, and it invents helper methods that do not exist. This template treats
both as design problems rather than prompting problems.

- **Locators come from a real page**, not from the model's priors — the agent explores the
  running app via `@playwright/cli` before generating anything.
- **The vocabulary is closed.** A generated test picks from a typed set of fixtures and
  named business actions. It cannot reach for anything else, and lint rejects it if it tries.
- **Conventions execute.** A markdown rule saying "prefer `getByRole`" is advisory; an
  ESLint rule that fails the build is a feedback signal the agent can act on unaided.

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

## Not included, deliberately

The plan targets a specific stack — HashiCorp Vault, PractiTest, Jira Data Center, GitLab CI,
an internal SMTP mock. Those integrations are described as **adapters behind interfaces**, so
the architecture holds if you swap any of them. Nothing here assumes a particular vendor
beyond Playwright itself.

## Layout

```
.gitlab-ci.yml     reference pipeline — annotated, not currently executed
docs/plan.html     the architecture plan and self-critique
```

## Reading order

If you only read three sections of the plan:

1. **§02 — What "AI-legible" actually means.** The argument the rest depends on.
2. **§06 — Agent tooling: CLI over MCP.** With the benchmark that decided it.
3. **§19 — Self-critique.** Written adversarially against the plan, severity-ranked.

## License

MIT
