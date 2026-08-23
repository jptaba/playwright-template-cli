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
| 62 | Two applications have real accessibility violations, newly visible | `blocked` |
| 52 | One coverage cell is left, and it is blocked | `blocked` |
| 56 | Toolshop's cart is per-tab, and its profile says it is per-account | `blocked` |
| 46 | The journey has been run for one application, not five | `ready` |
| 48 | Seeded failure cases exist for one application, not five | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 51, 53, 55, 58, 59, 60 and 61 are `done`** and archived in
`backlog.md`. **Item 61 closed in run 79, and it was not what it said it
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
page. **Item 52 is
under way** — `toolshop` went from one coverage kind to four in run 68, and
`target:doctor` now names the missing ones itself rather than leaving it to a
six-stage journey. **52 is finished** apart from `toolshop`'s `@audit`, which is blocked on item
56: that application has no second surface to ask whether a change was
recorded, and the profile claim underneath it wants a measurement rather than
an edit. `parabank` is **parked** as of run 72 — its
five specs stay, two of them reporting real defects, and `suites:live` reports
it as parked rather than running it until ParaBank's own 500s clear. Its review
date is 2026-09-19 and `target:doctor` says so on every check. Run 69 gave `saucedemo` all five kinds and turned up items 57
and 58 doing it; **57 shipped in run 70**, so a corrected template line now
reaches the packs that already exist.

**Item 56's measurement was run in run 77 and it is answered** — see the item.
What is left of it is a decision only the owner can take, so it is `blocked`
rather than ready.

**Take 46 and 48 next**, together — one command per application. Item 62 is
`blocked` on an owner decision rather than on work.

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

---

### 60. The scaffold's next step names the file onboarding refuses to write to — `ready`

**Found in run 74**, by onboarding a scratch target end to end through the
running dashboard against `https://www.saucedemo.com` and reading the result
panel — not by reading source. The credential was written to the **gitignored**
`config/secrets.private.json`, which is the default step 4 offers and the
correct one. The panel then said:

> 1. Add credentials for standard to `config/secrets.local.json` — the keys are
>    listed above.

Both halves are wrong at that moment. The credential **had just been written**,
so there is nothing to add; and the file named is the **tracked** one, which
`.gitignore`, the Test users page and item 15 all say is the wrong place for
anything real.

**Where it is.** `src/support/onboarding/scaffold.ts:419` hardcodes the path:

```ts
secretSource === 'local'
  ? `Add credentials for ${roles.join(', ')} to config/secrets.local.json — …`
  : `Write username and password to ${credentialPaths[0]} in Vault (…)`
```

**This is item 15's defect one layer over, and that is the useful part.** Run 17
fixed *where onboarding writes* a credential and left *what onboarding tells you
to do* naming the old destination. The same shape as items 14 and 17: the page
contradicting what it just did. Verified on disk in the same run — the tracked
file's checksum was byte-identical before and after, so the write is right and
only the instruction is wrong.

**Shape.** `buildScaffold` already takes `secretSource`; it needs to know
whether credentials were supplied and which of `WRITABLE_LOCATIONS` they went
to, and to say either nothing or the right file. The CLI path — where nobody
typed a credential — still needs the instruction, so this is a message that
varies rather than one to delete. Prefer naming the location the caller
actually used over defaulting to either file.

**Do not fix it by editing a pack.** The message is generated; the generator is
the thing that is wrong.

---

### 62. Two applications have real accessibility violations, newly visible — `blocked`

**Not a regression. These were always there** — item 61's fix is what made them
visible, by stopping the scan answering for a page that had not finished
rendering. Both were reported green until run 79.

| application | spec | findings |
|---|---|---|
| **orangehrm** | `A11Y-001`, the dashboard | **critical** `button-name` ×4 · serious `color-contrast` ×11 · `list` ×1 · `scrollable-region-focusable` ×1 |
| **toolshop** | `TOOL-5-01`, the sign-in form | **critical** `button-name`, plus two more |

`restful-booker` is genuinely clean — 13/13 — and `saucedemo` declares no
accessibility capability, so neither changed.

Triage now files both as `application-defect` via the `accessibility-violation`
rule rather than leaving them as "needs judgement", so the report says where
they go. What it cannot say is what to *do*, and that is the blocker.

**Three options per application, and all three are the owner's:**

1. **Accept them as red.** They are the vendor's defects on demos this
   repository does not own, and §10 says a defect in the application is a
   failure that stays one. The cost is two permanently red suites.
2. **Waive with a reason and a review date**, scoped by `urlPattern` to the
   page they were granted for — the shape ParaBank and OrangeHRM already use
   for `html-has-lang`. The scan keeps counting waived nodes, so an exception
   accepted for four cannot quietly become forty.
3. **Park**, as ParaBank is parked, if an application stops being testable.
   Almost certainly wrong here: the rest of both suites passes.

**Do not silence these by widening a waiver to make the red go away.** That is
the move rule zero and §10 both forbid, and `button-name` at critical is a real
barrier — a button no screen reader can announce — rather than a cosmetic one.

**Worth stating plainly, because it is the argument for having done this at
all:** four applications' accessibility specs had been green for weeks, and the
green was worth nothing on two of them.

---

### 52. One coverage cell is left, and it is blocked — `blocked`

Read off the tags in each pack, and **`target:doctor` now reports it directly**
(`coverage-incomplete`, added in run 68) rather than leaving it to
`npm run app:journey`:

| application | has | missing |
|---|---|---|
| toolshop | `@smoke` `@negative` `@idempotency` `@boundary` | audit — **blocked**, see item 56 |
| saucedemo | all five | — |
| parabank | all five | — **parked** (run 72): the application answers HTTP 500 |
| orangehrm | all five | — (run 73) |

`restful-booker` and `saucedemo` have all five. **saucedemo is the better
worked example of the four beyond the happy path**, because each one is a
claim about a UI-only application with no service to ask — which is the harder
case and the one the other two are in.

**Look for cells that already exist before writing any.** Two of toolshop's
four were present and merely untagged — genuinely negative specs that
`--grep @negative` did not run and no measure could see. That is the cheapest
coverage there is, and an untagged negative spec is itself a defect in the
suite's own selectors.

**Toolshop's `@audit` is blocked rather than unwritten**, and item 56 is why:
its cart lives in per-tab `sessionStorage` and its API layer is a read-only
catalogue, so there is no second surface to ask whether a change was recorded.
Do not tag a reload as an audit — the measure would go green having proved
nothing.

**OrangeHRM's two landed in run 73**, and they are the first specs in that
pack to create data — adding a system user, and removing it in a `finally`.
Writing them surfaced three latent races in its verbs, including one in
`searchByUsername` that had been waiting for a fact that was already true.

**What is left is `toolshop`'s `@audit` only, and it is blocked on item 56.**

### 56. Toolshop's cart is per-tab, and its profile says it is per-account — `blocked`

**The measurement the item asked for was run in run 77, and the framework half
shipped with it**: `npm run pool:measure` and the `POOL_SIZE_OVERRIDE` that
lets a pool be collapsed without editing the profile of the application under
test.

**The answer, measured rather than argued.** Both arms at three workers, so the
only difference between them is how many identities they share:

| arm | result |
|---|---|
| the declared pool of 3 | **0 of 2 runs green** — failures on cart *and* catalogue specs |
| every worker on one account | **2 of 2 runs green** |

The collapsed arm was *cleaner than the control*. Sharing one account produced
**fewer** failures than spreading across three, so the pool is not preventing
the interference its profile says it prevents. Three separate hand
measurements agree: the cart specs alone, on one account at three workers,
passed 4 of 4.

**Two caveats, both worth keeping.**

- The control runs at the pool's own worker count (3), which is *above*
  toolshop's normal ceiling of 2. Both arms share it so the comparison is
  sound, but neither arm is a normal run — and at the normal ceiling the same
  suite went 22/22 in the same session.
- With `poolSize: 3` and `authFlowAccount: 3`, the usable accounts are
  `[1, 2]`, so a third worker already shares account 1 with the first. The
  declared pool was never giving three workers three identities.

**What is left is a decision, and it is the owner's.** Rule zero forbids
troubleshooting by editing the profile, and the item already said this half
"needs a person rather than another probe". The options:

1. Drop `poolSize` for `customer` and let `e2e` run at its natural width. The
   measurement says nothing is lost. A pool also guards collisions no spec
   currently exercises, which is the argument for keeping it.
2. Keep it, and correct the *stated reason* in the profile, which is currently
   a claim about server-side carts that the application does not support.

**The wider finding, which outlives toolshop.** All five profiles declare
`serverState: true`, and four still carry the scaffolder's comment verbatim —
`// does state need cross-test cleanup?`. That is the question, not an answer,
and it is a scaffold default nobody revisits. Only toolshop pays for it today
because only toolshop declares a `poolSize`; the next application to declare
one inherits the same unexamined claim. `pool:measure` is what that application
now has and toolshop did not.

### 46. The journey has been run for one application, not five — `ready`

**Rewritten in run 59: the original claim is out of date.** It said the
operational surfaces could only be exercised by whoever owned a PractiTest
licence. `npm run fakes:serve` and `npm run app:journey` now exist, and the
whole six-stage journey has been run green end to end for `restful-booker`.

What is actually left is narrower: **run it for the other four**, and fix what
it reports. That is one command per application, and items 51 and 52 are most
of what it will report.

---

### 48. Seeded failure cases exist for one application, not five — `ready`

Also narrower than written. `fakes:serve` seeds four deliberate-failure cases
and a Jira story stating them as acceptance criteria — for `restful-booker`.
The other applications have neither, which is the same gap as item 51 seen from
the services' end, and the two should be done together per application.

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
