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

**The owner answered both open questions on 2026-08-17**, so item 12 is
unblocked and is now **the only `ready` item** — connect to your own Vault by
URL and data shape, then verify a sign-in with it, server-side, with no secret
ever on the page. The other answer defines what "continuously" means for item
11: this loop measures triage agreement and records it per run, rather than a
CI job. Item 13 is the one thing still needing input a run cannot generate
alone.

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

### 13. The dashboard suite has load-sensitive tests — `hypothesis`

Two different specs have each failed **once** inside a full `npm run verify` and
then passed every repeat afterwards, including 6–8 repeats each and several
further full runs:

- `onboarding-journeys.spec.ts` › "a slow save landing late" (run 5)
- `step4-credentials.spec.ts` › "the marker it derived is what gets written"
  (run 6)

`verify` runs the framework and dashboard projects together, so there is more
contention than either project alone. Both specs involve a request in flight and
an assertion about what the page did with it.

Before treating this as real, get the evidence the repository already knows how
to collect: this is precisely what `flakeCandidates`, `FLAKE_MINIMUM_RUNS` and
the quarantine machinery in `src/support/quarantine.ts` exist for, and neither
observation has been through it. **Two singletons are not a flake rate.** Do not
change a timeout on the strength of this note.

If it recurs: quarantine is the mechanism, not a hand-tuned wait.

### 12. Connect to your own Vault, then verify a sign-in with it — `ready`

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
