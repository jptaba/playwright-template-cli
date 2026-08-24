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
| 68 | Two applications keep a worker cap that costs them, for a reason worth removing | `hypothesis` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Run 101 was a scan and closed what it found: the health chip's own routing
promise did not hold for the one finding this repository actually carries.**
`toolshop`'s sole live warning is `coverage-incomplete` (missing `@audit`,
permanently accepted at item 52), and the chip routes it to `/cases` per
item 75/76's `whereToFix` mechanism — but `/cases`, driven live, never
mentioned "audit" or any of the five coverage kinds anywhere on the page; its
own "Coverage" section answers a different question (does every managed case
have a spec) than `coverage-incomplete` asks (does the pack have all five
*kinds* of test). `/cases` now renders a "Coverage kinds" section, reusing
`journey.ts`'s already-tested `coveragePresent` against the spec titles
`collectCoverage` already reads — no new parsing, and `kinds` is `null`
whenever "every application" is selected, matching the page's existing
convention for that state.

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

**Run 86 was a scan run and run 87 closed what it found.** The draft is now the
fifth thing `target:remove` clears, it expires after a day, and the page says
when a restored one was saved. `npm run onboard` opens the onboarding page.

**Driving the dashboard to prove it turned up two more, both item 16's.** The
page discarded the whole plan the moment `alreadyGone` was true — printing the
exact "Nothing named X is onboarded" wording item 16 removed, while credentials
and sessions were still listed in the plan it threw away. And
`hasAnythingToRemove` counted four things, so a plan whose only leftover was
the draft refused to execute. **The CLI had been right about both since item
16; two consumers had not, and nothing drove them until now.**

**Run 93 closed items 75 and 76**, at the owner's direction: *Set up* left the
rail for the top bar beside the application switcher, and the health chip now
routes to the page that fixes the finding rather than always the profile. The
collapsed group had been leaving two invisible links in the keyboard tab order.
A phone-width budget that had been passing while the page overflowed was found
and strengthened — it rendered a bar that never ships.

**Run 94 was a scan and closed what it found: run 93's chip kept its old
behaviour on one of its three destinations.** `/onboard` still opened blank
when the chip named an application with a real finding — `/users` and
`/cases` already read the top bar's shared selection, `/onboard` keeps its
own picker and did not. A query string the page reads once and drops from the
address bar closes the gap without relaxing item 6's guarantee that a plain
visit still opens blank.

**Run 100 was a scan and closed what it found: the wizard dropped the keyboard
at every step it advanced.** Four controls, two mechanisms, one defect. "Add an
application" hides itself; the probe, the credential check, the sign-in, Create,
Remove and Save all disable themselves; and a successful Preview *folds* the
step its own button sits in. In every case the focused element left the tab
order without handing focus on, so the browser dropped it to the document body
and the next Tab restarted at the top of the page. Measured on the running
dashboard: **16 Tab presses** back to the field "Add an application" had just
revealed, **25** back to step 2 after a read.

**Preview looked like the counter-case and was not, which is the part worth
carrying.** It is the one advance button that never disables itself, and the
first version of this fix cited it as the shape the others should match. Driving
it showed the fold hides it just as effectively. A control does not have to be
disabled to leave the tab order.

**Also corrected in flight:** a plain `focus()` is not enough on a section that
was `display:none` a moment earlier — the browser's focus-scroll measures a
layout that has not caught up and leaves the caret hundreds of pixels below the
fold. The landing scrolls explicitly, and a test asserts the field is in the
viewport rather than merely focused.

**Run 99 closed item 80.** `/runs`, `/triage` and `/publish` all showed an
unscoped run list; `/triage` was the sharp one, because it *defaults* to a run
and invites verdicts, so a person triaging with parabank in the bar was ruling
on toolshop's failures. `scopeRuns` filters on the target every record already
carries, and returns `elsewhere` so an empty list can say *why* it is empty —
"none here, four belong to others" has a next step in it and "no runs" does
not. A run recorded as `default` is what `npm run verify` writes and belongs to
no application, so it matches nothing and needed no special case.

**Run 97 closed item 79, which is what made 78 work.** `main()` ended with an
unconditional `open(url)`, so every scheduled run, headless check and loop
iteration put a window on somebody's desktop — and those windows were holding
the connections that made run 96's watchdog correctly decline to reap the
servers. The default is now a fact rather than a flag: a terminal attached to
stdout means a person is running this. Proven end to end — an automated caller
now opens no browser, says why, and the server closes itself.

**Run 96 closed item 78 and raised 79.** The dashboard had no way to notice it
had been abandoned: `shutdownHandler` covers `SIGINT` and `SIGTERM`, and
neither fires when whatever launched a backgrounded server goes away — on
Windows no signal is delivered at all. Measured: **60 live dashboards holding
5.4 GB**, six hours of one day. `idleWatcher` gives the machine back after 60
idle minutes, where idle means *zero connections* (the Runs page holds an
`EventSource` open, so counting requests would close the server underneath a
page watching a run) *and no run in flight* (nobody watching is not nothing
happening). Item 79 is what stops it being fully effective.

**Run 95 closed item 77, which is the other half of item 75.** The owner:
*"The header with application and selection, followed by applications then
test users are kind of off and it's really not that intuitive."* Measured on
the running bar: nine elements in one flat row, and `.ctx-label`, `.ctx-env`
and both set-up links computing to the **same `--muted` grey with no
underline** — so a caption reading *"Application"* and a link reading
*"Applications"* sat 350px apart in identical styling, and the links' only
affordance was a hover background, which a keyboard and a touchscreen never
see. A hairline divider, `"Applications"` → `"Onboarding"`, and a real
underline at `--ink-2`.

Two things recommended and then dropped on evidence, recorded so nobody
re-proposes them: **no icons** (the dashboard has zero inline SVG and no icon
font, and `navigation()` carries an explicit "labels are words" principle with
a test enforcing it), and **`/users` keeps its name** (it is titled *and*
eyebrowed "Test users", so renaming only the link would introduce the
link-disagrees-with-its-page mismatch this change removes from `/onboard`).

**Run 92 closed item 73 and withdrew item 74.** The Stories page is scoped to
the application whose specs cite each story — run 80's fix, applied where it had
been missed. **Item 74 was not a defect**: `/api/cases` was always scoped and
the page always passed its target; I had called the route with an empty body and
reported its correct answer to a different question. It survived one
re-verification because I re-ran the same flawed probe. Read the rendered page,
not a route's answer to a question the page never asks.

**Run 88 scanned all seven pages and run 89 closed both findings.** The top bar
carries the doctor's verdict on every page, `/runs` states when an application
is parked, and the page called Runs lists the runs that have finished. The
declined list below still stands: eight capabilities that should stay out of the
dashboard, and why.

**Ten other capabilities are absent from the dashboard and most should stay
that way** — the reasoning is recorded under item 72 so nobody re-derives it.
The line held: everything raised is the page failing to report state it already
has; everything declined would make the dashboard *do* more rather than *say*
more.

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

**Two more live-suite singletons, run 100, on two different applications in two
consecutive passes of the same command.** First pass: `orangehrm` **4/7**, with
`OHRM-2-01` `@boundary` and `OHRM-3-01` `@audit` both timing out on the same
`searchByUsername` locator. Second pass twenty minutes later: `orangehrm` back
to **6/7**, and `restful-booker` down to **9/13** on `RB-1-01`, `RB-1-02` and
`RB-2-04` — its room-list specs, which is the same set item 67 saw fail at
width. Neither set reproduced in isolation: orangehrm's e2e suite ran **6/6
alone** and **6/7 with e2e and a11y together**, which is its recorded normal
state. So by the conventions' own test — run it with nothing else running, and
if it still fails no change here will honestly fix it — these are not
application defects that can be reported as such. They are sightings, recorded
so a later run has something to join, and they strengthen item 68: the specs
that move are the ones asserting what a shared global list contains.

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

### What was deliberately *not* raised, and why

Run 88 checked the whole command surface against the seven pages. Ten things
the framework can do were absent from the dashboard. Two became items 71 and 72
and shipped in run 89; the rest are listed here so nobody re-derives them and
files eight more.

**Kept in the live worklist deliberately**, though neither item is open: this is
a standing decision about what the dashboard is for, and it was very nearly lost
when its two items were archived — the same way runs 66 and 80 lost sections.

| Not exposed | Verdict |
|---|---|
| `catalog:build` / the capability catalog | **Leave out.** It answers "does this verb exist" while writing a spec — an editor question, in a file the conventions already name. A person operating the dashboard is not writing a spec. |
| `explore` | **Leave out.** It opens a browser and writes a snapshot to disk for whoever is authoring locators. The dashboard already drives a browser at the application during onboarding, which is the part an operator needs. |
| `pool:measure` | **Leave out.** A one-off measurement, run about once per application in its lifetime, whose output is a judgement recorded in a profile. A button for it would sit unused beside controls people press weekly. |
| `app:journey` | **Leave out.** It is a six-stage command that runs the suite, triages and publishes — every stage of which already has its own page. A button that does all of it would bypass the decisions those pages exist to ask for. |
| `heal` | **Leave out for now.** Proposed repairs to a pack are a code review, not a dashboard action; accepting one from a page would write to a target pack with nobody reading the diff. |
| `target:upgrade` | **Borderline, defer.** Pack drift is real and invisible, but it reports rather than rewrites, and its output is a file-by-file diff — closer to `git status` than to anything else here. Reconsider if drift ever causes a failure somebody could not diagnose. |
| `triage:measure` | **Borderline, defer.** `/triage` already shows agreement between the rules and the *person*. Ground-truth agreement is a framework-quality metric, and this loop's own log is where it is trended. |
| `cases:pull` / `cases:push` | **Worth revisiting after item 63 settles.** `/cases` shows the gap sharply — 10 cases with no spec, 18 specs citing an id that does not exist — and offers no way to act on either. That is a recovery gap, which the standing brief cares about. |
| `notify:teams` / `notify:email` | **Blocked on item 49**, not on design. Sending the report is exactly `/publish`'s job; there is nothing to send it to yet. |
| `rotate:passwords` | **Leave out.** `/users` already explains it in copy, and it is the most dangerous automation in the plan — it should never start because somebody clicked something. |

**The pattern worth keeping.** Everything left out is either an *authoring*
command (catalog, explore), a *once-per-application measurement*
(pool:measure), or something whose danger comes from being easy
(rotate:passwords, heal). Everything raised is the page failing to report state
it already has. That is the line to hold: the dashboard should say more, not do
more.

---

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
