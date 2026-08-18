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
| 32 | Three declared capabilities have no specs, and report as a pass | `ready` |
| 28 | `cartLocators.line` has the same substring trap | `ready` |
| 31 | The a11y scan counts incomplete checks and discards what they were | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 30 and 29 shipped in runs 40 and 41.** `npm run suites:live` now runs
every onboarded application's specs against the real deployment, and **step 5
of the working agreement in `backlog.md` says every run does this and records
the result.** Read that before starting — it is a new obligation on every run,
not an optional extra, and it is what item 29 was actually for.

Item 32 below was found by running that command for the first time.

---

### 32. Three declared capabilities have no specs, and report as a pass — `ready`

Found by running `npm run suites:live` (run 41), by reading what it listed
rather than by looking for it.

`src/targets/toolshop/tests/contract/` contains nothing but a `.gitkeep`, while
`config/targets/toolshop.ts` declares `contracts: { enabled: true, spec:
'src/targets/toolshop/contracts/openapi.json' }` — a vendored document, pinned,
and nothing validates against it. `src/targets/parabank/tests/a11y/` and
`tests/api/` are empty the same way, with both capabilities declared on.

**Why this is worse than an empty directory.** `playwright.config.ts` builds a
project per enabled capability, so the `contract` and `api` projects are
created, collect zero specs, and the run is green. The conventions are explicit
that a capability declared off should report "not applicable for `<target>`"
rather than a silent zero — but a capability declared *on* with no specs is a
silent zero wearing the opposite label, and it is the more misleading of the
two. toolshop's 13/13 does not include a single contract assertion.

Note parabank's a11y emptiness is **already explained** and should not be
double-counted: the coverage phase parked that spec deliberately, pending item
31. The unexplained ones are toolshop's contract and parabank's api.

**Shape, and it wants a decision rather than a patch.** `target:doctor` is the
natural home — it already checks a profile's claims against what is on disk,
and "declared capability, no specs" is exactly that shape. Whether it is an
error or a warning is the call: an error blocks a run, and a target mid-build
legitimately has empty directories for a while. A warning that names the file
is probably right, with the same wording as the other doctor findings.

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

- A `toolshop` triage-fixture. **Ranked below the real suites**, and run 39b is
  the evidence: a fixture of deliberate failures is worth less than running the
  suite that is meant to pass. Run 41 shipped the running half
  (`npm run suites:live`), so this is now the smaller remaining piece.
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
