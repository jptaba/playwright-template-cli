# Improvement backlog

A living, ranked list of work the improvement agent may pick up. It is **state
that survives between runs** — every run starts a fresh session with no memory,
so without this file the agent re-discovers the same three things forever and
never compounds.

## How a run starts

Two ways, and neither is a CI job:

- **A local scheduled task**, `playwright-framework-improvement-loop`, every
  five hours. It lives at
  `~/.claude/scheduled-tasks/playwright-framework-improvement-loop/SKILL.md` and
  is managed from the "Scheduled" section of the Claude Code sidebar — not from
  anything in this repository. It fires only while the app is running; if the
  app was closed when a run was due, it runs at next launch.
- **By hand**, by asking for a run in a session.

Nothing in `.github/workflows/` schedules this, and nothing needs to. If you are
looking for the trigger and cannot find it in the repo, that is why: it is
machine-local configuration, deliberately, because the most valuable runs drive
a real browser at a running dashboard and that is not a thing to do from CI.

**Nothing enforces one run at a time, and on 2026-08-17 three overlapped** — two
scheduled sessions plus a by-hand one, landing items 7, 9 and 10's investigation
concurrently. No work was lost, because `git merge --ff-only` refuses rather
than corrupts, but a run that picks an item another run is already finishing is
a wasted run. So: **re-read `backlog.md` and `git log origin/main` immediately
before picking, not once at the start.** The file on disk can lag what is
already pushed by minutes. If `origin/main` has moved since the session opened,
re-read the backlog before committing to an item.

## How the agent uses this file

1. Read this file and `improvement-log.md` before doing anything else.
2. Pick the **highest-ranked item that is `ready`**. Do not pick a second one.
3. If nothing is `ready`, spend the run scanning instead: investigate the
   application, promote `hypothesis` items to `ready` with concrete evidence
   (file paths, line numbers, a reproduction), and add new items found.
   A scan-only run is a legitimate outcome and should still open a PR
   containing the updated backlog.
4. After implementing, move the item to `done` with the branch name, and append
   to `improvement-log.md`.
5. **Measure, and record the numbers in the log entry.** The owner's definition
   of "continuously" is this loop rather than a CI job (see item 11), so a run
   that changed triage rules — or that had nothing better ranked — runs
   `npm run triage:measure` and writes the result down. Trending lives in the
   log entries. The loop stops when the solution meets the intent and is
   bulletproof, not when the backlog is empty.

## Branching and pushing

Work on `agent/<yyyy-mm-dd>-<slug>`, then **fast-forward `main` to it and push
`main` as well**. The owner's standing instruction is that everything lands on
`main` rather than sitting on a branch waiting for a review that will not come.

```bash
git push -u origin agent/<date>-<slug>
git checkout main && git merge --ff-only agent/<date>-<slug> && git push origin main
```

Only push `main` once `npm run verify` has passed and the tree is clean. If the
merge is not a clean fast-forward, stop and say so rather than forcing it.

`gh` is not installed on this machine, so a pull request cannot be opened from
the shell. Report the `pull/new/<branch>` link `git push` prints, and be clear
that `main` already carries the work.

## Status vocabulary

| Status | Meaning |
|---|---|
| `hypothesis` | A suspicion. Needs evidence before it may be implemented. |
| `ready` | Evidenced, scoped small enough for one PR, safe to start. |
| `blocked` | Needs a human decision. Say what the decision is. |
| `done` | Shipped. Records the PR. |

## The standing brief

The owner's stated priority, in their words:

> There is a lot of complexity and it is not that user friendly from the UI
> dashboard, and its structure and how a user interacts with them are not that
> seamless at this time.

And the goal the whole thing serves:

> This is a Playwright test framework that is application-under-test-agnostic
> and should be very very easy to onboard or delete, automate tests,
> troubleshoot failures and report them.

So **UX of the dashboard and the onboarding journey outranks everything else**
unless something is actually broken. "Fewer decisions in front of the user" and
"the page tells you what went wrong and what to do about it" beat new features.

A change that adds a capability but adds a step to the wizard is a net loss
here. Say so in the PR if you think an exception is warranted.

**Sharpened by the owner, 2026-08-17**, and this is now the direction items 18
to 20 carry out:

> One of things i was thinking is to incrementally show (like a wizard) the
> sections that the user needs to be put in or available for them to configure
> after providing the initial details rather than presenting everything to them
> at once. We could still however give them a high level info on what the
> require info are somewhere so they have a good idea of the flow before
> jumping into the initial steps. It should be applied to all sections of the
> UI dashboard. And please let's figure out to make the UI and themes more
> pleasing to the eyes (add a light mode, dark mode and auto mode) and just
> make everything pretty and pleasing to the eyes that will surely make the
> user very engaged.

Two things follow that a run should not have to re-derive. **"Incrementally
show" is not the same as the gating already there:** every section is rendered
today and merely `inert`, so the page is its full height from the first second
and the crowding is what an operator meets before they have typed anything.
And **the overview is what pays for the hiding** — reveal without a stated
shape is a wizard nobody can see the end of, which is worse than a long page.
Neither half ships alone.

---

## Evidence base

`journey-notes.md` records `npm run onboard` driven end to end twice against a
real application (saucedemo), on 2026-08-16. Items 1–9 below were numbered to
match the findings in that file. **Everything ranked `ready` below was observed,
not inferred.** Three of the original six seeded items were guesses that turned
out wrong and have been deleted; item 8 later joined them, having been observed
but mis-diagnosed. Both sets are recorded under "Deleted guesses" at the bottom.

**As of 2026-08-17 every onboarding-UX item is `done`, and so is item 10** — 1
through 10, less the retired 8. Two of item 11's slices are `done` as well
(runs 12 and 13, same day) — see the item for what shipped and what evidence
corrected along the way. Item 14, found by re-driving the dashboard in run 14,
is `done` too.

**The owner answered both open questions on 2026-08-17**, which unblocked item
12 — connect to your own Vault by URL and data shape, then verify a sign-in
with it, server-side, with no secret ever on the page. **Its first slice
shipped in run 16**, and run 17 shipped item 15 — where a typed credential is
actually stored, which turned out to be the file git tracks. The other answer
defines what "continuously" means for item 11: this loop measures triage
agreement and records it per run, rather than a CI job.

Run 18 shipped item 16, and run 19 shipped item 13 — which turned out not to be
a flaky test at all, but a real race in the page that the failing test was
correctly reporting.

**Run 22 shipped item 12 slice 2**, the Vault sign-in verification, and proved
it against a real Vault: a Vault target now reaches a passing `setup:auth` with
no file edited by hand.

**The owner re-stated the standing priority on 2026-08-17**, sharpened into
items 18, 19 and 20 — show one step at a time behind a stated overview, across
every page, and give the tool a theme control and the polish that goes with it.
**Take them in that order: 18, then 20, then 19.** 18 is the ask itself; 20 is
small and mostly already built; 19 needs the pattern 18 settles or it becomes
seven separate opinions. Item 12 slice 3 and item 17 stay `ready` and now rank
below all three — neither is a defect anybody is meeting, and the crowding is.

**Run 23 shipped item 18**, both halves in one change, and the onboarding page
opens at 1714px where it opened at 3888px. **Item 20 is the next one**, and one
part of it is no longer optional: the reveal now depends on a fade, so the
motion half of 20 has already landed inside 18.

**The owner added item 21 on 2026-08-17** — the "Application" slot in the top
bar is a label, not a switcher, so a selection neither sticks nor spreads. It
was driven and evidenced the same day it was asked for. The order is now **20,
21, then 19**: 19 rearranges controls on the pages 21 deletes four of.

**Run 24 shipped item 20's first slice**, the theme control, on every page, and
**run 25 shipped item 21**, the application switcher. The top bar is now crumb,
application, theme — and it is the only place either is chosen.

**Next is item 19**, which is what is left of the owner's progressive-disclosure
ask: the same pattern on the pages that are not wizards. It is smaller than it
was — 21 has already deleted the four duplicate pickers it would have had to
arrange — and the note under it about what 18 actually settled still stands.
After that, item 20's remaining polish, then item 12 slice 3 and item 17.

**Runs 26 to 29 worked down that list and turned it into three budgets**, which
is the shape worth noticing rather than any one of the fixes. Height (run 27),
then two more unbounded queues the height budget found (28), then the measure
(29). Each was a property of the page that no test had an opinion about, each
was invisible to a green suite, and each is now a number with a message.

**Run 30 put `/runs` and `/users` behind both budgets**, and the height budget
found a fifth unbounded list the minute Test users joined it — 14.1 screens of
accounts above the form somebody came to use. Five of the seven pages are now
held by a number.

**Run 31 shipped item 24 and item 12 slice 3**, at the owner's direction and
together. Item 24 went the way the owner leant — the manager, which was the
cause — and the layout followed because twenty cards is still eight screens.
Item 12 is now `done` in full: a Vault connected on the dashboard is kept, and
a run resolves it with nothing exported.

**Runs 33 to 37 emptied the `ready` list.** Hover states, item 17, `/stories`
into the harness, the shared overview panel, and item 20's status tokens all
shipped; the spacing scale was measured and declined with its numbers. All
seven pages are behind four budgets — copy, height, measure and contrast — and
every one of those budgets was written after something got past a green suite.

**Nothing in this file carries a `ready` label, and nothing is blocked.** Item
11 is a standing objective rather than a task. **So the next run is a scan
run**, and the file's own rule for one applies: drive the dashboard and the
onboarding journey, record what actually happens, and raise what is found with
evidence. Do not pick something from the closed items and re-open it on
reasoning alone — three of item 20's four polish claims were written that way
and all three turned out mis-shaped when driven.

**Run 38 was that scan, and shipped item 25**: the top bar overflowed
horizontally at a real phone width (375px) because `.topbar-end` wrapped as a
single row inside the already-wrapping `.topbar`, but the application switcher
and the theme control inside it had no wrap of their own. Found by resizing to
375px, which no run since item 21 added the switcher had done — item 20's
"wraps below 60rem" note was measured at 1280px and 560px, never at a phone's
own width. **Nothing in this file carries a `ready` label after run 38
either.** The next run is another scan; the file's own rule still applies, and
run 38's own lesson applies too — check a real phone width, not just the
560px "narrow windows" tests already cover.

**Correcting the standing note on Vault, 2026-08-17 (run 21).** It said the
owner has no Vault to test against. There is no *hosted* one and none is
needed: `docker run --rm -p 8200:8200 -e VAULT_DEV_ROOT_TOKEN_ID=<token>
hashicorp/vault` is a real Vault in one command, and Docker is installed here.
Run 21 used it to confirm something three runs of reasoning had left open —
**Vault mounts KV v2 at `secret/` while this framework defaults to `kv`** — and
to drive the real `VaultSecretStore` against the real product for the first
time.

So: prove Vault work against a dev server, and use `tests/support/fake-vault-server.ts`
(which already exists and is thorough) for the repeatable coverage. The fake
believes whatever it is told, so anything that is an *assumption about Vault*
needs the real thing once.

---

## Ranked items

### 1. The derived signed-in marker is never checked for uniqueness — `done`

Shipped on `agent/2026-08-16-marker-uniqueness`. Uniqueness now outranks every
quality judgement in the ranking, because it is not one: a duplicated name
cannot resolve, so the dullest unique control beats the best-named ambiguous
one. When every candidate is duplicated the marker is still returned, carrying
`ambiguous: true`, and the page and the generated file both say why it will
fail rather than claiming success.

Verified end to end: onboarding saucedemo through the dashboard now derives
`button "Open Menu"` instead of the duplicated `link "Sauce Labs Backpack"`, and
**`setup:auth` passes with no file edited by hand** — the stated aim, met on
this application for the first time.

The original text follows, because the failure is worth keeping.

**This was the one that was actually broken, so it outranked the UX work.**

`proposeSignedInMarker` (`src/support/onboarding/probe.ts:178`) diffs the
before/after aria snapshots and proposes a control that appeared, ranking
identity-shaped names last. It never checks that the proposed `role|name` occurs
**exactly once** in the after snapshot.

On saucedemo the proposal was `link "Sauce Labs Backpack"`, which matches both
the product image link and the product title link. `setup:auth` then dies on a
Playwright strict-mode violation, and the whole onboarding fails to deliver its
stated aim on a mainstream demo application.

Fix: prefer candidates whose `role|name` appears once; treat a duplicated name
the way identity-shaped names are already treated — rank it below a unique
alternative, and say so in the proposal rather than dropping it silently. If
every candidate is duplicated, say that plainly instead of writing a locator
that cannot resolve.

Framework-level and capability-shaped; no target may be named. Add a
`tests/framework/` case with a snapshot pair containing a duplicated name — the
derivation is pure and already unit-testable.

### 2. Verifying after Create silently discards the derived marker — `done`

Shipped on `agent/2026-08-16-ordering-trap`, together with item 3, because they
are the same trap seen from either end. A sign-in verified after the write now
says plainly that nothing was written, names the file, and prints the exact
replacement — proven verbatim: pasting it in makes `setup:auth` pass.

The original text follows.

Order matters and nothing says so. Verify → Create bakes the marker into
`locators/sign-in.ts`; Create → Verify reports the same marker on the page and
writes nothing, leaving the guess in place *and* leaving the generated comment
claiming verification "was skipped or did not succeed", which by then is false.

Both orders were run end to end. "Nothing is ever overwritten" is why the second
path cannot write — a defensible rule with an indefensible outcome.

Smallest honest fix: after Create, either offer to write the derived marker into
the one file it belongs in, or state on the page that it is too late and give
the exact edit. Doing nothing while saying "Signed in." is the only option that
should be off the table.

Depends on nothing; can land before or after item 1. Pairs naturally with
item 3.

### 3. Sign-in is labelled optional but the stated aim depends on it — `done`

Shipped on `agent/2026-08-16-ordering-trap`. Step 4 no longer calls signing in
"optional, and worth it"; step 5's preview warns, before the write, that
`signedInMarker` will be a guess and that afterwards is too late. No step was
added — the warning lands on the screen the user is already reading.

Note for whoever writes page copy next: `tests/framework/page-copy.spec.ts`
caps an explain block at **34 words** and a whole page at 220 visible. The first
draft of the step 4 wording was 59 and the suite refused it. That is the
conventions working, not an obstacle.

The original text follows.

Step 4 says *"Signing in once is optional, and worth it."* The banner says the
aim is that `setup:auth` passes unedited. Skipping the sign-in guarantees it
does not: the scaffold writes a guessed `signedInMarker` that fails as a
10-second timeout minutes later, far from the choice that caused it.

Fix is words plus one warning at the point of decision: step 5 should say, when
no verification has happened, that it is about to write a guessed signed-in
locator and what that will cost. Do **not** add a step — make the existing one
tell the truth about its consequence.

### 4. The credential source defaults to the option that cannot complete — `done`

Shipped on `agent/2026-08-16-vault-dead-end`, minus the default change — see
item 12, which is the part that needs a decision.

The dead end is gone: a Vault target no longer renders sign-in buttons that
have nothing to send. The explanation arrives before the click instead of after
it, and it names what to do instead — derive the marker from `npm run explore`
and correct `locators/sign-in.ts`. Step 5's warning says the same thing rather
than pointing at a button the page does not show. Switching source now clears
the refusal it no longer describes.

The server-side refusal is kept as a backstop and still tested, on the
"the page and the server disagree" pattern already used in step 5.

**Not done: changing the default from Vault to local.** Raised as item 12.

The original text follows.

"Credentials resolve from" defaults to **Vault**, which hides step 4's credential
fields entirely and makes **Sign in once** impossible — while the same section
prints "optional, and worth it" regardless.

The refusal message is excellent and should be kept verbatim. The problem is the
default routing a first-time user into a dead end, and the encouragement being
printed when it does not apply. Consider defaulting to local when no Vault
configuration is resolvable, and suppressing the sign-in encouragement when the
current source makes it impossible.

Also here, one line: after switching to local, the stale Vault refusal stays on
screen until the next action.

### 5. The preview goes stale and Create writes something else — `done`

Shipped on `agent/2026-08-16-stale-preview`. The plan now records the shape it
was computed from, and any later change that would alter the file list
withdraws it: the list goes, Create is refused, and the button that fixes it is
named. Previewing again restores the write.

The fingerprint deliberately covers only what changes the plan — name, roles,
secret source, layers, services, whether a contract document was found — so
signing in, which moves the marker and the gauntlet, does not nag about a
preview that is still accurate. There is a test for that specifically.

Verified against the running dashboard with the exact sequence that produced
the bug: preview says 6, tick the accessibility layer, the plan is withdrawn,
preview again says **7** and lists the a11y spec. The page and the write agree.

The original text follows.

Preview renders its plan into step 5. Change step 3 afterwards and the plan is
not recomputed, not cleared, and keeps its "Done for you" badge. Observed:
previewed 6 files, ticked the Accessibility layer, pressed Create, got **7
files** — the extra one never shown. Confirmed on disk.

Create re-reading the live form is correct. The preview being allowed to
disagree with it is the defect. Invalidate the plan on any step-3 change and
return step 5 to locked, or recompute it live.

### 6. `npm run onboard` opens on an application you already have — `done`

Shipped on `agent/2026-08-16-open-on-new`. The picker now falls back to
"— New application —" instead of the most recently onboarded one. A caller that
asked to keep its selection still gets it, so saving an edit still lands where
it was — that was the reason the fallback existed and it is untouched.

One line of behaviour, eight tests. Most were relying on the auto-selection
rather than asserting it, and now say which application they mean; the one that
asserted the old default was rewritten to the new guarantee.

The original text follows.

With no draft, the picker preselects the most recently onboarded application,
read-only, all five steps locked. The command whose purpose is onboarding greets
a returning user with a different application and nothing to do.

Default the picker to "— New application —". The onboarded ones stay one
selection away. Smallest diff on the list and the first thing anybody sees.

### 7. Preview's output lands two sections from its button — `done`

Shipped on `agent/2026-08-17-preview-summary`. Step 3 now says so itself: a
`.status` line next to the button reports the file count and points at "Write
it" below, and the step's own badge turns from "Needs your input" (accent) to
"Previewed" (pass-green) the moment a preview succeeds. Both reset to their
pre-preview state the instant the plan goes stale — the same trigger item 5
already wired up — so the badge and the invalidation notice in step 5 can
never disagree about whether the current plan is still good.

The full file list stays in step 5, unmoved: summarising rather than
relocating kept the diff to one new `.status` element and a handful of calls,
and the sidecar step rail already opens a path there for anyone who wants it.

The original text follows.

Step 3's button renders into step 5, below step 4 and off-screen at 1280×720,
and step 3's badge stays "Needs your input" after a successful preview. The
section that owns the button gives no sign it worked.

Either summarise the plan in step 3 and keep the full list in step 5, or move
the badge. Small, and it makes item 5's invalidation legible when it lands.

### 9. Reloading throws away the unlock state, not the answers — `done`

Shipped on `agent/2026-08-17-reload-keeps-its-place`. A draft carrying step 1's
read reopens steps 2 and 3 with it. Steps 4 and 5 still wait for a preview,
which is an answer computed from the form rather than a state to restore.

**The item understated the problem, and the correction is the interesting
part.** The journey notes said the cost was re-running the 12-to-18 second
probe. There was a second way on — "Skip and fill in by hand" — and it is
worse: it calls `clearWhatWasRead()`, which blanks `uName`, `pName`, `sName`,
resets `signInPath` and `testId` to defaults, and writes placeholder locators.
So the two exits after a reload were *re-read everything* or *silently discard
what was restored*. The draft was preserving answers the page would not let
anybody use.

An existing test asserted the old behaviour deliberately — "unlocking is a
claim about what has been done in *this* visit". That reasoning was taken
seriously and then rejected in writing: the draft already makes that claim when
it puts the readings back into step 2's fields. Restoring answers and then
refusing to accept them is the inconsistency, not the unlocking.

Also fixed here, because unlocking exposed it: `switchedOnByReading` is not
persisted, so after a reload the Contracts tick survives with no vendored
document and nothing untick it. The preview now says so, rather than leaving
`target:doctor` to find a contract project with nothing to validate against.

The original text follows.

The draft keeps all of step 1 *and* step 2's probe results across a reload, and
correctly excludes credentials. But steps 2–5 return to `inert`, so the 12–18
second probe must be re-run purely to reopen sections whose fields are already
populated from the draft.

If the draft has probe results, the sections they fill should open. This is the
recoverability item that survived contact with the running system; the rest of
the original item 5 was wrong.

### 10. Keep a second, deliberately unlike target — `done`

Shipped on `agent/2026-08-17-second-target`. `saucedemo` is now committed
alongside `toolshop`: profile, four-layer pack, and one `@smoke` e2e spec —
`SD-1-01 · Adding a product to the cart updates the cart badge`. Credentials
resolve from `config/secrets.local.json`, legitimate here because saucedemo
publishes them on its own login page.

Onboarded through the running dashboard rather than the CLI, per the
"evidence beats reading" rule and because it re-exercises the exact path item
1's fix was built for: `proposeSignedInMarker` derived `button "Open Menu"`
again, not the duplicated `link "Sauce Labs Backpack"` (the product image
link and the product title link still share that name — confirmed live via
the accessibility tree at `/inventory.html`, and it is called out in a
comment on `locators/inventory.ts` so nobody "tidies" a locator there into
one that resolves to two elements). `setup:auth` passes unedited, which is
the aim the dashboard states in its own banner.

`npm run verify` passes with both targets on disk — 750 tests, unchanged from
before, because `test:framework` and the `dashboard` project test the
framework rather than a target. Confirmed separately: with `TARGET` unset,
`npx playwright test --list` still resolves only `[framework]` and
`[dashboard]`, no target-specific project — the second target does not leak
into a build that named none.

One finding, not acted on: step 5's "no sign-in has been verified yet" warning
stayed on screen after a successful **Sign in once**, even though the write
that followed correctly used the derived marker (`locators/sign-in.ts` on
disk has `button "Open Menu"`, not a guess). The warning text appears to be
computed once, at preview time, rather than re-checked after step 4 succeeds.
Cosmetic — the file written is correct either way — so left as a loose thread
rather than a new item; worth a look if someone is already in that area of
`dashboard-page.ts`.

**Run 14 picked that loose thread up as item 14 and it is now `done`.** It was
under-rated as cosmetic: see the item for why.

The original text follows.

Owner's ask, 2026-08-16: find a real application on the internet usable for a
comprehensive end-to-end run, so the framework is exercised as a whole rather
than at the seams.

**Decision taken by the owner, 2026-08-16: keep two unlike targets.** Deepen
`toolshop` (practicesoftwaretesting.com — UI, published API, database story) as
the comprehensive one, and keep a second, simpler, deliberately different target
permanently so agnosticism is tested continuously rather than assumed.

The case for it is already proven: item 1 exists *only* because saucedemo breaks
an assumption toolshop does not. One target would have shipped that bug
indefinitely.

Scope for the first PR — keep it small:

- Commit `saucedemo` as the second target. It onboards cleanly in about a
  minute and `setup:auth` passes; the recipe is in `journey-notes.md`.
- Its credentials are printed on its own login page, so `secretSource: local`
  is legitimate here and the profile should say so.
- One `@smoke` e2e spec, no more. The point of this PR is the second shape
  existing, not coverage.
- Check `npm run verify` still passes with two targets, and that an unset
  `TARGET` still builds only the `framework` project.

Do **not** fold item 11 into this.

### 11. A repeatable learn-fix-optimise loop over a full run — `hypothesis`

Owner's ask, 2026-08-16: every end-to-end test should be learned, fixed and
optimised, continuously, until it is bulletproof.

This is a standing objective, not a single PR. The first two candidate slices
below are now `done`, shipped on `agent/2026-08-17-triage-ground-truth` (run
12).

**Correcting the premise this item was written on.** It said "the triage
ground-truth fixture already exists for exactly this and nothing has been
measured against it." That was wrong, checked against the filesystem rather
than assumed: `src/targets/*/tests/triage-fixture/` did not exist anywhere in
the repository. The fixture *had* existed — `git log` shows it added for the
first `saucedemo` in `3e53bf3`, 2026-08-11 — but `1f38bbd` ("Make main a clean
application-agnostic template") deleted it along with the rest of that target
pack, and when run 11 re-onboarded `saucedemo` through the dashboard it
legitimately built only what item 10 scoped: locators, actions and one
`@smoke` spec, not the ground-truth fixture. The framework-level fixes that
commit made to `src/support/triage/rules.ts` and `src/support/text.ts`
survived, because those are framework code, not a target pack — only the
target-specific specs were lost.

**What shipped.** Recreated `src/targets/saucedemo/tests/triage-fixture/known-failures.spec.ts`,
plus the plumbing it needed that the current `saucedemo` pack did not yet
have: `actions/checkout.ts` and `locators/checkout.ts` (the cart and step-one
of checkout), a `sort`/`price` locator and `sortBy`/`displayedProducts`
actions on the existing inventory pair, and local credential entries for
`problem_user`, `error_user` and `performance_glitch_user` — saucedemo's own
published demo accounts, legitimate here for the same reason `standard_user`
already was. Every one of the four ground-truth failures was reproduced live
against `https://www.saucedemo.com` before being encoded, not assumed from
the deleted commit or from saucedemo's own documentation, and two turned out
not to behave the way their names suggest:

- `error_user`'s sort defect is not a silently wrong order. Choosing any sort
  throws a JS `alert()` ("Sorting is broken!") and the listing never reorders
  at all — the spec registers a `page.once('dialog', ...)` handler to observe
  this rather than hang.
- `performance_glitch_user`'s sign-in delay is not "barely late" — timed live
  at 7.6s standalone and 13.6s under the four-way worker contention of a real
  `triage-fixture` run, against a 3s budget.

**Measured**, with `TARGET=saucedemo TRIAGE_FIXTURE=true npx playwright test
--project=triage-fixture` then `npm run triage:cluster && npm run
triage:rules`: 4 failures → 4 clusters → **1 of 4 settled by rule**
(`network-infrastructure`, via the `transport-failure` rule — matches its
ground-truth category exactly) **and 3 correctly declined** for judgement.
That is the right answer, not a shortfall: no rule exists for
`timing-synchronisation` or for either `application-defect` case, so declining
all three is the rules module doing its job — inventing a false match would be
the actual defect. This is the "compare what rules settle against the
fixture's expected categories" measurement the item asked for, now run once
with a recorded result rather than never run at all.

**Second slice, `done` (run 13, `agent/2026-08-17-triage-measure`).** The three
manual commands are now one: `npm run triage:measure` runs the fixture, runs
cluster and rules, and reports agreement per spec — `--reuse` measures a run
already on disk. It reproduced run 12's hand-counted numbers exactly (1 agreed,
0 contradicted, 3 declined) without anybody comparing categories by eye.

The ground truth moved from an exported `GROUND_TRUTH` const to a
`triage-ground-truth` annotation on each spec, because framework code may not
import a target pack and annotations already reach `run-result.json` verbatim.
So a fixture added to *any* target is measured by the same command with no
framework change — which is what makes this a capability rather than a
saucedemo script.

The command fails (exit 1) only on a contradiction, on a ground-truth spec that
passed, or on an annotation naming a category the taxonomy lacks. A decline
exits 0: a rule refusing a judgement call is correct behaviour, and a command
that failed on those would train people to ignore it.

**Not done, and the honest next slices:**

- `toolshop` — the "comprehensive" target — has no triage-fixture either, and
  building one needs its own exploration of what known-cause failures it can
  produce on demand; nothing here should be assumed transferable. This is now
  the only remaining slice with a clear shape, and `triage:measure` measures it
  for free the moment the specs carry annotations.
- Nothing yet *runs* `triage:measure` on a schedule or trends its numbers.
  One command is repeatable; it is not continuous.

  **Answered by the owner, 2026-08-17:**

  > Continuously means in line with this auto self improvement loop until the
  > entire solution meets the intent and it is bullet proof.

  So it is **this loop, not a CI job.** The measurement belongs in the run
  itself: a run that touches triage rules, or that has nothing better ranked,
  runs `npm run triage:measure` and records the numbers in its log entry, so
  agreement is trended across entries rather than in a dashboard nobody opens.
  That also sets the loop's own stopping condition — it is not "the backlog is
  empty", it is "the solution meets the intent and is bulletproof", and the
  backlog is a means to that rather than the goal.

  Two consequences worth stating, because they change how a run is judged:

  - A run that lands nothing but measures and records is a **legitimate run**,
    on the same footing as a scan.
  - A rule tightened without a measurement afterwards is unfinished work, not a
    finished change awaiting a later check.
- Neither slice needs `TARGET=saucedemo` specifically — either would extend
  just as well starting from `toolshop`.

Depended on item 10, which is `done`. Unblocked; two of its four slices have
now shipped.

### 14. Step 5 kept warning about a guess after the sign-in that removed it — `done`

Shipped on `agent/2026-08-17-marker-warning-stays-true`. The warning is now
rendered by one function that both sign-in paths call, so a verified sign-in
withdraws it and the last screen before the write stops contradicting the
write.

Promoted from run 11's loose thread, and **re-driven live before being
touched** rather than taken on trust — the notes had called it cosmetic. It is
not. Reproduced against a running dashboard on `https://www.saucedemo.com`:
preview, then **Sign in once**, which derived `button "Open Menu"` and reported
success, and step 5 went on saying *"signedInMarker will be written as a guess
… setup:auth will fail until it is corrected by hand … doing it afterwards is
too late."* Every clause of that is false at that moment. Run 11 rated it
cosmetic because the **file** written is correct; the cost is not the file, it
is a user who reads the last screen before an irreversible step and is told the
thing they just did was too late. The honest reaction to it is to redo the
onboarding or hand-edit a file that needs no edit.

Same defect as item 5, one screen further on: the page allowed to disagree with
what it is about to do. Fixed the same way — one place decides, every path that
moves the marker calls it.

The `written` guard is the half worth keeping: once step 5 has written the
pack, a later sign-in must **not** clear the warning, because the guess really
was written and `markerArrivedTooLate` is what speaks to that. Both directions
are pinned by tests, and the too-late path was confirmed live as well.

No copy was added and no step. The fixed state is simply the absence of a
warning that no longer applies — exactly what a fresh preview would have shown.

### 15. Onboarding wrote every credential into the file git tracks — `done`

Shipped on `agent/2026-08-17-credential-location` (run 17), with the owner's
framing: *"All of these tests should route to local copy of the gitignored
credentials… we should have some way of letting the users choose or retrieve
where their test user credentials should be pulled from."*

**The defect.** `writeLocalCredentials` in `tools/dashboard.ts` wrote to
`config/secrets.local.json` unconditionally. That file is **tracked**. So
onboarding a real application through the dashboard — type the password, press
Create — put it in git, while `.gitignore` and the Test users page both said
plainly that anything real belongs in `config/secrets.private.json`.

Everything needed to do it properly already existed and onboarding used none of
it: `CREDENTIAL_LOCATIONS` describes the four places and what each costs,
`WRITABLE_LOCATIONS` says which two this page may write, `writeCredential`
honours them, and `/users` already used all three. Onboarding simply never
asked. That is the finding worth carrying forward — the gap was not a missing
capability, it was one surface not reaching for a vocabulary the repository
already had.

**Fixed:** step 4 offers where to store it, defaulting to the **gitignored**
file, with each option stating what it does with the value. The route validates
against `WRITABLE_LOCATIONS` and refuses anything else, and defaults to private
when the field is absent — the default is where the safety lives, because
anybody who does not read the section still must not commit a password.

**Second defect, found by fixing the first.** Offboarding read and wrote only
`secrets.local.json`, so once onboarding started writing to the private file,
`target:remove` took the pack and left the credential behind — an orphaned real
password for an application the repository no longer has. Both the plan and the
removal now cover both files, and the warning names them.

**Proven live**, not only in tests: onboarded a scratch target through the
running dashboard with a password, and it landed in `config/secrets.private.json`
with nothing in the tracked file; then offboarded a scaffolded target with a
seeded private credential and watched the entry go while the tracked file's
checksum stayed identical.

**Also here:** the connection check from item 12 is no longer Vault-only. It
takes a source, so a local target checks too and reports **which file
answered** — the `origin` the local store already returned and nothing showed.
That is the "retrieve where credentials are pulled from" half of the owner's
ask, and it is what makes this whole path exercisable on a machine with no
Vault: the same route, result shape and rendering the Vault case uses are now
run every time somebody onboards a public demo.

### 16. Offboarding a target that is already gone abandons its credentials — `done`

Shipped on `agent/2026-08-17-orphaned-credentials` (run 18).

`alreadyGone` now means what it says — the profile and the pack are gone — and
stops implying that everything else went with them. The plan still collects the
credential entries and stored sessions, `isRemovable` asks whether there is
anything to remove rather than whether the pack survived, and the description
says "No profile or pack — they are already gone" followed by what remains.
A target with genuinely nothing left is still a no-op, and the typed
confirmation is unchanged: fewer things to remove is not a reason for a weaker
confirmation when a credential is the one thing here a person put in by hand.

Proven on the real scenario rather than only in tests: scaffolded a target,
seeded a private credential, deleted the pack and profile by hand, and ran
`target:remove`. Before the fix it reported *"Nothing to remove"*; now it finds
the credential, refuses until the name is typed, and removes it — with the
tracked file's checksum unchanged.

The original item follows.

`planRemoval` returns early with `alreadyGone: true` and empty removals when
neither the profile nor the pack exists (`src/support/onboarding/offboard.ts:121`).
But credential entries and storage states can outlive both — remove the pack by
hand, or offboard twice, and the tool reports *"Nothing to remove"* while a real
password sits in `config/secrets.private.json` under that target's root.

Observed exactly that in run 17: after an offboard that predated item 15's fix,
a second offboard reported nothing to remove while the credential was still on
disk and visible in the file.

Small and well-shaped: the early return should still collect `removeSecretKeys`
and `removeStorageStates`, and say "the pack is already gone, but these remain"
rather than "nothing to remove". Keep `alreadyGone` — it correctly changes the
wording — but stop it meaning "and therefore nothing else exists".

### 13. The dashboard suite has load-sensitive tests — `done`

Shipped on `agent/2026-08-17-assist-poll-race` (run 19). **It was not a flaky
test. It was a real race in the page, and the failing test was right.**

Measured first, as the item demanded: **0 failures in 6 full framework+dashboard
runs** — past `FLAKE_MINIMUM_RUNS` (5), the threshold this repository says a
rate needs before it means anything. So quarantine was the wrong instrument;
you cannot quarantine what you cannot catch.

The diagnosis came from reading what the failure *was* rather than how often it
happened. `assistDone` clears the poll interval and nulls `assistTimer`
synchronously, then awaits `/api/assist/finish` and renders the derived marker
into `#assistOut`. `clearInterval` stops the next firing and does nothing about
a callback already awaiting its reply — so a poll in flight resumes and
`replaceChildren`s the same element with "N page(s) met so far". The marker is
derived, displayed, and wiped, with nothing on screen looking wrong.

That is a user-visible defect, not a test artifact: an operator who signs in
with the visible browser can lose the marker panel to a stale poll.

**Reproduced deterministically** rather than waited for, using the held-route
pattern `onboarding-journeys.spec.ts` already uses — hold `/api/assist/poll`
open, wait for one to be genuinely in flight, finish, then release. Against the
unfixed page `#assistOut` reads `"1 page(s) met so far between the password and
now.poll 1"` where the marker should be. The fix compares a fact — is this
still the current timer — per the reasoning already written above
`formSignature()`, which learned the same lesson about counting versus
comparing.

Worth keeping: the neighbouring tests finish immediately after starting assist,
so no poll has fired at 1500ms and there is nothing to land late. The first
version of this test did the same and passed against the broken page. Waiting
for the request is what made it real.

The original item follows.

Two different specs have each failed **once** inside a full `npm run verify` and
then passed every repeat afterwards, including 6–8 repeats each and several
further full runs:

- `onboarding-journeys.spec.ts` › "a slow save landing late" (run 5)
- `step4-credentials.spec.ts` › "the marker it derived is what gets written"
  (run 6)

`verify` runs the framework and dashboard projects together, so there is more
contention than either project alone. Both specs involve a request in flight and
an assertion about what the page did with it.

**A third sighting, run 18 (2026-08-17):** `step4-credentials.spec.ts` › "a
marker that names one person is shown as the risk it is" failed once inside a
full framework+dashboard run, then passed in isolation and passed again in the
next two full `verify` runs. That is a different spec from run 6's, in the same
file.

So three singletons, three different specs, all in the `dashboard` project,
all under full-suite parallel load, all unreproducible alone. The pattern is
now consistent enough to be worth acting on — and consistently *one* failure
each, which is what makes a hand-tuned wait the wrong instrument.

Before treating this as real, get the evidence the repository already knows how
to collect: this is precisely what `flakeCandidates`, `FLAKE_MINIMUM_RUNS` and
the quarantine machinery in `src/support/quarantine.ts` exist for, and none of
the three observations has been through it. **Three singletons are still not a
flake rate.** Do not change a timeout on the strength of this note.

The honest next step is to *measure*: run the dashboard project under load N
times, collect the failures through the existing quarantine machinery, and get
a rate. That is a run's worth of work on its own and needs no new code — which
makes it a good candidate now that the pattern has recurred a third time.

### 12. Connect to your own Vault, then verify a sign-in with it — slices 1 and 2 `done`, slice 3 `ready`

**Slice 2 shipped** on `agent/2026-08-17-vault-sign-in` (run 22). A Vault
target can sign in once, and therefore stops shipping a guessed
`signedInMarker`. What crosses the socket is the **path the connection check
just proved**; the credential is read in the process that drives Chromium and
nowhere else — not in the request, not in the response, not on the page.

**Sign in once** appears for a Vault target only once the check has passed, and
is withdrawn the moment the shape it was proven for moves, for the reason
`plannedShape` already learned. **Sign in with a browser you can see** stays
hidden: it hands a filled form to a person watching, which is the one thing a
value nobody typed must not do.

**Proven end to end against a real Vault** (`hashicorp/vault` in dev mode, run
21's recipe), driving the running dashboard at `https://www.saucedemo.com`:
the wrong mount reported the miss and left the button hidden, the right mount
found the credential and revealed it, and pressing it derived
`button "Open Menu"` with nothing typed. `secret_sauce` and `standard_user`
both appear nowhere in the page's HTML. Then Create, then
`TARGET=vault-scratch npx playwright test --project=setup:auth` — **passed,
with no file edited by hand**, which is the dashboard's own stated aim and had
never been reachable for a Vault target. The scratch target, its stored session
and the container were all removed afterwards.

Also here, because two routes now take a connection: the address parsing, the
scheme check and the refusal of a body carrying `token`, `secretId`,
`secret_id`, `password` or `jwt` moved into one reader both call. A second
hand-written copy of that refusal is the thing that eventually diverges.

**Slice 1 shipped** on `agent/2026-08-17-vault-connection` (run 16): step 3
grows a "Your Vault" block — address, namespace, KV mount, account type and
credential root — with **Check the connection**, which resolves one path
server-side and reports the field names it holds. `describe` rather than
`read`, so it cannot return a value and no flag changes that.

The invariant held and is pinned by tests: **no field on that page holds a
secret.** The route refuses a body carrying `token`, `secretId`, `secret_id`,
`password` or `jwt` and does not echo the value back; authentication still
resolves from the environment via `resolveAuthFromEnvironment`.

The path shape now reaches the write. `credentialRoot` and `accountType` became
optional `ScaffoldOptions`, defaulted to what the scaffolder always wrote, so
what the check proves and what the profile is written with are the same two
values — and moving either withdraws a preview computed from the old ones.

**Slice 3, `ready` and the next thing here:** the connection is not persisted
anywhere. Both the check and the sign-in use what is typed into step 3, and
nothing keeps it — so a reload loses it, and the suite still needs `VAULT_ADDR`
and `VAULT_KV_MOUNT` exported by hand. The check prints the exact exports,
which is honest but is not the same as it being configured. Watching run 22's
live proof, that is now the only hand-edit left on the Vault path: everything
else the dashboard writes for you.

The open question was left to the implementer, and the preference is already
stated: keep `config/targets/` free of anything machine-specific — a Vault
address is not a property of the application under test — so a machine-local
file beside `.onboarding-draft.json` is the shape to try first, with the
environment still winning when it is set, because CI sets it and must not be
overridden by a file somebody's laptop wrote.

Small enough for one PR, and it makes the connection check worth more than the
run it happens in.

The original item follows.

Surfaced by item 4. A Vault target can never derive `signedInMarker` during
onboarding, because deriving it means signing in and signing in means a
credential this page deliberately never holds. So every Vault target ships with
a guessed marker and a hand-edit, and the dashboard's stated aim —
`setup:auth` passes unedited — is reachable only for `local` targets.

**Answered by the owner, 2026-08-17:**

> For the vault it should give the user an option to connect to its own vault
> by providing them the option to provide a url and data shape.

So: **the third option, plus the configuration surface it was missing.** Not a
password box — the page never holds a credential. The dashboard lets somebody
point the framework at *their* Vault and describe how secrets are laid out in
it, then reads the credential **server-side** for the verification only.

**Why this is safe, checked against the integration rather than assumed.** The
Vault *token* is already ambient and is never typed: `resolveAuthFromEnvironment`
(`src/integrations/vault/vault-store.ts:306`) takes a CI JWT from
`VAULT_ID_TOKEN`, an AppRole pair, or a `VAULT_TOKEN` a developer gets by
logging in with OIDC. That stays exactly where it is. The two things the owner
asked to be configurable are not secrets:

- **URL** — `VAULT_ADDR` / `VAULT_SERVER_URL` (`vault-store.ts:73`), today
  environment-only and invisible on the page.
- **Data shape** — the KV mount (`VAULT_KV_MOUNT`, default `kv`) and the path
  layout the `secrets` fixture builds,
  `<root>/<accountType>/<role>/<index>` (`src/fixtures/…:210`), whose payload
  is expected to carry `username` and `password`. `root` and `accountType` are
  already profile fields; the mount is not.

**The rule that keeps it honest: no field on this page may hold a secret.** A
URL, a mount and a path template are configuration. A token, a `secret_id` or a
password is not, and none of them gets a box.

**Scoped first slice** — this is a dashboard item, so it is the standing
priority and now the only `ready` item in the file:

1. A Vault connection section: URL, KV mount, and the path shape, with a
   **Check the connection** button that resolves one known path server-side and
   reports what it found — the same "read it, do not guess it" move step 1
   already makes for the application.
2. Only once that check passes does a Vault target get **Sign in once**. Item 4
   hid those buttons for Vault targets and that stays right until there is a
   working connection to hide them *for*.
3. When no ambient token exists, say so plainly and name the fix (`vault login`,
   or `SECRET_SOURCE=local` for a genuinely public target). Item 4's refusal
   copy is good and should be reused, not rewritten.

Watch the diff: this is bigger than anything in this file so far and should be
split. Slice 1 alone — connect and check, no sign-in change — is a whole PR.

Still open, and a judgement the implementer may take: whether the connection
settings live in the profile, in a machine-local file beside the draft, or in
the environment the dashboard already reads. Prefer whichever keeps
`config/targets/` free of anything machine-specific.

Related: changing the default source away from Vault was deliberately **not**
done in item 4. Defaulting to a local file nudges people toward putting real
credentials in one, which the conventions permit "only where they are genuinely
public". If item 12 resolves toward server-side Vault verification, the default
should stay as it is.

### 17. After Create, the page warns about a credential it just used — `done`

Observed live in run 22, at the end of the journey that had just worked. The
connection check found the credential, **Sign in once** signed in with it and
derived the marker, Create wrote the pack — and the result panel said:

> `credentials-unchecked` — Credentials could not be checked against the
> configured secret store. Run `npm run vault:check` if the source is Vault.
> Until this passes, `setup:auth` is unverified and a whole run can fail at
> sign-in.

And then, under "Next": *"Write username and password to
`qa/<name>/pools/workforce/standard/1` in Vault"* — the exact path that had
just been read from, twice, on that page.

**Shipped in run 34.** The fix turned out to be neither of the two the item
proposed — not passing a flag from the page, and not trusting what the page
claims. `src/support/secrets/resolvable.ts` **asks the store**, with the same
`describe` call the connection check makes: existence and field names, never a
value, no argument that changes that. So the panel stops assuming the worst and
finds out instead, and it is right about a target nobody checked on the page as
well as one somebody did.

It holds two distinctions the old flag could not:

- **Present is not enough.** A credential carrying `user` where the fixture
  reads `username` resolves as existing and fails at sign-in. That is the
  failure the connection check exists to catch, so losing it one screen later
  would have been strange.
- **A store that answers nothing is unchecked, not empty.** A Vault that cannot
  be reached wants "check your Vault"; a path with nothing at it wants "write
  this path". Reporting the first as the second sends somebody to write a
  credential into a Vault they cannot reach — and "could not check" is now the
  *only* thing that produces that warning, which is what it was written for.

**Proven on the real `saucedemo` profile against the real local store**: the
role resolves, and the credential diagnostics come back empty where they used
to always carry `credentials-unchecked`. With the credential root pointed at
something nothing is written under, the same code reports
`credentials-missing` naming the path — so the panel got quieter about the
thing that was fine without going quiet about the thing that is not.

The original diagnosis follows.

`diagnoseWritten` (`tools/dashboard.ts:477`) hardcodes `credentialsChecked:
false`, with a comment saying credentials are not read back. **The comment is
right and the flag is wrong.** Nothing needs re-reading: the page already knows
a check passed for this shape, and knows a sign-in with it succeeded. This is
item 14's defect one screen further on — the page contradicting what it just
did — and the same fix shape: pass what is known rather than assume the worst.

Care needed on two edges, both of which the existing invalidation already
answers: a check that passed for a *different* shape proves nothing about this
one, and a local target's credential is written by Create rather than read, so
"checked" means something different there. `setup:auth` is still the real
proof and the wording should keep saying so.

### 18. Show one step at a time, and say up front what the whole thing needs — `done`

Shipped on `agent/2026-08-17-one-step-at-a-time` (run 23). Both halves
together, because the item says neither is correct alone: a **Before you start**
panel states what the journey needs and what it reads for you, and a step that
cannot be reached yet is not on the page.

**The item's own estimate of the crowding was low, and the real number is the
finding.** Measured on the running page rather than estimated: **3888px at
1280×720 before anybody types a character**, which is 5.4 screens, and the four
gated sections were **2370px — 61% of it** — untouchable. It now opens at
1714px. The rest arrives as it is earned.

Three things worth carrying forward:

- **A rail entry for a step that is not on the page is a link to nothing.**
  Disabled both ways — `pointer-events` for the mouse, `tabindex="-1"` for the
  keyboard — because doing one of the two leaves a control broken for exactly
  the people least able to tell.
- **Hiding needs a way back, and there is exactly one.** Selecting an onboarded
  application opens steps 2 and 3 to show its settings; choosing "— New
  application —" afterwards has to put them away, or step 2 sits there holding
  a default test-id attribute for an application nothing has read. `applyDraft`
  owns both directions, which keeps it out of the paths that would withdraw a
  preview.
- **It fixed a defect nobody had recorded.** Steps 2 and 3 hold everything a
  profile can be edited to, and they stayed `inert` while **Change its
  settings** offered Save and un-disabled the inputs — so the test-id
  attribute, the roles, the secret source and the four layer checkboxes could
  not be focused or changed, and only step 1's fields were really editable.
  Confirmed live against the page as it was before the change. Selecting an
  application is now what puts them on the page.

The copy budget did its job and is the reason to keep it: the page had **18
words of headroom** and the panel needed 52, so the lede lost its second clause
and three blocks were tightened. The budget now counts the panel too, and skips
a block carrying `hidden` — the browser-assisted sign-in's explanation is shown
by pressing a button, which puts it with the disclosures rather than in the
budget. 213 of 220.

The original item follows.

**The owner's ask, and it now outranks item 12 slice 3 and item 17.** Quoted in
full under "The standing brief" above.

What is on disk today, checked rather than assumed: the onboarding page renders
all five sections plus the removal disclosure on first paint, gated with
`inert`, a "Locked" badge and a `lockhint`. The gating is honest — item 1's
scan found every hint accurate — but honesty is not the problem being reported.
The page is roughly two screens tall before anybody has typed a character, and
what a first-time operator meets is every decision they will ever have to make,
at once, most of them refusing to be touched.

**Two halves, and neither ships alone:**

1. **A preflight panel, before step 1.** What this will need, in one short
   list: a URL of a *test* deployment, the roles the suite signs in as, where
   credentials come from, and whether the service publishes an OpenAPI
   document. It is what pays for hiding the rest — somebody who can see the
   shape of the journey will accept being shown one step of it.
2. **Reveal, rather than render-and-lock.** A step that cannot be reached yet
   is not on the page. The step rail already exists and already links to each
   section; it becomes the progress indicator and the way back, which is most
   of the navigation work done.

**Watch these, all of them evidenced by an earlier run:**

- `tests/framework/page-copy.spec.ts` caps a `<p class="explain">` at 34 words
  and a whole page at 220 visible. Showing one step at a time should make that
  budget *easier*, not harder — if a draft needs the cap raised, the draft is
  the problem.
- Several dashboard tests reach a later step by clicking through earlier ones
  and would now need the reveal to have happened. That is the suite working,
  per run 6's note: rewrite them to the new guarantee rather than restoring the
  old default.
- Item 9's lesson applies directly. A reload restores the draft, so the reveal
  must restore with it — a wizard that puts somebody back at step 1 holding all
  their answers is the same defect in a new shape.
- Do **not** let this add a click to the happy path. Reveal on the action the
  operator was already taking (a successful read unlocks *and* reveals), never
  behind a "Next" button whose only job is to be pressed.

Bigger than 400 lines if taken at once. Slice it: preflight panel first, since
it stands alone and is the half that makes the other half safe.

### 21. The "Application" slot in the top bar is a label, not a switcher — `done`

Shipped on `agent/2026-08-17-application-switcher` (run 25). The slot is a
`<select>` now, the choice is held on this machine and survives a restart, and
the four page-body pickers are gone — every page reads one `TARGET_NAME` the
shell renders from the same answer the bar was rendered from.

The rules live in `src/support/ui/selection.ts`, pure and tested without a
filesystem: the environment wins, then the stored choice **if that application
still exists**, then a single onboarded application because one is not a
choice, and otherwise **none** — which is the case the old behaviour answered
with the alphabetically first application.

Worth carrying forward:

- **A `TARGET` naming something absent is reported, not fallen through.**
  Silently using a stored choice instead would hide a broken `TARGET` behind a
  page that looks fine. The bar reads "none selected · TARGET not found".
- **The refusal is visible text, not a `title`.** The first version put the
  sentence in a tooltip behind the word "fixed", which a keyboard cannot reach
  — and "none selected · fixed" explains nothing to anybody who cannot hover.
- **Deleting a picker exposed a second one deciding the same fact.** The Runs
  page disabled its button when no application was chosen, and its own poll
  re-enabled it a second later from the slot count alone. Both go through one
  `startable()` now. Found by driving it, not by the suite.
- **`.dashboard-selection.json` is gitignored** and deliberately not in
  `config/targets/`: a profile describes the application, this describes the
  person looking at one.

The original item follows.

### 21b. The original item — `done`

**The owner's ask, 2026-08-17:**

> Let's also include in the backlog to check the top right most section where it
> shows "Application" as it wasn't truly effective and sticking if you select an
> app for the other pages. Meaning, when the app is already onboarded, they
> should have an option to select it on that section so everything else follows
> that onboarded app. You can find better ways to do it or a standard way to do
> it but the goal is still seamless, intuitive and effective.

**Driven rather than read.** With `saucedemo` and `toolshop` both onboarded and
`TARGET` unset — the normal state of this repository — every page was opened
and the bar inspected:

- The top bar reads **"Application · none selected"** on all six pages, always.
  `chrome()` (`tools/dashboard.ts:945`) calls `resolveTarget()`, which throws
  when several profiles are registered and nothing has chosen between them, and
  the catch renders "none". It is a `<span>`. There is nothing to click.
- **Meanwhile the page under it has already chosen.** `/users` was showing
  saucedemo's credential locations and account list while the bar above it said
  none selected. Two answers to "which application" on one screen, forty pixels
  apart — the item 5 and item 14 family, a page allowed to disagree with
  itself.
- **The selection is duplicated four times and shared none of them.** `/users`
  has `#pick`, `/stories` `#sTarget`, `/cases` `#cTarget`, `/runs` `#rTarget`.
  `/triage` and `/publish` have no application picker at all — they pick a
  *run*. Choosing `toolshop` on `/users` and then opening `/runs` lands back on
  `saucedemo`: every page is its own document, and nothing carries.
- **The default is alphabetical, which the conventions explicitly refuse.**
  Each picker fetches `/api/targets`, fills a `<select>` and lets the browser
  select the first option (`runs-page.ts:150`). CLAUDE.md says of the CLI:
  *"alphabetical order does not get to decide which application gets tested."*
  The dashboard does exactly that, silently, and **Start a run** is one click
  away from it.

**The slot is already the right place, and the shell says so** — `topbar()` in
`src/support/ui/shell.ts:249` is commented *"The org-switcher position, for the
same reason products put one there."* It was built as the standard pattern and
then left read-only. So this is finishing it, not inventing it.

**Shape to aim for:**

1. The `.ctx` slot becomes the switcher: the onboarded applications, the
   environment beside the name, and "none selected" as a real state rather than
   a failure to resolve. It is in the shell, so every page gets it once — the
   `19` rule, applied here.
2. The choice **persists across a navigation and a restart**. Server-side is
   the better half of that: the shell is rendered by the server, so a stored
   choice makes the first paint correct with no flash, and `chrome()` can read
   it without every page re-deciding. A machine-local file beside
   `.onboarding-draft.json` is the shape to try — the same reasoning as item 12
   slice 3, and the same rule: **`TARGET` in the environment still wins**,
   because CI sets it and must not be overridden by a file a laptop wrote.
3. The four page-body pickers **go**, and their pages read the selection. That
   is the "everything else follows" half, and it is what makes the bar worth
   its space rather than a seventh copy of the same control.
4. With nothing selected, a page that needs one **says so and offers the
   switcher** rather than guessing the alphabetically first. Refusing to guess
   is what the CLI already does; the dashboard should not be the surface where
   that rule is quietly dropped.

**Ranked after 20 and before 19**, and the ordering matters: 19 rearranges
controls on these same pages, and this item deletes four of them. Doing 19
first means arranging things that are about to move.

Watch: `/triage` and `/publish` are scoped to a *run*, not to an application,
and a run already carries its target (`tools/dashboard.ts:1265`). Do not give
them an application switcher that does nothing — either filter their run lists
by the selection, or leave the slot showing the selection without acting on it,
and say which was chosen.

### 19. The same pattern on every other page — first slice `done`

Shipped on `agent/2026-08-17-lists-nobody-sized` (run 26). **Measured all six
pages at 1280×720 before touching anything**, which is what decided the slice:

| page | before | after |
|---|---|---|
| `/publish` | **7.8 screens** | **2.9** |
| `/cases` | **7.3** | **3.4** |
| `/triage` | 4.1 | unchanged |
| `/users` | 2.6 | unchanged |
| `/stories` | 1.9 | unchanged |

Only two pages had the problem, and in both it was the same cause: **a list
whose length is a property of the repository, rendered inline in full.** Not
prose, not controls — the pages' copy budgets were already fine.

`/publish` was the worse and the more interesting. `#rSkipped` rendered every
unreportable spec title joined with `"; "` into **one text node, 3660px tall**
— 192 titles as a single run-on sentence, which is unreadable because it is not
a sentence, it is a list. The count somebody acts on was its first eight words.
It is now the sentence, plus a disclosure saying *"Which 192 spec(s)"* holding
one title per line. Nothing was removed.

`/cases` is different and the difference matters: its lists **are** the page's
answer, so they are capped and scrolled rather than disclosed — and only above
six rows, so a one-row answer does not sit in a box built for forty.

The shared thing is `.longlist` in `tokens.ts`, per this item's own rule. It is
deliberately small: the Publish results list has capped itself at 24rem since it
was written, so this is that existing rule shared, not a new pattern invented.

**What is left of this item:** `/triage` at 4.1 screens is the next candidate
and was not touched — nothing there is obviously wrong, and a change with no
stated defect is the taste-only refactor the guardrails refuse. `/users`,
`/stories` and `/runs` are fine and should be left alone. Re-measure before
assuming otherwise.

The original item follows.

### 19b. The overview panel, shared — `done`

**Shipped in run 36**, and it is what this item's own note said the first slice
should be: `.preflight` and `.pf-title` into `tokens.ts`, an `overview()`
helper in `shell.ts`, and one non-wizard page given one. Not `enable` — that is
about steps, and no other page has steps.

**Publish got the overview**, because it is the page where knowing the shape
before starting is worth most: it is the one that leaves the building. The two
columns are *You bring* and *It leaves behind*, and the pairing is the rule
rather than symmetry — a list of what a page needs, with no matching list of
what it produces, reads as a warning.

Onboarding's own panel was converted to the helper rather than left beside it,
so there is one way to write one. Its markup is unchanged in the browser,
`<code>` and all.

The copy budget already counted overview words against the page total, so an
overview is paid for out of the same 220 as everything else — which is what
stops it becoming a second lede. Two more tests hold the shape: two columns,
the second saying what the page leaves behind, and a phrase per line.

The original item follows.

### 19c. The original note

"It should be applied to all sections of the UI dashboard." The other pages —
`/users`, `/runs`, `/cases`, `/stories`, `/triage`, `/publish` — are not
wizards and must not be turned into them. Progressive disclosure means
something different there: the common action visible, the configuration and the
rarely-used controls behind a disclosure that states what is inside it.

The rule that keeps this from becoming seven separate opinions: whatever item
18 settles on lives in `src/support/ui/shell.ts` and is *used* by each page.
Seven hand-rolled reveals is the outcome to avoid, and it is the likely one if
this is picked up before 18 has established the pattern.

**What 18 actually settled, now that it has shipped**, and it is less than this
item assumed. The reveal is three CSS rules and two functions — `enable` and
`relock` — and every one of them is about *steps*: a section that a previous
answer has earned. None of the other six pages has steps. What is genuinely
reusable is the **overview panel** (`.preflight`, `.pf-title`) and the copy
budget that now counts it, so the first slice here is moving those two into
`shell.ts` and giving one page an overview — not lifting `enable`.

### 20. A theme control, and the polish it makes visible — `done`

**The theme control shipped** on `agent/2026-08-17-theme-control` (run 24), and
the finding below was right: the palette was already complete and nothing ever
stamped `data-theme`. So this was lifting a control the handbook already had
into `shell.ts`, where a page gets it by being a page — all seven have it, and
none of them asked for it.

What is worth keeping from doing it:

- **Restore runs in the head, synchronously.** Do it from the body script and
  somebody who chose dark gets a white page first, which is the flash the
  choice exists to avoid. There is a test on the *ordering*, because the
  behaviour test cannot see a flash.
- **Auto is the absence of a choice, not a third value.** No key stored, no
  attribute set, the media query in charge. Storing the word `auto` would have
  made `:root:not([data-theme="light"])` mean something different from what it
  says.
- **The stylesheet is one template literal, and a backtick in a comment closes
  it.** Known for `dashboard-page.ts`; it is true of `tokens.ts` too, and it
  cost a parse error here. The comment now says so in place.
- **`tests/framework/ui-shell.spec.ts` had a guard that read the first
  `<script>` block.** The head restore is now first, so that guard had silently
  stopped covering the page's own script — the thing it was written for. It
  checks every block now. Worth remembering whenever something is added to the
  shell: a test that finds "the" anything is a test that can be moved off its
  subject without failing.
- **Three things in one bar stops fitting at about phone width.** It wraps
  below 60rem now, and what a jumped-to section has to clear grows with it.

**The palette now holds to WCAG 2.2 AA in both themes, and is held there by a
test** — asked for by the owner, 2026-08-17:

> let us try to use a palette colors that also passes WCAG checkpoint on dark
> and light modes

Kept here rather than raised as its own item, because it is exactly what this
item is about: the theme control made both themes real, and this is the polish
that became checkable once they were.

**Measured first, and the palette was mostly already right.** Text cleared
4.5:1 everywhere in both themes — the worst pair in either was 4.61. Three
things did not, and all three were the kind an eye does not catch:

| what | was | now |
|---|---|---|
| white on the dark theme's `--fail` — the destructive button | **2.94** | 5.87 |
| every input and select border, light | **1.92** | 3.31 |
| every input and select border, dark | **1.70** | 3.33 |
| `--muted` on `--fail-soft` (a disclosure inside a note) | **4.18** | 4.63 |
| the pressed theme segment, against the group around it | **1.07** | 3.31 |

The destructive button's label follows `--surface` now instead of being white,
which is the trick the primary button always used: the token is dark where
`--fail` is light and light where it is dark, so one declaration is right in
both. `--rule-strong` moved for the borders, `--muted` darkened a step in
light, and the pressed segment of the theme control carries a ring drawn as a
shadow so nothing shifts.

**Section and card borders were deliberately left soft** — 1.25:1 in light and
1.34 in dark. 1.4.11 covers what is *required to identify a component or its
state*, and the edge of a card is not that; darkening every rule in the
stylesheet to satisfy a rule that does not apply would be a repaint wearing a
standard's name. The contrast test says which borders it holds to 3:1, and why.

**`tests/dashboard/contrast.spec.ts` and `onboarding-contrast.spec.ts` are the
fourth budget**, and they compute from the rendered page rather than from a
table of tokens — a table would be a second copy of the palette, and the copy
is what goes stale.

**Hover shipped in run 33**, which is the last of the three things this item
named. `button`, `button.secondary` and `button.destructive` each answer the
pointer now, and the mix moves **toward `--ink`** — dark in light, light in
dark — so one declaration goes the expected direction in both themes with no
second block to keep in step. Not on a disabled button: that would be a promise
the control does not keep.

`tests/dashboard/controls.spec.ts` holds it, in both themes, and asserts the
half a hover state usually gets wrong — that the **label is still readable on
the hovered fill**. The contrast budget cannot see that, because it measures a
page nobody is pointing at.

**And it found a real gap in the contrast budget itself.** `color-mix()`
computes to `oklab(...)` in Chrome, and the budget parsed colours with a regex
expecting `rgb(...)` — so any element with a mixed background was skipped in
the backdrop walk and scored against whatever was further up the page. The
context bar has used a `color-mix` background since it was written. Colours are
parsed by the browser now, through a 1×1 canvas, which understands every space
it understands and hands back the sRGB the arithmetic is defined in. Re-run
after the fix, nothing new failed — but it was measuring less than it claimed.

**The status tokens were done in run 37, and the item's framing was wrong about
why.** It called this "a legibility fix with a stated benefit". Measured, the
legibility was already fine — every status colour passes the contrast budget in
both themes, and no page hardcodes one. What was actually there:

**Twelve `.badge.*` rules across five files**, each restating the same three
declarations, and the one that mixes the border had drifted to **four different
values for the same role** — 25%, 30%, 40%, and a pair that set a flat token
instead. None of it visible. The cost is that the thirteenth badge gets written
by copying whichever one was nearest, and there is no way to be right by
default.

So `.badge` in `tokens.ts` carries the recipe and a page sets `--status` and
`--status-soft` (and `--status-ink`, for the accent, whose ink is darker than
the line it is mixed from). Twelve restatements became twelve one-liners.
`tests/framework/ui-shell.spec.ts` refuses a badge rule that sets anything
else, naming the page and the property.

**The spacing scale was measured in run 37 and declined**, which closes this
item. The numbers, and they do show real inconsistency in the source:

- **38 distinct rem spacing values across 238 declarations.** Eight of them
  sit inside a single 0.4rem band — `.3`, `.35`, `.4`, `.45`, `.5`, `.55`,
  `.6`, `.7` — used 116 times between them. At a 16.5px root, `.4rem` and
  `.45rem` differ by 0.8 of a pixel.
- **25 of the 38 are off a `.25rem` grid**, accounting for 175 of the uses.

**And none of it misaligns anything.** Driven at 1280×720 on Triage and Test
users: section gaps uniform at 18px on both, every section on one left edge,
every heading on one left edge, heading-to-prose 13–14px where the 1px is font
metrics rather than spacing. The rhythm a reader actually perceives comes from
the repeated structures — `section`, `.head`, `p.explain` — and those live in
the shared stylesheet already. The 38 values are inside page-specific
components, where nothing aligns across them and nothing can.

So this is the taste-only refactor the guardrails refuse: 238 declarations
touched, every visual detail in the tool at risk, and no defect anybody meets.
A partial scale would be worse than none, because two systems is what the badge
item was about.

**What would change the answer:** an owner asking for a visual refresh. Then
the scale is the right vehicle and should be done deliberately in one pass —
not arrived at as a background refactor with no brief.

**Run 29 measured the two that were stated as one item, and they are not.**
Driven at 1280×720 against the real repository, reading the computed style of
every focusable element and every `:hover` rule in the served sheet:

- **Focus is already covered, and this half of the item is a dead end.** Every
  focusable element on the page carries `outline: 2px solid var(--accent)` from
  one rule in `tokens.ts`, and the seven that did not match `:focus-visible`
  turned out to be `display: none` inside a closed disclosure — not focusable
  at all. The ring is drawn one pixel outside the element, so on the primary
  button, whose background *is* the accent, it still reads against the surface
  behind it in both themes. Nothing to fix; recorded so nobody re-checks it.
- **Hover is a real gap, and it is `ready`.** The whole served stylesheet has
  five `:hover` rules — `.wordmark`, `nav.rail a`, `.ctx-pick`, `.theme button`
  and `details.more > summary`. **`button` has none**, in any variant, on any
  page. So the rail link answers the pointer and the button that actually
  writes the target does not, which reads as disabled. The fix is three rules
  and the mix is the interesting part: `color-mix(in srgb, var(--accent) 85%,
  var(--ink))` moves *toward the ink*, so it darkens in light and lightens in
  dark without a second block — the direction hover is expected to go in each.
  Left out of run 29 deliberately: it is a different assertion needing a
  different home, and one item per run is the rule.

**Half of this is already built, which is the useful finding.**
`src/support/ui/tokens.ts` ships the full three-state palette — a light `:root`,
a `prefers-color-scheme: dark` block guarded with `:not([data-theme="light"])`,
and a `[data-theme="dark"]` block so an explicit choice wins both ways. It is
correct, it is commented, and **nothing in the dashboard ever stamps
`data-theme`.** There is no toggle and no stored preference on any page, so the
tool follows the operating system and offers no say in it.

`docs/handbook.html` already has exactly the control that is missing: a
three-way group (`role="group"`, `aria-label="Colour theme"`) plus a
restore-before-paint script reading `localStorage.theme`, with "no attribute"
deliberately meaning auto. Lift it into the masthead in `shell.ts` so every
page gets it once. The tokens file already argues for this in its own header —
a tool that looks like a different product from its own documentation reads as
a bolt-on.

That is a small first slice with a visible payoff. The rest of "pretty" needs
to stay concrete, because the guardrails refuse taste-only refactors — so the
polish items each name what they fix:

- **Focus and hover states.** Focus is `done` and was already done before this
  was written; hover is `ready` and is the button. See the run 29 note above.
- **Vertical rhythm and width.** The measure half is `done` (run 29): six of
  the seven pages had prose running at 108 to 142 characters a line and now run
  at 76, and `page-measure.spec.ts` holds that. **The spacing scale is still
  `ready`** and still needs a stated defect before it is worth doing — nobody
  has measured it, and "feels calm" is not one.
- **The reveal wants motion** — `done`, inside item 18. A revealed section
  fades in over .3s, and the stylesheet's blanket
  `prefers-reduced-motion: reduce` rule already neuters it. What is left here
  is whether anything *else* on the page wants the same treatment.
- **Status colour is already tokenised** (`--pass`, `--fail`, `--warn` and
  their soft pairs) and is used unevenly across pages. Making that consistent
  is a legibility fix with a stated benefit, not a repaint.

Check both themes on every page before claiming this. A token defined only
inside a media block is the classic way one theme's text ends up on the other
theme's ground, and the file's own comment says so.

---

## Deleted guesses

Written from source, disproved by use. Recorded so nobody re-adds them.

- **"The `inert` gating gives no reason."** Wrong. Every gated section states
  its precondition in the section body before any interaction, and both
  statements are accurate.
- **"Failure messages may surface raw errors."** Wrong, and backwards — the
  dashboard's messages name the file, the fix and often the exact command, and
  are better than most of the framework. The remaining gap is item 1, where a
  correct message points at a locator the tool itself wrote wrongly.
- **"Long-running routes go silent."** Wrong for all three routes, not just
  two. Probe and verify report progress, and so, it turns out, does Create —
  see the next entry.
- **"The disclosure pattern may be carrying too much."** Not supported. The
  disclosures hold reasoning; the instruction is in the section body. Nothing
  needed to act was found behind one.
- **"Recoverability of a part-finished onboarding."** Half wrong — the draft
  keeps more than expected. Only the unlock-state half survives, as item 9.
- **Former item 8, "Create runs several seconds with no status line."**
  Wrong, checked directly against a running server rather than assumed.
  `$('create').onclick` has set `result.textContent = 'Writing…'` and disabled
  the button since the dashboard's very first commit (`1166f7c`,
  `src/support/onboarding/dashboard-page.ts`) — the exact "same treatment" the
  item asked for already existed. Calling `document.getElementById('create').click()`
  in the live page and reading `#result` synchronously afterwards (before the
  pending fetch resolves) showed `"Writing…"` with the button disabled, proving
  it renders. The "several seconds" half was checked too: `performance.getEntriesByType('resource')`
  timed the real `/api/create` round trip at **66–90ms**, cold, against a real
  external target (`saucedemo`) as well as a scratch one — the handler is pure
  local file I/O with no network call in it (`tools/dashboard.ts:306`,
  `diagnoseWritten`), so there is no path to a multi-second Create at all. The
  ~10s in `journey-notes.md`'s table almost certainly measured the
  observing agent's own round-trip, not the page. The probe genuinely does run
  12–18s behind a static string with no elapsed time or cancel — that half of
  the original item may still be worth doing, but it is a probe polish, not a
  "Create shows nothing" bug, and nobody has scoped it as its own item yet.

---

## Out of scope

- Load and performance testing. Refused by the conventions, and not the ask.
- Renaming or restructuring the four layers. That architecture is deliberate
  and settled; do not relitigate it.
- Anything requiring a live credential the run does not have.

### 22. Four pages have no browser test at all — `done`

Found by run 26, and it is why item 19's defects survived this long.

The `dashboard` project covers onboarding and the shell. `/users`, `/stories`,
`/cases`, `/triage` and `/publish` have **no browser test** — every reference to
them in `tests/` is the onboarding page's own `#pick`. So Publish rendering 192
spec titles as one 3660px sentence, and Cases growing to 7.3 screens, were
invisible to a green suite. Both were found by opening the pages.

Not "add tests for five pages", which is a month. The shaped first slice is a
**harness like `tests/dashboard/harness.ts`** — a real loopback socket, the real
page, a fake service behind the interface the routes already take — for the two
pages that just needed fixing. Those routes already take their data through a
service boundary (`testUsersService`, the run manager, the case report), which
is the thing that makes this cheap; the onboarding harness is the proof of the
pattern and it is 270 lines including comments.

Then the assertion worth having first, because it is the one that would have
caught both: **no page renders a block taller than N screens on realistic
data.** A height budget, in the same spirit as the copy budget in
`page-copy.spec.ts` — which exists precisely because "this is getting long" is
the judgement nobody makes on a Friday.

Ranked below item 20's remaining polish only if somebody disagrees with this:
the copy budget was worth writing, and this is the same rule for the axis that
actually broke.

**Shipped** on `agent/2026-08-17-height-budget` (run 27): `tests/dashboard/pages-harness.ts`
serves `/publish` and `/cases` over a real loopback socket with the real routes,
faking only at the service boundary the routes already take. Six tests, and the
budget is `page-height.spec.ts`.

**The size of what comes back is a parameter**, and that is the design decision
worth keeping. The defects on both pages were defects of *quantity* — fine on
three rows, unusable on two hundred — so a fixed fixture would have hidden them
exactly the way the real repository did. Confirmed by running the budget
against the pre-fix pages: **Publish 5.3 screens, Cases 30.1 screens**. Cases
was 7.3 on the real repository, which happened to hold 27 rows; the same page
on 270 is four times worse than anything anybody had seen.

Budgets are 5 screens and a 1200px tallest block, deliberately loose: this is a
tripwire for a block with no bound, not a design rule, and a tight number is one
everybody raises.

**`/triage` joined in run 28, and the budget immediately earned its keep** —
see the item below. **Still `ready` here:** `/runs`, `/users` and `/stories`
have no harness entry.

**Run 30 added `/runs` and `/users`, and the budget found a fifth unbounded
list within a minute of their joining:** Test users at **14.1 screens on 160
accounts** — roles times pool size, which the profile decides and the page has
no say in, with the two fields for setting a password below all of it. Capped
and scrolled above six rows, like the Cases lists, because this list is the
page's answer rather than a queue.

`/runs` needed one thing the other pages did not, and it is worth knowing
before touching the harness again: it is fed by an **event stream**, so it sits
outside the router the way it does in `tools/dashboard.ts`, and the fixture must
call `server.closeAllConnections()` before `close` or teardown waits sixty
seconds on a socket that is behaving correctly.

**`/stories` joined in run 35, and the claim this item made about it was
wrong.** It said `/stories` had "neither a measured defect nor an unbounded
list", on the evidence of a real repository holding a handful. Parameterised,
`#sList` renders every story ever pulled: **4870px of buttons at 120, and the
page 8.8 screens**, with the story you opened and everything about it below all
of them. Capped and scrolled above six, like the Cases lists — you scan this
list to *find* a story, so it is not a queue to show ten of.

That is now three times this has happened. **A page looks bounded on the
repository it is looked at on**, and the number that matters is the one nobody
has met yet. The `AuthoringService` fake turned out to be cheap after all —
`model()` throws, because nothing in a budget drafts a case.

All seven pages are now behind the height, measure and contrast budgets.

### 24. The Runs page grows for as long as the dashboard is open — `done`

**Shipped in run 31**, both halves, and the owner picked the lean: the manager.

`runsToForget` in `registry.ts` — pure, beside the rest of the run decisions —
forgets the oldest runs past `RETENTION.runs` when a new one starts, and never
forgets one that is still going however old it is. **The reason it is the
manager and not only the layout:** `pruneRuns` deletes a run's *directory* past
the same retention and the page reads progress out of that directory, so a run
held past the prune renders as a card with no numbers, about a run whose every
artefact has been deleted. The map should not outlive the disk.

Twenty cards is still eight screens, so the layout half followed: the newest
ten, and a button naming the rest. Item 23's pattern, now against a bound. This
page redraws off its stream twice a second, so the choice lives beside the
`expanded` flag and `showFirst` takes a callback to set it.

**Found on the way, and it is the thing worth carrying:** an element with the
`hidden` attribute stayed on screen. Any author rule setting `display` beats
the browser's own `[hidden] { display: none }`, and a Runs card is a flex
column — so ten rows were hidden and all twenty were still visible, and the
budget still read eight screens with the fix supposedly in. `tokens.ts` now
says what `hidden` means. Triage and Publish were unaffected only because
neither `.cluster` nor `.defect` sets `display`.

The original item follows.

### 24b. The original item — `done`

Measured in run 30, in the harness, at 1280x720:

| runs held | page |
|---|---|
| 12 | 5.3 screens |
| 20 | **8.0** |
| 30 | **11.5** |

Linear and unbounded, and the cause is not the layout: **nothing ever removes a
run from `RunManager`'s map.** `list()` returns every run it is holding, the map
is only ever added to (`manager.ts:159`), so the page holds a card for every run
started since the dashboard was opened — a finished run from two hours ago
weighing exactly as much as the one running now.

The height budget is armed at 12 and passes there, which is deliberate: 12 is a
defensible morning and the tripwire fires just above it. **The next run past
about 13 fails the budget**, which is what a tripwire is for.

**Two candidate treatments and they are genuinely different, so this wants a
decision rather than a reflex.** `showFirst()` from item 23 is the layout
answer, and it needs one thing the other two pages did not: `refresh()` re-runs
on every stream push, twice a second, so the "show the rest" state has to live
in a module-level flag beside `expanded` or it is reset before anybody can read
it — pass a callback into `showFirst` rather than writing a second copy of it.
The other answer is that this is a **data-lifetime** question and belongs in the
manager: drop or fold finished runs after N. That fixes the cause; the layout
one fixes the symptom.

**What weakens the layout framing, and is the reason this is not already done:**
`#runs` is the last block on the page. Item 23's argument was "what a long page
costs is the sections after it", and here there are none — the newest run is at
the top, which is the one you are watching. So the cost is real but smaller than
on Triage and Publish, and the fix should be argued rather than assumed.

### 23. Two more unbounded queues, found by the budget — `done`

Run 28, on `agent/2026-08-17-queues`. Not a new idea, and that is the point:
**the budget found them, nobody looked.**

Adding `/triage` to the harness reported **22.0 screens on 60 clusters**, and
setting the harness's failure count on `/publish` — which the first budget test
had never done — reported **12.7 screens**, with the whole Jira section sitting
below 7605px of defect cards. Both are the item 19 defect a third and fourth
time.

Fixed with one shared `showFirst()` in the shell script: the first ten, and a
button naming how many remain. A queue is not capped and scrolled the way the
Cases lists are — you read one, act on it, and move on, and doing that inside a
24rem box is worse than a long page.

**The invariant that decided how it is built**, and it is worth carrying:
`showFirst` renders everything and hides the overflow, rather than leaving the
rest unrendered. Publish decides what to file by reading the checkbox of every
defect in the preview, so an unrendered row would **throw on send**, and a row
rendered but never scrolled to still carries the recommendation the preview
computed. *What gets filed must not depend on how far somebody scrolled.*
Triage has no such sweep — each verdict is recorded from its own row — but one
pattern that is safe everywhere beats two that need the difference remembered.

Also corrected here: the tallest-block budget was punishing legitimate content.
A section holding ten work items is fine; the thing being hunted is one block
with no bound. It excludes sections, and is stated in screens (4.5) rather than
pixels, because that is the unit the complaint is in.

### 25. The bar wrapped as a row, but not the two things inside it — `done`

Found and shipped in run 38, a scan run, by driving the dashboard at a real
phone width rather than only the 560px "narrow windows" width the existing
tests use. Every other scan of the theme control and the application switcher
(items 20, 21) was done at 1280px or at 560px; nobody had resized to 375px
since item 21 added a second control into the same box item 20 had already
filled.

**Measured before touching anything.** At 375×812, `document.documentElement`
had a `scrollWidth` of 427–428px against a `clientWidth` of 375 — the whole
page scrolled horizontally, on every page, because the shell's top bar is
shared. The cause: `.topbar-end` (`src/support/ui/tokens.ts`) holds the
application switcher (`.ctx`, 270px) and the theme control (`.theme`, 122px)
as two flex items with `gap: 1rem` and **no `flex-wrap` of its own**. The
`@media (max-width: 60rem)` block added in run 24 wraps `.topbar` itself, but
that only moves `.topbar-end` onto its own row — it does not let the two
things inside that row drop onto separate lines, so at a width narrower than
their combined 408px they overflowed the viewport instead.

**Fixed with one rule in the same media query**: `.topbar-end { flex-wrap:
wrap; justify-content: flex-end; row-gap: .4rem; }`. Confirmed live,
before/after: `scrollWidth` 428px → 375px at 375px width, on `/onboard` and
on `/runs`; the switcher and the theme control stack without overlapping
(`.theme`'s top edge at or below `.ctx`'s bottom edge); and desktop width
(1280px) and the 60rem breakpoint itself (960px) are both unaffected — the
two controls stay on one line there, exactly as before.

Two tests added to `tests/dashboard/shell-navigation.spec.ts`'s existing
"narrow windows" block, at 375px rather than the block's existing 560px:
**no horizontal overflow**, and **the switcher and the theme control do not
occupy the same row without also not overlapping**. Seen red first — stashed
the CSS fix and confirmed the second test fails against the old rule
(`theme.y` short of `ctx.y + ctx.height` by 37px in the test's synthetic
fixture); the first test happened to pass on that same fixture, because its
`.ctx` renders shorter static text there than the real `<select>` does on a
live page — recorded so the next run does not read that pass as the bug not
existing.

**Verify:** `npm run verify` passes, exit 0 — 903 tests (2 more than run 37's
901).

**Also checked, and declined:** `/triage` currently lists a two-year-old
unresolved cluster, *"Tearing down 'dashboard' exceeded the test timeout of
60000ms"*, from a toolshop run dated 2026-08-16 16:22 — before run 19's poll-
race fix and run 30's `closeAllConnections()` fix, both landed 2026-08-17.
`grep -rn "Tearing down"` across `src/`, `tests/` and `tools/` finds nothing —
it is Playwright's own fixture-teardown message, not framework text. This
run's own `npm run verify` (903 tests, including the `dashboard` project)
completed in 58 seconds with no teardown timeout anywhere. Likely already
fixed by one of those two runs and simply never re-triaged; left as `unclassified`-worthy
rather than reopened as an item, since nothing here reproduces it and chasing
a two-day-old single sample would be exactly the "three singletons" mistake
item 13 already corrected once. If it recurs on a fresh run, that is the
moment to act on it, not this one.

### 26. The clustering signature spent its window on a blank line and an echo — `done`

Found and shipped in run 39, a scan run, by opening `/triage` and reading a
cluster rather than reading the clustering code. The toolshop run from
2026-08-16 rendered its signature as the same sentence twice:

> `Error: the listing never changed after the search. A term that returns
> exactly as many products as were already on screen would look like this. the
> listing never changed after the search. A term that returns exactly as many
> products as were already on screen would look like this. :: Search the
> catalogue for "pliers" :: w0`

**The cause is `expect.poll`, and that is what makes it worth fixing.**
`normaliseError` (`src/support/triage/cluster.ts`) took
`.split('\n').slice(0, 3)` — blank lines counted toward the three. Playwright
renders `expect.poll(fn, { message })` as `Error: message`, a blank, `message`,
a blank, then the matcher, so all three slots went to the message and its own
echo and the signature never reached what was asserted. **`expect.poll` is the
primitive the conventions mandate for eventual consistency** ("the only
acceptable answer"), so the required style produced the least informative
signature in the suite. `expect(value, message)` prints the message once and
was never affected — checked both forms against real runs rather than assumed.

Fixed by dropping blanks and an immediately-repeated line *before* taking
three, so the three are three lines of content. The count stayed at 3
deliberately: the number of lines feeding run-to-run variance is unchanged, and
only their informativeness moves.

**Measured on the real runs on disk, before and after:**

| cluster | before | after |
|---|---|---|
| toolshop search (`expect.poll`) | **323 chars, the message twice, no matcher** | 255, once, plus `expect(received).toBe(expected) … Expected: true` |
| toolshop a11y | 134 | 151 — gains `+ Received + <n>` |
| teardown timeout | 90 | **90, byte-identical** |
| fixture TF-5901, TF-5904 | — | **byte-identical** |

A single-line message is untouched, which is what says this is not churn.

**Agreement was re-measured, not assumed:** `npm run triage:measure` reports
**1 agreed · 0 contradicted · 3 declined**, unchanged from run 13. The rules
read the whole `message + stack` via `errorText`, never the signature, so a
richer signature cannot move them — now checked rather than reasoned about.

**The cheapest possible moment to change this**, and worth stating because it
will not be true again: cluster ids are a sha256 of the signature, so changing
it re-keys every cluster. `config/triage-verdicts.jsonl` does not exist yet —
no human verdict has ever been recorded — so nothing was orphaned.
`HumanVerdict.signature` exists for exactly this day and its comment says so;
once verdicts accumulate, a change here costs a migration.

**Watch:** the third new test is the counterweight and is the one to keep. A
strict-mode violation *is* a stack of near-identical rows, so the dedup
compares a line only against the one before it. Collapsing any lookalike would
merge two locators into one signature.

### 27. Two `@smoke` cart specs picked a product they were not allowed to buy — `done`

Found and shipped in run 39b, by **running the live suite** rather than the
framework's own — which, checked against the log, this loop had never done in
39 runs. `npm run verify` covers `framework` and `dashboard`; the 13 toolshop
specs and 1 saucedemo spec against the real applications had not been run since
run 11, and `/triage` had been showing their failures for two days.

**Both cart specs took `[first]` from the shared listing and assumed it could
be added to a cart.** Toolshop's stock is shared mutable state on a demo
everybody uses — anybody in the world can buy the last pair of Combination
Pliers — and an out-of-stock product renders `add-to-cart`, `quantity`,
`increase-quantity` and `decrease-quantity` **disabled**. So the spec died as a
15-second timeout on a disabled button, which reads as a broken cart and is the
catalogue telling the truth.

Measured live at the time of the fix: **two of the nine products on page one
were out of stock**, and the first of the nine was one of them — so this was
deterministic, not a flake, once the catalogue drifted into that state. It
passed on the first full run of the day and failed on the second; nothing in
the repository changed in between.

**This is the conventions' own rule** — *never assert on data the spec did not
create* — and the same lesson `actions/cart.ts` already records one level down:
a vocabulary must be able to express every state the application has. The
catalogue could describe a product but not whether it could be bought.

Fixed by teaching L1 the state and letting the spec ask: `cardLinks`,
`inStockCards` (composed as a `hasNot` filter, so it auto-waits rather than
being sifted with `count()`), `outOfStock`, and an
`addableProductNames` action. Both specs now assert the precondition with a
message rather than dying on `undefined`.

**And it exposed a latent locator defect, which is the more valuable half.**
`card(page, name)` used `filter({ hasText: name })` — a **substring** match —
and this catalogue is full of names that contain one another: "Pliers" is
inside "Combination Pliers", "Long Nose Pliers" and "Slip Joint Pliers";
"Hammer" is inside four more. Asking for "Pliers" and taking `.first()` opened
**"Combination Pliers"**. It had been invisible because the spec always asked
for whatever was already first, so the wrong answer and the right one were the
same element. The moment a spec chose by *stock* instead of by *position*, the
two came apart. Now anchored with `exactly()`.

**Seen red then green, deterministically**, both in isolation with no load
needed: unfixed → both specs fail on the disabled button; selection fixed only
→ TOOL-3-01 fails with `Expected "Pliers", Received " Combination Pliers "`,
which is the substring bug caught in the act; both fixed → 13/13 toolshop and
2/2 saucedemo pass live.

### 28. `cartLocators.line` has the same substring trap — `ready`

Found by grep while fixing item 27, **not observed failing**, and deliberately
not folded into that diff — the norm this file has followed since run 17.

`src/targets/toolshop/locators/cart.ts:27` is
`lines(page).filter({ hasText: product })`, the same substring match item 27
just anchored in `catalogue.ts`. It is currently **unreachable**: both cart
specs add exactly one product, so no cart ever holds two lines whose names
nest.

**Why it is still worth doing.** `cart.empty()` removes line by line *by name*,
and every cart spec calls it in a `finally` against a **shared, static account**
with `serverState: true`. The first spec that adds two products whose names nest
— "Pliers" and "Combination Pliers" are both on page one — gets a `remove` that
matches two rows, and then hands every later spec on that worker a dirty cart.
The failure lands on whichever spec lost the race, which is the exact shape the
profile's own comment warns about.

`exactly()` lives in `locators/catalogue.ts` today. Two call sites is the second
caller that justifies sharing it — a small `locators/text.ts` in the toolshop
pack, not framework surface, since no other target has names that nest
(checked: saucedemo's six do not).

Also here, and lower value: `saucedemo/locators/inventory.ts:17` has the same
shape. Its six product names do not nest, so it is correct today by luck rather
than by construction.

### 29. The live suites are not part of any loop — `ready`

The finding underneath item 27, and worth more than it.

`npm run verify` runs `framework` and `dashboard`. **It does not run a single
spec against a real application**, by design — those need network and
credentials. The consequence nobody had written down: in 39 runs this loop has
never executed the specs it exists to keep bulletproof, and item 27's two
failures sat on `/triage` from 2026-08-16 until 2026-08-18 with the log
recording green verifies throughout.

`triage:measure` has the same shape and does run live — but only against the
`triage-fixture` project, whose specs are *meant* to fail. So the one live thing
the loop does is the one that proves nothing about the real suite.

**Shape to aim for**, and it is a decision rather than a patch: a run should
execute the live suites for every onboarded target and record pass/fail in its
log entry, the way it already records `triage:measure`. That is roughly 45
seconds for toolshop and 6 for saucedemo. The open question is what a run does
when a live failure is the application's fault rather than the suite's — which
is what `/triage` is for, and is an argument for the run *triaging* its own
result rather than just reporting a number.

Ranked below the dashboard work as usual, but this is the item that decides
whether "until it is bulletproof" is measured or asserted.

### 30. More workers than accounts, on a target that keeps state on the server — `ready`

**Measured in run 39c, and it corrects run 39b's claim** that the toolshop live
suite passes 13/13. It does — at three workers. At the local default it passes
about one run in four.

| workers | live toolshop runs |
|---|---|
| 7 (local default, 16 CPUs) | **1 passed / 3 failed** |
| 3 (= the customer pool) | **3 passed / 0 failed** |

**The framework already predicts this in its own words.** `accountForWorker`
(`src/support/paths.ts`) is commented *"two workers only collide when there are
more workers than accounts"*, and toolshop declares `poolSize: { customer: 3 }`
with `serverState: true`. Playwright's local default is CPU/2 — seven here — so
workers 0, 3 and 6 sign in as the same customer at the same time.

**The failures were never the same twice**, which is what makes this expensive
to diagnose from a log and easy from a number:

- `setup:auth` — *"Sign-in for role 'customer' (account 1) did not establish a
  session. The form reported no error"*
- `TOOL-2-03` — signed in, and `isSignedIn` never became true
- `TOOL-3-01` — the cart row for "Pliers" would not detach after a remove

Three different specs, three different stories, one cause. This is exactly the
shape the conventions describe: *"the failures do not look like contention —
they look like a 409 from an endpoint, or a cart with one item too many,
landing on whichever spec lost the race."*

**Why this is not a one-line patch, and wants a decision.** The obvious fix is
to cap workers at the pool size, and the obvious implementation is wrong:

- **Which role's pool binds?** The minimum across all roles caps toolshop at
  **1**, because it has a single admin — and the profile says plainly that
  nothing writes as the admin. The right answer is probably the pool of
  `roles[0]`, the identity `authedPage` uses, but that is a claim about how
  specs share identities rather than a fact the profile states.
- **saucedemo would be capped to 1.** It declares `serverState: true` and no
  pool, so the rule serialises it. Correct by the rule and free today (it has
  one spec), but it shows the rule is blunt.
- **CI is capped at 4 and is also above 3.** So this is not a local-only
  artefact, and the change would slow every target's CI run whether or not it
  needed it.

A capability-shaped `workerCeiling(roles, poolSize, serverState)` beside
`accountForWorker` is the shape to try, pure and testable without a browser.
Whether it binds on `roles[0]` or on something the profile should state
explicitly is the decision this item is waiting on.

**Do not fix this by raising the pool.** Three real customer accounts on a
shared public demo is what the vendor publishes; inventing a fourth is not
available.
