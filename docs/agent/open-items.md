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
| 37 | Two projects sign in as the same customer at the same time | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |


**Items 30, 29, 32 and 33 shipped in runs 40 to 43**, and **items 34, 28, 31,
35 and 36 all shipped in run 44**, which the owner asked to run five items back
to back rather than the usual one.

`npm run suites:live` runs every onboarded application's specs against the real
deployment, and **step 5 of the working agreement in `backlog.md` says every
run does this and records the result.** Read that before starting — it is an
obligation on every run, not an optional extra.

**Item 32 was raised wrong and is worth reading in `backlog.md` for that
reason.** It said `target:doctor` needed a new check. The checks already
existed and were silently defeated by the scaffolder's own `.gitkeep` files —
a reminder that "the tool does not do X" is a claim to verify, not to build on.

Item 37 below is what run 44 found while verifying its own work, and it is the
one thing standing between the live suites and a stable green.

---

### 37. Two projects sign in as the same customer at the same time — `ready`

**The live suites fail intermittently and this is why.** Observed three times
in run 44, on three different specs, all in full parallel runs and all passing
in isolation immediately afterwards:

| spec | symptom |
|---|---|
| `TOOL-1-02` (×2) | the listing never changed after a search |
| `TOOL-3-02` | the cart row for "Combination Pliers" would not detach after a remove |

The third is the giveaway, because the locator was plainly working — the call
log shows it resolving 33 times to a visible row. The row simply never went
away, which is what a *different session emptying the same cart* looks like.

**The cause is documented in the conventions and nothing implements around
it:** *"worker indices repeat across projects: `api` worker 0 and `contract`
worker 0 pick the same slot."* toolshop runs `auth-flows`, `e2e`, `api`,
`contract` and `a11y`, and `auth-flows` has no `dependencies`, so it runs
**concurrently with `e2e`**. Both sign in as `customer`. Slot 0 in each picks
account 1, and toolshop declares `serverState: true` with a server-side cart
against the signed-in account.

So `TOOL-2-01`/`02`/`03` are signing in and out as the very customer whose cart
`TOOL-3-01`/`02` are mutating.

**Item 30 (the worker ceiling) and item 36 (`parallelIndex`) do not fix this
and were never going to.** 30 bounds how many workers run at once; 36 makes the
slot numbering honest. Neither has an opinion about two *projects* holding the
same slot number simultaneously, which is the actual collision.

**Shape, and it wants a decision.** Three candidates, in rough order of
preference:

- **Partition across projects as well as workers** — mix the project name into
  the account index. Correct, and it needs more accounts than a pool has the
  moment two projects both want three.
- **Give `auth-flows` its own identity.** It is the only project that
  deliberately drives a login form, and the conventions already say negative
  auth specs want a disposable account. A `nonAuthenticatingRoles`-style
  second customer would decouple it entirely, and is probably the smallest
  honest fix.
- **Serialise the projects that share a role**, via `dependencies`. Simple,
  and it costs wall-clock on every target whether or not it needs it.

**Do not fix this by raising the pool.** Three real customer accounts is what
the vendor publishes.

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
