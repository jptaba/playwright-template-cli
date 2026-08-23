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
| 67 | Three applications have a measured answer and still pay the cap | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 62, 52, 56 and 65 all closed on 2026-08-23.** The first three were the
owner's to decide and they decided them; 65 was work. See *The owner's
decisions* below — and read 56's entry there before touching a worker
ceiling, because the recommendation it was decided on was wrong and the
correction is what raised item 66.

**Items 46, 48, 51, 53, 55, 58, 59, 60, 61, 63 and 64 are `done`** and archived in
`backlog.md`. **64 closed in run 82**: a scan is a result when scanning again
says the same thing. The quiet period is wall-clock and wall-clock is a proxy;
under load a starved page holds still and the scan answers for a shell with
`settled: true`. The scanner now settles, scans, settles and scans again, and
accepts the findings only when two consecutive scans agree. `restful-booker`
went from green-alone-red-under-load to **red alone, three times out of three,
with identical findings** — and the confirmation reported `link-name` ×3 that
even the loaded run had missed. **63 closed in run 81**: a PractiTest **set per application**,
looked up by the application's own name rather than an id written into a
profile, so `pull-cases` returns this suite's cases and not the project's. The
case half of stage 2 is exercised for the first time. **46 and 48 closed together in run 80**: the fakes seed from the
specs on disk rather than from one application's ids — 62 cases and 22 stories
across all five, where it was 4 and 3 — and the journey has now been run for
every application. **saucedemo completes all six stages**, the second
application to do so. **Item 61 closed in run 79, and it was not what it said it
was** — not a vendor regression but a framework defect: the accessibility scan
ran before single-page applications had rendered, so it had been reporting
false passes for as long as it existed. The scan now waits for the DOM to stop
changing, and what that revealed is item 62.
**Item 60 closed in run 78**: the next-steps list says nothing about a
credential the caller has already written, and names the gitignored file rather
than the tracked one when it does speak. Proven by driving the running
dashboard, which is where it was found.
**Item 58 closed in run 76**: `sharedEnvironment` is read by
`no-lockout-on-shared`, which refuses a real account's username paired with a
made-up password — the shape that actually spends a lockout budget. It is
deliberately narrower than the `@negative @auth` tag, so both existing negative
sign-in specs still run. **Item 59
closed in run 75**: a known failure is now *declared* — the spec states the text
its failure should contain, `suites:live` checks the failure against it, and a
lint rule refuses `test.fail()`, which is the mechanism that could not tell
"the defect is still there" from "this stopped testing anything". **Item 53
closed in run 74**: a step the preview has an answer for folds to one line, and
the finished wizard went from 5.68 screens to 3.03 measured on the running
page. **Item 52 closed on 2026-08-23** at 4 of 5 for `toolshop`, by the owner's
decision: that application has no second surface to ask whether a change was
recorded, so an `@audit` cell there would prove nothing. `parabank` is
**parked** as of run 72 — its
five specs stay, two of them reporting real defects, and `suites:live` reports
it as parked rather than running it until ParaBank's own 500s clear. Its review
date is 2026-09-19 and `target:doctor` says so on every check. Run 69 gave `saucedemo` all five kinds and turned up items 57
and 58 doing it; **57 shipped in run 70**, so a corrected template line now
reaches the packs that already exist.

**Item 66 closed in run 84** and its measurement is worth carrying: `serverState`
was answering both "does this need cleanup" and "may two workers share an
account", and four of five applications ran **serially** for a scaffold default
nobody had answered. `sharedIdentitySafe` separates them, `target:doctor` asks,
and `pool:measure` can finally see the case that costs the most.

**Take item 67 next** — the three applications with a measured answer still pay
the cap, and what they need is five runs each rather than two. After that, 49
needs credentials only the owner can supply and 11 is a standing objective, so
the run after is a scan run.

**Where the journey stands, run 80, every application:**

| application | stages | what is left |
|---|---|---|
| **saucedemo** | **6 of 6** | — |
| orangehrm | 5 of 6 | run — a11y, accepted as red |
| restful-booker | 5 of 6 | run — a11y, accepted as red (no longer a flake: run 82) |
| parabank | 5 of 6 | run — parked, and the line says so |
| toolshop | 4 of 6 | coverage accepted at 4 of 5; run — a11y, accepted as red |

Every application reaches stages 1, 2, 5 and 6. **Every remaining stage failure
is now a decision somebody has taken rather than an open question** — the three
accessibility reds are accepted (see *The owner's decisions*), toolshop's
missing `@audit` is accepted, and parabank is parked with a review date.

**Toolshop's live suite failed on a different spec in each of runs 75 and 76** —
`TOOL-3-03` in the cart's cleanup, then `TOOL-1-02` settled as
`timing-synchronisation`. Two singletons on two different specs is not yet a
flake rate, and `src/support/quarantine.ts` plus `FLAKE_MINIMUM_RUNS` is the
machinery for deciding whether it becomes one. Recorded here so a third
sighting has something to join.

*(Item 52's section below was restored in run 68. Run 66 removed it by
accident while archiving item 51 — the two were adjacent, and the row in the
table above survived while its body did not. Worth a glance whenever a section
is cut from this file.)*

## The owner's decisions, 2026-08-23

Taken after run 82 put the four blocked items in front of them with a
recommendation each. Recorded here so no later run re-asks.

| # | Decision |
|---|---|
| **62** | **Accept as red, all three applications.** No waivers. |
| **56** | Drop `poolSize` for `customer` — **and the recommendation was wrong; see below.** |
| **52** | **Accept toolshop at 4 of 5 coverage kinds.** |
| **49** | The owner sets `TEAMS_WEBHOOK_URL` and the SMTP relay themselves. `TEAMS_ALWAYS` and `DIGEST_ALWAYS` stay **off**. |

**62 — accepted as red.** These are vendor defects on demos this repository
does not own, so §10's default applies and there is nothing to wait for. A
waiver's review date is a promise somebody will revisit it, and against a
third-party demo nobody can — so the waiver would become permanent silently,
which is the blindfold the mechanism exists to prevent. Three permanently red
accessibility specs is the accurate signal, and `orangehrm`, `restful-booker`
and `toolshop` stay that way until the vendors fix them.

**56 — the decision was taken on a recommendation that turned out to be
wrong, and the correction is the entry.** Run 82 recommended dropping
`poolSize` for `customer` "and get a worker back". It was applied, and the
worker ceiling went from 2 to **1**, not to 3.

`workerCeiling` derives the cap from `serverState` and the pool: with
`serverState: true` and no pool it is 1, and three accounts with the third
reserved for `auth-flows` gives 2. **The pool is the only parallelism this
suite has.** Dropping it costs a worker rather than returning one.

Run 77's measurement was read as "the pool buys nothing", and its own caveat
says why that reading was too strong: both arms ran at three workers, *above*
this target's normal ceiling, and **at the normal ceiling of 2 the same suite
went 22/22 in the same session**. What the measurement actually disproved was
the pool's *stated reason* — the cart is per-tab `sessionStorage`, so two
workers never shared one — not the pool itself.

**So option 2 was taken instead: the pool is kept and its reason is
corrected.** The profile now says the pool is load-bearing for speed and not
for cart isolation, and `authFlowAccount` keeps its own justification, which
was always about the session rather than the cart. The change was reverted
before it shipped; toolshop's ceiling is 2 again and its suite runs 21/22, the
one failure being 62's accepted red.

**The real question this leaves is `serverState`, and it is item 66.**

**52 — accepted at 4 of 5.** `@audit` asks whether a change was recorded on a
second surface, and toolshop has none: a read-only catalogue API and a cart
that does not outlive a tab. Tagging a reload as an audit would go green having
proved nothing, which is worse than the gap.

**49 — the owner holds the credentials, which is right.** Both notification
paths are built and proven against local fakes. `TEAMS_ALWAYS` and
`DIGEST_ALWAYS` stay off: a nightly mail that is green 90% of the time trains
its recipients to filter it, which is the tools' own argument and it is a good
one. The fakes set both so a demo shows something; a real channel should not.

---

### 67. Three applications have a measured answer and still pay the cap — `ready`

**Raised in run 84**, by shipping item 66. `sharedIdentitySafe` exists and no
profile sets it, so `saucedemo`, `restful-booker` and `orangehrm` still run at
one worker despite measuring green above it.

**What is needed is more runs, not more thinking.** Item 66 measured 2 per
application; `FLAKE_MINIMUM_RUNS` in `src/support/quarantine.ts` is **5**, and
this repository has twice been bitten by treating singletons as rates — the
a11y "vendor regression" of run 78, and the pool conclusion of run 77 that run
83 had to correct.

So: `npm run pool:measure --target=<app> --runs=5`, per application, and set
`sharedIdentitySafe: true` only where all five agree. A profile edit recording
a measured property is not troubleshooting, but the measurement has to be worth
the name first.

**`parabank` is the fourth and should wait.** It is parked with its own review
date; measuring an application that answers HTTP 500 measures the outage.

**Do not set it for `toolshop` without thinking separately.** Its ceiling is 2
rather than 1, its pool exists for reasons run 83 wrote down, and
`authFlowAccount` guards a *measured, deterministic* collision between
`auth-flows` and `e2e` that is about the session rather than the cart. Lifting
the cap there is a different question with a different answer.

**Worth noting while in the area:** the doctor's warning is scoped to a pool of
one, where the cost is total. A pooled target pays a smaller version of the
same cap and gets no warning. That is deliberate for now — the message would
have to stop saying "1 worker" — but it is the obvious generalisation if
somebody wants it.

---

### 49. Point the notifications at a real Teams channel and Outlook relay — `blocked`

Both notification paths are **built, tested and proven end to end** against
local fakes (run 55). What is missing is one channel and one relay, and neither
is something an agent can create.

**Gmail was tried first and abandoned at the owner's direction.** Recorded
because the finding stands for any consumer mailbox: direct MX delivery is
refused outright —

```
550-5.7.1 The IP you're using to send mail is not authorized to
550-5.7.1 send email directly to our servers. Please use the SMTP relay at your
550-5.7.1 service provider instead.
```

— so unauthenticated sending is not a route to any Google-hosted address, and
authenticated sending needs an App Password that must never be pasted into a
chat or committed.

**What is needed, and it is configuration rather than code:**

| | |
|---|---|
| Teams | An **incoming webhook** on the destination channel. Its URL *is* the credential — anybody holding it can post — so it is registered for redaction the moment it is read. Set `TEAMS_WEBHOOK_URL`. |
| Outlook | An authenticated relay: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` (STARTTLS), `SMTP_USER`, `SMTP_PASSWORD`, plus `DIGEST_TO` and `DIGEST_FROM`. |

`credentialFromEnv('SMTP_PASSWORD', …)` registers the password for redaction,
so it cannot reach a log or an attachment. A **service mailbox** rather than a
person's account is what the tool's own copy already asks for.

**One decision worth taking deliberately.** `TEAMS_ALWAYS` and `DIGEST_ALWAYS`
make green runs notify too. The tools default them off, and their own comments
argue for that — *"a nightly mail that is green 90% of the time trains its
recipients to filter it"*. The fakes set both so a demo shows something; a real
channel probably should not.

---

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
