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
| 69 | A stale onboarding draft never expires, and nearly doubles the page it opens | `ready` |
| 70 | `npm run onboard` says it opens the onboarding page, and does so only sometimes | `ready` |
| 68 | Two applications keep a worker cap that costs them, for a reason worth removing | `hypothesis` |
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

**Item 67 closed in run 85, and only one of the three kept the flag.** All three
measured 5/5 green, and two then failed at the width lifting the cap actually
produces — `restful-booker` on two different room-list specs, `orangehrm` on its
audit spec. The instrument was asking "may two workers share this identity" and
being read as "may this suite run uncapped". It now runs the experiment arm
uncapped, and the verdict says what a clean result does not prove.

**Run 86 was that scan run**, and it found two things by driving the dashboard
rather than reading it. **Take item 69 next** — a stale draft nobody clears
takes the onboarding page from 1761px to 3173px and reopens two extra steps,
pre-filled for an application that was removed four days earlier. It is the
standing priority exactly: the crowding an operator meets before they have
typed anything. Item 70 is small and sits beside it.

**Both nearly went in wrong**, which is the scan run's own lesson repeating: a
copy bug and a truncated sentence turned out to be artifacts of how the
accessibility tree flattens, and item 70 was first written as a much larger
finding until the zero-application case was driven. Nothing here was filed
until it had been reproduced on a rendered page.

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

### 69. A stale onboarding draft never expires, and nearly doubles the page it opens — `ready`

**Found in run 86 by driving the dashboard**, and it was found by accident while
checking something else — which is the argument for scan runs.

**The evidence, measured on the running page at 1280×720:**

| state | height | screens | steps revealed | name field |
|---|---|---|---|---|
| no draft on disk | **1761px** | 2.45 | 1 of 5 | empty |
| the draft this machine had | **3173px** | **4.41** | **3 of 5** | `fold-scratch` |

**+80% height and two extra steps, from a file written on 2026-08-19** — four
days before, by a run that was testing something else. It names `fold-scratch`,
a scratch target that no longer exists, and pre-fills **twelve** fields with
that application's readings: `baseURL`, `testId`, `signInPath`, `uName`,
`pName`, `sName`, `roles`, `secrets`, `a11y`, `accountType`, `vaultMount`,
`credentialLocation`.

The 1761px figure matches the 1714px item 23 recorded when it shipped
progressive disclosure, so **the disclosure mechanism is working perfectly**.
What defeats it is state nobody clears.

**The mechanism, precisely:**

- `dashboard-page.ts:917` — `if (draft.savedAt || applications.length === 0) startAdding();`
  The *presence* of a `savedAt` opens the adding flow, however old it is.
- `savedAt` is written (`dashboard-page.ts:607`) and read in exactly two places
  (`:904`, `:917`), both of which only ask **whether it is non-empty**. The
  timestamp's value is never compared to anything. **There is no expiry.**
- `tools/dashboard.ts` reads the draft at `:612` and writes it at `:720`.
  Nothing deletes it — there is no clear path in that file at all.
- `src/support/onboarding/offboard.ts` and `tools/offboard.ts` contain the
  string `draft` **zero** times. So `target:remove` takes the profile, the
  pack, the credentials and the sessions, and leaves the draft describing the
  application it just removed.

**Why this is worse than it looks.** Item 9 deliberately made a draft carrying
step 1's read reopen steps 2 and 3, and that was right — losing a 12-to-18
second probe to a reload was the defect it fixed. But it was scoped to *this
visit*, and nothing bounds it. Four days later the same mechanism hands a user
a form full of a deleted application's settings, on the most crowded version of
the page, with **nothing on screen saying where the values came from or how old
they are** — the only related copy is "KEPT AS YOU TYPE" and a disclosure
titled "What is kept when you leave this page".

The likely first move for anybody meeting this is "Skip and fill in by hand",
which item 9 already established is the destructive exit: it calls
`clearWhatWasRead()`.

**Shape of the fix — framework, and there are three parts worth taking
together:**

1. **`target:remove` clears the draft when the draft names the target being
   removed.** This is the clean bug: offboarding already knows the four places
   a target leaves something, and the draft is a fifth.
2. **Expire it.** `savedAt` is already written and already ignored. A draft
   older than some stated period should be treated as absent — the number is a
   judgement, but a day or two matches "I was in the middle of this".
3. **Say where it came from.** If a draft *is* restored, the page should name
   it and offer to discard: "Restored from a draft saved on 19 August" beside a
   control that clears it. Restoring silently is what makes the crowded page
   look like the normal one.

Take 1 first — it is small, it is unambiguously a bug, and it removes the case
that actually happened here.

**Do not fix this by disabling draft restore.** Item 9 is right and the reload
case it fixed is real.

---

### 70. `npm run onboard` says it opens the onboarding page, and does so only sometimes — `ready`

**Found in run 86**, and it is a two-line fix with a one-line caveat.

`tools/onboard.ts` is nine lines whose docstring reads *"`npm run onboard` —
the dashboard, **opened on the onboarding page**"*, and whose body is
`import './dashboard'` and nothing else. `tools/dashboard.ts:116` repeats the
claim: *"`npm run onboard`, which is the same server opened on the onboarding
page."*

The server always opens `/` (`tools/dashboard.ts:1708`). Driven:

| applications on disk | `npm run onboard` lands on |
|---|---|
| none | **Onboard an application** — the claim holds |
| five | **Runs** — "Start a run" |

So the root *adapts*, which is good behaviour and is why this is minor rather
than broken: a genuine first-time user does land where the command promises.
But somebody adding their sixth application types the command named `onboard`
and gets the run launcher.

**Worth noting how nearly this was filed as a much bigger finding.** It was
first observed with five applications present, written up as "the onboarding
command does not open onboarding", and only checking the zero-application case
showed the root adapts. Reading `onboard.ts` — nine lines, no routing — would
have confirmed the wrong conclusion, because the routing is not in that file.

**Two honest options, and they are different products:**

1. **Make it true.** `onboard.ts` passes something the server reads to open
   `/onboard` regardless of how many applications exist. It is the command
   every piece of documentation names for adding an application.
2. **Make the comment true.** Say the root adapts: onboarding when there is
   nothing yet, runs once there is. Then the behaviour is deliberate rather
   than an unkept promise.

Option 1 costs one parameter and matches the command's name. Prefer it unless
somebody argues that a returning user is better served by Runs — in which case
the command should probably not be called `onboard`.

---

### 68. Two applications keep a worker cap that costs them, for a reason worth removing — `hypothesis`

**Raised in run 85.** `restful-booker` and `orangehrm` both run at **one
worker** and both earned that cap honestly — they failed at wider settings on
specs asserting what a global list contains.

But the cap is a blunt answer to a narrow problem. Neither failure was about
sharing an identity; both were about two workers mutating one list. The
suite-side fixes are known and unexercised here:

1. **Scope every list assertion to what the spec created.** `run.runId` already
   tags created records, and `orangehrm`'s filter specs half do this already —
   `OHRM-1-01` narrows by username and passes at five workers, while
   `OHRM-3-01` asserts on the unfiltered list and does not.
2. **Give the fixture data a per-worker namespace**, so two workers cannot
   generate colliding names.

**Do not start this by lifting the cap.** The order is: make the assertions
worker-safe, prove it at width, *then* lift. Reversed, it is run 85 again.

**Worth weighing against the cost.** One worker is slow but correct, and these
are vendor demos where the room and user lists are shared with strangers
anyway. The honest question is whether the wall-clock saved is worth rewriting
specs that currently read cleanly — which is a judgement, not a measurement.

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
