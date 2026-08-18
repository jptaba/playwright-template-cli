# Open items

**The live worklist.** Everything here is unfinished. Finished items and the
reasoning behind them stay in [`backlog.md`](backlog.md), which is now an
archive of 30 items and is read for *why a thing was done*, not for what to do
next.

Split out on 2026-08-18, after `backlog.md` passed 1,900 lines and the four
items that were actually open were spread across it.

The working agreement — how a run starts, how it picks, branching and pushing,
the status vocabulary, the standing brief — is still in `backlog.md` and is
still binding. Read it there; it does not change often. Read this file to
decide what to do.

| # | Item | Status |
|---|---|---|
| 30 | More workers than accounts, on a server-state target | `ready` |
| 29 | The live suites are not part of any loop | `ready` |
| 28 | `cartLocators.line` has the same substring trap | `ready` |
| 31 | The a11y scan counts incomplete checks and discards what they were | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Take them in that order.** 30 before 29, because 29 makes a run report the
live suite's result and 30 is what makes that result stable — wiring in a
measurement that fails three runs in four teaches people to ignore it.

---

### 30. More workers than accounts, on a target that keeps state on the server — `ready`

Full text and the measurements: `backlog.md`, item 30.

**One line:** toolshop declares a 3-account customer pool with
`serverState: true`, Playwright's local default is 7 workers here, and
`accountForWorker` already says two workers collide once there are more workers
than accounts. Live suite: **1 pass in 4** at the default, **3 in 3** at
`--workers=3`.

**The decision it is waiting on:** which role's pool binds. The minimum across
all roles caps toolshop at 1, because it has a single admin nothing writes as.
`roles[0]` — the identity `authedPage` uses — is probably right but is a claim
about how specs share identities rather than a fact any profile states. CI is
capped at 4, also above 3, so this is not a local-only artefact.

### 29. The live suites are not part of any loop — `ready`

Full text: `backlog.md`, item 29.

**One line:** `npm run verify` runs `framework` and `dashboard` and not one spec
against a real application, so in 39 runs this loop never executed the specs it
exists to keep bulletproof — and two `@smoke` failures sat on `/triage` for two
days under a green log.

Pairs with 30. Roughly 50 seconds for both current targets.

### 28. `cartLocators.line` has the same substring trap — `ready`

Full text: `backlog.md`, item 28.

**One line:** `lines(page).filter({ hasText: product })` is a substring match, as
`catalogue.ts` was before run 39b anchored it. Currently unreachable — every
cart spec adds one product — but `cart.empty()` removes by name in a `finally`
against a shared account, so the first spec that adds two nesting names hands
every later spec on that worker a dirty cart.

### 31. The a11y scan counts incomplete checks and discards what they were — `ready`

Found while onboarding ParaBank (coverage phase, application 3), by meeting it
rather than reading for it.

`summarise()` in `src/integrations/a11y/scanner.ts` stores
`incomplete: raw.incomplete.length` — **a number**. Axe's `incomplete` array
carries a rule id, a description and the nodes for every check it could not
decide, and all of it is thrown away.

**Why that matters more than it sounds.** The conventions are emphatic that
`scan.incomplete` is not a pass — *"those are checks axe could not decide, and
a spec that ignores them overstates its result"* — and the scaffolded spec duly
asserts `toBe(0)`. So a target with one indeterminate check has a failing
accessibility spec, a message reading `Expected: 0, Received: 1`, and **no way
whatsoever to discover what the check was.** The only two moves available are
to loosen the assertion, which the conventions forbid, or to delete the spec.

That is exactly where ParaBank's accessibility spec is parked, and it is the
one thing blocking it: the violations are all measured and waived, and the run
is otherwise clean.

**Shape:** keep the count, and add the findings beside it — rule id, impact,
description and node targets — the way `violations` and `waived` already carry
theirs. `WaivedViolation` is the precedent: it exists precisely so an exception
is *visible* rather than merely subtracted. Then a spec can say which check
needs a person, and `describeFindings` can name it.

Pure, and testable without a browser: `summarise()` already takes a
`RawAxeResult` and the framework tests already build them by hand.

### 11. A repeatable learn-fix-optimise loop over a full run — `hypothesis`

Full text: `backlog.md`, item 11. Two slices shipped (runs 12, 13).

**Standing objective, not a task.** The owner's stopping condition is "until the
entire solution meets the intent and it is bulletproof", so this closes when the
suites are, not when a list is empty.

**What is left:**

- A `toolshop` triage-fixture. **Now ranks below 29 and 30**, and run 39b is the
  evidence: a fixture of deliberate failures is worth less than running the
  suite that is meant to pass.
- **Only 1 of the 7 rules in `rules.ts` has ever been settled against ground
  truth** (`transport-failure`). The other six have unit coverage on synthetic
  message text and no ground truth at all. That is the measurement's real blind
  spot and nobody had written it down before run 39b.

---

## The coverage phase

A separate, time-boxed piece of work with its own log:
[`coverage-phase.md`](coverage-phase.md). Five new applications alongside the
two already here, each taken end to end through happy path, negative,
idempotency, audit and boundary coverage, one at a time.

It is kept out of this file on purpose. It is a programme with its own
per-application state, and folding it in would put this list back where
`backlog.md` was.
