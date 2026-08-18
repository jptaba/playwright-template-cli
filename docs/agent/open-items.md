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
| 38 | toolshop's deployment is unstable enough to drown the suite's signal | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Item 37 shipped in run 45** and **did not stabilise the live suite** — read
its entry in `backlog.md` before assuming the flakiness was addressed. The
collision it removed was real and deterministic; the flakiness has a different,
larger cause, which is item 38.

`npm run suites:live` runs every onboarded application's specs against the real
deployment, and **step 5 of the working agreement in `backlog.md` says every
run does this and records the result.**

---

### 38. toolshop's deployment is unstable enough to drown the suite's own signal — `ready`

**Measured in run 45, with the suite taken out of the picture entirely.**

| what was run | result |
|---|---|
| full toolshop live suite, ×3 | 3 failed |
| **`setup:auth` alone, ×4** | **1 failed** |
| full live suite, after item 37 | 19/20 |

The second row is the one that settles it. `setup:auth` alone is one project,
one worker per account, nothing else running — there is no contention this
repository is capable of creating, and it still failed one run in four with
*"Sign-in for role 'customer' (account 1) did not establish a session. The form
reported no error"*. It failed **through** the two retries that project already
allows.

The failing specs move run to run — `TOOL-1-02` (a search whose listing never
changed), `TOOL-3-01`/`TOOL-3-02` (a cart row that would not detach),
`setup:auth` — and every one of them passes in isolation sooner or later. That
is the signature of an unreliable dependency, not of a defect in any of them.

**The cause is not a mystery and is already written down:** toolshop is a
public demo, `sharedEnvironment: true`, and its credentials are the ones the
vendor publishes in a README. Anybody on the internet can be signed in as
`customer@practicesoftwaretesting.com`, emptying the cart a spec just filled.
ParaBank's profile records the same class of thing about its own host — 502s
for forty seconds in a sixty-second window.

**Why this matters more than any single flake:** the loop now runs
`npm run suites:live` every run and records the result (item 29). A measurement
that is red for reasons the repository cannot influence is one people learn to
scroll past, and it takes the real failures with it. This is the item that
decides whether "until it is bulletproof" is reachable against these targets at
all.

**Options, and this needs a decision rather than an implementation:**

- **Accept it and measure it.** Trend a pass *rate* across runs instead of
  demanding green, and treat a single red run as noise. Honest, and it weakens
  the "any failure exits 1" policy `suites:live` deliberately chose.
- **Stand up a deployment we own.** toolshop publishes a Docker Compose stack;
  a local instance would have stable data and unshared accounts, and would cost
  a container to run and a decision about where CI gets one.
- **Split the claim.** Keep the public demos for coverage breadth, and hold the
  *bulletproof* claim to an owned deployment only.

The second is the only one that actually makes the suite green, and it is the
one with a real cost. Worth the owner's view before anybody builds it.

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
