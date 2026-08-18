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
| 34 | Accepted provider drift has no recorded home | `ready` |
| 28 | `cartLocators.line` has the same substring trap | `ready` |
| 31 | The a11y scan counts incomplete checks and discards what they were | `ready` |
| 35 | An expected failure is counted as a pass in the run totals | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 30, 29, 32 and 33 shipped in runs 40 to 43.** `npm run suites:live`
runs every onboarded application's specs against the real deployment, and
**step 5 of the working agreement in `backlog.md` says every run does this and
records the result.** Read that before starting — it is an obligation on every
run, not an optional extra.

**Item 32 was raised wrong and is worth reading in `backlog.md` for that
reason.** It said `target:doctor` needed a new check. The checks already
existed and were silently defeated by the scaffolder's own `.gitkeep` files —
a reminder that "the tool does not do X" is a claim to verify, not to build on.

Items 34 and 35 both came out of run 43 writing toolshop's contract suite, and
34 ranks first because there is a `test.fail()` on disk standing in for the
mechanism it describes.

---

### 34. Accepted provider drift has no recorded home — `ready`

Accessibility has waivers: `A11yWaiver` in `config/targets/types.ts`, carrying
a rule, a **reason**, a **review date** and an optional scope, with
`target:doctor` reporting one whose date has passed. The conventions are
emphatic about why — *"a permanent exception is a waiver in the profile, with a
reason and a review date — never a deleted assertion"*.

**Contract drift has no equivalent, and run 43 needed one.** toolshop's
`/products/search` answers `from: null, to: null` on an empty result set where
the pinned document types both as `integer`. It is the vendor's demo and the
vendor's document; this repository can fix neither.

The three options available were delete the spec (forbidden), leave it red
(spends the suite's signal permanently, and makes `suites:live` report a
failure with no path to green), or `test.fail()` — which is what shipped, with
the reason and a 2026-11-18 review date in a comment.

**Why that is not the end state.** `test.fail()` is a fine primitive and it
inverts correctly, but the reason and the review date live in a **comment**,
where nothing can read them. The a11y waiver's whole advantage is that the date
is data: `target:doctor` reports an expired one. A contract exception expiring
in November will expire silently.

**Shape:** a `ContractWaiver` beside `A11yWaiver` — endpoint, reason,
`reviewBy`, and probably the JSON-pointer path of the failing property so the
waiver does not blind the whole endpoint, exactly as `selector` keeps an a11y
waiver from blinding a whole rule. `ContractRegistry.validate` already returns
failures carrying `at` (the instance path), so the narrowing is available.

Note the deliberate asymmetry to argue with: an a11y waiver suppresses a
finding, whereas a contract waiver would suppress a *drift throw*. Suppressing
it and still counting it — the way `scan.waived` counts waived nodes — is
probably right.

### 35. An expected failure is counted as a pass in the run totals — `ready`

Found in run 43, by checking what the run model recorded rather than assuming.

The per-test record is honest: `outcome: 'expected'`, `status: 'failed'`. But
`tally()` counts by outcome, so `byKind.contract` came back
`{total: 6, passed: 6, failed: 0}` for a suite in which one spec genuinely did
not conform. `suites:live` reports **19/19 passed** for toolshop on the same
basis.

That is Playwright's own semantic and it is defensible — an expected failure is
not an unexpected one. But it is the "silent zero" shape the conventions object
to everywhere else: the report says six passed, and six did not pass. Nothing
downstream can count expected failures because `KindTotals` has no field for
them, so a target could accumulate a dozen `test.fail()` markers and read as
perfectly green.

**Shape:** an `expectedFailures` count in `KindTotals`, populated from
`outcome === 'expected' && status === 'failed'`, surfaced in the run report and
in `formatLiveReport` beside `flaky` — which already exists for exactly this
reason, because "green only after retries is not green".

Small and pure. `tally()` takes records and returns totals, and the framework
tests already build both by hand.

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
