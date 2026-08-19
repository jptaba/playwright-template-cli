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
| 46 | The operational surfaces are proven for one application, not four | `ready` |
| 47 | The publish and cases tools cannot reach a loopback fake | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Nothing carries a `ready` label.** Items 38 and 41 to 42 all closed across
runs 46 to 50. The next run is either a **scan** — drive the dashboard and the
onboarding journey and raise what is found with evidence — or the **coverage
phase**, which is now much the largest body of work left: four of seven
applications are not onboarded, and 32 of 35 coverage cells are empty.

**Item 38 resolved itself in run 48.** The lockout cleared — `POST /users/login`
now answers **HTTP 200** — and toolshop is back to **20/20** live. Nothing in
this repository changed it, which is the point: the failure was left red and
legible rather than tailored around, and it went away on its own.

`npm run suites:live` runs every onboarded application's specs against the real
deployment, and **step 5 of the working agreement in `backlog.md` says every
run does this and records the result.**

---

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

---

### 46. The operational surfaces are proven for one application, not four — `ready`

**Audited in run 54 at the owner's question**, with evidence rather than
recollection. The functional half is genuinely covered; the operational half is
not, and the two should not be reported together.

**Functional testing against the live applications: yes, and it is real.**
16 spec files across 4 applications, all driving real deployments, **38/38
green** on the last `suites:live`. That includes e2e, api and a11y projects —
not the framework's own tests.

**Everything else, measured from what is actually on disk:**

| surface | state | evidence |
|---|---|---|
| onboarding | **2 of 4** | parabank and restful-booker were onboarded through the dashboard; toolshop and saucedemo predate it |
| offboarding | ✓ | exercised repeatedly on scratch targets, with `secrets.local.json` checksums unchanged |
| runs | ✓ **4 of 4** | `results/live/` holds a run model per application |
| report | ✓ **first time in run 54** | `report:render` produced a 20 KB self-contained `index.html` from restful-booker's live run, and correctly refused a stale triage result, naming the fix |
| triage | ~ | clusters and rules have run on real failures, but **`config/triage-verdicts.jsonl` does not exist** — no human verdict has ever been recorded, for any application |
| cases | ✗ **1 of 4** | `cases/` holds `toolshop` and nothing else |
| stories | ✗ **1 of 4** | `stories/` holds `TOOL-1`…`TOOL-5` and nothing else |
| publish (Jira) | ~ | ran correctly against a live run and said *"No failures. Nothing to file."* — the right answer for a green run, but the filing path is unexercised |
| publish (PractiTest) | ✗ | reads the run correctly — *"13 test(s), 12 carrying a PractiTest id"* — then stops at `PRACTITEST_URL is not set` |
| test users | ✗ | not verified against a live application |

**So the honest answer to "do we truly exercise all of it": no.** The
functional suites are proven four ways over; the operational chain is proven
for toolshop, and only as far as the point where it needs an external service.

**Two different kinds of gap, and they want different answers:**

- **Blocked on a service nobody here has.** `cases:pull`, `cases:push` and
  `publish:practitest` need a PractiTest instance; the Jira filing path needs a
  Jira. That is the owner's call — connect real ones, or accept that this half
  is proven against fakes only.
- **Not blocked, merely undone.** No triage verdict has ever been recorded,
  and the Test users page has never been driven against a live application.
  Both are doable now.

### 47. The publish and cases tools cannot reach a loopback fake — `ready`

Found while trying to close item 46 without a real PractiTest.

`tests/support/fake-practitest-server.ts` exists and is thorough — the
framework tests use it — so pointing `PRACTITEST_URL` at one should let the
whole chain be exercised for any application. It does not work: the fake
recorded **zero calls**, and both tools failed at the connection with the
framework's proxy/CA advice.

Notably `publish:practitest` then **degraded to a warning and exited 0**,
which is correct and is the framework working — *"reporting never turns a
green suite red"*.

The fake is reached happily from inside a Playwright test, where the request
context belongs to the test. The standalone tools construct their own, and
that is the difference worth investigating first.

**Why it matters more than a test convenience:** without it, every claim about
cases, stories and publishing depends on somebody owning a PractiTest licence.
With it, the whole operational chain is provable for all four applications on
any machine, and item 46's blocked half stops being blocked.
