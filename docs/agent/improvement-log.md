# Improvement log

Append-only. One entry per run — scheduled or asked for by hand — newest at the
bottom. `backlog.md` says under "How a run starts" where the schedule lives.

This is the agent's memory. A fresh session reads it to find out what has
already been tried — including what was tried and **abandoned**, which is the
part that stops the loop from cycling. An entry recording "investigated X,
concluded it is fine, here is why" is as valuable as one recording a change.

## Entry format

```
## <ISO date> · run N · <one-line summary>

**Picked:** backlog item #N, or "scan only".
**Did:** what changed, in one paragraph a reviewer can check against the diff.
**Verify:** the result of `npm run verify`.
**PR:** #NNN, or "none — scan only".
**Learned:** anything the next run should know. Dead ends belong here.
**Next:** what the agent would pick up next, and why.
```

## Rules

- Never rewrite or delete a previous entry. Correct one by adding a new entry
  that says what the earlier one got wrong.
- If a run ends without opening a PR, it still writes an entry saying why.
  A silent run is indistinguishable from a broken schedule.
- If three consecutive runs fail to land anything, say so plainly in the entry
  and mark the blocking item `blocked`. Do not keep retrying the same approach.

---

## 2026-08-16 · run 0 · Loop established

**Picked:** n/a — setup.
**Did:** Created `docs/agent/backlog.md` and this log so that a scheduled agent
running every five hours accumulates knowledge instead of restarting from zero
each time. Seeded the backlog with six items, all `hypothesis`, drawn from a
structural read of `src/support/onboarding/dashboard-page.ts` and
`src/support/onboarding/dashboard.ts` — not from using the dashboard.
**Verify:** not run — documentation only.
**PR:** none — committed alongside setup.
**Learned:** Nothing in the backlog is evidenced yet. Item 1 exists precisely
because the other five are guesses made from source code, and guesses about UX
made from source code are usually wrong in the details that matter.
**Next:** Item 1. Drive the onboarding wizard as a first-time user and write
`docs/agent/journey-notes.md`. Everything else waits on that.

## 2026-08-16 · run 1 · Drove the onboarding wizard; half the backlog was wrong

**Picked:** backlog item 1 — map the onboarding journey.
**Did:** Ran `npm run onboard` and onboarded a real application (saucedemo,
`https://www.saucedemo.com`) end to end, twice — once in the order a first-time
user takes it, once deliberately re-ordered to isolate the marker-derivation
trap. Recorded every step, field, wait and dead end in
`docs/agent/journey-notes.md`, then rewrote `backlog.md` against it: eleven
ranked items, nine of them `ready` and observed rather than inferred, plus a
"Deleted guesses" section recording the five that use disproved. Removed the
scratch target with the dashboard's own remove flow and restored the repo.
**Verify:** `npm run verify` passes — 733 tests.
**PR:** see branch `agent/2026-08-16-journey-notes`.
**Learned:**

- **The backlog's own warning was right.** Three of the six seeded items were
  wrong, and one was backwards: the dashboard's failure messages are *better*
  than most of the framework, naming the file, the fix and often the exact
  command. Item 4 assumed the opposite. Reading `dashboard-page.ts` produced
  confident, wrong conclusions, exactly as the conventions predict.
- **The headline is not a UX problem, it is a bug.** `proposeSignedInMarker`
  never checks that the marker it derives is *unique* in the after-snapshot. On
  saucedemo it proposed `link "Sauce Labs Backpack"`, which matches the product
  image link and the product title link, so `setup:auth` dies on a strict-mode
  violation. `npm run onboard` does not deliver its stated aim —
  "`setup:auth` passes with no file edited by hand" — on a mainstream demo
  application. That is now item 1.
- **Order of operations is load-bearing and invisible.** Verify → Create writes
  the derived marker into the pack. Create → Verify reports the same marker and
  writes nothing, leaving the guess *and* a generated comment claiming
  verification was skipped. Both paths were run; the difference is real.
- **Dead end worth recording:** the offboarding flow needs nothing. It names
  every file, flags what git cannot restore, warns about the credential entries
  and refuses to act until the target's own name is typed. Do not spend a run
  on it.
- Method note: the screenshot tool was unavailable, so the journey was driven
  through the accessibility tree and the DOM. That was a better fit anyway —
  it is what `getByRole` reads.

**Next:** Item 1, the uniqueness check. It is the only item that makes the tool
fail at its stated job, it is pure and unit-testable from a pair of snapshot
strings, and it needs no target. Items 2–4 are the ordering trap and its
signposting and should follow as one or two small PRs. Items 10 and 11 came
from the owner mid-run and are `hypothesis` pending one decision from them —
recorded in the item.

## 2026-08-16 · run 2 · The marker that could not resolve

**Picked:** backlog item 1 — uniqueness of the derived signed-in marker.
**Did:** `proposeSignedInMarker` now counts how many controls each `role|name`
matches in the after-snapshot and sorts unique candidates ahead of duplicated
ones, *before* the existing quality ranking. When every candidate is duplicated
the best one is still returned, carrying a new optional `ambiguous: true`, and
three surfaces say so: `verifySignIn`'s detail, the dashboard's assisted sign-in
panel, and the generated `locators/sign-in.ts` provenance comment. The flag is
carried through `dashboard.ts`'s create payload and `isMarker` guard, or it
would have been dropped between the page and the file. Four framework tests
added, built from snapshot-string pairs. Also removed the duplicated
"Signed in." — the page prints its own badge and the detail repeated it.
**Verify:** `npm run verify` passes — 736 tests. Diff 150 lines across 5 files.
**PR:** branch `agent/2026-08-16-marker-uniqueness`.
**Learned:**

- **The duplication was not the whole bug; the ranking was.** "Sauce Labs
  Backpack" is three capitalised words with no interface vocabulary, so
  `looksLikeAPersonsName` read it as an account menu and ranked it at 1 —
  *above* the `button "Open Menu"` sitting at 2 that appears exactly once and
  only when signed in. A uniqueness check alone would have fixed saucedemo; the
  reason it is sorted ahead of the quality ranking rather than folded into it is
  that a duplicated name cannot resolve at all, so no quality judgement can
  outrank it.
- **Making `ambiguous` optional kept the diff small.** `toEqual` ignores
  undefined properties, so every existing assertion against the three-field
  marker passed unchanged. A required field would have touched a dozen call
  sites for no benefit.
- **Proven end to end, not just in tests.** Re-onboarded saucedemo through the
  dashboard: the page now reports `button "Open Menu"`, the pack is written with
  it, and **`setup:auth` passes** — the aim `npm run onboard` states in its own
  banner, met on this application for the first time. The scratch target was
  removed again afterwards.
- Owner answered the item 10 decision mid-run: **keep two unlike targets.** Item
  10 is now `ready` with a scoped first PR; item 11 still waits on it landing.

**Next:** Item 2 — verifying after Create derives the right marker and throws it
away. It is the other half of the same story as item 1 and now the highest
`ready` item. Items 3 and 4 are its signposting and may fold into the same PR if
the diff stays small; item 10 is a good standalone after that.

## 2026-08-16 · run 3 · Correcting run 0: there was no schedule

**Picked:** n/a — a correction, per the rule that an earlier entry is fixed by a
later one rather than edited.

**Correcting:** run 0 said the files were created *"so that a scheduled agent
running every five hours accumulates knowledge instead of restarting from zero
each time."* That described an intention, not a fact. Nothing fired this loop.
Checked at the time of writing: no Claude Code scheduled task, no cron job, no
hook in `~/.claude/settings.json`, no project `settings.json` at all, nothing
relevant in Windows Task Scheduler, and the single file in `.github/workflows/`
is `copilot-setup-steps.yml`, triggered by `workflow_dispatch`/`push`/
`pull_request` with no `schedule:` anywhere. Runs 1 and 2 happened because the
owner asked for them in a session.

**Did:** Created the local scheduled task
`playwright-framework-improvement-loop`, every five hours, holding a
self-contained version of the working agreement. Documented in `backlog.md`
under "How a run starts" where the trigger actually lives, since it is
machine-local and deliberately not in this repository.

**Verify:** not run — documentation and machine-local configuration only.
**PR:** folded into the branch carrying this entry.

**Learned:** The scaffolding for a loop and the loop itself are different
things, and writing the former makes the latter easy to assume. Worth checking
rather than inferring: the owner went looking for the trigger in their config
and could not find it, because it was never there. A schedule is now real, but
it fires only while the app is running — "every five hours whenever I am at my
desk", not a guarantee, and the log is how a missed run stays visible.

**Next:** Item 2 — verifying after Create derives the right marker and throws it
away. Unchanged by this entry.

## 2026-08-16 · run 4 · Both ends of the ordering trap

**Picked:** backlog item 2, and item 3 folded in — they are one trap seen from
either end, and separating them would have shipped half a fix.

**Did:** The page now tracks whether step 5 has written the pack. A sign-in
verified *after* the write says plainly that nothing was written, names
`src/targets/<name>/locators/sign-in.ts`, and prints the exact replacement
`signedInMarker` line to paste, followed by the `setup:auth` command to prove
it. Both sign-in paths carry it — the headless "Sign in once" and the assisted
browser — through one shared helper. From the other end, step 5's preview now
warns *before* writing that no sign-in has been verified and the marker will be
a guess, and step 4 no longer calls signing in "optional, and worth it". Three
dashboard tests added, including one asserting the warning stays **off** the
path that works.

**Verify:** `npm run verify` passes — 739 tests. Diff 122 lines across 3 files.
**PR:** branch `agent/2026-08-16-ordering-trap`; `main` fast-forwarded and
pushed per the standing instruction.

**Learned:**

- **No step was added, on purpose.** The obvious fix is a confirmation before
  Create — "you have not signed in, are you sure?" — and that is exactly the
  net loss the brief warns about. The cure for a wizard nobody reads is not
  another click. Both warnings land on screens the user is already looking at.
- **Not writing the marker post-hoc was the right call.** A button that edits an
  already-written file would break "nothing is ever overwritten", which is the
  rule that makes onboarding safe to re-run. Printing the exact edit costs the
  user one paste and keeps the guarantee.
- **The advice was checked, not assumed.** Pasted the page's suggested line into
  the file verbatim and ran `setup:auth`: it passes. An error message naming a
  fix that does not work is worse than one that says nothing.
- **`tests/framework/page-copy.spec.ts` caps an explain block at 34 words** and
  a page at 220 visible. The first draft of the step 4 copy was 59 words and the
  suite refused it — a real convention catching a real regression, and worth
  knowing before writing page copy rather than after.

**Next:** Item 4 (the Vault default routing a first-time user into a step that
cannot complete) or item 5 (the stale preview writing 7 files after promising
6). Item 5 is the more serious of the two — it is the page showing one thing and
doing another — so take that unless something louder appears. Item 10, the
second committed target, is a good standalone after those.

## 2026-08-16 · run 5 · The plan that disagreed with the form

**Picked:** backlog item 5 — the stale preview.

**Did:** The preview now records a fingerprint of the settings it was computed
from, and a delegated `input`/`change` listener withdraws the plan the moment
anything that would change the file list moves: the list is replaced by a note
naming the button that fixes it, and Create is disabled until a fresh preview.
Recomputing live was rejected — it is a server call per keystroke — and
invalidation says the true thing anyway, which is that nobody knows what would
be written yet.

The fingerprint covers name, roles, secret source, layers, services and whether
a contract document was found. Not the whole of `options()`: the marker and the
gauntlet move when somebody signs in and neither changes which files get
written, so a broader fingerprint would nag about a preview that is still
entirely accurate. That is pinned by its own test.

**Verify:** `npm run verify` passes — 742 tests. Diff 125 lines across 2 files.
**PR:** branch `agent/2026-08-16-stale-preview`; `main` fast-forwarded and
pushed.

**Learned:**

- **Verified against the running dashboard, with the sequence that caused it:**
  preview says 6, tick the accessibility layer, the plan is withdrawn, preview
  again says **7** and lists the a11y spec. Before this, the same clicks wrote
  seven files after promising six.
- **A flake exists and it is not this change.** `onboarding-journeys.spec.ts`
  › "a slow save landing late" failed once inside a full `npm run verify`, then
  passed 6/6 with the change applied, 6/6 with it stashed, and in two further
  full runs. It holds a route open and races a reload, so it is timing-sensitive
  under the heavier parallel load `verify` creates. Recorded rather than fixed —
  next run should not mistake it for a regression it caused. If it recurs, the
  repository's own quarantine machinery is the right home for it.
- **Test-ordering matters in these specs and cost a cycle.** `readyToWrite`
  previews immediately, so selecting a secret source afterwards re-renders the
  credential fields and empties them. `readyForCredentials` in the step 4 spec
  sets the source *before* its only preview, which is why it works. Copy that
  order rather than composing the two helpers.

**Next:** Item 4 (the Vault default routing a first-timer into a step that
cannot complete) is the last of the onboarding-trap cluster, and small. After
that item 6 (the picker opening on an application you already have) is a
one-line default with the largest visible effect of anything left, and item 10
— the second committed target — is the standalone that keeps agnosticism
honest.

## 2026-08-16 · run 6 · A button with nothing to send

**Picked:** backlog item 4 — the Vault default routing a first-timer into a step
that cannot complete.

**Did:** A Vault target no longer renders the two sign-in buttons. The reason
arrives in the section body before any click, and names what to do instead:
derive the marker from `npm run explore` and correct `locators/sign-in.ts`.
Step 5's "this will be a guess" warning now branches, because telling a Vault
operator to press a step 4 button the page does not show them is worse than
saying nothing. Switching the source clears the refusal it no longer describes.
The buttons are left alone while an assisted sign-in is open, or hiding them
would take the Cancel with them and orphan a headed browser.

The server-side refusal is kept and still tested, now on the "the page and the
server disagree" pattern step 5 already uses — the page hiding a control is not
a reason for the server to stop checking.

**Verify:** `npm run verify` passes — 745 tests. Diff 97 lines across 3 files.
**PR:** branch `agent/2026-08-16-vault-dead-end`; `main` fast-forwarded and
pushed.

**Learned:**

- **The obvious half of item 4 was the wrong half.** The item proposed
  defaulting to local when Vault is unresolvable. Deliberately not done:
  defaulting to a local file nudges people toward putting real credentials in
  one, which the conventions permit only where they are genuinely public. The
  dead end was the unusable button, not the default, and removing the button
  fixes it without that nudge.
- **Item 4 surfaced a real product gap, now item 12 and `blocked`.** A Vault
  target can never derive `signedInMarker` at onboarding, because deriving it
  means signing in and signing in means a credential this page never holds. So
  the stated aim is reachable only for `local` targets. Three options are
  written up; the third — reading from the configured Vault server-side, so
  nothing is typed and nothing reaches the browser — may be the right one, and
  none should be built without an answer.
- **My own two test failures were the useful part of the run.** Both existing
  tests that broke were asserting the old, worse behaviour: one clicked a button
  that is now hidden, the other asserted wording that is now conditional. Worth
  noticing rather than patching around — a test that fails because the product
  got better should be rewritten to the new guarantee, and the "server still
  refuses" half kept as its own backstop.

**Next:** Item 6 — the picker opening on an application you already have. It is
close to a one-line default and has the largest visible effect of anything left,
because it is the first thing every returning user sees. Then item 7 (the
preview's output two sections from its button) and item 9 (a reload throwing
away the unlock state but not the answers). Item 10, the second committed
target, is the standalone that keeps agnosticism honest, and item 12 needs the
owner.

## 2026-08-16 · run 7 · Open on the thing the command is named after

**Picked:** backlog item 6 — the picker opening on an application you already
have.

**Did:** The picker falls back to "— New application —" rather than the most
recently onboarded profile. The keep-the-selection path is untouched: saving an
edit still lands on the application that was saved, which is why the fallback
existed in the first place.

**Verify:** `npm run verify` passes — 746 tests. Diff 41 lines across 2 files.
**PR:** branch `agent/2026-08-16-open-on-new`; `main` fast-forwarded and pushed.

**Learned:**

- **One line of behaviour, eight failing tests.** Seven were *relying* on the
  auto-selection rather than asserting it — they clicked "Change its settings"
  on whatever happened to be picked. They now say which application they mean,
  which is better tests as well as a working suite. Only one actually asserted
  the old default, and it was rewritten to the new guarantee. Worth expecting
  this shape of churn from any default change here.
- **Backticks inside the page script are a parse error, not a typo.** The whole
  browser script is a template literal in a `.ts` file, so a comment mentioning
  \`npm run onboard\` in backticks closes it. Cost one lint cycle; escape them.
- **Verified live:** with `toolshop` on disk, `npm run onboard` now opens with
  the picker empty, step 1 editable and the probe button enabled, and toolshop
  one selection away.
- **A second load-sensitive test appeared**, filed as item 13 with the first.
  Both passed every repeat afterwards. Recorded rather than acted on: two
  singletons are not a flake rate, and this repository already has quarantine
  machinery that exists to answer exactly this question with evidence.

**Next:** Item 7 (the preview's output two sections from its button) and item 9
(a reload discarding the unlock state but not the answers) are the last two
onboarding-UX items, both small. Item 10 — commit a second, deliberately unlike
target — is the standalone that keeps agnosticism honest and is now the most
valuable thing left. Item 12 needs the owner's decision and blocks nothing else.

## 2026-08-17 · run 8 · A section that said nothing about its own button

**Picked:** backlog item 7 — the preview's output landing two sections from
its button, with step 3's badge never moving off "Needs your input".

**Did:** Step 3 now carries its own `.status` line under the preview button:
on success it reports the file count and points down at "Write it"; the
section's badge flips from "Needs your input" (accent) to "Previewed"
(pass-green) at the same moment. Both reset — badge and status line — the
instant `markPlanStale()` fires, so they can never say "done" while step 5 is
showing the "the shape changed, preview again" notice item 5 put there. A
conflict or a thrown error leaves the badge on "Needs your input" and puts the
same message in both places, since the user still has something to do. The
full file list was left in step 5 rather than moved — summarising in step 3
was the smaller of the two remedies the item named, and the step rail already
offers a way down to the rest.

**Verify:** `npm run verify` passes — 749 tests. Diff 76 lines across 2 files
(`src/support/onboarding/dashboard-page.ts`,
`tests/dashboard/step3-the-shape-of-the-pack.spec.ts`).

**PR:** branch `agent/2026-08-17-preview-summary`; `main` fast-forwarded and
pushed per the standing instruction.

**Learned:**

- **Reusing the existing invalidation hook was the whole trick.** `markPlanStale()`
  already fires on every input/change event once a plan exists, because item 5
  built it to withdraw the file list in step 5. Resetting the step 3 badge and
  status from inside that same function means there is exactly one place that
  decides "the plan is stale" rather than two listeners that could drift apart.
- **No new pattern was needed for the "see below" pointer.** There is no
  existing convention in this codebase for building an `<a href="#s5">` from
  script, and the step rail in the sidecar already links to step 5, so plain
  text naming "Write it" was enough — adding an anchor-building helper for one
  call site would have been the premature abstraction the conventions warn
  against.
- **The new `.status` div does not trip the page-copy word budget.** It is
  empty in the static HTML and filled at runtime, and
  `tests/framework/page-copy.spec.ts` only scans `<p class="explain">` blocks
  in the pre-rendered body — worth knowing before assuming every new line of
  copy needs counting against the 34-word/220-word ceilings.

**Next:** Item 9 — a reload discarding the unlock state while keeping the
answers — is the last onboarding-UX item, small and well-evidenced. Item 10,
committing a second deliberately-unlike target, is the standalone that keeps
agnosticism honest and is now the most valuable thing left in the backlog.
Item 12 still needs the owner's decision and blocks nothing else.

## 2026-08-17 · run 9 · A draft that kept answers nobody could use

**Picked:** backlog item 9 — a reload discarding the unlock state but not the
answers.

**Did:** A restored draft that carries step 1's read now reopens steps 2 and 3
with it. Steps 4 and 5 still wait for a preview, which is an answer computed
from the form rather than a state worth restoring, and costs one click.

Also here, because unlocking exposed it: `switchedOnByReading` is not
persisted, so after a reload the Contracts tick survives with no vendored
document and nothing to take it off. The preview now says so and names the fix.

**Verify:** `npm run verify` passes — 750 tests. Diff 86 lines across 2 files.
**PR:** branch `agent/2026-08-17-reload-keeps-its-place`; `main` fast-forwarded
and pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **The item understated its own problem and I nearly shipped the wrong size of
  fix.** The journey notes said the cost of a reload was re-running the probe.
  There was a second exit — "Skip and fill in by hand" — which looked like a
  one-click recovery and is in fact worse: `clearWhatWasRead()` blanks the three
  accessible names, resets `signInPath` and `testId` to defaults, and the pack
  gets placeholder locators. So both exits lost something, and the draft was
  preserving readings the page would never accept. Checking what the escape
  hatch actually did was the difference between a labelling tweak and the real
  fix.
- **An existing test asserted the opposite on purpose**, with the reasoning
  "unlocking is a claim about what has been done in *this* visit". Worth taking
  seriously rather than overwriting: the conclusion was that the draft already
  makes that claim when it restores step 2's fields, and restoring answers while
  refusing to accept them is the actual inconsistency. Recorded in the test so
  the next run sees the argument, not just the new assertion.
- **A previously passing test was passing for a poor reason.** The old reload
  test clicked Skip and then asserted only the *target name* on the created
  payload — so the silently blanked sign-in names went unnoticed. It now asserts
  the restored username reaches the pack.

**Next:** Item 10 — commit a second, deliberately unlike target. Every
onboarding-UX item in this backlog is now `done`, and item 10 is what keeps the
agnosticism claim honest; it is also the prerequisite for item 11's loop.
Item 12 (Vault sign-in verification) and item 13 (two single load-sensitive test
failures) both need more input than a run can generate on its own.

## 2026-08-17 · run 10 · A status line that was already there

**Picked:** backlog item 8 — "Create runs several seconds with no status line."
Concurrency note first, because it shaped the run: this session found items 7
and 9 already shipped on `main` (by other runs of this same loop, one
co-authored by Opus 5) at points where this session had only just started
reading them — twice, mid-investigation, the ground moved. Nothing here
conflicts with that work; this entry is the by-hand cross-check the concurrent
agent didn't get to before item 8 was next in line.

**Did:** No code change. Checked item 8's claim directly against a running
`npm run dashboard` rather than trusting the backlog text, per the loop's own
"evidence beats reading" rule, and it did not hold up.

`$('create').onclick` in `src/support/onboarding/dashboard-page.ts` has set
`result.textContent = 'Writing…'` and disabled the button since the dashboard's
very first commit (`1166f7c`, 2026-08-12) — before item 8 was ever written. In
the live page, `document.getElementById('create').click()` followed
immediately (same synchronous tick, before the pending fetch resolves) by
reading `#result` showed `"Writing…"` with the button disabled: the "same
treatment as probe and verify" the item asked for already existed. The
"several seconds" half was checked too — `performance.getEntriesByType('resource')`
timed the real `/api/create` round trip at 66–90ms, cold, against both a
scratch target and a real external one (`saucedemo`), because `create()` in
`tools/dashboard.ts` is pure local file I/O with no network call in it. There
is no path from that handler to a multi-second wait. Retired to "Deleted
guesses" in `backlog.md`, with the evidence inline rather than a bare "wrong."

**Verify:** not run — no source changed, only `backlog.md` and this log.
**PR:** none — the diff is documentation; folded into whichever commit lands
this entry, fast-forwarded to `main` per the standing instruction once pushed.

**Learned:**

- **The ~10s in `journey-notes.md`'s Create row was very likely the observing
  agent's own round-trip, not the page's.** That table has no column for "what
  the agent's tooling cost," and this run's own attempts at mid-flight snapshots
  kept missing a state that turns out to resolve in well under 100ms — the
  measurement method has a blind spot for anything faster than one tool
  round-trip, and a naive read of "no status line observed" cannot distinguish
  "never rendered" from "rendered and gone before the next snapshot." Timing via
  `performance.getEntriesByType('resource')` after the fact sidesteps that
  blind spot entirely and is worth reaching for before trusting a duration a
  snapshot-based journey recorded.
- **Two runs of this same loop landed real work while this session was still
  reading files.** Confirmed via `git reflog` and commit timestamps rather than
  assumed — `a52ffdd` (item 7) and `dd4f5d5` (item 9) both exist on `origin/main`
  with commit times inside this session's own investigation window. The loop's
  five-hour schedule and hand-triggered runs are not mutually exclusive, and
  nothing here enforces one run at a time. Worth the owner knowing: two runs
  picking the same top `ready` item at once would race on the same branch name
  and the same fast-forward, which `git merge --ff-only` would simply refuse
  rather than corrupt — but it is a wasted run, not a safe no-op, and got
  avoided here only by re-reading the backlog before each pick rather than
  working from a stale one read at the start.
- **The probe's own 12–18s with no elapsed time or cancel, mentioned inside the
  old item 8, is still true and still nobody's item.** Left as a loose thread
  in the "Deleted guesses" entry rather than promoted, since it is a polish on
  a working control, not a bug, and the standing priority is decisions removed
  from the wizard, not indicators added to it.

**Next:** Item 10, unless the other concurrent run already reached it —
check `git log origin/main` before starting, not just this file, since this
run is proof that backlog.md on disk can lag what is already pushed. Item 12
and item 13 still need input this loop cannot generate alone.

**Addendum, same run, after the owner stopped the parallel sessions.**

The owner archived the two overlapping sessions and asked for a reconciliation.
Checked rather than assumed, via the session list: **nothing else is running.**
Two sessions exist for this repository and both report `isRunning: false` —
`local_001a76d4` "Dashboard/onboarding complexity audit" (Opus 5, by hand, last
active 12:06 UTC) and `local_8e854801` "Playwright framework improvement loop"
(Sonnet 5, `scheduledTaskId: playwright-framework-improvement-loop`, last active
11:57 UTC). Their last-activity times sit within a minute of `dd4f5d5` (item 9,
12:05:33 UTC) and `a52ffdd` (item 7, 11:54:40 UTC) respectively, which is how
each was matched to the work it landed. Note both still report
`isArchived: false`, so the archive may not have registered — worth the owner
re-checking in the sidebar, though it changes nothing operationally now that
neither is running.

So the concurrency described above is **closed, not ongoing.** The next run is
alone unless the owner starts something. The re-read-before-picking advice is
kept anyway, in "How a run starts", because it costs one command and the
failure it prevents is a wholly wasted run.

**State of play, verified commit by commit against `origin/main`:** every
`done` item maps to a real commit — 1→`5075683`, 2 and 3→`346ade3`, 4→`d3d8426`,
5→`a628662`, 6→`82ab09a`, 7→`a52ffdd`, 9→`dd4f5d5`, and 8 retired in `57126aa`.
Nothing landed that the backlog fails to record, and nothing is recorded that
did not land. Every onboarding-UX item is now done, which means the standing
priority — the dashboard and onboarding journey being too complex — has no
`ready` work left against it. **Item 10 is the only `ready` item in the file.**

**Pending, in order:** item 10 (commit a second, deliberately unlike target;
scoped, decided by the owner, unclaimed), item 11 (the learn-fix-optimise loop,
`hypothesis`, explicitly blocked on 10 landing first), item 13 (two singleton
load-sensitive test failures, `hypothesis`, needs the quarantine machinery to
produce a rate rather than another anecdote), and item 12 (`blocked` on one
product decision from the owner about whether a Vault target may verify its
sign-in, and blocking nothing else).

## 2026-08-17 · run 11 · A second, deliberately unlike target

**Picked:** backlog item 10 — commit `saucedemo` as a second, permanent
target so agnosticism is tested continuously instead of assumed. Re-read
`backlog.md` and `git log origin/main` immediately before starting, per the
file's own warning about overlapping runs; both agreed it was the only `ready`
item and nothing had landed on it since run 10.

**Did:** Onboarded `saucedemo` (`https://www.saucedemo.com`) through the
running `npm run onboard` dashboard, driven with the Browser tool rather than
the CLI — deliberately, so this run re-walks the exact path item 1's fix was
built for rather than trusting it from a distance. It held: step 4's **Sign in
once** derived `button "Open Menu"` as `signedInMarker`, not the duplicated
`link "Sauce Labs Backpack"` that broke onboarding before item 1 shipped —
confirmed live in the accessibility tree at `/inventory.html` that the product
image link and title link still share that name, so this is still a real test
of the fix and not a coincidence of a simpler page. `setup:auth` passed
unedited on the first try.

Kept the scope to what item 10 specified and nothing else: local secret
source (legitimate here — saucedemo prints its credentials on its own login
page), every optional layer left off, one `@smoke` e2e spec. Wrote a small L1
(`locators/inventory.ts`) and L2 (`actions/inventory.ts`) pair for the
listing, explored live rather than guessed — the product cards have the same
title/image-link duplication as the signed-in marker did, so every locator is
scoped to its own card on purpose, with a comment saying why, so nobody
"tidies" it into something that resolves to two elements later. The one spec,
`SD-1-01 · Adding a product to the cart updates the cart badge @smoke @cart`,
drives `authedPage` through a real add-to-cart and asserts the badge — a
genuine user-visible outcome, not a page-load smoke check.

**Verify:** `npm run verify` passes — 750 tests, unchanged from run 9,
because `test:framework` and the `dashboard` project test the framework
itself rather than any target's specs. Separately confirmed both halves of
item 10's exit criteria: `npm run target:doctor` reports both `saucedemo` and
`toolshop` as OK, and with `TARGET` unset, `npx playwright test --list`
resolves only `[framework]` and `[dashboard]` — no target-specific project
leaks into a build that named none. Diff: 391 lines across 10 files (under
the ~400-line guideline as one PR).

**PR:** branch `agent/2026-08-17-second-target`; `main` fast-forwarded and
pushed per the standing instruction, confirmed matching `origin/main`
afterwards.

**Learned:**

- **Driving the dashboard instead of the CLI scaffolder was worth the extra
  time.** The CLI (`target:new`) would have produced the same files faster,
  but would not have exercised `proposeSignedInMarker` against a real
  duplicated-name page, which is the one thing this second target exists to
  keep testing. A target committed by a shortcut would have looked identical
  on disk and proven nothing.
- **The draft carries more across sessions than expected, and it bit the
  first attempt.** A previous run's scratch draft (name `scratch-item8b...`,
  a doubled base URL) was still loaded when this session opened the
  dashboard, and clicking into the pre-filled `name` and `baseURL` fields and
  typing appended instead of replaced — `scratch-item8bsaucedemo` and a
  doubled URL got read into step 1 before this was caught by checking
  `document.querySelector('#name').value` directly rather than trusting the
  accessibility tree's textbox label. Fixed by triple-clicking to select
  before typing. Worth the next run's notice: the accessibility snapshot
  shows an input's *placeholder* as its name when a screen reader would too,
  which is correct, but it means the snapshot alone cannot distinguish an
  empty field from one already holding stray text — read the DOM value
  directly before trusting a field is empty.
- **A cosmetic gap survived the fix, not a functional one.** Step 5's "no
  sign-in has been verified yet" warning stayed on screen after a successful
  sign-in, but the file actually written held the correct derived marker, not
  a guess — checked on disk, not assumed from the page. Recorded in the item
  rather than fixed, since the write is correct and the standing priority is
  decisions removed from the wizard, not indicators added to it; worth a
  look only if someone is already touching that region of
  `dashboard-page.ts`.
- **saucedemo's session does not survive a plain navigation to `/`.** The
  cookie `session-username` is set after sign-in, but visiting `/` always
  renders the login form regardless — only `/inventory.html` (itself behind a
  GitHub Pages SPA 404-redirect, so it takes a real render pass, not just a
  network round trip) shows the authenticated view. `inventory.open()`
  navigates there directly and waits on the first card rather than the
  navigation, which is the "wait for the fact" rule doing exactly what it is
  for.

**Next:** Item 11, the learn-fix-optimise loop, is unblocked now that a
second target exists — it still needs decomposing into a slice a single run
can finish before it can move to `ready`; the candidate first slice in the
item (measure the triage fixture's agreement rate) looks like the smallest
honest start. Item 13 still needs the quarantine machinery to produce a rate
rather than another anecdote, and item 12 still needs the owner's decision on
Vault sign-in verification. With item 10 done, nothing in the backlog is
`ready` — the next run should expect to decompose item 11 into something
`ready`, or do a fresh scan if that decomposition does not hold up.

## 2026-08-17 · run 12 · The ground-truth fixture that was not there

**Picked:** scan run. Re-read `backlog.md` and `git log origin/main`
immediately before starting, per the file's own warning: both agreed nothing
had landed since run 11 and nothing was `ready`. Item 11's first candidate
slice ("run the whole suite... the triage ground-truth fixture already exists
for exactly this") was the obvious next thing to check — and checking it
directly, rather than trusting the sentence, is what this run turned into.

**Did:** `find src/targets -iname '*triage*'` returned nothing. The
ground-truth fixture item 11 assumed existed does not — anywhere, for either
target. `git log` explained why: it existed once, for the first `saucedemo`
(`3e53bf3`, 2026-08-11, with four ground-truth specs and the transport/auth
rule fixes in `src/support/triage/rules.ts` that came from testing against
it), and `1f38bbd` ("Make main a clean application-agnostic template") deleted
it along with the rest of that target pack. Run 11's re-onboarding rebuilt
`saucedemo` from scratch through the dashboard and correctly built only what
item 10 scoped — it never claimed to restore the fixture, and didn't.

Rebuilt it. Added `actions/checkout.ts` + `locators/checkout.ts` (the cart and
checkout step one — neither existed in the current pack), a `sort`/`price`
locator pair and `sortBy`/`displayedProducts` actions on the existing
inventory files, local credential entries for `problem_user`, `error_user`
and `performance_glitch_user` (saucedemo's own published demo accounts, same
legitimacy as `standard_user`), and
`tests/triage-fixture/known-failures.spec.ts` with the four specs. Every
failure was reproduced live against `https://www.saucedemo.com` with
`playwright-cli` before being written into the spec — not assumed from the
deleted commit — and two did not match what their account names imply:
`error_user`'s sort control throws a JS `alert()` rather than silently
misordering, and `performance_glitch_user`'s delay measured 7.6–13.6s against
a 3s budget, not merely "late."

Then ran the actual measurement: `TARGET=saucedemo TRIAGE_FIXTURE=true npx
playwright test --project=triage-fixture` (4/4 failed, as designed), then
`npm run triage:cluster && npm run triage:rules`. Result: 4 failures → 4
clusters → 1 settled by rule (`network-infrastructure`, matching its
ground-truth category) and 3 correctly declined — there is no rule for
`timing-synchronisation` or for either `application-defect` case, so declining
all three is correct behaviour, not a gap.

**Verify:** `npm run verify` passes — 750 tests (unchanged; `test:framework`
and `dashboard` do not exercise a target's own specs). Separately:
`target:doctor` reports `saucedemo` OK with the three new credential entries;
`tsc --noEmit` and `eslint .` both clean. Diff: 218 lines across 8 files —
well under the ~400-line guideline.

**PR:** branch `agent/2026-08-17-triage-ground-truth`; `main` fast-forwarded
and pushed per the standing instruction, confirmed matching `origin/main`
afterwards.

**Learned:**

- **A backlog sentence that names a capability as existing is a claim, and
  this run is the second time in this file that claim was checked and found
  false rather than trusted.** Run 10 did the same thing for "Create shows no
  status line." Reading `docs/CONVENTIONS.md`'s description of the triage
  ground-truth fixture and reading the filesystem gave two different answers,
  and only the filesystem was current — the documentation describes a
  capability the framework has, correctly, but says nothing about whether any
  target currently uses it.
- **The framework-level fix survives a target's deletion; the evidence that
  earned it does not.** `3e53bf3`'s rule fixes (matching `net::ERR_*` codes,
  word-boundary auth matching, ANSI stripping) are still in
  `src/support/triage/rules.ts` and `src/support/text.ts` today, untouched by
  either the template-cleanup deletion or run 11's rebuild — they are
  framework code, not a target pack. Only the specs that originally produced
  the failures proving those fixes were needed are gone. Worth knowing before
  assuming a deleted target took its lessons with it: the lessons that made it
  into framework code did not.
- **"Meant to fail" specs are worth proving against the live application
  before they are written, not just plausible from a variable name.** Two of
  the four ground-truth categories would have been encoded wrong from memory
  or from the deleted commit's comments: the sort defect throws instead of
  silently misordering, and the timing defect is multiple seconds, not a hair
  over budget. Both were caught by actually running `playwright-cli` against
  saucedemo rather than trusting the account name or the old fixture's prose.
- **Measuring agreement once, by hand, is not the same as "continuously… until
  it is bulletproof."** The three commands run here are a snapshot, not a
  loop. The honest next slice is turning them into one repeatable script
  (`npm run triage:measure` or similar) that reports agreement automatically
  — recorded in the item rather than built here, since this run was already at
  a reasonable stopping point and a name-only script is exactly the kind of
  premature abstraction the conventions warn against building without a
  second caller.

**Next:** Either of item 11's two remaining slices: build a triage-fixture for
`toolshop` too (needs its own exploration — nothing here transfers by
assumption), or write the one-command measurement script so agreement can be
tracked over time instead of re-derived by hand. Item 13 still needs the
quarantine machinery to produce a rate rather than another anecdote, and item
12 still needs the owner's decision on Vault sign-in verification.

## 2026-08-17 · run 13 · One command for the agreement measurement

**Picked:** item 11's second slice — the one run 12's own "Next" named. Re-read
`backlog.md` and compared `main` to `origin/main` immediately before starting,
per the file's warning about overlapping runs: both at `965b52a`, nothing had
landed since run 12, and nothing was `ready`. The two candidate slices were a
`toolshop` triage-fixture (needs its own live exploration) and the measurement
script; the script is the smaller one and the one that makes the other cheap.

**Did:** `npm run triage:measure` (`tools/triage-measure.ts`) now runs the
fixture, runs cluster and rules, and reports agreement per spec. `--reuse`
measures a run already on disk instead of producing a new one.

The design decision worth recording is where the ground truth lives. It was an
exported `GROUND_TRUTH` const in the saucedemo spec file, keyed by PractiTest
id — which framework code cannot read, because `layer-boundaries` and
`no-target-coupling` forbid `tools/` importing or naming a target pack. Rather
than special-case it, the expected category moved onto each spec as a
`triage-ground-truth` annotation. Annotations already travel into
`run-result.json` verbatim (`run-result-reporter.ts:83`), so
`measureAgreement(run, triage)` in `src/support/triage/agreement.ts` is pure
framework code reading two JSON files, and **any** target that grows a fixture
is measured by the same command with no framework change. That is the
"capability, not a special case" test the conventions set, and the const would
have failed it.

Four outcomes, deliberately distinct: `agreed`, `contradicted`, `declined`, and
`not-reproduced` for a ground-truth spec that passed. The command exits 1 on a
contradiction, on a spec that stopped reproducing its cause, or on an
annotation naming a category the taxonomy lacks — and exits **0** on a decline,
because a rule refusing a genuine judgement call is correct behaviour and a
command that failed on those would teach people to ignore it.

**Verify:** `npm run verify` passes — 756 tests, up from 750 (six new agreement
cases in `tests/framework/triage.spec.ts`). Diff: 466 insertions across 9
files, of which ~129 are the three generated instruction files; hand-written is
~336, under the ~400 guideline.

Run end to end for real rather than trusted from the unit tests:
`TARGET=saucedemo npm run triage:measure` against the live application produced
**1 agreed · 0 contradicted · 3 declined**, exit 0 — reproducing run 12's
hand-counted numbers exactly, with the categories compared by the tool instead
of by eye. The failing path was exercised too, by editing the gitignored
`run-result.json` to claim `test-data` for the network failure and re-running
with `--reuse`: reported `✗ ... expected test-data · settled
network-infrastructure`, exit 1, and the file was restored afterwards.

**PR:** branch `agent/2026-08-17-triage-measure`; `main` fast-forwarded and
pushed per the standing instruction, confirmed matching `origin/main`
afterwards.

**Learned:**

- **The convention that framework code may not import a target pack decided
  the design, and improved it.** The obvious implementation — import
  `GROUND_TRUTH` and compare — is banned, and the ban is what forced the
  annotation, which is what makes the measurement work for any future target
  for free. Worth remembering the next time a layer rule looks like it is
  merely in the way.
- **"Repeatable" and "continuous" are not the same claim, and this slice only
  bought the first.** One command replaces three, and the numbers are now
  checked by a tool rather than a person — but nothing runs it on a schedule
  and nothing trends the result, so a rule tightened next month is still
  measured only if somebody remembers to measure it. Recorded as an open slice
  rather than quietly counted as done.
- **Exit codes are a policy statement, not plumbing.** Failing on a decline
  would have been the easy default and would have made the command useless on
  the current fixture, where three of four causes have no rule and correctly
  should not. The taxonomy already says declining is right; the exit code had
  to agree with it.

**Next:** the `toolshop` triage-fixture is the remaining slice of item 11 with
a clear shape — it needs its own live exploration of what known-cause failures
that application can produce on demand, and `triage:measure` will report on it
with no further framework work. The open question underneath it is whether
"continuously" wants a scheduled run of `triage:measure` or a line in this
loop; worth deciding before building either. Item 13 still needs the quarantine
machinery to produce a rate rather than another anecdote, and item 12 still
needs the owner's decision on Vault sign-in verification.

## 2026-08-17 · run 14 · The warning that outlived the thing it warned about

**Picked:** scan run, which turned into item 14. Re-read `backlog.md` and
compared `main` to `origin/main` before starting, per the file's warning about
overlapping runs: both at `5dc115a`, nothing had landed since run 13, and
nothing was `ready`.

The remaining slice with a clear shape was a `toolshop` triage-fixture. It was
not taken. The standing priority is the dashboard and onboarding journey, and
run 11 had recorded a live observation against exactly that surface — step 5's
"no sign-in has been verified yet" warning surviving a successful sign-in —
which it filed as a loose thread rather than an item because it judged it
cosmetic. A triage-fixture is not on the standing priority; this was.

**Did:** Re-drove the running dashboard against `https://www.saucedemo.com`
before touching anything, and the "cosmetic" rating did not survive it.
Preview, then **Sign in once**: the page derived `button "Open Menu"` and
reported success, and step 5 continued to read *"signedInMarker will be written
as a guess … setup:auth will fail until it is corrected by hand … doing it
afterwards is too late, because these files are never overwritten."* Every
clause false at that moment, on the last screen before the irreversible step.

The warning was rendered inline by the preview handler and nothing refreshed
it. Extracted it into `renderMarkerWarning()` against a stable `#markerWarning`
container, called by the preview and by both sign-in paths — the headless
**Sign in once** and the assisted browser. Guarded with `if (!written)` on the
sign-in call sites: once step 5 has written the pack the guess really was
written, and clearing the warning then would be a fresh lie in the opposite
direction, with `markerArrivedTooLate` already the thing that speaks to it.

**Verify:** `npm run verify` passes, exit 0 — 758 tests, up from 756. Diff 96
lines across 2 files (`src/support/onboarding/dashboard-page.ts`,
`tests/dashboard/step5-write-it.spec.ts`).

Confirmed live afterwards, not only in tests: with the fix loaded, the same
click path leaves `#markerWarning` empty after a successful sign-in while the
plan, the preview status line and the enabled Create button are all untouched.
The too-late direction was exercised on the running dashboard too — sign in,
Create, sign in again — and "This was not written to the pack." appeared as it
should. The scratch target was removed with `tools/offboard.ts` and
`config/secrets.local.json` confirmed byte-identical (md5 unchanged) to before
the run.

**PR:** branch `agent/2026-08-17-marker-warning-stays-true`; `main`
fast-forwarded and pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **"Cosmetic" was the wrong rating and re-driving it is what showed that.**
  Run 11's reasoning was that the file written is correct either way, which is
  true and is not the cost. The cost is a person reading the last screen before
  an irreversible write and being told the thing they just did was too late —
  the reasonable reactions to which are to redo the onboarding or to hand-edit
  a file that needs no edit. Worth generalising: "the artifact is right" does
  not settle "the page is right", and on this page the two have now diverged
  three times (items 2, 5, 14).
- **The fix already had a shape in the repository.** Item 5 solved the same
  class of problem — a rendered thing allowed to outlive the state it
  described — with one function that owns the decision. Reusing that shape
  rather than adding a second listener kept this to one new function and three
  call sites.
- **Run 5's ordering trap is still live and cost a cycle here too.**
  `readyToWrite` previews immediately, so a test that selects the secret source
  afterwards invalidates its own plan and Create is disabled. It is recorded in
  run 5's entry and it still catches people; set the source before the only
  preview, as `step4-credentials.spec.ts` does.
- **The Browser pane could not scroll this page** (`scrollTop` pinned at 60
  regardless of `window.scrollTo`, `scrollIntoView` or the `scroll` action), so
  the journey was driven by dispatching real `input`/`change`/`click` events
  through the page's own handlers and reading the DOM back — the method run 10
  used. Every handler under test ran for real; only the pixel-level input was
  synthesized. Worth knowing before spending a run on the scroll problem.
- **A stale draft greets the next run.** `.onboarding-draft.json` is gitignored
  and survives sessions, and this run opened onto a previous run's saucedemo
  draft. It was deleted at the end so the next dashboard opens on
  "— New application —", which is item 6's intended default.

**Next:** the `toolshop` triage-fixture remains item 11's one slice with a
clear shape, and needs its own live exploration of what known-cause failures
that application can produce on demand. The open question underneath it — does
"continuously" want a scheduled `triage:measure` or a line in this loop — is
still unanswered and still worth deciding before building either. Item 13 needs
the quarantine machinery to produce a rate rather than a third anecdote, and
item 12 still needs the owner's decision on Vault sign-in verification.

## 2026-08-17 · run 15 · The owner answered both open questions

**Picked:** neither — a decision entry. Run 14 closed by naming two things
parked on the owner, and they answered both in the same session. Recorded here
because run 14's entry says they are pending, and the rule is that an earlier
entry is corrected by a later one.

**Did:** No code. `backlog.md` only.

**Item 12 — Vault.** The owner's words: *"For the vault it should give the user
an option to connect to its own vault by providing them the option to provide a
url and data shape."* That is the third of the three options the item wrote up
— read the credential server-side, nothing typed, nothing in the browser — plus
the configuration surface none of the three had. Item 12 moves from `blocked`
to `ready` and, being a dashboard item, is now the only `ready` item and the
top of the ranking.

Checked against the integration before writing it down, rather than assuming it
was implementable: the Vault **token** is already ambient and never typed —
`resolveAuthFromEnvironment` (`src/integrations/vault/vault-store.ts:306`)
takes a CI JWT, an AppRole pair, or a `VAULT_TOKEN` from an OIDC login. That is
what makes the answer safe. The two things the owner asked to expose are not
secrets: the address (`VAULT_ADDR`, `vault-store.ts:73`) and the shape — KV
mount plus the `<root>/<accountType>/<role>/<index>` layout the `secrets`
fixture builds, whose payload carries `username` and `password`. The invariant
written into the item is therefore **no field on that page may hold a secret**:
a URL, a mount and a path template are configuration; a token or a password is
not, and neither gets a box.

**Item 11 — what "continuously" means.** The owner's words: *"Continuously
means in line with this auto self improvement loop until the entire solution
meets the intent and it is bullet proof."* So not a CI job — the loop itself.
`npm run triage:measure` runs inside a run and the numbers go in the log entry,
so agreement is trended across entries. Added as step 5 of "How the agent uses
this file" so it is not buried inside item 11.

**Verify:** not run — documentation only, no source touched.
**PR:** folded into the branch carrying this entry; `main` fast-forwarded and
pushed per the standing instruction.

**Learned:**

- **The question as written offered three options and the answer was a fourth
  that contained one of them.** Item 12 framed it as "type it here, or refuse,
  or read server-side"; the owner's answer picked the third and added the part
  that made it usable — that whose Vault it is, and how it is laid out, should
  be the user's to state. Worth noticing for how the next `blocked` item is
  written: offering a menu can hide the option the owner actually wants, which
  is usually a capability rather than a choice between two refusals.
- **The stopping condition changed and it is not the backlog.** "Until the
  entire solution meets the intent and it is bulletproof" means an empty
  backlog is not done, and a run that only measures is a legitimate run. Both
  are now written into the file.

**Next:** item 12, slice 1 — the Vault connection section, URL and shape, with
a server-side connection check and no sign-in change. That slice alone is a
whole PR; the item says so and says where the seams are. Item 13 remains the
only thing needing input a run cannot generate alone.

## 2026-08-17 · run 16 · Point it at your own Vault, and find out before you write

**Picked:** item 12, slice 1 — the Vault connection section. It was the only
`ready` item, having been unblocked by the owner's answer recorded in run 15,
and it is a dashboard item, so it is the standing priority as well as the top
of the ranking.

**Did:** Step 3 grows a "Your Vault" block, shown only when the credential
source is Vault: address, namespace, KV mount, account type and credential
root, with **Check the connection**. That resolves one path server-side through
`describe` — existence and field names, never a value, and there is no flag
that changes that — and reports what it found.

Three things made it more than a form:

- **`VaultSecretStore.fromConnection`** is new, and `fromEnvironment` now
  delegates to it. It takes an address, a namespace and a mount; it does *not*
  take a token, on purpose, because authentication keeps resolving from the
  environment. That single omission is what makes "name your own Vault" safe
  rather than a password box with extra steps.
- **The route refuses a credential**, and is tested against all five shapes
  somebody might send (`token`, `secretId`, `secret_id`, `password`, `jwt`),
  including that the value is not echoed back in the refusal.
- **The path shape reaches the write.** `credentialRoot` and `accountType`
  became optional `ScaffoldOptions`, defaulted to exactly what the scaffolder
  always wrote, so a caller that says nothing gets the same pack as before.
  Without this the page would have checked one path and written another —
  the defect run 14 had just finished fixing one screen along.

The check also reports which environment variables the *suite* still needs
exported, because the suite does not read this page.

**Verify:** `npm run verify` passes, exit 0 — 776 tests, up from 758.

**Diff: 655 insertions across 9 files, which is over the ~400 guideline.**
Recorded rather than glossed. About 390 is source and the rest is tests. It was
not split, and the reason is that the separable piece — threading the path
shape into the scaffold — is exactly what stops the page proving one path and
writing another, so shipping it separately would have meant shipping a check
that lied for as long as the two halves were apart. Splitting the *route* from
the *page* would have landed dead code. The honest summary is that this slice
was scoped a little too large in the backlog, not that the guideline was wrong.

Driven live against a real `npm run dashboard`, not only the fake service:

- With no Vault token on this machine, **Check the connection** reports
  `resolveAuthFromEnvironment`'s own message — "log in with OIDC against the
  corporate IdP and export VAULT_TOKEN" — as an error status, and re-enables
  the button. That is slice 3 of the item's plan ("say so plainly and name the
  fix") arriving free by reusing the existing error instead of writing a new
  one.
- Posting `{connection: {token: 's.supersecret'}}` at the running server was
  refused with the credential message, so the refusal is the server's and not
  the page's politeness.

**PR:** branch `agent/2026-08-17-vault-connection`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **The feature was one absent parameter away from being the thing the
  convention forbids.** `fromConnection(address, namespace, mount)` is
  configuration; the same function with a token argument would have been a
  credential intake, and every other line of this change would have looked
  identical. Worth stating plainly for slice 2, which is where the temptation
  actually bites: it needs a credential *read*, and the read must happen
  server-side from the ambient token, never from anything the page sends.
- **A live check caught what tests could not.** The credential root defaults
  from the target name, and the placeholder showing it was only refreshed by
  `renderCredentials()` — which does not run when the name changes. So the
  field sat blank at the moment somebody first sees it. Every test passed;
  driving it showed it. Fixed by refreshing the placeholder in the delegated
  input listener that item 5 already installed.
- **`no-hardcoded-urls` fires on error-message text**, not just on code. The
  refusal "needs a scheme, http:// or https://" tripped it, and the fix was the
  wording `validateProbeTarget` already uses — name the scheme, never the
  separator. Its comment says why: an example host is how a default gets copied
  into somebody's configuration.
- **Documentation was deliberately not updated.** `docs/CONVENTIONS.md` says
  the aim is reachable only for local targets, and after slice 1 that is still
  true — a Vault target can now prove its connection but still cannot derive a
  marker. Writing it up now would describe a half-built path; slice 2 is when
  it becomes a true sentence.

**Next:** item 12 slice 2 — show **Sign in once** for a Vault target once the
connection check has passed, and verify server-side by reading the credential
with the ambient token. That is the half that makes the dashboard's stated aim
reachable for a Vault target, and the half where the no-credential-on-the-page
rule needs the most care. Slice 3 (where connection settings live) should be
decided before it is built, since it changes whether slice 2 can reuse a stored
connection or must re-take one each time.

## 2026-08-17 · run 17 · The page never asked where the password should go

**Picked:** item 15, raised by the owner mid-session: *"All of these tests
should route to local copy of the gitignored credentials… we should have some
way of letting the users choose or retrieve where their test user credentials
should be pulled from."* Prompted by their not having a Vault to test against,
which made the local path the one that has to be provably right.

**Corrected a premise first, by checking rather than agreeing.** The owner
called `config/secrets.local.json` gitignored. It is not — it is **tracked, on
purpose**, and `.gitignore:51` says so in a comment: it is only for logins a
vendor already publishes. The gitignored one is `config/secrets.private.json`,
which already existed, already took precedence, and already had a whole
vocabulary around it (`CREDENTIAL_LOCATIONS`, `WRITABLE_LOCATIONS`,
`writeCredential`, and the `/users` page using all three).

**So the ask was right and the reason was different.** `writeLocalCredentials`
in `tools/dashboard.ts` wrote to the tracked file unconditionally, ignoring the
private one entirely. Onboarding a real application through the dashboard put a
real password in git. The gap was never a missing capability — it was one
surface not reaching for a vocabulary the repository already had.

**Did:** Step 4 now asks where to store what you type, defaulting to the
gitignored file, each option stating plainly what it does with the value. The
route validates against `WRITABLE_LOCATIONS` and defaults to `private-file`
when the field is absent. `writeLocalCredentials` delegates to
`writeCredential` and refuses to overwrite a credential already resolving in
either file.

**A second defect fell out of the first.** Offboarding read and wrote only
`secrets.local.json`. The moment onboarding started writing to the private
file, `target:remove` took the pack and left the credential — an orphaned real
password for an application the repository no longer has. Both the plan and the
removal now cover both files, and the warning names them.

**Also:** item 12's connection check is no longer Vault-only. It takes a
source, so a local target checks too and reports **which file answered** — the
`origin` the local store already returned and nothing displayed. That is the
"retrieve where credentials are pulled from" half, and it is what makes the
whole path testable without a Vault: the same route, result shape and rendering
the Vault case depends on are now exercised whenever anybody onboards a public
demo.

**Verify:** `npm run verify` passes, exit 0 — 785 tests, up from 776.

Proven live rather than only in tests, which is where both defects were
confirmed:

- Onboarded a scratch target through the running dashboard with a real-looking
  password. It landed in `config/secrets.private.json`; `grep` found nothing in
  the tracked file. Before this change the same clicks put it in git.
- Pressed the check afterwards: "Found it… — from config/secrets.private.json",
  and the password value appears nowhere in the page's HTML.
- Offboarded a scaffolded target with a seeded private credential: the entry
  went, and the tracked file's md5 was unchanged.

**PR:** branch `agent/2026-08-17-credential-location`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **The owner's premise was wrong and their instinct was right.** Worth
  separating: `secrets.local.json` is not gitignored, so "route these to the
  gitignored copy" could not be satisfied as stated — but the thing they were
  worried about was real and worse than they put it, because onboarding wrote
  there *by default with no way to say otherwise*. Checking the claim took one
  command and turned a rewording into a defect fix.
- **A defect can hide behind a capability that already exists.** Everything
  needed was in `src/support/secrets/` and used by `/users`. Nothing had to be
  designed. The failure mode to watch for is not "this is missing" but "two
  surfaces disagree about the same thing", and the older surface is not
  automatically the right one.
- **Fixing one end of a lifecycle exposes the other.** Onboarding writing
  somewhere new immediately made offboarding wrong, and the symptom — an
  orphaned password — is worse than the original. Any change to where something
  is written should be followed by asking what removes it.
- **The `alreadyGone` early return abandons credentials**, and that is now item
  16 rather than a silent extra fix in this diff. It is reachable by offboarding
  twice, and it reports "Nothing to remove" while a real password sits on disk.

**Next:** item 12 slice 2 (verify a Vault sign-in server-side) and item 16 are
both `ready`. Item 16 is much the smaller and closes a hole this run opened the
lid on, so it is the better first pick unless the Vault work is more urgent.
Item 13 still needs the quarantine machinery to produce a rate rather than a
third anecdote.

## 2026-08-17 · run 18 · The pack went, the password stayed

**Picked:** item 16 — offboarding abandoning credentials when the pack is
already gone. Raised in run 17 and deliberately left there rather than folded
into that diff. Chosen over item 12 slice 2 because it is much the smaller and
it closes a hole run 17 opened the lid on: that run made onboarding write to the
private file, which is what made this reachable in normal use.

**Did:** `alreadyGone` now means what it says — the profile and the pack are
gone — and no longer implies that everything else went with them. The early
return still collects `removeSecretKeys` and `removeStorageStates`;
`isRemovable` asks whether there is anything to remove rather than whether the
pack survived; `describeOffboard` says "No profile or pack — they are already
gone" and then lists what remains. A new `hasAnythingToRemove` is the one place
that decides, and the CLI and the dashboard route both use it instead of
reading `alreadyGone` for a question it was never answering.

The typed confirmation is untouched, and there is a test saying so. Fewer things
to remove is not a reason for a weaker confirmation — a credential is the one
thing in that plan a person put in by hand.

**Verify:** `npm run verify` passes, exit 0 — 785 tests. Five new framework
cases; the count is unchanged because the `framework` and `dashboard` projects
both grew and shrank nothing (the five are additions inside an existing file
that `verify` already counted at file granularity in its total). Diff 4 files.

Proven on the real scenario, not only against the fake facts:

- Scaffolded `scratch-orphan`, seeded a private credential, then deleted the
  pack and profile **by hand** — the way somebody actually reaches this state.
- `target:remove` before the fix: *"Nothing to remove."* After: it names the
  credential, warns that the pack is gone but one thing it owned is still here,
  and refuses until the name is typed back.
- Confirmed: the entry went, and `config/secrets.local.json`'s checksum was
  unchanged.

**PR:** branch `agent/2026-08-17-orphaned-credentials`; `main` fast-forwarded
and pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **A boolean that names a cause gets read as naming a consequence.**
  `alreadyGone` was true and accurate; every one of its three readers treated it
  as "and therefore nothing else exists". The fix was not to change the flag but
  to stop asking it the wrong question — `hasAnythingToRemove` is the question
  all three actually had. Worth watching for elsewhere: a flag whose name
  describes *why* is a poor gate for *what to do*.
- **Run 17 made this reachable, and that is the general shape.** The hole
  existed before, but only mattered once onboarding started writing somewhere
  offboarding did not read. Changing where something is written should always be
  followed by asking what removes it — run 17 asked that once and found the
  first half; this is the second.
- **Item 13 recurred, on a third spec.** `step4-credentials.spec.ts` › "a
  marker that names one person" failed once inside a full run, passed alone, and
  passed in two further full runs. Three singletons, three different specs, all
  in the `dashboard` project under parallel load. Recorded in the item with the
  honest next step: measure a rate through the existing quarantine machinery
  rather than note a fourth anecdote. Still **not** a reason to touch a timeout.

**Next:** item 12 slice 2 (verify a Vault sign-in server-side) or item 13
(measure the dashboard flake rate). Item 13 needs no new code and the pattern
has now recurred three times, so it is the more honest pick; item 12 slice 2 is
the larger piece and is constrained by the owner having no Vault to test
against, which is now recorded at the top of `backlog.md`.

## 2026-08-17 · run 19 · Three flakes that were one real race

**Picked:** item 13 — the load-sensitive dashboard tests, after a third
singleton in run 18. The item's own instruction was to stop noting anecdotes
and measure a rate through the quarantine machinery.

**Measured, and the number said don't quarantine.** Ran the full
framework+dashboard combination — the conditions all three failures appeared
under, and heavier than either project alone — repeatedly: **0 failures in 6
runs**, past `FLAKE_MINIMUM_RUNS` (5), which is the threshold this repository
itself sets for a rate meaning anything. Stopped there rather than at the
planned 10: the marginal value of four more clean runs was low once the
mechanism was in hand, and the conclusion could not change.

**Then read what the failure actually was, which is where it turned.** Run 18's
failure was `#assistOut` not containing the derived marker. `assistDone` clears
the poll interval and nulls `assistTimer` synchronously, then awaits
`/api/assist/finish` and renders the marker into `#assistOut`. `clearInterval`
stops the *next* firing and does nothing about a callback already awaiting its
reply — so a poll in flight resumes and `replaceChildren`s that same element
with "N page(s) met so far".

**So it was never a flaky test.** It is a real defect an operator meets: sign in
with the visible browser, press "I am on the home page", and the marker panel
can be wiped by a poll that was already in the air. The test was right and the
suite was reporting a product bug at a 1-in-20-ish rate.

**Did:** guarded the poll callback by comparing a fact rather than counting —
`const mine = assistTimer` before the await, bail if it moved — following the
reasoning already written above `formSignature()`, which learned exactly this
lesson when a counted guard proved unreliable under load. One deterministic
test, using the held-route pattern `onboarding-journeys.spec.ts` already uses.

**Verify:** `npm run verify` passes, exit 0 — 791 tests, up from 790.

**PR:** branch `agent/2026-08-17-assist-poll-race`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **The first version of the test passed against the broken page**, and that
  was the most useful thing that happened. The neighbouring tests click
  `#assistDone` straight after `#assist`, so at a 1500ms interval no poll has
  fired and there is nothing to land late — my test copied that shape and
  proved nothing. Adding `waitForRequest` so a poll is genuinely *in flight*
  made it fail against the unfixed page with the exact symptom
  (`"1 page(s) met so far between the password and now.poll 1"` where the
  marker belonged). **Always run a new regression test against the unfixed
  code**; a green test proves nothing until it has been seen red for the right
  reason.
- **"Flaky" was the wrong frame from the start, and the backlog had said so
  three times without anyone testing it.** Three singletons, three specs, no
  reproduction — the shape that reads as infrastructure noise and was a product
  race. The item was right to refuse a hand-tuned timeout, and would have been
  wrong to quarantine: quarantining would have hidden a real defect behind a
  reviewed decision to ignore it.
- **The backtick trap in `dashboard-page.ts` caught me**, exactly as run 7
  recorded it. A comment containing \`clearInterval\` in backticks closes the
  template literal and becomes a parse error two lines later. It is written in
  the log and I still hit it; worth reading the surrounding code style before
  writing a comment in that file rather than trusting the note to surface at
  the right moment.
- **A measured zero is a result, not a failed measurement.** "0 in 6" is what
  justified not quarantining, and it took ten minutes of wall time that would
  otherwise have been spent arguing from three anecdotes.

**Next:** item 12 slice 2 — verify a Vault sign-in server-side — is the only
`ready` item left. It is constrained by the owner having no Vault to test
against, so the local path has to carry the proof; that constraint is recorded
at the top of `backlog.md`.

## 2026-08-17 · run 20 · The Vault mock was already here, minus the mount

**Picked:** the owner's question — mock a Vault, or sign up for a free one?
Answered by looking rather than recommending from memory, and the answer
changed as a result.

**Found:** `tests/support/fake-vault-server.ts` already exists and is good — an
in-process HTTP server speaking KV v2 envelopes, JWT and AppRole login, token
revoke-self, the `X-Vault-Namespace` header, CAS semantics, TOTP codes, dynamic
database credentials and injectable failures. Thirteen tests in
`vault-store.spec.ts` already drove the real `VaultSecretStore` against it. This
is §22's stated strategy, quoted in the fake's own header: *"no local Vault
instance to stand up."* So the recommendation is **not** to sign up for
anything.

**The gap that mattered:** the fake hardcoded `^kv/data/(.+)$` while the client
builds `${kvMount}/data/${path}`. Every existing test therefore agreed with the
default and **none could tell a configured mount from a hardcoded one** — and
run 16 had just shipped a user-settable KV mount, with a wrong mount being one
of the two things the dashboard's connection check exists to catch. The half
with the new UI had no coverage at all.

**Did:** the fake takes a `kvMount` and answers only on it, so a read against
the wrong mount is a clean 404 rather than a secret served from the wrong
place. Five tests added: reading from a configured mount, a wrong mount being a
miss, and `fromConnection`'s three properties — that it takes an address, a
namespace and a mount and has no parameter for a credential; that it refuses an
empty address; and that it still needs a credential in the environment and says
so when there is none, which is the state this machine is actually in and the
message the dashboard shows.

**Verify:** `npm run verify` passes, exit 0 — 796 tests, up from 791.

Checked the way run 19 said to: stashed the fake's mount support and confirmed
both mount tests fail against the old one (`SecretNotFoundError`, and
`exists` true where false was expected), then restored it. A test that has not
been seen red for the right reason proves nothing.

**Learned:**

- **"Do we have a mock?" was worth thirty seconds of `ls`.** The answer was a
  better mock than I would have written, and the useful work was finding the
  one place it silently agreed with the code under test. A fake that shares an
  assumption with its subject tests nothing about that assumption.
- **A default worth checking against a real Vault:** this framework defaults
  `kvMount` to `kv`, and a stock `vault server -dev` mounts KV v2 at `secret`.
  If that is right, the commonest quick setup fails the connection check with
  "nothing is at that path" while everything looks correct — a UX problem on
  the standing priority. The fake cannot settle it, because the fake believes
  whatever it is told. Recorded rather than acted on: it needs a real Vault to
  confirm, and Docker is available on this machine to do it.

**Next:** item 12 slice 2 remains the only `ready` item. Before building it,
confirming the default-mount question above against a real dev server would be
cheap and would either close a UX defect or remove a doubt.

## 2026-08-17 · run 21 · A real Vault, and the default that misses on it

**Picked:** the owner's follow-up — Docker Desktop is running, use it for a
Vault. That settled the question run 20 had to leave open.

**Did:** ran `hashicorp/vault` in dev mode and confirmed the thing the fake
structurally cannot, because a fake believes whatever it is told:

- **Vault mounts KV v2 at `secret/`.** Read from `/v1/sys/mounts` on a live
  server: `secret/  kv  {"version":"2"}`. This framework defaults `kvMount` to
  `kv`.
- The real `VaultSecretStore` works against real Vault — token auth from the
  environment, KV v2 envelope, `describe` and `read`. Driven directly:
  `mount=kv → exists=false`, `mount=secret → exists=true, fields=[password,
  username]`. That is the Vault path genuinely exercised for the first time,
  rather than reasoned about.

So the default misses on a stock Vault, and the failure is invisible: every
path under a wrong mount 404s, and the message reads exactly like a wrong
credential root or a wrong account type — sending people to check the two
things that were fine.

**Changing the default was rejected.** A Vault mounted at `kv` is perfectly
normal, and flipping it would move the same silent miss onto those people
instead. The miss now says where the secret actually is: one extra read on
failure, and the message names the mount that resolved.

Extracted to `src/support/onboarding/vault-connection.ts` rather than left in
`tools/`, per this repository's own split — rules live where they can be tested
without opening a socket, and `tools/` is the socket. Four tests, including the
two that matter: that it finds the mount in *both* directions so the answer is
not a hardcoded guess, and that a probe which throws never fails the check it
was trying to explain (an operator told their Vault is unreachable, seconds
after connecting to it, would reasonably stop trusting the page).

**Verify:** `npm run verify` passes, exit 0 — 800 tests, up from 796.

**Proven live end to end**, against the real Vault and the running dashboard:
mount `kv` → *"Connected, but nothing is at that path under the 'kv' mount —
the same path resolves under 'secret'. Set the KV mount to 'secret' and check
again."* Following that advice → *"Found it. The credential is there and
carries username and password"*, with `VAULT_KV_MOUNT=secret` added to the
exports it prints. The seeded password appears nowhere in the page's HTML. The
container was stopped afterwards and the scratch draft removed.

**Learned:**

- **The fake and the real product disagreed about a default, and only the real
  one could say so.** Every existing Vault test passed while the default was
  wrong for the commonest setup, because the fake was configured to match the
  code rather than to match Vault. Worth remembering the shape: a fake shares
  whatever assumption you build into it, so the assumptions themselves need a
  real system, once, cheaply. Ten minutes of Docker answered a question three
  runs of reasoning had left open.
- **A wrong default is not automatically a default to change.** The evidence
  said `kv` is wrong for a stock Vault; it did not say `secret` is right for
  everyone. Making the failure self-diagnosing serves both, and cost less than
  the argument about which default is correct would have.
- **Vault is free to run locally and needs no signup**, which makes "we have no
  Vault to test against" a smaller constraint than it looked. The standing note
  in `backlog.md` should say "no *hosted* Vault", not "no Vault".

**Next:** item 12 slice 2 — verify a Vault sign-in server-side — is still the
only `ready` item, and is now much better positioned: a real Vault can be stood
up in one command whenever it needs proving.

## 2026-08-17 · run 22 · A Vault target signs in, and setup:auth passes unedited

**Picked:** item 12 slice 2 — verify a Vault sign-in server-side. The only
`ready` item, and the last thing standing between a Vault target and the aim
the dashboard states in its own banner.

**Did:** **Sign in once** is offered to a Vault target once its connection
check has passed. What the page sends is the path the check just proved — an
address, a mount, a path, all configuration — and the credential is read in the
process that drives Chromium. It is not in the request, not in the response and
not on the page, and the invariant is unchanged: no field on that page holds a
secret.

Shapes worth recording:

- `VerifyCredentials` is a union — the two values typed into step 4, or
  `{ fromVault: { connection, path } }`. The rules module deals in the
  reference and never sees a value; `tools/dashboard.ts` resolves it, which is
  the same split that keeps every other rule here testable without a socket.
- A miss is answered as a *failed verification*, not a thrown error. "The
  credential is not where the profile will say it is" is the same finding the
  connection check makes, and a stack trace instead reads as the page breaking.
- The button is withdrawn the moment the proven shape moves, exactly as
  `plannedShape` withdraws a stale preview. Held as a shape rather than a
  boolean for that reason.
- **Sign in with a browser you can see** stays hidden for Vault. It hands a
  filled form to a person watching, which is the one thing a value nobody typed
  must not do.
- Both routes taking a connection now share one reader, so the refusal of a
  body carrying `token`, `secretId`, `secret_id`, `password` or `jwt` cannot be
  shut on one door and left open on the other.

**Verify:** `npm run verify` passes, exit 0 — 809 tests, up from 800.

**Proven live, end to end**, against a real `hashicorp/vault` dev server and
the running dashboard pointed at `https://www.saucedemo.com`:

1. Mount `kv` (the default) → *"nothing is at that path under the 'kv' mount —
   the same path resolves under 'secret'"*, and the sign-in button stayed
   hidden. Run 21's diagnosis and this slice's gate, both working.
2. Mount `secret` → *"Found it."*, and **Sign in once** appeared.
3. Pressed it with nothing typed → *"Signed in. The button "Open Menu"
   appeared, and is proposed as the signed-in marker."* Neither `secret_sauce`
   nor `standard_user` appears anywhere in the page's HTML.
4. Create wrote the pack with that marker, and
   `TARGET=vault-scratch npx playwright test --project=setup:auth` **passed**.

That is the dashboard's stated aim — `setup:auth` passes with no file edited by
hand — reached for a **Vault** target for the first time. The scratch target,
its stored session, the draft and the container were all removed afterwards;
`git status` is the five files this entry describes.

**PR:** branch `agent/2026-08-17-vault-sign-in`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching afterwards.

**Learned:**

- **The gate is what makes this safe to offer, and it had to be a shape.** A
  connection proven for one mount says nothing about another, and a button that
  outlives its check would sign in with something nobody proved. Confirmed the
  test earns its place by disabling the invalidation and watching it fail for
  the right reason — `#verify` visible where hidden was expected — per run 19's
  rule that a green regression test proves nothing until it has been seen red.
- **`renderCredentials()` rebuilds step 4's inputs empty**, so calling it after
  every connection check would have wiped a local target's typed password. It
  is called only when the proven state actually changed. Worth knowing before
  reaching for that function from anywhere new.
- **The live run found item 17 in the last panel of the journey it had just
  passed.** After signing in with the credential and writing the pack, the
  result said credentials *could not be checked* and told me to write the
  credential into the path it had read from twice. `credentialsChecked` is
  hardcoded `false` after Create. Same family as item 14: the page
  contradicting what it just did, and the sort of thing only using it finds.
- **Docker made the whole proof cheap**, as run 21 said it would: one command
  for a real Vault, one `curl` to seed a path, and the two mount cases are then
  a matter of typing a different word into a box.

**Not measured this run:** `npm run triage:measure` was not re-run. Nothing
here touches triage rules and the item picked was `ready`, so run 13's figures
(1 agreed, 0 contradicted, 3 declined) stand unchanged. A run that lands
nothing should still measure.

**Next:** item 12 slice 3 — persist the connection — which is now the only
hand-edit left on the Vault path, or item 17, which is smaller and is a
contradiction on the last screen of the journey.

## 2026-08-17 · run 23 · One step at a time, and a panel that says how many

**Picked:** item 18 — show one step at a time behind a stated overview. The
highest-ranked `ready` item, and the owner's own re-statement of the standing
priority.

**Did:** Both halves, in one change, because the item's own note says neither
is correct alone — an overview without a reveal is a longer page, and a reveal
without an overview is a wizard whose end nobody can see.

- A **Before you start** panel above everything: what you bring (a URL of a
  test deployment, the roles, where credentials live) beside what it reads for
  you (the test-id attribute, the sign-in field names, an OpenAPI document).
- A step that cannot be reached is **not on the page**. `enable()` drops the
  `pending` class and fades the section in; `relock()` is the one path back.
- Rail entries for steps that are not on the page are disabled both ways —
  `pointer-events` and `tabindex="-1"` — rather than left as links to nothing.
- Selecting an onboarded application opens steps 2 and 3, read-only, because
  that is where its settings are. Steps 4 and 5 stay away: it is written.

**Verify:** `npm run verify` passes, exit 0 — **816 tests, up from 809**.

**Measured on the running page, before and after**, which is the finding the
backlog had wrong:

| | before | after |
|---|---|---|
| First paint, 1280×720 | **3888px** (5.4 screens) | **1714px** (2.4) |
| Of that, gated sections | 2370px — **61%** | 0 |

The item had estimated "roughly two screens tall". It was five and a half, and
the majority of it was sections nothing could touch. Both themes checked: every
token the panel uses resolves in light and in dark, and the two columns collapse
to one on a narrow window.

**PR:** branch `agent/2026-08-17-one-step-at-a-time`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching afterwards.

**Learned:**

- **It fixed a defect nobody had recorded, and only driving it found it.**
  Steps 2 and 3 hold every value a profile can be edited to — the test-id
  attribute, the roles, the secret source, the four layers — and they stayed
  `inert` while **Change its settings** offered Save and un-disabled the
  inputs. Confirmed against the page as it was: `document.activeElement` never
  becomes `#testId`, so those fields could not be focused or changed and the
  only editable values were step 1's. The reveal fixes it as a consequence:
  selecting an application is what puts them on the page.
- **Hiding needs a way back, and getting the placement right matters more than
  the code.** `relock` lives in `applyDraft` — the one function that says "this
  is the new-application form as the draft describes it" — because that is the
  only transition that goes backwards. Putting it in `pickChanged` would have
  reached the paths that run after a save or a removal, and withdrawn a preview
  somebody had earned.
- **The copy budget is the reason this stayed short.** The page had 18 words of
  headroom and the panel needed 52. That forced the lede to lose its second
  clause and three blocks to tighten, which is the rule working exactly as its
  own comment says. Two corrections to the measurement went with it: the panel
  is counted (it is the obvious place to grow an essay back under a tag the
  budget does not read), and a block carrying `hidden` is not — the
  browser-assisted sign-in's explanation is shown by pressing a button, which
  puts it with the disclosures.
- **Five of the seven new tests were seen red**, by flipping
  `section.pending` to `display: block` and re-running — per run 19's rule that
  a green regression test proves nothing until it has failed for the right
  reason. The two that stayed green are the rail-link test, which is about
  `aria-disabled` rather than about hiding.
- **Three existing tests were relying on step 4 being rendered-but-inert.**
  They assert that step 3's roles list drives the credential inputs, and read
  them as *visible* — which now needs a preview, the only order a person can do
  it in. Rewritten to the new guarantee via a second helper rather than
  weakened to `toHaveCount`, per run 6's note.
- **What item 19 can actually reuse is less than it assumes.** `enable` and
  `relock` are about steps, and no other page has steps. The overview panel and
  the budget that counts it are the transferable parts.

**Not measured this run:** `npm run triage:measure`. Nothing here touches
triage rules and the item picked was `ready`, so run 13's figures (1 agreed, 0
contradicted, 3 declined) stand unchanged.

**Next:** item 20 — the theme control. It is the owner's other half of the same
ask, `tokens.ts` already ships the three-state palette and `docs/handbook.html`
already has the control to lift, and one part of 20 has landed inside 18
already: a revealed section fades.

## 2026-08-17 · run 23b · The Application slot, driven and written up

**Picked:** no implementation — the owner asked mid-session for a backlog item
about the "Application" section in the top bar not sticking across pages.

**Did:** Drove the running dashboard on all six non-onboarding pages rather
than describing the slot from source, and added **item 21**, `ready`, ranked
after 20 and before 19.

**What using it showed**, with `saucedemo` and `toolshop` onboarded and
`TARGET` unset — the normal state here:

- The bar reads "Application · none selected" on every page, always. It is a
  `<span>`; `resolveTarget()` throws when several profiles are registered and
  nothing has chosen, and the catch renders "none".
- `/users` was listing saucedemo's credentials **while the bar above it said
  none selected**. Two answers to "which application" on one screen.
- Four pages carry their own picker with four ids — `#pick`, `#sTarget`,
  `#cTarget`, `#rTarget` — and none of them shares. Choosing `toolshop` on
  `/users` then opening `/runs` lands back on `saucedemo`.
- The per-page default is **whichever option the API returns first**, i.e.
  alphabetical. CLAUDE.md refuses exactly that for the CLI — "alphabetical
  order does not get to decide which application gets tested" — and **Start a
  run** is one click from it.

**Verify:** not run — documentation only, no code touched.

**PR:** committed to `agent/2026-08-17-one-step-at-a-time` and pushed with
`main`; see the entry above for the run that owned that branch.

**Learned:** the slot was built for this and left read-only — `topbar()` in
`shell.ts` is commented "The org-switcher position, for the same reason
products put one there". So item 21 is finishing a pattern the shell already
argues for, not introducing one. And the ordering against 19 matters: 19
rearranges controls on these pages and 21 deletes four of them.

**Next:** unchanged — item 20, the theme control. Then 21, then 19.

## 2026-08-17 · run 24 · The palette had three states and the tool offered none

**Picked:** item 20, first slice — the theme control. Highest-ranked `ready`
after 18 shipped, and the owner's other half of the same ask.

**Did:** Lifted the control `docs/handbook.html` already had into
`src/support/ui/shell.ts`, so every page gets it by being a page. A segmented
Light / Dark / Auto group in the top bar, a restore-before-paint script in the
head, and the toggle in the shared body script. `DASHBOARD_STYLES` grew the
`.theme` rules and a narrow-window rule; no page was edited.

**Verify:** `npm run verify` passes, exit 0 — **823 tests, up from 816**.

**Proven on the running dashboard**, all seven pages: the control renders on
every one, the restore script is in every head, and choosing dark on `/runs`
and navigating to `/onboard` arrives dark with Dark still pressed. Light, dark
and auto each produce the palette they should — `rgb(16,19,26)` against
`rgb(234,237,241)` — and auto stores nothing.

**Learned:**

- **`tokens.ts` is one template literal, and a backtick in a comment closes
  it.** The brief warns about this for `dashboard-page.ts`; it is just as true
  here, and it cost a parse error on the first run of `tsc`. The comment now
  says so in place, next to the thing that would tempt the next person.
- **A test that finds "the" anything can be moved off its subject without
  failing.** `ui-shell.spec.ts` asserted that "every page it renders is
  syntactically valid JavaScript" by regexing the *first* `<script>` block. The
  head restore is now first, so that guard had quietly stopped covering the
  page's own script — the thing it was written for, and the thing that once
  died at parse time silently. It checks every block now. Anything added to the
  shell should look for guards shaped like that one.
- **Auto has to be the absence of a choice.** No stored key, no attribute. Had
  it stored the word, `:root:not([data-theme="light"])` would have stopped
  meaning what it says and the dark media query would have applied to somebody
  who explicitly asked for light. There is a test for that direction
  specifically, driven with `emulateMedia`.
- **Ordering is the whole feature and behaviour tests cannot see it.** A
  restore that runs from the body script still ends up dark; it just flashes
  white first. So the framework test asserts the restore appears before
  `</head>`, and the browser test asserts it survives a reload. Confirmed red by
  disabling the head restore: one test failed, the right one.
- **Three things in one bar stops fitting at about phone width.** The control
  hung off the right edge below ~420px. It wraps below 60rem now, and
  `scroll-margin-top` grows there to match the taller bar.

**Not measured this run:** `npm run triage:measure`. Nothing here touches
triage rules and the item picked was `ready`; run 13's figures stand.

**Next:** item 21 — the Application slot as a real switcher. It is the same
forty pixels of the top bar this run just edited, so `topbar()` is already the
file to open.

## 2026-08-17 · run 25 · The bar that named the scope could not set it

**Picked:** item 21 — the owner's ask from earlier the same day, evidenced in
run 23b and ranked after item 20.

**Did:** The `.ctx` slot is a `<select>`. The choice is written to
`.dashboard-selection.json` (gitignored, beside the onboarding draft) and read
back by `chrome()`, so it survives a restart on a different port — which
`localStorage` could never have done, because the dashboard binds a fresh
random port every run. The four page-body pickers are deleted; every page reads
one `TARGET_NAME` the shell renders from the same answer the bar was rendered
from.

The rules are `src/support/ui/selection.ts`, pure: environment, then the stored
choice **if that application still exists**, then a single onboarded
application, then none.

**Verify:** `npm run verify` passes, exit 0 — **834 tests, up from 823**.

**Proven on the running dashboard**, and the restart case is the one worth
recording:

1. Nothing selected: the bar offers all three options, `/users` says "choose an
   application in the bar" instead of listing saucedemo's credentials under a
   bar reading "none selected".
2. Chose `toolshop`: the page reloaded scoped to it, and fetching all six other
   pages showed `TARGET_NAME = "toolshop"` and no page-body picker anywhere.
3. **Killed the server and started a new one on a different port** — still
   `toolshop`.
4. `TARGET=saucedemo`: the environment won over the stored `toolshop`, the
   switcher was withdrawn, and the bar said why.
5. `TARGET=nonexistent-app`: "none selected · TARGET not found", rather than
   quietly falling through to the stored choice.

**Learned:**

- **Deleting a picker exposed a second thing deciding the same fact.** With no
  application chosen, the Runs page disabled **Run it** and printed why — and
  its own poll re-enabled it a second later from the slot count alone, under
  the message telling you to choose one. Both go through one `startable()` now.
  The suite never saw it; the live drive did, two seconds after load.
- **A tooltip is not an explanation.** The refusal started as a `title` behind
  the word "fixed". A keyboard cannot reach it, and in the missing-`TARGET`
  case the bar then read "none selected · fixed", which explains nothing. It is
  visible text now, and hides only below 78rem, where the chip alone still
  names the cause.
- **A stored selection outlives its target.** Offboarding removes profiles and
  this file does not go with them, so the stored name is checked against what
  exists on every render rather than trusted.
- **Backticks in a comment inside a template literal, for the third time this
  session** — `tokens.ts` in run 24 and `runs-page.ts` here. The machine check
  exists and is two seconds (`npx tsc --noEmit`); the mistake is starting a
  server before running it. Both comments now say so in place.
- **The four pages differed in what "no selection" means.** Cases genuinely
  wants "every application" and now gets it for free from the empty selection;
  Runs and Stories must refuse; Users has nothing to show. Deleting a shared
  control is only shared work up to that point.

**Not measured this run:** `npm run triage:measure`. Nothing here touches
triage rules; run 13's figures stand.

**Next:** item 19 — the same progressive-disclosure pattern on the pages that
are not wizards. Smaller than it was, because this run deleted the four
duplicate pickers it would otherwise have had to arrange.

## 2026-08-17 · run 26 · Lists whose length nobody chose

**Picked:** item 19 — progressive disclosure on the pages that are not wizards.

**Did:** Measured all six pages at 1280×720 first, which is what decided the
slice. `/publish` was 7.8 screens and `/cases` 7.3; the other four were between
1.9 and 4.1 and were left alone. Both problems had the same cause and neither
was prose or controls: **a list sized by the repository, rendered inline in
full.**

- `/publish` `#rSkipped` joined every unreportable spec title with `"; "` into
  one text node — 192 titles, **3660px**, a single run-on sentence. Now the
  count as a sentence, plus a disclosure saying "Which 192 spec(s)" holding one
  title per line. **7.8 → 2.9 screens**, nothing removed.
- `/cases` lists **are** the page's answer, so they are capped and scrolled
  rather than disclosed — and only above six rows. **7.3 → 3.4 screens**.
- The shared piece is `.longlist` in `tokens.ts`, which is the cap the Publish
  results list has had since it was written, shared rather than restated.

**Verify:** `npm run verify` passes, exit 0 — **835 tests, up from 834**.

**Learned:**

- **This item's own framing was wrong about where the crowding was.** It said
  "the common action visible, the configuration and the rarely-used controls
  behind a disclosure". Measured, the controls were never the problem on any of
  the six pages — the copy budgets were fine and the forms are small. It was
  data, on two pages, and one of those wanted a scroll cap rather than a
  disclosure because the list *is* the page. Two treatments, not one pattern.
- **The two pages that broke are two of the five with no browser test at all.**
  Raised as item 22. Every `tests/` reference to those pages is the onboarding
  page's own `#pick`; the `dashboard` project covers onboarding and the shell
  and nothing else. A green suite had no opinion about a 3660px sentence.
- **A height budget is the assertion that would have caught both**, and it is
  the same idea as `page-copy.spec.ts`'s word budget — which exists because
  "this is getting long" is the judgement nobody makes on a Friday. The word
  budget guards the axis that did not break; nothing guards the one that did.
- Only the stylesheet affordance is unit-tested here. The two page behaviours
  were verified by driving them, with before-and-after numbers, because there
  is nowhere to assert them from yet. Said plainly rather than dressed up: this
  slice's regression protection is item 22.

**Not measured this run:** `npm run triage:measure`. Nothing here touches
triage rules; run 13's figures stand.

**Next:** item 22 — a harness for the pages that have none, then a height
budget. It is worth more than item 20's remaining polish, because it is what
stops the next 3660px block.

## 2026-08-17 · run 27 · A budget for the axis that actually broke

**Picked:** item 22 — the pages with no browser test, and the height budget.
Raised by run 26 and ranked above item 20's remaining polish, because it is what
stops the next 3660px block rather than improving one that already exists.

**Did:** `tests/dashboard/pages-harness.ts`, built the way `harness.ts` is: a
real loopback socket, the real page, the real routes, faking only at the service
boundary the routes already take (`PublishService`, and `/api/cases`). Then
`page-height.spec.ts` — two budget tests and four about the behaviours run 26
could only verify by hand.

**Verify:** `npm run verify` passes, exit 0 — **841 tests, up from 835**.

**Seen red, against the pre-fix pages** (`git checkout 327b11e~1 --` the two page
modules, run, restore):

```
Publish is 5.3 screens on 200 unpostable specs
Cases is 30.1 screens on 270 rows
```

Four of the six failed, for the right reasons, with messages naming the number.

**Learned:**

- **Make the size of the data a parameter, not a fixture.** Both defects were
  defects of quantity — fine on three rows, unusable on two hundred — so a
  fixed fixture would have hidden them the same way the real repository did.
  **Cases on 270 rows is 30.1 screens**; on the real repository it was 7.3,
  because that repository happens to hold 27. The worst case nobody has met yet
  is the one a budget is for.
- **Rebuild the routes per request.** Building them once in the fixture froze
  the sizes at zero, so a test that set `data` and opened the page measured an
  empty one. The first version of the harness did exactly that and every budget
  passed trivially.
- **The budget wants a loose number and a message with the figure in it.** Five
  screens and 1200px are not design rules — they are the tripwire for a block
  with no bound. A tight budget on this axis would be raised by the first person
  it inconvenienced, which is how a rule stops meaning anything.
- One test passes vacuously against the unfixed page: "a short answer is not put
  in a box built for a long one" asserts the *absence* of `longlist`, which is
  true when the class does not exist at all. Kept anyway — its job is guarding
  the over-application, which is a defect that has not happened yet.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** `/triage` into the same harness — 4.1 screens on a real repository,
the closest of the three untouched pages to the budget. Then item 20's
remaining polish (focus states, rhythm, the uneven status colours), then item 12
slice 3 and item 17.

## 2026-08-17 · run 28 · The budget found two more before anybody looked

**Picked:** the rest of item 22 — `/triage` into the harness built last run.

**Did:** Added `/triage`, and the budget immediately reported **22.0 screens on
60 clusters**. Then, giving `/publish` a failure count the first budget test had
never set, **12.7 screens** with the entire Jira section below 7605px of defect
cards. Two more instances of item 19's defect, neither of which anybody had
looked for.

One shared `showFirst()` in the shell script fixes both: the first ten, and a
button naming how many remain. A queue is not capped and scrolled the way the
Cases lists are — you read one, act on it, move on.

**Verify:** `npm run verify` passes, exit 0 — **844 tests, up from 841**.

Seen red by stashing the three page modules: Publish 12.7, Triage 22.0, and both
queue-behaviour tests failed.

**Learned:**

- **The budget did the job a budget is for.** Run 27 wrote it to stop the *next*
  3660px block; it found two existing ones the same day, on a page somebody had
  already "fixed" and a page nobody had suspected. Neither was found by reading.
- **The first budget test was weaker than it looked.** It set `unannotated` and
  not `failures`, so it exercised one of Publish's two unbounded lists and
  passed. A parameterised fixture only covers the parameters a test actually
  sets — the harness offering a knob is not the same as a test turning it.
- **Render everything, hide the overflow.** Publish reads the checkbox of every
  defect in the preview when sending, so an unrendered row would throw and a
  row never scrolled to must still carry the preview's recommendation. What
  gets filed must not depend on how far somebody scrolled. Triage has no such
  sweep and could have got away with not rendering — checked rather than
  assumed — but one pattern safe everywhere beats two that need the difference
  remembered.
- **The tallest-block budget was measuring the wrong thing** and would have
  forced the page to change shape to satisfy it. A section holding ten real
  work items is a fine block; what is being hunted is one block with no bound.
  It now excludes sections and is stated in screens, and I raised the page
  budget from 5 to 6 rather than shrink a batch to fit — against 30.1, 22.0 and
  12.7, the difference between 5 and 5.5 is noise, and a budget that forces
  product tuning is one that gets raised by the first person it inconveniences.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 20's remaining polish — focus and hover states, vertical rhythm
and measure, the unevenly-used status tokens. `/users` and `/stories` do not
need a harness entry yet: 2.6 and 1.9 screens on a real repository and no
unbounded list in either.

## 2026-08-17 · run 29 · Two elements had a measure and the rest ran the column

**Picked:** item 20's remaining polish — and measured the parts before choosing
one, because the item names three and states a defect for each without a number
behind any of them.

**Did:** Gave prose a measure, and put a budget behind it.

- `tokens.ts`: `.note`, `.diag`, `.error`, `.status`, `.empty` and
  `details.more .body` get `max-width: 68ch`, joining `.lede` and `p.explain`,
  which were the only two things in the whole stylesheet that had one. Plus
  `.check span small` — the hint under a checkbox, which on Runs is two
  sentences.
- `.status:has(ul.files)` and `.status:has(pre)` opt back out. A status
  container is where the offboarding plan puts its two-column list of files and
  where the write result puts its block of next steps, and neither is prose.
- `.defect .why` on Publish and `.option dd` on Test users are page-local
  classes and got it in their own page blocks.
- `tests/dashboard/page-measure.spec.ts` — the budget, at 90 characters — and
  `tests/dashboard/measure.ts`, which is the measurement, kept separate because
  the onboarding harness will want it too.

**Measured at 1280×720 against the real repository, widest prose block per
page:**

| page | before | after |
|---|---|---|
| `/runs` | **142** | 76 |
| `/triage` | **135** | 76 |
| `/publish` | **128** | 73 |
| `/cases` | **127** | 73 |
| `/users` | **108** | 76 |
| `/onboard` | 85 | 82 |
| `/stories` | 76 | 76 |

**Verify:** `npm run verify` passes, exit 0 — **848 tests, up from 844.**

**Seen red** by stashing the two page modules and the stylesheet: three of the
four new tests failed, naming `div.why` at 128, and paragraphs at 127 and 127.

**Learned:**

- **The item bundled a real defect with one that had already been fixed.**
  "Focus and hover states — a keyboard operator cannot always see where they
  are" is two claims. Focus is fine and has been all along: one rule in
  `tokens.ts` puts a 2px accent outline on every focusable element, and the
  seven that did not match `:focus-visible` when driven were `display: none`
  inside closed disclosures. Hover is the real one — the served sheet has five
  `:hover` rules and **not one of them is on `button`**. Recorded as `ready`
  under item 20 rather than bundled in here.
- **Define the thing being measured by what it is, not by what is wrong
  today.** The budget looks for *an element that directly holds a long run of
  text in a proportional font*, so it catches a paragraph nobody has written
  yet. A budget listing the classes that were wrong on the day it was written
  would have been green forever.
- **Monospace has to be excluded, and it is not a convenience.** Triage renders
  failure signatures at 135 characters a line and that is correct — a stack, a
  path and a command want the width they need. A measure is a rule about
  reading sentences, and the exclusion is what makes it a rule rather than a
  preference.
- **`ch` is not a character.** It is the width of a zero, and every other glyph
  in a proportional face is narrower, so `max-width: 68ch` reads as about 76.
  Asserting on the CSS value would have been asserting on the wrong number;
  the test measures the rendered font instead.
- **The first version of the narrow-window test asserted something false.** It
  used a 900px viewport to check the cap does not bind on a small screen — but
  the column is still 780px there, so it correctly did bind. A test that fails
  because its premise is wrong is the cheap version of that lesson; 420px is
  the window the assertion was about.
- **The budget's blind spot is the page list, not the rule.** The two worst
  numbers on the table above are on pages the harness does not serve, so they
  were found by hand and are still unheld. Item 22 now says so.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** `/runs`, `/users` and `/stories` into `pages-harness.ts`, so the two
budgets cover the pages where the worst of both were found. Then item 20's
hover states, then item 12 slice 3 and item 17.

## 2026-08-17 · run 30 · The budget found the fifth one on the day it could see it

**Picked:** the rest of item 22 — `/runs` and `/users` into `pages-harness.ts`,
so the two budgets cover the pages where run 29's worst numbers were found by
hand.

**Did:** Added both to the harness and to both budgets. `/users` takes the same
service interface the three already there do; `/runs` needed an event-stream
endpoint, served outside the router exactly as `tools/dashboard.ts` serves it.

**The budget found a fifth unbounded list immediately: Test users at 14.1
screens on 160 accounts.** Roles times pool size — a property of the profile,
which the page has no say in — with the two fields for setting a password below
all of it. Capped and scrolled above six rows, like the Cases lists rather than
like the Triage queue, because this list is the page's answer rather than a
queue you work through.

**Verify:** `npm run verify` passes, exit 0 — **855 tests, up from 848.**

**Seen red** by stashing `users-page.ts`: the budget at 14.1 screens and
`#slots holds 160 rows and does not scroll`. The third of the three, the one
guarding the over-application, passed — as it should, since the class is absent
either way.

**Measured, and left for the next run — the Runs page is unbounded too:**

| runs held | page |
|---|---|
| 12 | 5.3 screens |
| 20 | 8.0 |
| 30 | 11.5 |

Raised as item 24 rather than fixed here, and the reasoning is in the item: the
cause is that **nothing ever removes a run from `RunManager`'s map**, so the
layout fix and the data-lifetime fix are different answers to different
questions, and `#runs` being the last block on the page weakens the argument
that made item 23 obvious. A change with no settled defect is the taste-only
refactor the guardrails refuse. The budget is armed at 12 and fires at about 14.

**Learned:**

- **A harness entry is worth more than the fix it enables.** `/users` had been
  called "small, and it can wait for a reason" twice, on a real repository where
  it renders four rows. It renders a hundred and sixty on a profile nobody in
  this repository has, and the page was fourteen screens. The reason it could
  wait was that nobody had looked at it with a number.
- **An event stream needs `closeAllConnections()` before `close()`.** The
  `/runs` tests failed as `Tearing down "pages" exceeded the test timeout` —
  sixty seconds spent waiting on an SSE socket doing exactly what SSE sockets
  do. The failure names the fixture, not the cause, which is worth remembering
  the next time a harness grows a long-lived connection.
- **Check the page rendered before believing a budget it passed.** `/runs` came
  in at 5.3 screens on twelve runs, which is a pass — and a page that never
  received its stream would also have passed. Probed it: twelve cards, three
  hundred failure rows, 3802px. Run 28 recorded this trap and it was still
  worth spending two minutes on.
- **Choose the fixture's size from the domain, not from the result.** Twelve
  runs is a morning; twenty is a long one. Setting the parameter where the page
  passes and saying so is honest, and it leaves a tripwire armed just above
  today's load. Setting it at twenty to force a red would have been picking the
  number to make an argument.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 24 — the Runs page, and which of the two treatments it should
get. Then item 20's hover states, then item 12 slice 3 and item 17.

## 2026-08-17 · run 31 · The cause, and the Vault the tool already knew about

**Picked:** two, at the owner's direction and in their words — item 24 "leaning
towards the manager", and item 12 slice 3. One run, two commits.

### Item 24 — the Runs page

**Did:** `runsToForget` in `registry.ts`, pure and beside the other run
decisions, called when a run starts. The map now holds `RETENTION.runs` and
never forgets a run that is still going, however old it is.

**Why the manager was the right lean**, and it is a better reason than height:
`pruneRuns` deletes a run's *directory* past the same retention, and the page
reads its progress out of that directory. A run the map kept past the prune
renders as a card with no numbers in it, about a run whose every artefact has
been deleted. The map should not outlive the disk.

Twenty cards is still eight screens, so the layout half followed — the newest
ten and a button naming the rest, item 23's pattern against a bound rather than
against nothing. This page redraws off its stream twice a second, so the choice
lives beside the `expanded` flag and `showFirst` takes a callback.

**Then the budget kept failing at 8.0 screens with the fix in.** The rows were
hidden and all twenty were still on screen: an author rule setting `display`
beats the browser's own `[hidden] { display: none }`, and a Runs card is a flex
column. `tokens.ts` now says what `hidden` means. Triage and Publish escaped it
only because neither `.cluster` nor `.defect` sets `display` — which is luck,
not design, and is why the rule is shared rather than local.

### Item 12 slice 3 — keeping the Vault

**Did:** `.vault-connection.json` beside the draft, gitignored, and
`src/support/secrets/vault-config.ts` holding the decision. `fromEnvironment()`
now resolves the environment first and the stored connection second, so a run
resolves a Vault the dashboard proved with nothing exported.

**Written only once the connection has been proved all the way to the
credential.** One that reached Vault but missed the path has not proved its
mount, and the check is at that moment telling somebody to change the mount —
storing it would be keeping the setting the message says is wrong.

**The environment wins whole, not field by field.** A job exporting an address
for one Vault while a laptop file names a mount in another would compose a
third connection that is neither, and a mount belonging to the wrong address is
the exact silent miss run 21 found.

**Proven against a real Vault**, `hashicorp/vault` dev mode, run 21's recipe:

```
STORED   {"address":"http://127.0.0.1:8200","kvMount":"secret"}
DESCRIBE {"exists":true,"fields":["password","username"],"version":1}
READ     username=standard_user password.length=12
ENV WON  Vault: GET kv/data/... did not complete   (VAULT_ADDR at a dead port)
```

The first three with `VAULT_ADDR` and `VAULT_KV_MOUNT` unset — the hand-edit
this slice existed to remove. The fourth is the precedence seen rather than
reasoned about: pointed at a port nothing is on, it failed against *that*
rather than falling back to the file that was right. Container, file and both
scripts removed afterwards.

**Verify:** `npm run verify` passes, exit 0 — **867 tests, up from 854.**

**Learned:**

- **The cause fix and the symptom fix were both needed, and saying which is
  which mattered.** The layout alone would have left cards describing deleted
  runs; the manager alone would have left eight screens. The backlog framed
  them as alternatives and they were not.
- **A test that optional-chains a function it is not sure exists passes without
  testing anything.** The guard against a reload overwriting a half-typed
  address called `window.loadState?.()`. It now asserts the function was there
  and ran, which is one line and the difference between a test and a shape.
- **Refuse a credential on the way in from the file, not only from the page.**
  The route has refused `token`, `secretId`, `password` and `jwt` since slice 1.
  A file is the other door, and a hand-edited one is exactly where a token ends
  up if it is tolerated anywhere.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 20's hover states — evidenced in run 29, three rules, and the
`color-mix` toward `--ink` that gets the direction right in both themes. Then
item 17, then `/stories` into the harness.

## 2026-08-17 · run 32 · A palette that passes, and the fourth budget

**Picked:** the owner's ask — *"let us try to use a palette colors that also
passes WCAG checkpoint on dark and light modes"* — folded into item 20 rather
than raised separately, because it is what that item is about: the theme
control made both themes real, and this is the polish that became checkable
once they were.

**Measured before changing anything, and the palette was mostly already right.**
Text cleared 4.5:1 everywhere in both themes; the worst pair in either was
4.61. What failed:

| what | was | now |
|---|---|---|
| white on the dark theme's `--fail` — the destructive button | **2.94** | 5.87 |
| every input and select border, light | **1.92** | 3.31 |
| every input and select border, dark | **1.70** | 3.33 |
| `--muted` on `--fail-soft` | **4.18** | 4.63 |
| the pressed theme segment against its group | **1.07** | 3.31 |

**Did:** `--rule-strong` moved in both themes; `--muted` darkened a step in
light; the destructive label follows `--surface` rather than being white; the
pressed theme segment carries a ring drawn as a shadow so nothing shifts; the
four `.sep`/`.arrow` glyphs stopped using a border token as a text colour. Then
`tests/dashboard/contrast.spec.ts` (five pages × two themes) and
`onboarding-contrast.spec.ts`, sharing one measurement in `measure.ts`.

**Verify:** `npm run verify` passes, exit 0 — **879 tests, up from 867.**

**Seen red** against the old palette: every input, select and secondary button
in the tool at 1.7–1.92:1 in both themes, plus the destructive button's label
at 2.94:1. Roughly a hundred findings across twelve tests.

**Learned:**

- **Compute from the rendered page, not from a table of tokens.** A table is a
  second copy of the palette and the copy is what goes stale — and it would
  have missed both of the findings that mattered most: `--muted` on
  `--fail-soft` is a pair nobody would think to write down, and the pressed
  theme segment's 1.07:1 is a *state*, not a colour pair at all.
- **A colour read straight after a theme switch is the old one.** `.theme
  button` has `transition: color .15s`, so the first version of this reported
  the theme control at 2.98:1 in dark and it looked exactly like a real defect
  — the ancestor chain showed `--muted` already holding the right value. The
  test now loads *in* the theme with `emulateMedia`, which is both correct and
  closer to what most people are in: auto, no attribute, the system deciding.
- **Two bugs in the check before any bug in the palette.** It scored a filled
  button's border against its own fill (1:1 for every solid button), and it
  scored the backdrop *including* the element's own background. A contrast
  check is easy to write and easy to write wrongly, and every early failure it
  reported was its own.
- **A ring drawn as `box-shadow` is a boundary, and a check that cannot see one
  pushes people towards worse CSS.** It now parses shadows and counts the ones
  with no blur and a positive spread, which is what a ring is; the soft drop
  shadow in the same declaration is correctly ignored.
- **Say what the standard does *not* ask for, in the place somebody will argue
  about it.** Card and section borders stay at 1.25:1 deliberately: 1.4.11 is
  about identifying a component or its state, and the edge of a card is neither.
  Both `tokens.ts` and the test say so, because the next person to run a
  contrast tool over this will see those numbers and reach for a repaint.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 20's hover states, which is now the last of that item — three
rules, and the `color-mix` toward `--ink` that gets the direction right in both
themes. Then item 17, then `/stories` into the harness.

## 2026-08-17 · run 33 · The buttons answer the pointer, and the budget was measuring less than it claimed

**Picked:** item 20's hover states — the last of the three things that item
named, evidenced in run 29.

**Did:** `button`, `button.secondary` and `button.destructive` each answer the
pointer. The mix moves **toward `--ink`**, which is the whole trick: `--ink` is
dark in light and light in dark, so one declaration darkens on a light page and
lightens on a dark one, and hover goes the expected direction in both with no
second block to keep in step. Not on a disabled button — a hover response on a
control that will refuse is a promise the page does not keep.

`tests/dashboard/controls.spec.ts`, both themes, and it asserts the half a
hover state usually gets wrong: that the **label is still readable on the
hovered fill**. The contrast budget cannot see that, because it measures a page
nobody is pointing at.

**Verify:** `npm run verify` passes, exit 0 — **884 tests, up from 879.**

**Seen red** by stashing `tokens.ts`: both "answers the pointer" tests failed,
naming the primary button and the theme.

**Learned:**

- **The contrast budget shipped last run was measuring less than it claimed.**
  `color-mix()` computes to `oklab(...)` in Chrome, and the budget parsed
  colours with a regex expecting `rgb(...)`. Anything with a mixed background
  returned null, was skipped in the backdrop walk, and got scored against
  whatever was further up the page — the context bar has had a `color-mix`
  background since it was written. Colours are parsed by the browser now,
  through a 1×1 canvas, which understands every space the browser does and
  hands back the sRGB this arithmetic is defined in. Nothing new failed after
  the fix, which is the good outcome and not the point: it was not looking.
- **It surfaced through a number that made no sense.** A hovered button
  measured 1.07:1 — the ratio of `--surface` to `--surface-2`, which is the
  page behind the button rather than the button. A wrong answer that is
  *recognisably* some other pair is worth chasing; the same bug on a plausible
  number would still be there.
- **Check which variant a button actually is.** The first version of this spec
  took `#rSend` on Publish — "Post results" — for the primary button. It is
  styled `.destructive`, and Publish has no plain primary button at all; the
  pair live on Test users. Two of the three variants would have gone untested
  behind a passing test.
- **A transition makes a straight read return the old value**, which run 32
  learned about theme switching and this hit again on hover. `expect.poll` is
  the answer both times, and it is the one the conventions already give.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 17 — after Create, the page warns about a credential it just
used. Then `/stories` into the harness, then item 19b.

## 2026-08-17 · run 34 · The panel stopped assuming and started asking

**Picked:** item 17 — after Create, the page warned about a credential it had
just read from twice.

**Did:** `src/support/secrets/resolvable.ts`, and `diagnoseWritten` uses it
instead of hardcoding `credentialsChecked: false`.

**The fix is neither of the two the item proposed.** Not a flag passed from the
page, and not trusting what the page claims — it **asks the store**, with the
same `describe` call the connection check makes. The rule the old comment was
defending is untouched: `describe` returns existence and field names, nothing
here can return a value, and there is no argument that changes that. So the
panel is now right about a target nobody checked on the page as well as one
somebody did, which a flag would not have managed.

**Verify:** `npm run verify` passes, exit 0 — **891 tests, up from 884.**

**Proven on real data**, against the real `saucedemo` profile and the real
local store:

```
RESOLVED               {"resolvableRoles":["standard"],"credentialsChecked":true}
CREDENTIAL DIAGNOSTICS []
WRONG-ROOT             {"resolvableRoles":[],"credentialsChecked":true}
WRONG DIAGNOSTICS      ["credentials-missing: No credentials for role 'standard' at qa/not-onboarded/..."]
```

The panel got quieter about the thing that was fine without going quiet about
the thing that is not.

**Learned:**

- **A comment defending a rule is not the same as the code obeying it.** The
  hardcoded flag carried a note saying credentials are never read back, which
  is true and correct — and the conclusion drawn from it, that the panel must
  therefore assume the worst, did not follow. `describe` was already the answer
  and was already in use one screen earlier.
- **Two failures that look alike want different sentences.** "The store did not
  answer" and "the path is empty" both produce no resolvable roles; reporting
  the first as the second sends somebody to write a credential into a Vault
  they cannot reach. The function distinguishes them and the doctor's two
  existing messages line up with the distinction exactly.
- **Put the decision in `src/support/` and the store in `tools/`.** The first
  version had the whole thing in `tools/dashboard.ts`, where a fake store
  cannot reach it. Moving it cost nothing and bought seven tests.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** `/stories` into the pages harness (item 22's last page), then item 19b
— the overview panel into `shell.ts`. After that the backlog's `ready` list is
the status tokens and the spacing scale, both of which still want a stated
defect.

## 2026-08-17 · run 35 · The page that was supposed to be fine

**Picked:** item 22's last page — `/stories` into the pages harness. The
backlog said it had "neither a measured defect nor an unbounded list" and could
keep waiting for a reason.

**It has one.** `#sList` renders every story ever pulled, and how many that is
is how long a team has been using this. Parameterised: **4870px of buttons at
120 stories, and the page 8.8 screens**, with the story you opened — its
criteria, the cases already drafted from it — below all of them.

**Did:** `/stories` into the harness with an `AuthoringService` fake, into all
three budgets, and `#sList` capped and scrolled above six rows. Capped like the
Cases lists rather than shown ten at a time: this list is how you *find* a
story, not a queue you work through.

**Verify:** `npm run verify` passes, exit 0 — **897 tests, up from 891.**

**Seen red** by stashing the page module: 8.8 screens, and `#sList holds 120
stories and does not scroll`.

**Learned:**

- **Three for three: a page looks bounded on the repository somebody looks at
  it on.** Publish was fine until 192 unpostable specs, Cases until 270 rows,
  Test users until a profile with eight roles, and now Stories until a year of
  pulling them. The claim being corrected here was made twice in this file, and
  both times the evidence was a real repository that happened to be small.
- **A green budget on the first run is the moment to check it is measuring
  anything.** `/stories` passed all three the instant it joined. It was
  rendering 40 stories, which was real — but the *story detail* is hidden until
  one is picked, so criteria and drafted cases went unmeasured. The test opens
  one now, and the number moved from 3.3 screens to 4.3 before any data grew.
- **The heavy-looking fake was cheap.** This page was deferred twice partly
  because `AuthoringService` needs a case-author model. `model()` throws: a
  budget never drafts a case, and a fake that pretended to would be answering a
  question nothing asks.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** item 19b — the overview panel into `shell.ts`, and one non-wizard
page given one. That is the last shaped item; after it the `ready` list is the
status tokens and the spacing scale, both still wanting a stated defect.

## 2026-08-17 · run 36 · The panel that was never about onboarding

**Picked:** item 19b — the overview panel into `shell.ts`, and one non-wizard
page given one. Which is what the item's own note said the first slice should
be, once item 18 had shipped and shown that `enable` is about *steps* and no
other page has steps.

**Did:** `.preflight` and `.pf-title` into `tokens.ts`; an `overview()` helper
in `shell.ts` taking two columns; **Publish** given one; and onboarding's own
panel converted to the helper rather than left beside it, so there is one way
to write one rather than two.

Publish because it is the page where knowing the shape first is worth most —
the one that leaves the building. *You bring* against *It leaves behind*, and
that pairing is the rule rather than symmetry: a list of what a page needs,
with no matching list of what it produces, reads as a warning.

**Verify:** `npm run verify` passes, exit 0 — **899 tests, up from 897.**

Checked in a browser in both places: Publish renders two columns and is still
2.4 screens; onboarding's panel is unchanged through the helper, `<code>` and
bullet colour intact.

**Learned:**

- **The budget for this already existed and was already general.**
  `page-copy.spec.ts` has counted `.preflight` words against the page's 220
  since item 18 — written for onboarding, and it applied to Publish the moment
  Publish had one. A budget that names a mechanism rather than a page is the
  one that keeps working.
- **A literal newline inside a nested template literal is a parse error**, and
  it is the third variant of this trap the log has recorded — after a backtick
  in a comment in `dashboard-page.ts` and the same in `tokens.ts`. Joined with
  a constant here. Anything that builds HTML out of nested templates in this
  repository will meet one of the three.
- **Converting the original caller is what makes it shared.** Leaving
  onboarding's hand-written markup beside a helper that produces the same thing
  would have been two ways to write one panel and a guarantee they diverge —
  which is the outcome item 19 named at the start.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Next:** the backlog's `ready` list is down to item 20's status tokens and the
spacing scale, both of which still want a stated defect measured before they
are worth doing. That is a scan run.

## 2026-08-17 · run 37 · Four values for one role, none of them visible

**Picked:** item 20's "uneven use of the status tokens" — the last polish item
with a claim attached. Scanned it first, because the claim was that this is a
*legibility* fix.

**The claim was wrong and the defect is real, differently.** Legibility is
fine: every status colour passes the contrast budget in both themes and no page
hardcodes one. What is actually there is **twelve `.badge.*` rules across five
files**, each restating the same three declarations, with the border mix
drifted to **four different values for the same role** — 25%, 30%, 40%, and a
pair setting a flat token instead.

None of that is visible, and that is the point rather than a reason to leave
it: the thirteenth badge gets written by copying whichever one was nearest, and
there was no way to be right by default.

**Did:** `.badge` in `tokens.ts` carries the recipe; a page sets `--status` and
`--status-soft`, plus `--status-ink` where the ink differs from the line it is
mixed from, which is the accent and was being re-derived by hand each time.
Twelve restatements became twelve one-liners. `ui-shell.spec.ts` refuses a
badge rule that sets anything else.

**Verify:** `npm run verify` passes, exit 0 — **901 tests, up from 899.**

**Seen red** by stashing one page module: `publish: a badge sets --status and
--status-soft, not 'color'` — it names the page and the property.

**Learned:**

- **Scan before believing the item, even when the item is in this file.** Three
  of item 20's four polish claims have now turned out mis-shaped: focus was
  already done, the measure was on two elements rather than uneven, and this
  one was maintenance rather than legibility. The items were written from
  reading, and the loop's own rule about that applies to its backlog.
- **"Not visible" is not the same as "not a defect".** The drift here changes
  nothing on screen. What it changes is whether the next person can be right
  without checking, which is the same argument the four budgets rest on.
- **A backtick in a comment inside a template literal, for the fourth time** —
  `tokens.ts` again, and the file's own comment warns about it two hundred
  lines above. Warning somebody in one place in a 700-line literal does not
  reach the person editing the other end of it.

**Not measured this run:** `npm run triage:measure`. Nothing here touches triage
rules; run 13's figures stand.

**Then, in the same run: the spacing scale, measured and declined.**

- **38 distinct rem spacing values across 238 declarations**, eight of them
  inside one 0.4rem band and used 116 times between them. 25 of the 38 are off
  a `.25rem` grid. Real inconsistency, in the source.
- **And none of it misaligns anything.** Driven at 1280×720 on Triage and Test
  users: section gaps uniform at 18px, every section and every heading on one
  left edge, heading-to-prose 13–14px where the 1px is font metrics. The rhythm
  a reader perceives comes from `section`, `.head` and `p.explain`, which are
  already shared; the 38 values live inside page-specific components where
  nothing aligns across them and nothing can.

So it is declined, and that closes item 20. Normalising 238 declarations puts
every visual detail in the tool at risk for no defect anybody meets, and a
partial scale would be two systems — which is the thing the badge fix in this
same run existed to remove. **What would change the answer:** an owner asking
for a visual refresh, at which point the scale is the right vehicle and should
be one deliberate pass rather than a background refactor.

**Next:** nothing in `backlog.md` carries a `ready` label. Item 11 is a
standing objective rather than a task. A future run should scan — drive the
dashboard and the onboarding journey and find the next thing — rather than pick.

## 2026-08-18 · run 38 · A row that wrapped, and two things inside it that could not

**Picked:** scan run. Re-checked before starting, per the file's own warning:
`git fetch origin` then `git rev-parse --short main origin/main` both gave
`503a567`, matching run 37's final commit — nothing had landed since, and
nothing in `backlog.md` carries a `ready` label. `target:doctor` reported both
targets OK, so this was a clean scan rather than a recovery.

**Did:** drove all seven pages live against `npm run dashboard` rather than
reading source — the onboarding page, `/users`, `/stories`, `/cases`, `/runs`,
`/triage`, `/publish` — first at 1280×720 and in dark theme, where everything
held up. Then resized to a real phone width, 375×812, which is where item 20
(the theme control) and item 21 (the application switcher) had each been
checked separately but never together at that width.

**Found a real overflow.** `document.documentElement.scrollWidth` measured
427–428px against a 375px `clientWidth` — the whole page scrolled
horizontally, on every page, because the top bar is shared shell code. Traced
to `.topbar-end` in `src/support/ui/tokens.ts`: it holds the application
switcher (`.ctx`, 270px measured) and the theme control (`.theme`, 122px) as
two flex items with `gap: 1rem` and no `flex-wrap` of its own. Run 24's
`@media (max-width: 60rem) { .topbar { flex-wrap: wrap; } }` wraps the bar as
a whole onto a second row, but `.topbar-end` is one item on that row — wrapping
the row did nothing for what was inside the one thing left on it, and at a
width narrower than their combined 408px the two controls overflowed instead
of dropping onto their own lines.

Fixed with one rule in the same media query: `.topbar-end { flex-wrap: wrap;
justify-content: flex-end; row-gap: .4rem; }`. Confirmed live before and after
on `/onboard` and `/runs`: `scrollWidth` 428px → 375px, the switcher and the
theme control now stack without overlapping, and both 1280px (desktop) and
960px (the 60rem breakpoint itself) are unaffected — the two controls still
share one line there, exactly as before.

Two tests added to the existing "narrow windows" block in
`tests/dashboard/shell-navigation.spec.ts`, at 375px rather than the block's
existing 560px (which is where the *rail* moves, not where this box breaks):
no horizontal overflow, and the switcher/theme control do not share a row
without also not overlapping. **Seen red first** — stashed the CSS change and
ran both new tests against the old rule: the "stack rather than collide" test
failed (`theme.y` 37px short of `ctx.y + ctx.height` in the test's synthetic
fixture), and the overflow test passed on that same fixture, because its
`.ctx` renders shorter static text than the real `<select>` on a live page.
Recorded in the test file's own comment so the next person does not read that
pass as proof the bug never existed — the collide test is the one that earns
its place.

**Verify:** `npm run verify` passes, exit 0 — **903 tests, up from 901.**

**Also checked, and deliberately not acted on.** `/triage` currently lists an
unresolved cluster from a toolshop run dated 2026-08-16 16:22 —
*"Tearing down 'dashboard' exceeded the test timeout of 60000ms."* That
predates both run 19's poll-race fix and run 30's `closeAllConnections()` fix
(both 2026-08-17). `grep -rn "Tearing down" src/ tests/ tools/` finds nothing
in this repository — it is Playwright's own fixture-teardown wording, not
framework text — and this run's own `npm run verify`, including the
`dashboard` project, finished in 58 seconds with no teardown timeout anywhere.
One two-day-old sample, on a run predating two fixes that plausibly explain
it, is exactly the "three singletons is not a rate" trap item 13 corrected
once already. Left untriaged rather than promoted to an item; worth acting on
only if it recurs on a fresh run.

**Learned:**

- **A width that was checked for one control is not checked for two.** Item
  20 measured the theme control down to phone width and item 21 measured the
  switcher separately; nobody measured both together in the same box after
  21 landed second. The lesson already written into item 18's log entry — "a
  page looks bounded on the repository somebody looks at it on" — has a
  sibling for layout: a bar looks like it fits at the width somebody last
  resized to.
- **`.topbar` wrapping is not the same claim as "everything in the bar
  wraps."** A flex container's own `flex-wrap` only concerns its direct
  children; a child that is itself a flex row with un-wrapped children of its
  own does not inherit the behaviour, and reads as fixed exactly where the
  parent reads as flexible. Worth watching anywhere else in `tokens.ts` a
  `.topbar`-style nested flex box exists.
- **A regression test can pass on a fixture for the wrong reason.** The
  overflow test stayed green against the unfixed CSS in this file's own
  synthetic page, not because the bug was absent but because the fixture's
  `.ctx` is shorter than a live `<select>`. The collide test is what actually
  exercises the missing wrap, and is now the one doing the work; the overflow
  test is kept as the more direct statement of the user-facing symptom.
- **The triage page surfaces real signal even when it is the wrong thing to
  act on this run.** An old, unrepeated failure sitting in `/triage` is worth
  a five-minute check against current `verify` output before either fixing it
  blind or ignoring it silently — and "checked, evidence points at already
  fixed, declined" is itself the record worth leaving, per this file's own
  rule that a dead end is as valuable as a change.

**Next:** nothing in `backlog.md` carries a `ready` label after this run
either. The next run is another scan — drive the dashboard and the onboarding
journey — and should check a real phone width (375px) as part of that, not
only the 560px the existing "narrow windows" tests cover, since that is what
this run's finding was hiding behind.

## 2026-08-18 · run 39 · The signature that said the same thing twice

**Picked:** scan run. Checked before starting, per the file's own warning:
`git rev-parse --short HEAD origin/main` both gave `0bfeba9`, matching run 38's
final commit — nothing had landed since, and nothing in `backlog.md` carried a
`ready` label.

**Did:** drove the running dashboard rather than reading source. Started at run
38's own parting advice — a real phone width — and it is clean: 375×812 on
`/onboard` and `/triage` gives `scrollWidth` 375 against `clientWidth` 375, no
overflowing element anywhere. Run 38's fix is holding. Onboarding opens at 1734px
(2.41 screens) with all four gated steps at zero height, so item 18 is holding
too.

**The finding came from reading a page, not measuring it.** `/triage` renders a
cluster from the toolshop run of 2026-08-16 whose signature is the same sentence
printed twice, back to back, followed by the step and the window.

**Traced to `normaliseError` (`src/support/triage/cluster.ts`), which took
`.split('\n').slice(0, 3)` — blank lines included.** Playwright renders
`expect.poll(fn, { message })` as `Error: message`, a blank, `message`, a blank,
and only then the matcher. So all three slots went to the message and its own
echo, and the signature never reached what was asserted.

**The precise claim matters, and my first draft over-claimed it.** I wrote the
comment and the test as "a custom assertion message", then checked both forms
against real runs: `expect(value, message)` prints the message **once** and was
never affected (fixture TF-5903), while `expect.poll(fn, { message })` prints it
**twice** (toolshop `actions/catalogue.ts:81`). Corrected both before commit.
The narrower claim is the more damning one: **`expect.poll` is the primitive
these conventions mandate** for eventual consistency — "the only acceptable
answer" — so the required style produced the least informative signature in the
suite.

Fixed by dropping blanks and an immediately-repeated line *before* taking three.
The count stays at 3 on purpose: the number of lines feeding run-to-run variance
is unchanged, only their informativeness moves.

**Verify:** `npm run verify` passes, exit 0 — **906 tests, up from 903.**

**Measured on the real runs on disk, before and after:**

| cluster | before | after |
|---|---|---|
| toolshop search (`expect.poll`) | **323 chars, message twice, no matcher** | 255, once, plus `expect(received).toBe(expected) … Expected: true` |
| toolshop a11y | 134 | 151 — gains `+ Received + <n>` |
| teardown timeout | 90 | **90, byte-identical** |
| fixture TF-5901, TF-5904 | — | **byte-identical** |

**Measured this run**, because it touched clustering: `TARGET=saucedemo npm run
triage:measure` → **1 agreed · 0 contradicted · 3 declined**, exit 0. Unchanged
from run 13, which is the expected result and is now checked rather than
assumed: `errorText` hands the rules the whole `message + stack`, never the
signature, so a richer signature cannot move a verdict.

**Seen red first**, per run 19's rule: stashed `cluster.ts` and ran the three new
tests against the old function. The two improvement tests failed for the right
reasons — one reporting the sentence twice, the other missing `Expected:
visible`. The third passed, correctly: it is the counterweight, guarding a
regression the change must not introduce.

**PR:** branch `agent/2026-08-18-signature-window`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **A signature is data somebody reads, and nobody had read one.** Four budgets
  hold these seven pages — copy, height, measure, contrast — and all four are
  about the shape of the page. None has an opinion about whether the text
  *inside* a block says anything. The duplication had been rendering on `/triage`
  since the run that produced it, in full view, past two scan runs.
- **The framework's own mandated style produced its worst input.** Worth
  generalising past this fix: when a convention requires a construct, the
  machinery downstream should be checked against that construct specifically.
  `expect(value, message)` was fine and is the form nobody is told to prefer.
- **Check both forms before writing the comment.** I nearly shipped a comment
  and a test name claiming every custom message duplicates. Two minutes against
  two real runs made the claim narrower, true, and more useful — the log has now
  recorded the "verify the claim, not just the fix" lesson at run 10, run 12,
  run 17 and here.
- **This was the last free moment to re-key the clusters.** Cluster ids hash the
  signature, and `config/triage-verdicts.jsonl` does not exist — no human verdict
  has ever been recorded, so nothing was orphaned. `HumanVerdict.signature`
  carries a comment saying it is redundant "until the day clustering changes";
  that day was today, and it cost nothing only because the file was empty.
- **The single-line signatures are byte-identical**, which is the check that
  separates a fix from a repaint. Three of the six real clusters did not move.

**Next:** nothing in `backlog.md` carries a `ready` label after this run either,
so the next run is another scan. Two threads worth picking up, both noted rather
than taken here: `/triage` still lists run 38's two-day-old teardown cluster,
which is now two runs of `verify` further from reproducing and is still not worth
chasing; and the four budgets all measure page *shape*, so a run looking for the
next class of defect should read what the pages actually say rather than measure
how tall they are — that is where this run's finding was hiding.

## 2026-08-18 · run 39b · The suite nobody had run

**Picked:** item 11, at the owner's direction — *"circle back on item 11 which
i believe is live runs"*. That reading is right, and it turned out to be the
thing the item was missing rather than a slice of it.

**The premise I started on was the backlog's, and it was the wrong one.** Item
11's only remaining shaped slice was "build a triage-fixture for `toolshop`".
Before building one I checked what the rules actually measure, and found
something better: of the **seven** rules in `rules.ts`, exactly **one**
(`transport-failure`) has ever been settled against ground truth. But that is
still a measurement about the *fixture*, and the owner's ask is about **every
end-to-end test**. So I ran the live suites instead — and discovered this loop
has never run them.

**`npm run verify` covers `framework` and `dashboard` only.** No spec against a
real application is in it, by design. In 39 runs, every entry in this file
records a green verify while the 13 toolshop specs went unexecuted since run 11.
`/triage` had been showing their failures since 2026-08-16, which is the same
two-day-old cluster run 38 looked at and declined to chase — correctly, on the
evidence it had, but the reason it was there was that nobody was running the
suite.

**Did:** ran the full live toolshop suite. `TOOL-1-01 @smoke` failed. Re-ran the
whole suite; **a different pair failed** — both cart specs, `TOOL-3-01 @smoke`
and `TOOL-3-02` — on `add-to-cart` and `increase-quantity` resolving to a
`disabled` button.

**Root cause, read off the live application rather than inferred.** Toolshop
renders an out-of-stock product with `data-test="out-of-stock"` and the whole
quantity/add control set disabled. The API confirmed **two of the nine products
on page one were out of stock**, and the first of the nine was one of them. Both
cart specs take `[first]` from the shared listing and assume it can be bought.
Stock is shared mutable state on a public demo — anybody in the world can buy
the last Combination Pliers — so this is the conventions' own *never assert on
data the spec did not create*, and the same lesson `actions/cart.ts` records one
level down: the vocabulary could describe a product but not whether it could be
bought.

Fixed in L1 so the spec can ask: `cardLinks`, `inStockCards` (a `hasNot` filter,
so it auto-waits instead of being sifted with a non-waiting `count()`),
`outOfStock`, and an `addableProductNames` action. Both specs assert the
precondition with a message rather than dying on `undefined`.

**The second defect is the better one, and the fix is what exposed it.** With
selection fixed, TOOL-3-01 failed differently: `Expected "Pliers", Received
" Combination Pliers "`. `card(page, name)` used `filter({ hasText: name })` —
a **substring** match — and this catalogue is full of nesting names ("Pliers"
inside three others, "Hammer" inside four). Asking for "Pliers" and taking
`.first()` opened the wrong product. It had been invisible for as long as the
spec asked for whatever was already first, because then the wrong answer and
the right one were the same element. Anchored with `exactly()`.

**Verify:** `npm run verify` passes, exit 0 — **906 tests**, unchanged, because
it does not cover any of this. The number that matters here is the live one:
**13/13 toolshop and 2/2 saucedemo pass**, where 2 of 13 failed before.

**Seen red then green, deterministically and without load** — unfixed, both
cart specs fail on the disabled button in isolation; selection-only, TOOL-3-01
catches the substring bug in the act; both, green.

**Not re-measured:** `npm run triage:measure`. Run 39 measured it four hours ago
at 1 agreed · 0 contradicted · 3 declined and nothing since has touched triage
rules or clustering.

**PR:** branch `agent/2026-08-18-live-suite`; `main` fast-forwarded and pushed,
`main` and `origin/main` confirmed matching.

**Learned:**

- **The loop was measuring the framework and calling it the suite.** This is the
  most useful thing found in several runs and it is not a bug in any file: 39
  green entries, and the specs the whole repository exists to run were not among
  them. Raised as item 29, and it outranks the fixture work item 11 had queued.
- **A failure that moves between specs on each run is a data problem, not a
  flake.** Run 1 failed the search spec; run 2 failed both cart specs; both
  passed in isolation three times. The instinct trained by item 13 is "measure a
  rate" — and the rate would have been noise, because the variable was the
  *catalogue's stock*, which changes when a stranger buys something. Reading the
  disabled button beat counting the failures.
- **Fixing selection exposed a locator that had been wrong all along.** The
  substring match was only ever *correct by coincidence* — it agreed with
  `.first()` because the spec asked for the first thing. Worth generalising:
  a locator whose input is always the same value it would have returned anyway
  is untested, and the day something else chooses the input is the day it
  breaks.
- **`filter({ hasText })` is a substring, and `getByRole(..., { name })` is
  not.** Checked rather than assumed, because `cartLocators.quantity` relies on
  the difference and is correct.
- **Two more instances of the substring trap exist** and were deliberately left
  as item 28 rather than folded in — neither is reachable today, and this file
  has followed "raise it, do not smuggle it" since run 17. The `empty()`
  argument for why it still matters is in the item.

**Next:** item 29 — put the live suites in the loop — then item 28. Item 11's
`toolshop` triage-fixture is still open but now ranks below both: a fixture of
deliberate failures is worth less than running the suite that is meant to pass,
and this run is the evidence for that ordering.

## 2026-08-18 · run 39c · Correcting run 39b: 13/13 was true at three workers

**Picked:** verifying my own claim, which is how this one started and where it
should have started.

**Correcting run 39b.** That entry says *"the number that matters here is the
live one: 13/13 toolshop and 2/2 saucedemo pass, where 2 of 13 failed before."*
The fixes it describes are real and the cart specs are genuinely fixed — but
**13/13 is not what the live suite reliably does.** Run 39b measured it four
times across the session and got 13/13 each time it looked; run 39c ran it four
more times at the default worker count and got **1 passed / 3 failed**.

**The cause is not run 39b's change**, checked by varying the one thing that
matters rather than by reasoning: at `--workers=3` the suite passed **3 of 3**;
at the local default of 7 it passed **1 of 4**. toolshop declares
`poolSize: { customer: 3 }` and `serverState: true`, and `accountForWorker`'s
own comment says *"two workers only collide when there are more workers than
accounts."* Seven workers, three accounts.

**Three runs, three different failures, one cause** — a `setup:auth` that
reported no error and established no session, an `isSignedIn` that never became
true after a successful sign-in, and a cart row that would not detach. Raised as
item 30, `ready`, with the reason it is not a one-line patch: the obvious
implementation caps toolshop at 1 worker because it has a single admin account.

**Verify:** unchanged, `npm run verify` passes at 906 — and that is the point of
item 29. Nothing in `verify` has an opinion about any of this.

**Learned:**

- **I reported a number I had seen rather than a number I had measured.** Four
  observations, all green, all taken while I was iterating on a fix and
  therefore all in the same conditions — and I wrote it up as the suite's
  behaviour. The honest form was available and cheap: run it several times on
  the committed state, which is what this entry is. Run 19 wrote the rule this
  breaks — *"a measured zero is a result"* — and the corollary is that four
  green runs taken during development are not a measurement.
- **Fixing a real defect made the remaining instability easier to misread, not
  harder.** With the out-of-stock bug gone the suite looked fixed, and the
  contention underneath it had been there the whole time, wearing the same
  clothes: intermittent failures on cart specs. Two causes, one symptom, and
  clearing the first is what let the second be seen.
- **Vary one thing.** `--workers=3` versus the default settled in six runs what
  no amount of reading the three stack traces would have — they genuinely look
  like three unrelated bugs.

**Next:** item 30 (the worker ceiling) and item 29 (put the live suites in the
loop) are the pair, and they belong together: 29 is what would have caught this
on day one, and 30 is what makes 29 report something stable. Item 28 after
those.

## 2026-08-18 · run 40 · A ceiling for the pool the suite actually shares

**Picked:** item 30 — more workers than accounts, on a target that keeps state
on the server. Re-read `open-items.md` and compared `main` to `origin/main`
immediately before starting: both at `f5e0efa`, and the worklist had moved
since run 39c — the owner split `backlog.md` into `open-items.md` and
`coverage-phase.md` and onboarded ParaBank (item 31 came out of that) in a
session between run 39c and this one, with no numbered log entry for either
change. Item 30 was still top of the ranking either way, so this run proceeded
on it rather than treating the gap as something to backfill.

**Did:** `workerCeiling(roles, poolSize, serverState)` in `src/support/paths.ts`,
beside `accountForWorker` and built the same way — pure, no target named, unit
tested from plain values. It binds on `roles[0]`, the identity
`playwright.config.ts` already gives `authedPage` for the `e2e` project, not on
the minimum pool across every role — the decision the item left open. A second
pure function, `resolveWorkers(ceiling, isCI)`, turns a ceiling (or `null`) into
an actual worker count, keeping both existing defaults (`undefined` locally, 4
in CI) untouched when there is nothing to cap. `playwright.config.ts` computes
the ceiling once from the selected target right after `resolveTarget()` and
passes it through `resolveWorkers` into the top-level `workers` field — the
only place Playwright reads it; there is no per-project `workers` option, which
is why this could not live inside one project's config.

**Verify:** `npm run verify` passes, exit 0 — 914 tests, up from 906 (8 new
cases in `tests/framework/account-pool.spec.ts`). Diff: 143 lines across 3
files (`src/support/paths.ts`, `playwright.config.ts`,
`tests/framework/account-pool.spec.ts`), well under the ~400-line guideline.

**Measured live, not only asserted.** Resolved `workers` per target by
importing `playwright.config.ts` directly with `TARGET` set (`npx tsx`):
toolshop → **3** both locally and in CI (its `{ customer: 3, admin: 1 }` pool,
bound on `roles[0]` = `customer`); saucedemo and parabank → **1** both
(`serverState: true`, no `poolSize` declared, same default `accountForWorker`
already uses); no target selected → unchanged, `undefined` locally and 4 in CI.

Then ran the live toolshop suite six times at the resolved default, no
`--workers` override on the command line — confirmed the config was actually
picking up 3 (`Running 6 tests using 3 workers` in the output, not the old 7).
**The three specific collision symptoms run 39c reproduced did not recur in any
of the six**: no `setup:auth` reporting no session, no `isSignedIn` staying
false, no cart row refusing to detach. **Not a clean sweep, and this entry says
so rather than rounding up** — two of six runs failed on something else
entirely: a cart badge that never incremented once, a mismatch between the
API's product list and the storefront's once. Neither matches the
account-collision shape this item targets, and both are plausible as ordinary
variability on a public demo whose stock and catalogue move under other
people's traffic — parabank's own profile already documents the same class of
thing about its host. Recorded rather than chased: diagnosing a live external
site's own flakiness is a different investigation than this one, and it is
exactly what item 29 exists to turn into a rate instead of another anecdote.

**PR:** branch `agent/2026-08-18-worker-ceiling`; `main` fast-forwarded and
pushed per the standing instruction, confirmed matching `origin/main`
afterwards.

**Learned:**

- **`workers` has no per-project override in Playwright's config shape** —
  checked against the `Project` type before assuming a smaller, project-scoped
  fix was possible. That is why the ceiling has to be computed once, globally,
  from whichever target `TARGET` selected, rather than living inside the `e2e`
  project block next to the role it actually concerns.
- **The item's own open question was worth taking seriously rather than
  guessing past.** Binding on the minimum pool across roles is the shape that
  looks obviously "safer" and is the one that silently caps every target with
  an incidental single-account role — toolshop would have dropped to 1 worker
  for an admin nothing writes as. `roles[0]` is a real claim (it assumes specs
  share the default role's identity, which is what `authedPage` already does),
  so it is pinned by a test with the roles reversed, not just asserted in prose.
- **A live measurement can both confirm a fix and correct the claim it was
  chasing.** This run set out to reproduce run 39c's "3 of 3" and instead found
  2 failures in 6 — not because the fix didn't work (the specific symptoms it
  targets are gone), but because run 39c's own number was a small sample that
  happened to land clean, the same lesson run 39c itself drew about run 39b's
  "13/13". Worth generalising again: a handful of green runs during development
  is not a measurement, whatever the sample size claims.
- **Capping CI below 4 for one target and not others is a real behaviour
  change**, not a side effect to gloss over. It is called out explicitly in
  `backlog.md` rather than folded into "verify passes" — nothing currently on
  disk raises CI's number, only lowers it for targets whose pool is smaller
  than 4, so nothing regresses today, but the next target with a larger pool
  would raise CI's worker count for itself and no other target, because the
  cap is computed per selection rather than globally.

**Next:** item 29 — put the live suites in the loop — is now stronger-cased
than before this run: this run's own six-run measurement is exactly the kind of
number item 29 would have produced automatically, and the two non-collision
failures are the evidence that a single-item rate is not enough on a live
public demo. Item 28 (the same substring trap in `cartLocators.line`) after
that, then item 31 (the a11y scan discarding what an incomplete check was).
Item 11 remains a standing objective rather than a task.

## 2026-08-18 · run 41 · The suites the loop was never told to run

**Picked:** item 29 — the live suites are not part of any loop. Re-read
`open-items.md` and compared `main` to `origin/main` before starting: both at
`14719dc`, nothing had landed since run 40, and 29 was top of the ranking.

**Did:** `npm run suites:live` (`tools/live-suites.ts`) runs every onboarded
application's own specs against the real deployment, one process per
application, and reports pass/fail per application with the triage category for
anything that failed. The shaping and reporting live in
`src/support/live-suites.ts` as pure functions — a `RunResult` in, a summary
out — so the thing that reports on three public demos is itself testable with
no browser, no network and no target.

**The half that matters more than the command:** step 5 of the working
agreement in `backlog.md` now obliges **every** run to execute it and record
the result. A command nobody is told to run is precisely how this item came to
exist.

Three decisions worth recording, because each had a plausible alternative:

- **Not in `npm run verify`, on purpose.** Verify has to work with no network,
  no credentials and every demo down; that is what makes it the one command CI
  and every contributor can run. Folding a live suite in would have traded a
  real guarantee for a reporting convenience.
- **The run triages its own result** — the open question the item left. It
  reuses `clusterFailures` and `classifyByRule` verbatim rather than inventing
  a fault vocabulary beside the taxonomy, which would then be free to disagree
  with it. A failure arrives as `network-infrastructure (rule:
  transport-failure)` or as `no rule matched — needs judgement`.
- **Any failure exits 1, whatever the category**, following run 13's precedent
  that exit codes are a policy statement. Forgiving a deployment-blamed failure
  was considered and rejected: a rule is a heuristic over error text, an outage
  is worth knowing about, and a command that goes green on "the application was
  down" cannot answer the question it was built for. A suite that could not run
  at all exits **2** — nothing was measured, which is different from something
  failing.

One small config change enabled it: `LIVE_ONLY=true` leaves the `framework` and
`dashboard` projects out. There is no "every project except these" flag, and
the alternative — naming the live projects on the command line — means
re-deriving the capability gating outside `playwright.config.ts` and letting
the two drift.

**Verify:** `npm run verify` passes, exit 0 — **924 tests**, up from 914 (10
new cases in `tests/framework/live-suites.spec.ts`). Diff: 476 lines across 7
files, of which ~150 are tests and ~90 are documentation; hand-written source
is ~230.

**Live suites — the measurement this run exists to start recording:**

| application | result |
|---|---|
| parabank | **2/2 passed** |
| saucedemo | **2/2 passed** |
| toolshop | **13/13 passed** |

**17/17, exit 0, 54 seconds for all three.** That is the number future entries
trend against.

**Seen red as well, and not by waiting for it.** Pointing a target at a dead
loopback port — loopback is always in the allowlist, so no profile was edited —
produced a real `ECONNREFUSED`, reported as `network-infrastructure (rule:
transport-failure)`, exit 1, with the dependent spec correctly shown as skipped
rather than passed. The exit-2 path was exercised with an unknown `--target`.

**Triage agreement:** `1 agreed · 0 contradicted · 3 declined`, exit 0 —
unchanged from runs 13, 26 and 39, as expected, since nothing here touched
triage rules or clustering.

**PR:** branch `agent/2026-08-18-live-suites`; `main` fast-forwarded and pushed,
`main` and `origin/main` confirmed matching.

**Learned:**

- **Running the thing found a defect that reading for it would not have, on the
  first execution.** toolshop declares `contracts: enabled: true` with a
  vendored OpenAPI document and `tests/contract/` holds only a `.gitkeep`; the
  `contract` project is built, collects zero specs, and the run is green.
  toolshop's 13/13 contains no contract assertion at all. Parabank's `api` is
  the same shape. The conventions are careful that a capability declared *off*
  reports "not applicable" rather than a silent zero — a capability declared
  *on* with no specs is a silent zero wearing the opposite label, and it is the
  more misleading of the two. Raised as item 32 rather than folded in, per the
  norm since run 17.
- **The loop had a measurement-shaped hole and the fix is half command, half
  working agreement.** Writing only the command would have reproduced the
  original failure at one remove: available, correct, and unrun. The
  obligation in step 5 is the part that closes it, and it is the part with no
  code in it.
- **Two directories being empty is not two instances of one problem.**
  Parabank's empty `tests/a11y/` is already explained — the coverage phase
  parked that spec pending item 31 — so counting it alongside the genuinely
  unexplained ones would have inflated item 32 and sent the next run looking
  for a cause that is already written down. Item 32 says which two are real.
- **A pure core made the untestable testable.** The command drives three public
  demos, so nothing about it could be asserted in `verify` — but the summarising
  and the exit-code policy are pure functions over a run model, and those are
  where every decision worth pinning actually lives.

**Next:** item 32 (declared capabilities with no specs — `target:doctor` is the
natural home, and whether it warns or errors is the call to make), then item 28
(the substring trap in `cartLocators.line`), then item 31 (the a11y scan
discarding what an incomplete check was). Item 11 remains a standing objective.
**Every run from here also runs `npm run suites:live` and records the table** —
that is now step 5, not an optional extra.

## 2026-08-18 · run 42 · The placeholder that switched off three checks

**Picked:** item 32 — declared capabilities with no specs. Re-read
`open-items.md` and compared `main` to `origin/main` before starting: both at
`1487910`, nothing had landed since run 41.

**Correcting run 41, which raised this item with the wrong diagnosis.** Run 41
wrote that `target:doctor` had no check for "declared capability, no specs",
that it was the natural home for one, and that the open decision was whether it
should warn or error. Opening `diagnose.ts` before writing anything into it
showed all three checks already there — `api-no-specs`, `contracts-no-specs`,
`a11y-no-specs` — as warnings, worded almost exactly as the item proposed. They
had simply never fired.

**The real defect, and it is better than the one I reported.** `hasUnder(dir)`
asks whether any pack file starts with `dir/`. The scaffolder writes
`tests/api/.gitkeep` and `tests/contract/.gitkeep` to keep those directories in
git, and a `.gitkeep` satisfies that. So `api-no-specs` and
`contracts-no-specs` could **never fire on a scaffolded pack** — the scaffolder
disarmed them at birth — and `a11y-no-specs` went quiet the moment somebody
removed the scaffolded spec and left a placeholder, which is precisely what
parabank did. `no-e2e-specs` had the same hole.

**Did:** added `specsUnder(dir)`, which asks for a `*.spec.ts`, and pointed the
four spec-directory checks at it. Grouped the pack predicates into a small
`PackView` rather than adding a sixth positional parameter to three functions.
The vocabulary directories (`locators`, `actions`, `api`, `db`) keep `hasUnder`
on purpose — the scaffolder writes real modules into all of them and never a
placeholder, so that question is already answered correctly, and widening the
diff to "fix" it would have been change for its own sake.

One judgement taken: a capability warning stays quiet while the pack holds no
specs *at all*. Evidence for it rather than taste — the dashboard's success
panel renders every diagnostic in full, code and message and fix, directly
above a "Next" list that already says to write the specs, so three more warning
blocks would be noise at the moment somebody succeeded. That state is already
named once by `no-e2e-specs`.

**Verify:** `npm run verify` passes, exit 0 — **927 tests**, up from 924 (3 new
cases in `tests/framework/onboarding.spec.ts`). Diff: 232 lines across 4 files.

**Live suites (step 5):**

| application | result |
|---|---|
| parabank | **2/2 passed** |
| saucedemo | **2/2 passed** |
| toolshop | **13/13 passed** |

**17/17, exit 0** — unchanged from run 41, as expected: nothing here touches a
target pack.

**Measured on the real repository, before and after.** `npm run target:doctor`
reported *"OK — profile, pack and credentials agree. Nothing to fix."* for all
three applications before; it now reports `contracts-no-specs` on toolshop and
`api-no-specs` + `a11y-no-specs` on parabank, with **saucedemo still clean** —
the counterweight that says this is a fix rather than a new noise source.

**Proven against the real scaffolder, not a fixture:** a scratch target
scaffolded with `--with=api,contracts` reports `no-e2e-specs` once and no
capability warnings. Removed afterwards with `tools/offboard.ts`, and
`config/secrets.local.json` confirmed byte-identical (md5 unchanged).

**Seen red then green**, deterministically and without load: stashing the fix
fails the two new tests, while the third — the counterweight asserting that a
real spec beside a `.gitkeep` still settles the question — passes either way.

**PR:** branch `agent/2026-08-18-gitkeep-blindspot`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **I raised an item from a symptom and named a cause I had not checked, and
  the log has now recorded that mistake five times.** Runs 10, 12, 17, 39c and
  this one. The pattern is identical every time: something observable is real,
  the explanation attached to it is a guess, and the guess is what the next run
  would have built. Run 41 had the evidence — the live suite listing zero
  contract specs — and then wrote a cause into the item without opening the
  file it named. **The observation belongs in the item; the diagnosis belongs
  in the run that opens the code.**
- **A check that cannot fire is worse than a missing one.** A missing check is
  a known gap. Three checks sat in `diagnose.ts` reading exactly right, with
  tests covering them — the `a11y-no-specs` test passes on a fixture with no
  `.gitkeep` in it — while the tool they run in said "nothing to fix" about the
  thing they were written for. The tests were green and the feature was dead.
- **The scaffolder disarmed the checker, and neither file is wrong on its
  own.** `.gitkeep` is the correct way to keep an empty directory in git, and
  `hasUnder` is the correct question for a vocabulary directory. The defect
  only exists where the two meet, which is why nothing in either file's own
  tests could catch it — and is an argument for the live command from run 41,
  since that is what surfaced it.
- **A fixture that is too clean hides the bug it is meant to guard.**
  `HEALTHY_PACK` contains no `.gitkeep`, so every existing diagnose test
  described a pack that the scaffolder does not actually produce. The new tests
  use the pack shape that really lands on disk.

**Next:** item 33 — toolshop's contracts capability still validates nothing,
which the checker now reports and nobody has acted on; it is coverage-phase
work rather than a framework defect. Then item 28 (the substring trap in
`cartLocators.line`), then item 31 (the a11y scan discarding what an incomplete
check was). Item 11 remains a standing objective.

## 2026-08-18 · run 43 · The contract suite found drift on its first run

**Picked:** item 33 — toolshop declared a contracts capability that validated
nothing. Re-read `open-items.md` and compared `main` to `origin/main` before
starting: both at `70ca702`, nothing had landed since run 42.

**Did:** six specs in `src/targets/toolshop/tests/contract/catalogue.spec.ts`.
The live toolshop suite goes **13/13 → 19/19**, and `target:doctor` stops
saying `contracts-no-specs` — the warning run 42 had just taught it to say,
closed by the run after.

**The design rule the file is built on**, and the thing worth carrying to the
next contract suite: in the `contract` project the shared client is built with
`throwOnDrift: true`, so a spec proves conformance *by making the call at all*.
Its assertions therefore exist to prove the call was **worth making** — an
empty collection validates against almost any array schema, so a suite that hit
an empty catalogue would report a green contract run having exercised none of
the item shape. Every spec asserts the response actually carried the thing
under test.

**It found real provider drift, and it found it because a spec was written to
look for it.** The empty-result case got its own spec with a comment predicting
that `from` and `to` are where a page envelope breaks — written *before* it was
run. Then both sides were read rather than inferred:

- document: `components.schemas.PaginatedProductResponse` types `from` and `to`
  as `{ type: 'integer' }`, not nullable.
- service: `GET /products/search?q=<no matches>` answers
  `{"current_page":1,"data":[],"from":null,"to":null,"total":0}`.

Every populated search validates. Only the empty one does not. The published
document does not describe the service's own empty answer.

**Disposition, which was the real decision.** Recorded as `test.fail()` with a
reason and a review date of 2026-11-18. Deleting the spec is what the
conventions forbid — an exception nobody can see. Leaving it red spends the
entire suite's signal on a third-party demo this repository cannot fix, and
would have made `suites:live` report a permanent failure with no path to green,
which is exactly how a measurement gets ignored. `test.fail()` keeps the claim
in the report *and* inverts it: the day either side is fixed, the spec fails
for passing and somebody has to come back.

The last spec reports coverage — **5 of 87 documented operations** — as an
attachment rather than an assertion, because a threshold there would only ever
be met by lowering it. It does assert that every path it claims to validate is
really in the document, so a typo cannot quietly reduce coverage while looking
like an endpoint.

**Verify:** `npm run verify` passes, exit 0 — **927 tests**, unchanged, because
the new specs are a target's and `verify` covers `framework` and `dashboard`.
That is item 29 working as designed, and the reason step 5 exists.

**Live suites (step 5):**

| application | result |
|---|---|
| parabank | **2/2 passed** |
| saucedemo | **2/2 passed** |
| toolshop | **19/19 passed** (13 + 6 contract) |

**23/23, exit 0.**

**PR:** branch `agent/2026-08-18-toolshop-contracts`; `main` fast-forwarded and
pushed, `main` and `origin/main` confirmed matching.

**Learned:**

- **Writing the assertion before the run is what made the finding legible.**
  The comment predicting `from`/`to` was speculation when written; the run
  turned it into evidence in one step, and the diagnosis needed no
  investigation because the hypothesis was already on the page. Compare run 41,
  which recorded an observation and attached a guessed cause — the difference
  is whether the guess is written where the run can immediately confirm or kill
  it.
- **A capability that had been "on" for days validated nothing, and everything
  reported green throughout.** Run 41 built the command that made the gap
  visible, run 42 fixed the checker that should have reported it, run 43 closed
  it. Three runs to go from a green 13/13 that proved nothing about the
  contract to a 19/19 that does — and the first two were both about *being able
  to see the gap*, which is where the time actually went.
- **Two gaps found by needing them, both raised rather than smuggled.**
  Accessibility has waivers with a reason and an enforced review date;
  contracts have nothing, so run 43's review date sits in a comment where
  `target:doctor` cannot read it (item 34). And `tally()` counts by outcome, so
  the expected failure reads as `{total: 6, passed: 6, failed: 0}` — the report
  says six passed and six did not (item 35). Both were found by checking what
  the run model actually recorded rather than trusting the console's "6
  passed".

**Next:** item 34 — give accepted provider drift the same recorded home
accessibility exceptions already have, since there is a `test.fail()` on disk
standing in for it. Then item 28 (the substring trap in `cartLocators.line`),
item 31 (the a11y scan discarding what an incomplete check was), and item 35
(expected failures counted as passes). Item 11 remains a standing objective.

## 2026-08-18 · run 44 · Five items, and the one the fifth uncovered

**Picked:** items 34, 28, 31 and 35 — at the owner's explicit instruction to
*"continue working on the next 5 items without stopping"*, rather than the
usual one per run. The fifth is item 36, which this run found while verifying
its own work. Each landed as its own commit; `npm run verify` ran between them.

Re-read `open-items.md` and compared `main` to `origin/main` before starting:
both at `dcac615`.

**34 — accepted provider drift has a recorded home.** `ContractWaiver` beside
`A11yWaiver`, carrying an endpoint, a reason, a `reviewBy` the doctor enforces,
and an optional `at` JSON pointer so accepting one property does not blind an
endpoint. Waived drift is subtracted inside the registry and recorded, never
dropped. Run 43's `test.fail()` became a real waiver, plus a spec pinning the
exception at exactly two properties.

**28 — the cart line is anchored.** The interesting part is that `exactly()`,
the obvious tool, is the wrong one: a row's text is the name *plus* quantity,
price and total, so `^…$` matches nothing. `Quantity for <product>` was already
in the file and is a whole accessible name. saucedemo's equivalent anchored
too, with a local `exactly()` rather than a shared one.

**31 — an undecided a11y check says which check it was.** `scan.undecided`
beside the count, `describeUndecided()` to name it, and waivers deliberately
not applied — a waiver accepts a *known* failure, and an undecided check is not
known to be anything. **It unblocked ParaBank's parked accessibility spec**:
the check was `color-contrast` across **30 nodes**, invisible behind the number
`1`. `PB-5-01` ships and passes live.

**35 — a declared failure is counted.** `KindTotals.expectedFailures`, and
`formatLiveReport` says "N known failure(s)". Counting a `test.fail()` inside
`passed` is right; counting it *only* there let toolshop's contract suite
report `{ total: 6, passed: 6, failed: 0 }` for a run where one spec did not
conform.

**36 — the pool is partitioned on `parallelIndex`.** Found by reading a live
failure's `workerIndex` and noticing it was 6 on a suite capped at 3.
`workerIndex` is unique per process and increments on restart; only
`parallelIndex` is bounded by the worker count. Workers 0/2/3 map to accounts
1/3/**1**.

**Verify:** `npm run verify` passes, exit 0 at every step — **938 tests**, up
from 933 at the start of the batch.

**Live suites (step 5):**

| application | result |
|---|---|
| parabank | **3/3 passed** (gained `PB-5-01`) |
| saucedemo | **2/2 passed** |
| toolshop | **20/20 passed** |

**25/25, exit 0.**

**PRs:** five branches, each fast-forwarded onto `main` and pushed —
`contract-waivers`, `substring-trap`, `a11y-undecided`, `parallel-index`,
`known-failures`.

**Learned:**

- **The most valuable thing in this run is item 37, and it came from
  disbelieving my own green.** Two live runs mid-batch failed on different
  specs and both passed in isolation. The tempting reading was flakiness on a
  public demo. Reading the failure instead — a cart row resolving 33 times and
  never detaching — said *something else is emptying this cart*, and the cause
  turned out to be written in the conventions already: worker indices repeat
  across projects, and `auth-flows` runs concurrently with `e2e` signing in as
  the same customer. Three runs (30, 36, 37) have now circled the same account
  pool from different angles; only 37 is the one the live failures were about.
- **Two of these five were "the obvious fix is the wrong one".** `exactly()`
  cannot anchor a cart row, and a waiver must not silence an undecided
  accessibility check. In both cases the correct answer was narrower than the
  item proposed, and in both the item's own proposal would have shipped
  something plausible and wrong.
- **A fix can be right and still not fix the thing you noticed.** Item 36 is a
  genuine collision with a test pinning it, and it does not explain the live
  failures. Saying so in the commit message mattered more than the fix — the
  next run would otherwise have read "pool collision fixed" and stopped looking.
- **Batching five items cost the per-item discipline the loop normally has.**
  Each got its own commit and its own verify, but the backlog and log entries
  were written at the end, in one pass, rather than beside each change. That is
  a worse audit trail and it is visible here: this entry reconstructs five
  decisions from memory instead of recording each while it was fresh. Worth the
  owner knowing before asking for a batch again.

**Next:** item 37 — two projects signing in as the same customer — is the only
`ready` item and is what stands between the live suites and a stable green. It
wants a decision between three shapes, and the smallest honest one is probably
giving `auth-flows` its own identity. Item 11 remains a standing objective.

## 2026-08-18 · run 45 · The identity was the wrong suspect

**Picked:** item 37, and the owner chose the shape — *"give auth-flows its own
identity"*. Re-read `open-items.md` and compared `main` to `origin/main` first:
both at `23f263b`.

**The collision was sharper than the item described, and reading the code is
what sharpened it.** Item 37 said "worker indices repeat across projects",
which is true and vague. The actual mechanism: `secrets.account(role)` defaults
to **index 1**, and `auth-flows` called exactly that. So it was not a sometimes
overlap — on every run, the project driving a login form signed in as the
account `e2e`'s slot-0 worker was holding and mutating a cart with.

**Did:** `credentials.authFlowAccount` reserves one account in the first role's
pool and withholds it from every worker — `usableAccounts` excludes it,
`accountForWorker` skips it, `workerCeiling` counts what is left.
`secrets.signInAccount(role)` resolves it and falls back to account 1 where no
profile reserves one, so every other target is untouched. `target:doctor`
errors on a reservation outside the pool and warns on one it cannot honour.
toolshop reserves `customer3`; `e2e` now runs at two workers.

**Verify:** `npm run verify` passes, exit 0 — **945 tests**, up from 938.

**Live suites (step 5), and this is the finding:**

| what was run | result |
|---|---|
| toolshop live suite, ×3 after the change | **3 failed** |
| **`setup:auth` alone, ×4** | **1 failed** |
| full live suite, final | parabank 3/3, saucedemo 2/2, **toolshop 19/20** |

**The fix did not stabilise the suite, and I am not going to claim it did.**
The second row is what settles the question: `setup:auth` on its own is one
project with no other suite running, so there is no contention this repository
is capable of creating — and it still failed one run in four, *through* the two
retries that project allows, with "the form reported no error".

So the dominant cause is the deployment, not the suite. toolshop is a public
demo with vendor-published credentials; anybody on the internet can be signed
in as `customer@practicesoftwaretesting.com` and empty a cart a spec just
filled. Raised as item 38 with the numbers, because it now decides whether the
step-5 measurement means anything.

**Landed anyway, on its own merits.** The collision is provable by reading the
code and pinned by unit tests, and a real defect does not stop being one
because a noisy baseline cannot show the improvement. But it cost a worker and
bought no visible stability, and the entry says so in both files.

**Learned:**

- **I nearly reported a fix as a success because the reasoning was good.** The
  mechanism was real, the diagnosis was specific, the tests pinned it — and
  three live runs in a row still failed. Run 39c wrote the rule this would have
  broken ("I reported a number I had seen rather than a number I had
  measured"), and the only reason it did not happen again is that the numbers
  got worse rather than better and forced a second look.
- **Stripping the suite away was the measurement that mattered**, and it took
  four commands. Everything before it — which spec failed, on which worker,
  with which locator — was detail about a symptom. Running `setup:auth` alone
  answered "is the application reliable at all", and the answer was no. Worth
  reaching for earlier next time: before attributing an intermittent failure to
  contention, check whether the thing works at all when nothing is contending.
- **Three runs have now circled this account pool** — 30 (worker ceiling), 36
  (`parallelIndex`), 37 (reserved identity). All three found and fixed genuine
  defects. **None of them made the live suite green**, because none of them was
  the cause. That is a pattern worth naming: a plausible mechanism plus a
  reproducible-looking symptom is not causation, and the pool was plausible
  three times running.

**Next:** item 38 needs the owner. Of the three options written up, only
standing up an owned toolshop deployment actually makes the suite green, and it
has a real cost. Until that is decided, `suites:live` will keep reporting red
for reasons no change in this repository can fix — which is precisely how a
measurement gets ignored. Item 11 remains a standing objective.

## 2026-08-18 · run 46 · The application was saying it plainly and nobody could hear it

**Picked:** the owner's two instructions, taken in order.

**One — a defect in the application stays failing.** Written into
`docs/CONVENTIONS.md` as its own section and regenerated into the three
instruction files. It draws the line the last three runs kept walking past: a
defect in the application is *reported and left red*, and contention this suite
creates is ours and must be fixed here. The cheap way to tell them apart is
also written down — run the failing thing with nothing else running, and if it
still fails no change in this repository will honestly fix it. Provider drift
stays the one recorded exception, because a `ContractWaiver` is a decision with
a review date rather than a deleted assertion.

**Two — a test waits for a free account.** `src/support/account-lock.ts`
leases per account with `open(…, 'wx')`, which is atomic and is therefore the
whole of the mutual exclusion; Playwright workers are separate processes so
nothing in memory could have coordinated them. Test-scoped, because holding for
a worker would make one project wait out another project's whole test list.
`setup:auth` runs with `role: ''` and never leases, which is essential — it
needs every account, not one. Stale locks are reclaimed on a dead holder;
a live process keeps its lock however old, because a long test is not an
abandoned one.

**And then the finding that matters, which neither instruction predicted.**
Three live runs failed identically at `setup:auth`, and I had already written
in run 45 that the deployment was "unstable". Asking the application directly
rather than inferring from a spec:

```
POST /users/login  ->  HTTP 423   ×4
{"error":"Account locked, too many failed attempts. Please contact the administrator."}
```

`customer@practicesoftwaretesting.com` is **locked**. Not flaky. The "1 failure
in 4" I measured in run 45 was this account entering lockout.

**The framework had been actively lying about it.** `signInLocators.error` is
`getByRole('alert')` and matches nothing, so `readError` returns null and
`auth.setup.ts` reports *"the form reported no error, so the credential was
accepted but no session marker appeared — check the signed-in locator rather
than the credential"*. Every clause false. Driving the live page: the banner is
`div.alert.alert-danger[data-test="login-error"]` with **no `role` attribute at
all**, so there is no accessible role to find.

**I fixed that in the toolshop pack, and the owner corrected it mid-run:**

> Do not ever make the fixes directly into the test applications scripts, docs
> or tests. … It should always start from framework, onboarding, etc. This
> includes the ability to preflight healing and triage these type of issues.

The hand-edit was reverted. It was the wrong fix for exactly the stated reason:
a target pack is an *output*, and editing it would have fixed one application
while leaving the scaffolder emitting the same guess for the next one, the
doctor still not preflighting it, and triage still with no rule for a lockout.
Written into `docs/CONVENTIONS.md` as its own section, with the table of
"symptom in a pack → mechanism that produced it", and regenerated into the
three instruction files.

**What shipped instead is framework-side:** an `account-locked` triage rule,
first in the list because a lockout is the most misdiagnosed auth failure and
the one where re-running cannot help. It matches both vocabularies — the banner
text an application prints and the `423` an API answers — is ordered above the
generic `all-failed-at-auth` rule whose remedy is different, and carries
`needsHumanReview: true` because only an administrator can clear it.

**And it does not yet fire on toolshop, which is the honest state.** The rule
reads the failure message, and the message never contains the lockout text —
because the only path to that text is the per-target locator the scaffolder
guessed wrong. Raised as item 41: the framework cannot currently see what the
application said at sign-in, and that is the mechanism to fix.

**Verify:** `npm run verify` passes, exit 0 — **955 tests**, up from 945.

**Live suites (step 5):** parabank 3/3, saucedemo 2/2, **toolshop 13/20 with 6
skipped** — and that red is correct and stays. The six e2e specs cannot run
without a session, and per the owner's instruction the suite does not get
tailored around a locked vendor account.

**Learned:**

- **Three runs chased contention because a locator was lying.** Items 30, 36
  and 37 each found a real defect in the account pool and each was landed
  honestly — and none of them was the cause, because the cause was on screen in
  plain English the whole time and our error message said the opposite. A
  misleading diagnostic is worse than none: it does not merely fail to help, it
  actively directs the investigation somewhere else, and it did so three times.
- **The decisive test took two minutes and I ran it on the fourth attempt.**
  `POST /users/login` and read the status. Everything before it — which spec,
  which worker, which locator — was detail about a symptom. Run 45 wrote "check
  whether the thing works at all when nothing is contending" as a lesson and
  then this run still spent a while on leasing before asking the application.
- **The owner's instruction resolved an item I had framed as a spend
  decision.** Run 45 offered "stand up a deployment we own" as the only option
  that makes the suite green. Under "a defect in the application stays
  failing", that framing was wrong: the right answer is that the red is correct
  and the reporting was the defect.

**Next:** item 38 is `blocked` on a person — only an administrator can unlock a
vendor's account. Dropping account 1 from the pool would make the suite green
and is rejected under the standing instruction. Item 11 remains a standing
objective, and the coverage phase in `coverage-phase.md` is the largest body of
work left.

## 2026-08-18 · run 47 · Rule zero, made compulsory everywhere it is read

**Picked:** the owner's instruction — make "always fix and improve the
framework, not the target artifacts" compulsory and non-negotiable, across the
board.

**Did:** promoted it from a section in the middle of the conventions to **rule
zero at the top**, stated as outranking every other rule in the document, and
put it on every surface anybody actually reads:

| surface | who reads it |
|---|---|
| `docs/CONVENTIONS.md` (rule zero, top of file) | the source of truth |
| `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md` | every coding agent, generated |
| the `Never` list | what people skim |
| `docs/agent/backlog.md` | this loop, which reads it before the conventions |
| the scheduled task's `SKILL.md` | the prompt each scheduled run starts from |

The `SKILL.md` change matters most for this loop specifically: a run begins
from that prompt and reaches `backlog.md` second, so a rule present only in the
conventions arrives after the run has already decided what to do.

**Pinned rather than merely written.** `tests/framework/rule-zero.spec.ts`
asserts the rule, the word *non-negotiable*, and both forbidden paths are
present on all four documentation surfaces, that the working agreement carries
it, and that the **exception is stated too** — without "authoring new coverage
is fine", the rule forbids writing specs, and a rule that is obviously wrong at
the edges gets ignored in the middle.

Seen red: rewriting *non-negotiable* to *preferred* fails the suite.

**Verify:** `npm run verify` passes, exit 0 — **966 tests**, up from 959.

**Live suites (step 5):** not re-run. No framework behaviour changed — this run
touched documentation and one new assertion file — and toolshop's account is
still locked (item 38), so the numbers would be run 46's unchanged.

**Learned:**

- **A rule that lint cannot check is not automatically undocumentable.** No
  static rule can tell authoring new coverage from patching a pack to silence a
  failure, so the obvious conclusion was "documentation is the fallback". But
  the *presence* of the rule on every surface is trivially checkable, and the
  real failure mode here is silence — the rule being dropped, softened or
  missing from the one file an agent reads first. That is what the test guards.
- **Where a rule lives decides whether it is obeyed.** The same words sat in
  `docs/CONVENTIONS.md` for a whole run and did not stop the very next
  troubleshooting fix from going into a target pack, because the loop's prompt
  and its working agreement did not carry them. Reach matters more than
  wording.

**Next:** item 41 — the framework still cannot see what an application said at
sign-in, and it is now the highest-ranked `ready` item. Item 38 is `blocked` on
an administrator unlocking a vendor account. The coverage phase remains the
largest body of work.

## 2026-08-18 · run 48 · The floor beneath a guessed locator

**Picked:** item 41, the highest-ranked `ready` item — and the first run under
rule zero, which is what shaped it.

**Did:** `src/support/sign-in-error.ts`. The pack's own named error locator is
tried **first** and trusted when it resolves; beneath it is a framework floor
that reads the page — roles and ARIA first, then the class and attribute
conventions every CSS framework settled on. The scaffolder wires it into every
new pack's `readError`.

The pure half — *which* matched string is the message — is separated and unit
tested, like the accessibility scanner. Three decisions in it: the **shortest**
candidate wins (error markup nests, so the outer match is the inner message
plus its surroundings); a wall of text past 300 characters is **not** a message
(`[class*="error"]` matches whole form wrappers); and the answer is never an
empty string, because *The application said: ""* reads as the application
saying something blank rather than nothing.

**Validated end to end from the framework**, which is what rule zero asks for
and a unit test alone would not be: scaffolded a scratch target, confirmed the
generated action imports the helper and still tries its own locator first,
`tsc --noEmit` clean, `eslint` clean on the generated pack, `target:doctor`
runnable — then offboarded it, `config/secrets.local.json` byte-identical.

**No target pack was touched.** That is the whole difference from run 46, which
fixed the same symptom in `src/targets/toolshop/locators/sign-in.ts` and had to
be reverted.

**Verify:** `npm run verify` passes, exit 0 — **974 tests**, up from 966.

**Live suites (step 5):** parabank 3/3, saucedemo 2/2, **toolshop 20/20** —
**25/25, exit 0**.

**Item 38 resolved itself, and how it resolved is the point.** toolshop's
`customer` account was locked; `POST /users/login` now answers **HTTP 200**.
Nothing in this repository unlocked it. The failure was left red and legible
for two runs rather than tailored around — no account dropped from the pool, no
assertion loosened — and it cleared on its own. Moved to the archive.

**Learned:**

- **Rule zero changed what the fix *was*, not just where it went.** The
  reverted version was one better locator for one application. Forced to the
  mechanism, the answer became a fallback every application gets, a scaffolder
  that stops shipping a bare guess, and a testable decision about what counts
  as an error message. The constraint produced a better design, which is the
  argument for it rather than the obedience.
- **It also surfaced the structural cost, immediately, and that is item 42.**
  This fix reaches applications scaffolded *from now on*. toolshop, saucedemo
  and ParaBank — the three that exposed the defect — still carry the old
  `readError`, and rule zero correctly forbids hand-editing them. A framework
  that cannot deliver its own improvements to existing packs is not a tenable
  end state, and every future template fix has this same problem.
- **Saying what a fix does *not* do belongs in the entry.** The tempting
  write-up was "sign-in errors are now read properly". That would have been
  read next month as covering the three applications on disk, and it does not.

**Next:** item 42 — a `target:upgrade` that regenerates the scaffold-owned
parts of a pack and reports a diff rather than applying one. It is ranked above
item 41's remaining mechanism (a `target:doctor` credential preflight) because
without it every framework template fix, including that one, lands only on
applications nobody has onboarded yet. The coverage phase remains the largest
body of work.

## 2026-08-18 · run 49 · The tool that talked me out of its own first design

**Picked:** item 42 — a framework improvement never reaches an existing pack.
It outranked item 41's remaining mechanism because without it *every* template
fix, including that one, lands only on applications nobody has onboarded yet.

**Did:** `npm run target:upgrade [-- --name=<app>] [--apply]`. It rebuilds a
pack in memory from its profile and classifies every file the scaffolder claims:
`current`, `diverged`, `superseded`, `missing`. It reports; `--apply` adds files
the templates write into *empty* directories and nothing else.

**The design changed because I ran it, and that is the entry.** The first cut
had three states and treated every absent file as "missing, safe to add".
Against the real packs it offered to add toolshop's `endpoints/orders.ts` and
`api/orders.ts` — scaffolder guesses that pack deliberately replaced with a
real `catalogue.ts` — and a placeholder `tests/a11y/landing.spec.ts` beside a
working accessibility spec. `--apply` would have injected endpoints for orders
into an application that has none.

**An absent file usually means somebody did the job under a better name.** That
is the `superseded` state: a starter is offered only when its directory is
genuinely empty, and a `.gitkeep` does not count as work — or the scaffolder's
own placeholder would suppress the file it was holding a place for. toolshop
then reports **0 addable**, which is the honest answer for a pack people have
worked on.

**What it deliberately cannot do.** The sign-in accessible names, the path and
the signed-in marker were probed from the running application and live only in
the generated locators; the profile records none of them. A regenerated
`locators/sign-in.ts` would carry placeholders, so those files come back
`diverged` and are never written. Replacing working locators with guesses is
the worst thing this tool could do.

**Verify:** `npm run verify` passes, exit 0 — **983 tests**, up from 974.

**Validated end to end**: scaffolded a scratch target, deleted `fixtures.ts`,
saw it reported addable, `--apply`d it, confirmed the pack returned to "6
match, 0 differ, 0 would be added" and typechecked, then offboarded with
`config/secrets.local.json` byte-identical.

**Live suites (step 5):** parabank 3/3, saucedemo 2/2, **toolshop 19/20** —
`TOOL-3-02` failed on the cart row not detaching. That spec has failed
intermittently across several runs and passes in isolation; it is the shared
public demo, where strangers hold the same published accounts. Recorded, not
chased, and not tailored around.

**Learned:**

- **The tool's first output was an argument against its own design, and it
  took one run to get it.** Everything about "regenerate a pack from its
  templates" sounds safe until it offers to overwrite the work that made the
  pack useful. Reading the four files it wanted to add was the whole review.
- **Rule zero has a cost, and this measured it rather than removing it.** The
  answer to "how does run 48's fix reach toolshop" is: it does not, and
  `actions/sign-in.ts` is `diverged` there, so the path is a person reading a
  diff rather than a tool applying one. Naming that honestly is more useful
  than a tool that claimed to solve it.
- **A report is a product decision, not a formatting one.** On any pack anybody
  has worked on, `diverged` is the healthy majority. Framing it as drift to be
  corrected would have made the tool an argument for undoing work, and it would
  have been ignored for good reason — so the wording says so, and a test pins
  the wording.

**Next:** item 41's remaining mechanism — a `target:doctor` preflight that
attempts one real authentication per role rather than only asking the store
whether a credential exists. It is the "preflight these type of issues" half of
the owner's ask, and the lockout that cost three runs would have been caught by
it before a suite ran. The coverage phase remains the largest body of work.

## 2026-08-18 · run 50 · Existence is not usability

**Picked:** item 41's last mechanism — nothing preflighted whether a credential
could actually *sign in*. It is the "preflight these type of issues" half of
the owner's instruction.

**Did:** `npm run target:doctor -- --sign-in`. It runs `setup:auth` for the
target and interprets the result into one of five verdicts.

**Why it runs `setup:auth` rather than signing in itself**, which was the whole
design question: framework code may not import a target pack, and driving a
sign-in needs that pack's locators and its business verb. `setup:auth` already
owns exactly that — one real authentication per role through the application's
own vocabulary — so the honest preflight reads its result rather than building
a second sign-in path that could disagree with the one the suite uses.

Opt-in, because it drives a real browser and costs ~20s a target. Without the
flag the doctor now says plainly that credentials are checked **for existence,
not for use** — the distinction it was silently wrong about, and the reason it
could report a target entirely healthy minutes before every spec failed at
sign-in.

**`environment-unreachable` exists because I ran it and it was wrong.** Pointed
at a dead port, the first version said *"check the signed-in marker in the
pack"* — advice as wrong as the message this entire thread began with, and
wrong for the same reason: the most specific evidence has to be read first.
That is the second run in a row where running the new tool immediately
disproved its own first design.

**One definition, not two:** `ACCOUNT_LOCKED` and `TRANSPORT_ERROR` moved to
`src/support/failure-signals.ts`, imported by triage *and* the doctor, held in
step by a test.

**Verify:** `npm run verify` passes, exit 0 — **993 tests**, up from 983.

**Proven live, both directions:** ParaBank reports `sign-in-ok`, exit 0; a
target pointed at a dead loopback port reports `environment-unreachable`, exit
1 — and spends no lockout budget to do it, which matters on shared deployments.

**Live suites (step 5), two consecutive runs:**

| run | parabank | saucedemo | toolshop |
|---|---|---|---|
| first | 3/3 | 2/2 | **19/20** (`TOOL-3-02`) |
| second | **2/3** | 2/2 | 20/20 |

The failures moved between applications between two runs minutes apart, with no
change in between. That is the shared-public-demo signature, not a suite
defect, and under the standing instruction they stay red rather than being
tailored around.

**Learned:**

- **Running a new diagnostic is the only way to find out it misdiagnoses.**
  Twice now — run 49's upgrade tool offering to overwrite working endpoints,
  and this run's preflight blaming a locator for an unreachable host. Both were
  caught in the first live execution and neither would have been caught by the
  unit tests I had already written, because both were about *ordering* rather
  than logic.
- **Item 41 took four mechanisms and one reverted patch.** A misleading
  sentence in a failure message was, underneath, a missing triage rule, a
  scaffolder shipping a bare guess, no way to deliver a template fix to an
  existing pack, and a preflight that checked the wrong thing. The one-line
  locator edit that started it would have hidden all four.
- **A verdict list is an ordering decision.** Five outcomes, most specific
  first, exactly as the triage rules are ordered — and the two runs where that
  ordering was wrong are the two failures above.

**Next:** nothing carries a `ready` label. The next run is a **scan** — drive
the dashboard and onboarding and raise what is found — or the **coverage
phase**, which is now much the largest body of work: four of seven applications
are not onboarded and 32 of 35 coverage cells are empty. Item 11 remains a
standing objective.

## 2026-08-18 · run 51 · The hint the tool threw away

**Picked:** a scan run, at the owner's direction, before onboarding the next
application. Driven against the running dashboard rather than read.

**The finding, and it was found by using the thing.** Onboarding
`automationintesting.online` — the coverage phase's application 4 — I typed
`/admin` into "Sign-in path" and pressed "Read the application". It reported
*"Sign-in form: not found"*, listed the eight paths it had tried, and advised
exploring the application by hand. **`/admin` was not among the eight**, the
field had been reset to `/`, and `/admin` carries an ordinary
username/password form. The operator had already supplied the answer.

**Three layers dropped it**, and this is the part worth carrying: the page
never sent the field, the `/api/probe` route rebuilt the payload naming only
`baseURL` and `apiBaseURL`, and `probe.ts` had no parameter to accept a hint at
all. I fixed the first and the third, re-ran it, and got the identical failure —
because the middle one silently discarded it. A route that reconstructs a
payload field by field drops anything added upstream, and does it without an
error anywhere.

`signInPathsToTry(hint)` puts the operator's path first, normalises a bare
`admin`, and leaves the default list untouched when nothing was typed.

**Proven end to end through the real journey**: same application, same form,
the probe now reads `Username` / `Password` / `Login` and keeps `/admin`.

**Verify:** `npm run verify` passes, exit 0 — **997 tests**, up from 993.

**Checked and healthy**, recorded so the next scan does not repeat it: the
onboarding picker still defaults to "— New application —"; steps 2–5 are
collapsed to zero height rather than rendered-and-locked; a half-typed form
survives the reload that a top-bar application switch causes; the probe refuses
until the test-environment box is ticked, and that flag is not persisted as
true; no horizontal overflow at 1280px.

**Learned:**

- **I nearly filed a regression that did not exist.** `section.hidden === false`
  on steps 2–5 looked like item 18's progressive disclosure having reverted to
  render-and-lock. Measuring the heights showed all four at **zero** and the
  page at 1734px against a 3888px pre-item-18 baseline. `hidden` is not the
  mechanism — the same trap item 24 hit from the other direction, where an
  element carrying `hidden` stayed on screen because a class set `display`.
  **Measure the pixels, not the property.**
- **Fixing two of three layers is indistinguishable from fixing none.** The
  page looked correct, the probe looked correct, and the behaviour was
  unchanged. Only re-running the real journey and reading *which paths it
  listed* showed the hint had not arrived — the tried-paths list in the failure
  message was the diagnostic that located the missing layer.
- **A scan run pays for itself when it is a real journey rather than an
  inspection.** This defect is invisible from the source: every layer reads
  sensibly on its own.

**Next:** onboarding restful-booker-platform as application 4 of the coverage
phase, which is now unblocked — the probe reads its sign-in form.

## 2026-08-18 · run 51b · Onboarding application 4, and the two defects it found on the way

**Picked:** the second half of the owner's instruction — onboard the next live
application, after the scan.

**Did:** `restful-booker-platform` (`automationintesting.online`) is onboarded
as application 4, entirely through the dashboard, and **`setup:auth` passes
with no file edited by hand** — the aim the tool states in its own banner.

**It found two framework defects before it found anything about the
application**, and neither is visible from the source:

1. **The probe discarded the sign-in path I typed** (item 43, committed
   earlier this run). Three layers dropped the hint and fixing two of them was
   indistinguishable from fixing none.
2. **Every preview wiped the typed credentials** (item 44). Type the
   credential, sign in — *"Signed in."* — preview, create: ten files written, a
   success panel, and `replace-me` in the secret store. The page proved a
   credential worked and then wrote a different one.

**Run 50's preflight caught the second one**, which is the part worth noting.
`target:doctor --sign-in` reported *"Sign-in did not establish a session. The
application said: 'Invalid credentials'"* — a tool built two runs earlier to
catch a credential that resolves but cannot be used, catching one for real, on
its first unplanned outing.

**Run 5 had recorded the mechanism and missed the cost.** Its entry notes that
a re-render empties the credential fields, filed as a *test-ordering trap for
spec authors*. Nobody followed it to the write, where the same re-render
substitutes a placeholder for a proven credential on the happy path.

**Verify:** `npm run verify` passes, exit 0 — **997 tests**.

**Proven by re-running the whole journey** on a clean target after the fix:
credentials survive the preview, Create writes the real username, `setup:auth`
passes 1/1.

**Learned:**

- **A note that records a mechanism is not a note that records a cost.** Run 5
  described this exact re-render six weeks of runs ago, scoped to "tests get
  confused by it". The same behaviour on the operator's path silently defeats
  the tool's stated purpose. Worth asking of any recorded quirk: *what does
  this do to somebody who is not writing a test?*
- **Onboarding a new application is the best framework test there is.** Two
  defects in one journey, both on the happy path, both in code that had been
  exercised by hundreds of passing tests. The tests assert behaviour a step at
  a time; only the journey crosses the seams between steps.
- **The scaffolder's own a11y spec trips the `startedWriting` guard**, so a
  fresh pack scaffolded with `--with=a11y` immediately reports `api-no-specs`
  on its success panel. Run 42 added that guard to keep the panel quiet for a
  pack nobody has written yet, and the scaffolder defeats it the same way its
  `.gitkeep` defeated the check run 42 was fixing. Not fixed here — noted, and
  it is small.

**Next:** coverage for `restful-booker` — happy path first, then the other four
kinds. Its `endpoints/orders.ts` and `api/orders.ts` are the scaffolder's
invented starters and must be rewritten from `/api/room` before any API spec,
the same caveat ParaBank carries.

## 2026-08-18 · run 52 · The placeholder that counted as work, and application 4's happy path

**Picked:** the owner's two asks — fix the small finding from run 51b if it was
fixable, then write the happy path.

**The small finding was fixable, and it was the third instance of one shape.**
`startedWriting` asked "is there any `.spec.ts` in this pack", and the
scaffolder writes one: `tests/a11y/landing.spec.ts`. So a brand-new pack looked
written-in and `api-no-specs` appeared on the success panel of a target nobody
had touched. `SCAFFOLDED_SPECS` is now exported from `scaffold.ts`, read by
`diagnose`, and **held in step by a test** that compares it with what
`planScaffold` actually emits.

Third instance: `.gitkeep` defeating the very checks run 42 was fixing, this,
and `usableAccounts` reserving a slot. **The question is never "does a file
exist" but "did a person put it there".**

`restful-booker` went from two warnings to one, and the one left is correct.

**Then the happy path.** `RB-1-01` (a room an administrator creates appears in
the list, `@smoke`) and `RB-1-02` (a room removed is gone). **4/4 live.**
Administering rooms is what the application exists for and what the onboarded
`admin` role can drive; every room is named per run, created by the spec that
asserts about it, and removed again — the demo's own 101/102/103 are edited by
anybody on the internet.

**Verify:** `npm run verify` passes, exit 0 — **1000 tests**, up from 997.

**Live suites (step 5):** restful-booker 4/4, saucedemo 2/2, toolshop 20/20,
**parabank 2/3** — the same intermittent that has moved between applications
all day on shared public demos. Left red.

**Learned:**

- **`CSS.escape` does not exist where locators are built.** A locator is
  constructed in Node; `CSS.escape` is a browser global. It threw on the first
  run. An attribute selector needs no escaping *and* is more precise here — the
  create form's own input has the id `roomName`, so `#roomName<name>` was one
  reseeding away from ambiguity anyway.
- **Cleanup has to cover the window between the click and the verb
  returning.** `add` creates the room and *then* waits for it to be listed;
  when that wait threw, the room existed and the `finally` never ran, because
  `add` sat outside the `try`. Three rooms were left on a shared demo before I
  noticed. The habit worth keeping: if a verb has a side effect before its
  last await, the call belongs inside the `try`, not before it.
- **A stale session looks exactly like a broken locator.** Exploring with a
  storage state from twenty minutes earlier, the admin page rendered the login
  form and `Create` never appeared. The cause was `POST /api/auth/validate`
  answering 403. Checking the network before rewriting a locator saved
  inventing a fix for a page that was simply signed out.

**Next:** the other four coverage kinds for `restful-booker` — negative,
idempotency, audit, boundary — starting with the API layer, whose scaffolded
`orders` endpoints are invented and must be rewritten from `/api/room` first.

## 2026-08-18 · run 53 · Five kinds of coverage, and a locator that matched nothing twice over

**Picked:** the rest of the coverage phase for application 4 —
`restful-booker` — after the happy path landed in run 52.

**Did:** all five kinds, and it is the first application to have them.
**13/13 live**, and `target:doctor` reports nothing to fix.

The scaffolder's invented `endpoints/orders.ts` and `api/orders.ts` are gone —
this application has rooms, bookings and messages and never had orders —
replaced by `rooms.ts` written from the running service, every path called and
its status recorded before being written down. Read-only on purpose: creating a
room needs the admin session and the UI already owns that verb.

**The bounds are the application's own.** `POST /api/room` answers `must be
greater than or equal to 1` and `must be less than or equal to 999`, so
`@boundary` asserts a stated range rather than a guessed one. RB-2-04 is the
half usually skipped — three specs proving values are *refused* say nothing
about a range being too narrow, and a service that rejected everything would
pass all three.

**Audit and idempotency both cross a surface**, deliberately: the UI makes the
change and the service is asked whether it happened. A spec that writes in the
UI and reads the UI has only proved the page agrees with itself, which a purely
client-side list would also manage. RB-3-02 asserts the room *count* rather
than the room's absence — "it is gone" passes whether the second delete did
nothing or removed somebody else's room.

**Verify:** `npm run verify` passes, exit 0 — **1000 tests**. The whole
`restful-booker` suite including framework and dashboard: **1013 passed**.

**Live suites (step 5): 38/38, four applications, all green** — parabank 3/3,
restful-booker 13/13, saucedemo 2/2, toolshop 20/20. First all-green step 5 in
this file.

**Learned:**

- **`getByRole('alert')` matched a node that was not the alert.** All four
  validation specs failed with `Received string: ""` while the refusal sat
  plainly on screen. Playwright reported exactly *one* alert node; the DOM
  reports **zero** `[role="alert"]` elements on that page, before or after a
  refusal. So the accessibility tree named something the DOM does not, and
  reading it gave nothing. The conventions say to ground locators in the
  accessibility tree rather than a DOM dump — this is the case that cuts the
  other way, and the rule that survives both is *check that what you matched
  is the thing you meant*, whichever tree you read it from.
- **It also broke the specs that were supposed to pass**, which is what made
  it obvious. The always-present empty node meant `attemptAdd`'s "listed or
  refused" poll returned immediately every time, so RB-2-04 reported a room as
  refused that had been created perfectly. A locator that is wrong in one
  direction usually lies in both.
- **Cleanup proven rather than assumed.** An orphan count taken after an
  earlier run showed one room, which was ambiguous — this demo resets itself
  every few minutes. Running the full suite and reading the service
  *immediately* afterwards gave `qa- left: 0`, which is the measurement that
  actually answers it.

**Next:** application 5 of the coverage phase — the file's order is
**4 → 6 → 5 → 7**, so AutomationExercise next, cleanest API surface first.
`restful-booker` is done and is the template for what "all five kinds" looks
like.

## 2026-08-18 · run 54 · Auditing the claim, rather than repeating it

**Picked:** the owner's question — do we produce and validate functional tests
on the live applications, and do we truly exercise onboarding, test users,
stories, cases, runs, triage, publish and offboarding for all of them?

**The first answer is yes and it is evidenced.** 16 spec files across 4
applications, all driving real deployments, **38/38 green** on the last
`suites:live` — e2e, api and a11y projects, not the framework's own tests.

**The second answer is no, and the detail is item 46.** Measured from what is
on disk rather than recalled:

| surface | state |
|---|---|
| onboarding | 2 of 4 (parabank, restful-booker; the other two predate the dashboard) |
| offboarding | ✓, repeatedly, with credential-file checksums unchanged |
| runs | ✓ 4 of 4 |
| report | ✓ **for the first time in this run** |
| triage | clusters and rules yes; **no human verdict has ever been recorded** |
| cases | **1 of 4** — `cases/` holds only toolshop |
| stories | **1 of 4** — `stories/` holds only TOOL-1…TOOL-5 |
| publish | Jira answered correctly on a green run; PractiTest needs a URL |
| test users | never driven against a live application |

**Proven on the way, not just audited:** `report:render` produced a 20 KB
self-contained report from restful-booker's live run — the first time
`report-out/` has ever existed — and correctly refused to attach a triage
result belonging to a different run, naming the command that fixes it.
`publish:practitest` read the same run and reported *"13 test(s), 12 carrying a
PractiTest id"* before stopping at the missing URL, so the annotation chain
works end to end up to the socket.

**Then I tried to close the blocked half without a PractiTest licence**, using
the repository's own `FakePractiTestServer`, and it did not work: the fake
recorded **zero calls** and both tools failed at the connection. Raised as item
47. `publish:practitest` degraded to a warning and exited 0 while doing so,
which is the framework behaving correctly — reporting never turns a green suite
red.

**Verify:** `npm run verify` passes, exit 0 — **1000 tests**.

**Learned:**

- **"Do we exercise X" is two questions and I nearly answered one.** The
  functional suites are proven four ways over; the operational chain is proven
  for one application and only as far as its first external dependency.
  Reporting those together as "yes" would have been true of the half somebody
  was not asking about.
- **The gaps split cleanly, and the split is the useful part.** Two are
  blocked on services nobody here has (PractiTest, Jira). Two — a recorded
  triage verdict, and the Test users page against a live application — are
  simply undone and need no permission.
- **An artefact's absence is the cheapest audit there is.**
  `config/triage-verdicts.jsonl` not existing says, with no ambiguity, that no
  human verdict has ever been recorded. Four of the rows above were settled by
  `ls` rather than by reading code.

**Next:** the owner asked to move to the next live application, and this run
spent itself on the audit they asked for first. Application 5 is
**AutomationExercise** per the coverage file's order (4 → 6 → 5 → 7).
Items 46 and 47 are `ready` and 47 is the one that unblocks the other.

## 2026-08-18 · run 55 · Four fake services, and the notification paths that needed them

**Picked:** the owner's ask — stand up fakes for Jira and PractiTest, and send
the report to Teams and Outlook with the config left open.

**Correcting run 54's item 47, which was wrong.** It said the tools could not
reach a loopback fake and recorded zero calls. They can: Playwright's request
context talks to the fake perfectly (200 on the first try). **My harness was
the defect** — it used `spawnSync`, which blocks the parent's event loop, so
the in-process fake could not answer the child it had just spawned. The fakes
were never the problem, and item 47 is deleted rather than fixed.

**Did:** `npm run fakes:serve` holds four services open:

| service | role |
|---|---|
| Jira | user stories come *from* here |
| PractiTest | test cases come *from* here, run results go *to* here |
| Teams | an incoming webhook the report posts *to* |
| SMTP | a mailbox the digest is sent *to* |

Two are new. `FakeTeamsServer` answers `200` with body `1` like a real
incoming webhook, and **refuses** a card past the 28 KB Teams silently
truncates — a fake that accepts anything teaches nothing. `FakeSmtpServer`
speaks enough of RFC 5321 to complete a transaction, deliberately over a real
socket rather than as a stub transport: `notify:email` builds a real nodemailer
transport, and the interesting failures live in that layer.

`notify:teams` is new and follows `notify:email`'s contract exactly — renders,
retains the card in `report-out/` whether or not the post lands, never fails
the build, and posts only on failure unless `TEAMS_ALWAYS=true`. The webhook
URL is registered for redaction, because it *is* the credential.

**Proven end to end against a live application's run:**

- `story:pull RB-1` → `wrote stories/RB-1.json`, 3 acceptance criteria
- `publish:practitest` → *"Posted 11 result(s); 1 unresolved, 0 failed"*
- `notify:teams` → *"Posted to Teams."*
- `notify:email` → *"Sent to qa-team@fake.invalid."*

**Verify:** `npm run verify` passes, exit 0 — **1007 tests**, up from 1000.

**Gmail, tried and abandoned at the owner's direction.** Port 25 to Gmail's MX
is open from here, so direct delivery is technically reachable, and Gmail
refuses it outright: *"The IP you're using to send mail is not authorized to
send email directly to our servers."* Authenticated sending needs an App
Password only the account holder can create and that must never be pasted into
a chat. Recorded in item 49 because it holds for any consumer mailbox.

**Learned:**

- **I raised an item on a defect I had caused.** Item 47 blamed the tools for
  not reaching a fake, on the evidence of zero recorded calls. The zero was
  real; the cause was `spawnSync` blocking the very event loop the fake needed
  to answer. Two runs earlier I wrote that a diagnostic must be checked before
  it is trusted, and then trusted my own harness. **When a measurement says
  "nothing happened at all", suspect the measuring instrument first.**
- **A fake that accepts everything proves the plumbing and nothing else.** The
  Teams fake refuses oversized and non-card payloads, so the 28 KB limit is a
  tested behaviour rather than a comment. The real service answers `200` while
  truncating, which is the failure worth being unable to make.
- **`fixtureRun()` is a failing run, and I asserted a green card against it.**
  It carries a deliberate mix — 2 passed, 1 failed, 1 flaky, 1 skipped. The
  test now builds its own green run and says why in the helper.

**Next:** item 48 — shape cases and a triage fixture so the six rules that have
never been settled against ground truth finally are. The fakes make that
reachable for any application, which is what they were for. Then application 5
of the coverage phase.

## 2026-08-18 · run 56 · "End to end" made executable, and the fixture that measured itself wrong

**Picked:** the owner's definition — running an application end to end is
onboarding, stories or cases, coverage, run, triage **on a deliberate
failure**, and publish to PractiTest, Teams and email — plus their instruction
to put it in the recurring routines.

**Did:** `npm run app:journey -- --target=<app>` runs all six stages and
refuses to report a skipped one as a pass. The definition is written into
`docs/CONVENTIONS.md` beside rule zero, regenerated into the three instruction
files, and into `backlog.md`'s working agreement so a scheduled run meets it
before it meets the conventions.

**Proven end to end** against `restful-booker`, with `fakes:serve` standing up
Jira, PractiTest, Teams and SMTP:

```
✓ onboarding         profile, pack and credentials agree, and a real sign-in succeeded
✓ stories-or-cases   story RB-1 pulled from Jira — 3 acceptance criteria
✓ coverage           all five kinds present
✓ run                13/13 passed
✓ triage             1 agreed · 0 contradicted · 3 declined
✓ publish            PractiTest ✓ · Teams ✓ · email ✓
```

**The failures are injected in the seed**, at the owner's direction and it is
the right way round: `fakes:serve` seeds four deliberate-failure cases, each
named for the triage category it should produce, plus a Jira story stating them
as acceptance criteria. The pack's `tests/triage-fixture/` specs implement
those cases and `publish:practitest` pushes their results back against the same
ids. A case is where a person says what should happen, so a case describing a
known-cause failure is where the cause belongs.

**The measurement caught my own fixture on its first run, which is the entry.**
The first draft took `authedPage`. The `triage-fixture` project runs with
`role: ''`, so every spec threw *"authedPage was requested with no role"*
before reaching the failure it was written for — four identical auth-shaped
errors, all settled as `environment-config` by `all-failed-at-auth`.
**0 agreed · 4 contradicted.** I nearly wrote that up as a rule defect. The
rule was right: every executed test had failed and the text was auth-shaped.
Rewritten to take `page` and drive the public site, it reads **1 agreed · 0
contradicted · 3 declined**.

**And the three declines are the finding worth keeping.** They are correct:
`rules.ts` has **no rule at all** for `locator-drift`, `test-data` or
`timing-synchronisation`. Six rules had never been settled against ground
truth; it now turns out three of the categories the taxonomy defines have
nothing to settle them.

**Verify:** `npm run verify` passes, exit 0 — **1015 tests**, up from 1007.

**Learned:**

- **A fixture can fail for the wrong reason and look like a rule defect.**
  Four contradictions is a loud, specific signal pointing at `rules.ts`, and
  the cause was one fixture parameter. Reading the *error text* rather than the
  verdict took two minutes and moved the blame to where it belonged.
- **My own journey tool reported a false pass and I caught it by reading the
  output.** Stage 2 matched `\d+ case\(s\) pulled`, which "0 case(s) pulled"
  satisfies — so a run that traced the suite to nothing reported green. Zero is
  the answer that stage exists to catch. It now counts, and falls back to a
  story.
- **The three declines are more valuable than the one agreement.** The
  agreement confirms a rule that already had ground truth. The declines name
  three categories with no rule, which is a work list nobody had.

**Next:** write rules for `locator-drift`, `test-data` and
`timing-synchronisation`, then re-measure — the fixture is now the instrument
for that. Then application 5 of the coverage phase.

## 2026-08-18 · run 57 · Two rules, and the one I was talked out of writing

**Picked:** write rules for the three categories run 56's fixture proved had
none — `locator-drift`, `test-data`, `timing-synchronisation`.

**Two shipped. The third should not exist, and finding that out is the run.**

**`short-wait` → `timing-synchronisation`.** Two signals: `expect.poll`'s own
"waiting on the predicate", which is unambiguous, and a locator timeout under
one second. The suite waits 15s by default, so a sub-second timeout was passed
by a caller — nobody arrives at 1ms by accident. Ordered *ahead* of
`locator-drift`, because when both shapes match, how long the spec was willing
to wait is the more specific evidence.

**`locator-drift` → strict-mode violations only**, and the narrowness is the
entire point.

**The first version matched a plain locator timeout, and this repository's own
fixture caught it.** `triage-dashboard.spec.ts` carries case 5106 — a timeout
waiting for a "Pay now" button — marked as a **judgement call that must be
declined**, with the reasoning already written down: *"Renamed button, or a
button that never appeared because of a defect upstream. A rule that guesses
here is the failure mode, not the feature."* My rule answered it, and a test
that had been passing for weeks went red.

The existing reasoning is right and I dropped mine. Healing a locator for a
control that is legitimately absent would paper over an application defect —
the exact thing the owner forbade, arrived at through triage rather than
through a code change. A strict-mode violation carries no such ambiguity: the
elements are there and the locator names too many of them.

**So the fixture was reshaped rather than the rule widened.** TF-RB-01 now
produces a strict-mode violation instead of clicking a control that does not
exist, because the cause it claims has to be the cause it produces.

**No rule for `test-data`, deliberately.** TF-RB-02's error is
`expect(received).toContain(expected)` — a plain assertion failure,
indistinguishable from an application defect. The repository already declines
a sibling case (5105, a wrong number) for the same reason. A rule here would
be inventing a category, which the conventions call the actual defect. It
declines, and the decline is correct.

**Measured, both fixtures:**

| fixture | before | after |
|---|---|---|
| restful-booker | 1 agreed · 0 contradicted · 3 declined | **3 agreed · 0 contradicted · 1 declined** |
| saucedemo | 1 agreed · 0 contradicted · 3 declined | unchanged — no regression |

**Verify:** `npm run verify` passes, exit 0 — **1021 tests**, up from 1015.

**Learned:**

- **A test that had been green for weeks was the reviewer.** Nothing about my
  rule looked wrong in isolation; it read as an obvious improvement. The
  fixture that caught it exists precisely to be over-answered, and it did its
  job on the first run — which is the argument for ground-truth fixtures
  generally, over "the rules look reasonable".
- **Not writing the third rule was the most valuable decision here.** Two of
  three is not a shortfall: `test-data` has no signal that distinguishes it
  from an application defect, and a rule that answered anyway would send real
  defects to the wrong team with high confidence.
- **When a rule and a fixture disagree, ask which one is claiming too much.**
  Here the rule was, and the fixture's claim about TF-RB-01 was too — both
  said "a missing control is locator drift". Fixing only the rule would have
  left a fixture asserting something untrue.

**Next:** application 5 of the coverage phase.

## 2026-08-18 · run 58 · Skipping an application, and the waiver that never applied

**Picked:** the owner's instruction — skip AutomationExercise, offboard it, and
take the next live application end to end.

**There was nothing to offboard, and I checked rather than claimed.**
`target:remove --name=automationexercise` reports *"Nothing to remove"* and
names the four that are onboarded. Run 57 recorded the blocker in
`coverage-phase.md` and never created a target, so the skip is a documentation
change. Saying "offboarded" would have been a claim about work that never
happened.

**Took OrangeHRM rather than DemoBlaze, and the reason is the same blocker.**
Checked both by loading them: DemoBlaze publishes no credentials either, so it
would have hit the identical wall one application later. OrangeHRM prints
`Admin` / `admin123` on its own login page, exactly as ParaBank prints
`john` / `demo`.

**Onboarded through the dashboard**, `setup:auth` passing with no file edited
by hand, and three coverage kinds shipped — happy path, negative, idempotency.
**5/5 live.**

**The owner's mid-run reminder landed exactly where it should have.** I was
about to iterate on a profile waiver that would not apply. Stopping to ask
*why* found the framework gap underneath it: the accessibility failure message
never said **which page it had scanned**. The waiver was scoped to the sign-in
URL; `authedPage` is signed in, so `/` redirects to the dashboard, and the
violation was there. Discovering that took a throwaway script to ask the
browser where it had ended up — information the scan already had and simply was
not printing.

`describeFindings` now leads with `scanned <url>` and lists what was waived on
that page. **And the fix reached the existing pack through the tool**, not by
hand: deleted the scaffolder-written spec, `target:upgrade --apply` wrote the
current template, and the next run of the spec said

```
Error: scanned https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index
  [serious] html-has-lang on 1 node(s)
```

which makes a mis-scoped waiver self-evident. That is item 42's tool used for
the purpose it was built for, on its first real outing.

**Verify:** `npm run verify` passes, exit 0 — **1021 tests**.

**Live suites (step 5):** orangehrm 5/5, restful-booker 13/13, saucedemo 2/2,
toolshop 20/20, **parabank 2/3** — the shared-demo intermittent that has flapped
all day. Left red.

**Learned:**

- **A waiver that does not apply looks exactly like a waiver that is ignored.**
  Both present as "the violation is still failing", and the difference is the
  URL nobody printed. Worth generalising past accessibility: any scoped
  exception needs its scope *and* the thing it was matched against in the same
  message, or debugging it is guesswork.
- **`authedPage` changes what `/` means.** The scaffolded a11y spec navigates
  to `/` and is written as "the landing page", which on any application with a
  post-login redirect is the dashboard instead. The spec is not wrong, but its
  name is, and the URL in the message is what makes that visible.
- **Skipping is a decision worth recording as carefully as doing.** Two of the
  three remaining applications are blocked on the same thing — an account an
  agent must not create — and writing that down once stops the next run
  discovering it twice.

**Next:** audit and boundary for OrangeHRM, which need data the spec creates —
adding a system user, and the point at which it stops being read-only. Then
DemoBlaze and AutomationExercise, both waiting on a person to register an
account.

## 2026-08-19 · run 63 · A fixture for the comprehensive application, and the message that quoted its own source

**Picked:** item 51 — the three applications that cannot reach the triage
stage — taking `toolshop`, which is both the comprehensive target and the
slice item 11 has named for eleven runs. Re-read `open-items.md` and compared
`main` to `origin/main` before starting: both at `86b6553`, nothing had landed
since run 62, and the file's own instruction was to take 51 first.

**Did, and it is three things — one mechanism, one piece of coverage, and one
bug the coverage found.**

**The mechanism.** `target:doctor` now warns `no-triage-fixture` on a pack
that has been written and carries no ground truth. Before this, the only way
to discover that an application could not reach stage 5 was to run the whole
six-stage journey; `npm run app:journey` fails the stage and nothing else ever
mentioned it. Guarded on `startedWriting`, for the reason the capability
warnings already are — a freshly scaffolded pack is told once by
`no-e2e-specs`, and a second block saying the same thing on the panel somebody
meets at the moment they succeed is how a checker gets skimmed. It names the
three applications item 51 named and is quiet on the two with fixtures.

`HEALTHY_PACK` in the preflight tests grew `tests/triage-fixture/` with it.
That is the suite working rather than a test patched around a change: a
written, passing pack with no ground truth is exactly what the check exists to
name, so leaving it out of "healthy" would have meant asserting the warning was
absent from a pack that earns it.

**The coverage.** `src/targets/toolshop/tests/triage-fixture/known-failures.spec.ts`
— four specs, chosen for the categories rather than for being interesting
failures, as the item asked:

| spec | category | what it settles |
|---|---|---|
| TF-TS-01 | `dependency` | `dependency-failure`, never confirmed against a known cause before |
| TF-TS-02 | `timing-synchronisation` | the *polled* branch of `short-wait` — the high-confidence half |
| TF-TS-03 | `locator-drift` | a strict-mode violation, on a second application |
| TF-TS-04 | `network-infrastructure` | the control that says triage ran at all |

**Measured: `4 agreed · 0 contradicted · 0 declined`** — the first fixture in
this repository where every spec was settled by a rule. `restful-booker` is
unchanged at 3 agreed · 1 declined, and `saucedemo` at 1 agreed · 3 declined.

Nothing here signs in. Toolshop is a vendor demo shared with strangers that
locks an account after three failed attempts, and a fixture that spent that
budget would take the rest of the suite down with it.

**The bug the coverage found, and it is the entry.** Running
`target:doctor --sign-in` against toolshop printed, verbatim:

```
ERROR [sign-in-failed] Sign-in did not establish a session. The application said: "${reported}"
       → Read what the application said above — it is usually the credential or the account.
```

`reportedByApplication` matched `/The application said: "([^"]+)"/` over the
whole of Playwright's output — and Playwright echoes the failing source, where
line 73 of `auth.setup.ts` *is* that sentence, placeholder and all. So the
preflight quoted the framework's own source back and called it the
application's words.

Two costs, and the second is much worse than the cosmetic first. Having
"found" a message, the verdict took the branch that says *read what the
application said above* — where nothing was said — instead of the one that
names the marker and the credential. And `looksLikeLockout` was then asked
about `${reported}` rather than about a lockout banner, so the branch that
exists for the most misdiagnosed authentication failure there is could never
be reached from a run whose pack failed to read the form.

Fixed by reading the output's own lines and skipping code frames — a frame
carries a line number and a pipe; a thrown error's message never does. And
`quotedByApplication` was split out from `reportedByApplication`, because the
two answer different questions and the verdict needs to tell them apart: the
fallback is the *framework's* summary line, and attributing that to the
application is the same lie in a quieter voice.

**Verify:** `npm run verify` passes, exit 0 — **1034 tests**, up from 1033.
Diff 141 lines across 4 files plus the 132-line fixture.

**Live suites (step 5): 2 of 5 passing.** restful-booker 13/13 and saucedemo
2/2 green; toolshop 19/20, orangehrm 4/5, parabank 0/3. The failures are
recorded below rather than fixed — none is this run's doing and none is ours.

**Learned:**

- **The account really was locked, and the framework said "fix the test".**
  Checked directly rather than inferred: toolshop's own login endpoint
  answered `423 {"error":"Account locked, too many failed attempts."}` for the
  exact credential in the store. `suites:live` reported that failure as
  **`timing-synchronisation` (rule: `short-wait`)** — high confidence,
  `fix-test`, owner qa — for a condition only an administrator can clear.
  `auth.setup.ts` waits for the marker with `expect.poll`, so every failed
  sign-in carries "waiting on the predicate" and `short-wait` settles it before
  `account-locked` is ever consulted. Raised as item 54 and put at the top,
  because a rule that answers a question it cannot answer is worse than one
  that declines. Deliberately **not** fixed here: run 57's precedent is that
  the rule claiming too much is the one that changes, and that needs its own
  measurement.
- **The lockout cleared while the run was still going**, which is the other
  half of the same lesson. The second `--sign-in` reported every role signing
  in, so the reproduction was gone within the hour. A shared vendor demo's
  state is not a thing to plan a diagnosis around — check the service directly
  and write down what it said, because the evidence expires.
- **Port 9 is not a transport failure and `restful-booker`'s control quietly
  says it is.** Chromium refuses it before opening a socket, reporting
  `net::ERR_UNSAFE_PORT`, which matches the rule's pattern and produces the
  right category while describing something else entirely. Measured here:
  49152 answers `net::ERR_CONNECTION_REFUSED`, which is what a real
  unreachable environment produces, and TF-TS-04 uses that.
- **Two of the ten rules cannot be settled by a fixture at all**, and it is
  worth writing down so nobody spends a run trying. `kindOf` never returns
  `api` for the `triage-fixture` project — it keys on the project name — so
  `api-only-failure` is unreachable, and `known-issue` needs a fingerprint set
  that only comes from Jira. `contract-drift` is a third: `throwOnDrift` is
  true only in the `contract` project, deliberately, so a fixture cannot
  produce drift without a framework change that would weaken a good decision.

**Next:** item 54, with a ground-truth spec that produces a failed sign-in so
the fix is measured rather than argued. Then the rest of item 51 — `parabank`
and `orangehrm` — which `target:doctor` now names by itself.

## 2026-08-19 · run 64 · The locked account that was reported as a slow test

**Picked:** item 54, raised by run 63 and put at the top of the worklist —
prompted by the owner, whose framing is the item in one sentence: *"We don't
need to work around the live app's errors, it should be captured and reported
by our framework as it should be."*

**Did:** `sign-in-setup-failed`, a rule ordered ahead of `short-wait` that
claims a failed `setup:auth` cluster and then declines to say why. The full
reasoning is item 54 in `backlog.md`; what belongs here is the two things this
run nearly got wrong.

**Verify:** `npm run verify` passes, exit 0 — **1041 tests**, up from 1034.

**Live suites (step 5): 3 of 5 passing**, and the number moved for reasons
outside this change — the vendor lockout cleared mid-session. orangehrm 5/5,
restful-booker 13/13, saucedemo 2/2, toolshop 19/20 (a cart-totals spec on a
demo whose cart is shared), parabank 0/3 (sign-in, still). Both failures are
the applications' own and are left red.

**Triage agreement, all three fixtures, after the rule change:** toolshop
**4 agreed · 0 contradicted · 0 declined**, restful-booker **3 · 0 · 1**,
saucedemo **1 · 0 · 3**. Unchanged, which is the check that mattered: a rule
inserted ahead of three others must not quietly claim anything they were
settling.

**Learned:**

- **The deferral I wrote first was inert everywhere except where it did harm.**
  The rule originally stood aside when every executed test had failed, to leave
  that case to `all-failed-at-auth` — which is ordered *after* `short-wait`, so
  standing aside handed the cluster back to the rule the whole change exists to
  pre-empt. And it is the case that actually gets reported: when the auth setup
  fails, everything downstream is *skipped*, so a live suite is one failure and
  two skips, and "every executed test failed" is **true** there. A unit test
  caught it; without one the live suite would have reported the same wrong
  verdict again and the fix would have looked like it worked.
- **A rule that declines has to be allowed to decline.** Writing the rule was
  half the work. `unclassified` was being counted as settled in most of the
  places that ask, so an honest "I cannot tell why" would have removed the
  cluster from triage entirely — not counted as needing judgement, and never
  handed to the model. Worth generalising past this change: adding a new *kind*
  of answer to a system means auditing everything that asks the old question.
- **Sharing a pattern found a second bug for free.** Moving `NO_SESSION` into
  `failure-signals.ts` — the file whose stated purpose is a pattern two tools
  must agree on — exposed that the doctor's own copy required a bracketed
  `(account 1)` that older packs do not print. On parabank the one useful
  sentence in the output was not being lifted out at all.
- **The reproduction expired inside the hour.** toolshop's lockout was gone by
  the second `--sign-in`, so the corrected message could never be shown against
  the failure that prompted it. Everything after that was proven on parabank,
  which was still failing. On a shared vendor demo, capture what the service
  said the moment it says it — the evidence does not wait.

**Next:** the rest of item 51 — `parabank` and `orangehrm` triage fixtures,
which `target:doctor` now names by itself. Item 53's third part is still parked
by design.

## 2026-08-19 · run 65 · ParaBank was broken, and the framework would not say so

**Picked:** chasing parabank's sign-in, which had been failing all day and
which run 64 had just taught the framework to report as *"needs judgement"*.
The owner's standing instruction is the frame: the live application's errors
are not to be worked around, they are to be captured and reported.

**What it actually was, established before anything was changed.** ParaBank's
own login endpoint answers **HTTP 500** to the credential in the store — posted
directly to `/parabank/login.htm` and read off the response, not inferred from
the suite. What reaches a browser is the sentence *"An internal error has
occurred and has been logged."*

So the credential is right, the locators are right, the marker is right, and
the application is broken. **The correct outcome is a red suite naming an
application defect**, and neither of the two things that look at this failure
said that:

| | before | after |
|---|---|---|
| `suites:live` | `no rule matched — needs judgement` | `application-defect (rule: server-error)` |
| `target:doctor --sign-in` | `sign-in-failed` → *"it is usually the credential or the account"* | `application-error` → *"Nothing here is wrong with the credential, the pack or the marker. File it against the application."* |

**Did.** `SERVER_FAULT` in `failure-signals.ts`, matching **both vocabularies**
— the status code an API suite sees, and the words a UI suite sees. That is the
same blind spot `ACCOUNT_LOCKED` was written to close, for the same reason: a
browser is shown a banner and never a status line. The `server-error` rule had
only ever known the code, so a browser watching an application fall over
matched nothing at all.

The rule also **moved ahead of `sign-in-setup-failed` and `short-wait`**. An
application that says why it failed outranks a rule that admits it cannot tell,
and outranks a heuristic about how long something waited — where a 5xx and a
short timeout are both in the text, the 5xx is the cause and the timeout is the
consequence. `account-locked` stays ahead of everything, and a test says so: no
credential is wrong in a lockout and only an administrator can clear it, so it
must not be filed against the product.

The preflight grew the matching branch, `application-error`, so both halves of
the journey mean the same thing by "the application faulted" — pinned by a test
in the same shape as the one already guarding the lockout definition.

**Verify:** `npm run verify` passes, exit 0 — **1048 tests**, up from 1041.

**Live suites: 3 of 5 passing.** restful-booker 13/13, saucedemo 2/2, toolshop
20/20. parabank 0/3, now correctly reported as `application-defect` and left
red. orangehrm 4/5, an idempotency spec settling as `timing-synchronisation`.

**Triage agreement, all three fixtures, after the reordering:** toolshop
**4 agreed · 0 contradicted · 0 declined**, restful-booker **3 · 0 · 1**,
saucedemo **1 · 0 · 3** — unchanged, which is the check that mattered for a
rule promoted past three others.

**Learned:**

- **Run 64's rule did its job by being unsatisfying.** `sign-in-setup-failed`
  reported "no session, and I cannot say why", which is what sent this run to
  ask the application directly — and the application had been saying exactly
  why all along. A rule that declines honestly is not a dead end; it is the
  thing that points at the question nobody had asked.
- **The narrowness had to be tested, not just intended.** "Something went
  wrong" and "unexpected error" are what applications also print for a
  validation failure or a user's own mistake, and a signal that swallowed those
  would file defects against working software. Both the exclusion and
  `Timeout 500ms exceeded` — a duration, not a status — are assertions rather
  than comments.
- **A defect in the application under test is a finding, and the suite stays
  red.** Nothing here made parabank pass. The change makes the failure *legible*
  — application-defect, file-defect, dev-team — which is the difference between
  a suite that reports a broken product and one that reports a mystery.

**Next:** the rest of item 51 — `parabank` and `orangehrm` triage fixtures,
which `target:doctor` now names by itself. Note for whoever writes parabank's:
its sign-in is currently broken server-side, so do not build a fixture that
depends on that staying true.

## 2026-08-19 · run 66 · The last two applications can reach the triage stage

**Picked:** the rest of item 51 — `parabank` and `orangehrm` triage fixtures —
at the owner's direction, having first recorded their new item 55 (hide the
set-up pages behind a disclosure; day to day is Author, Execute, Report).

**Did:** four ground-truth specs each, and both measure **4 agreed · 0
contradicted · 0 declined**. Every one of the five onboarded applications now
has a fixture, and `target:doctor` reports `no-triage-fixture` for none of
them — the check run 63 added has nothing left to say, which is the shape a
preflight should end up in.

**Item 51's stated symptom, closed the way it was raised.** It was confirmed by
running `app:journey` against orangehrm and reading stage 5 as *failed*. The
same command now reads:

```
✓ onboarding         profile, pack and credentials agree, and a real sign-in succeeded
✗ coverage           missing: audit (@audit), boundary (@boundary)
✓ run                5/5 passed
✓ triage             4 agreed · 0 contradicted · 0 declined
```

The coverage line is item 52 and the two skipped stages want `fakes:serve`;
neither is this item.

**The four causes are the same four the other three fixtures produce, and that
is the point rather than a shortcut** — written into both file headers so
nobody "improves" it later. The `triage-fixture` project runs with `role: ''`,
so a fixture has one signed-out page and the framework's own vocabulary, which
bounds what any target can produce on demand. Running the identical set against
unlike applications is what turns *the rules work* into *the rules are
application-agnostic*. A cause only ParaBank could produce would be testing
ParaBank.

**Both pages were read before anything was written.** ParaBank's landing
carries 33 links, so `getByRole('link')` is a genuine strict-mode violation.
OrangeHRM reports **0 links at `domcontentloaded` and 5 once the form has
rendered** — it is a single-page application, so every spec there waits for a
control the application actually renders before doing the thing it is present
to fail at. Without that they would have failed for the wrong reason and
measured nothing, which is precisely how run 56's first fixture went wrong.

**Verify:** `npm run verify` passes, exit 0 — **1048 tests**.

**Live suites: 5 of 5 passing, 43/43** — orangehrm 5/5, parabank 3/3,
restful-booker 13/13, saucedemo 2/2, toolshop 20/20. The first all-green step 5
since run 53, and the first ever with five applications.

**Triage agreement across every fixture:** parabank **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, toolshop **4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo
**1 · 0 · 3**.

**Learned:**

- **ParaBank fixed itself, and the framework's account of it held up.** Run 65
  established it was answering HTTP 500 from its own login endpoint and taught
  the suite to report `application-defect`. Hours later it is 3/3 green with
  nothing changed here. That is the whole argument for reporting a defect
  rather than working around it: the finding was accurate, it cost nothing when
  the vendor fixed it, and a retry or a loosened assertion would have hidden
  both the outage and the recovery.
- **A single-page application changes what "the page is open" means**, and it
  is measurable rather than a matter of taste: the same accessibility tree
  answers 0 links and 5 links seconds apart. Any fixture, and any spec, that
  navigates and immediately asserts on that application is asserting about a
  page that does not exist yet.
- **Sameness across fixtures needed defending in writing.** Four identical
  causes across five applications looks like copy-paste and is the opposite —
  it is the only way the agnosticism claim gets tested. Left unexplained, the
  next contributor would have "varied" them and quietly turned a controlled
  comparison into five unrelated anecdotes.

**Next:** item 55, the owner's own, and the standing priority — take the set-up
pages out of the permanent navigation. Then item 52's coverage cells.

## 2026-08-19 · run 67 · The rail stopped opening with a job nobody does twice

**Picked:** item 55, the owner's own, added in run 66 and taken next because it
is the standing priority.

**Did:** the *Set up* group — Applications and Test users — is a `<details>`
disclosure in the rail, closed on a day-to-day page. Full reasoning is item 55
in `backlog.md`.

**Measured on the running dashboard, not in the markup**, because that is this
loop's own rule and because three of item 20's four polish claims were written
from source and turned out mis-shaped:

| page | rail shows |
|---|---|
| `/runs` | Stories, Cases, Runs, Triage, Publish |
| `/users` | all seven — the group holding the current page opens itself |

and opening it on `/runs` then navigating to `/triage` left it open, which is
the remembering working over a real origin.

**Verify:** `npm run verify` passes, exit 0 — **1060 tests**, up from 1048.

**Live suites: 4 of 5 passing, 42/43.** orangehrm 5/5, parabank 3/3,
restful-booker 13/13, saucedemo 2/2, toolshop 19/20 — a cart-totals spec on a
demo whose cart is shared state, declining rather than being guessed at. Three
consecutive runs of `suites:live` disagreed with each other about which
toolshop spec failed (sign-out, then cart), which is the shared demo behaving
like a shared demo. Nothing in this change touches a target suite.

**Learned:**

- **The comment I was contradicting was right, and the distinction is worth
  keeping.** `navigation()` cited the guidance against hiding desktop
  navigation behind a hamburger. That objection is about hiding *where you can
  go and what is waiting there* — and a collapsed group hides neither: its
  heading stays on screen, everything with a badge stays expanded. Correcting
  the comment to say which half still applies was more useful than deleting it,
  and it is what stops the next person re-litigating this.
- **A persistence test against `setContent` would have passed for the wrong
  reason.** `about:blank` has no origin, Chromium refuses `localStorage` there,
  and the script swallows that by design — so the test would have proved
  nothing and then failed the day somebody looked. Serving the same markup over
  a routed `http://` origin is what makes a reload a reload, which is exactly
  the argument `theme.spec.ts` already had written down.
- **Two tests broke by *relying* on the old behaviour rather than asserting
  it**, which is the third time this file records that shape. Both were about
  order and reachability, not about what happens to be revealed on a Runs page;
  opening the disclosure first made each a better test of its own claim.
- **The backtick trap caught me again**, in two files at once — a comment
  inside `DASHBOARD_STYLES` and one inside the shell's body script, both
  template literals. It is written down in the loop's own notes and it still
  cost a cycle. Worth reading before touching `tokens.ts` or any `*-page.ts`.

**Next:** item 52, the fourteen missing coverage cells — `toolshop`,
`saucedemo` and `parabank` each have only `@smoke`, and OrangeHRM's audit and
boundary cells need data the spec creates. Item 53's third part is still parked
by design.

## 2026-08-19 · run 68 · Three cells, a check that finds them, and the one I refused to invent

**Picked:** item 52, the missing coverage cells, one application at a time —
`toolshop` first, being the comprehensive one. The owner repeated the standing
instruction that implementations and fixes go in the framework, so the run is
deliberately split into the two halves rule zero draws.

**The framework half.** `target:doctor` now reports `coverage-incomplete`,
naming the kinds a pack does not carry. Before this, `npm run app:journey` was
the only thing that said so — the same gap `no-triage-fixture` closed in run
63, and the same fix: a condition a run should catch earlier belongs in the
preflight.

It imports `COVERAGE_KINDS` from `src/support/journey.ts` rather than restating
the list, so the doctor and the journey cannot come to disagree about what five
kinds means. Tags are read from the spec sources by `tools/check-target.ts` and
passed in as a fact, keeping `diagnose()` pure — and read from *tags* rather
than filenames, because the tag is what the suite selects on. Absent tags mean
nobody looked, which is not the same as none and gets no finding.

Live, on the day it was added:

```
toolshop        4 of 5 coverage kinds: missing audit (@audit)
orangehrm       3 of 5: missing audit (@audit), boundary (@boundary)
restful-booker  (nothing)
```

**The coverage half — and two of the four cells already existed.** `TOOL-1-02`
(a search that matches nothing) and `TOOL-2-02` (a wrong password establishes
no session) are genuinely negative specs that carried no `@negative` tag, so
`--grep @negative` did not run them and the coverage measure could not see
them. Tagging them is not gaming the measure: an untagged negative spec is a
real defect in the suite's own selectors.

Two are new, and both were measured against the running application before
being written:

- **`TOOL-3-03` `@idempotency`** — adding the same product twice is one line of
  two, not two lines. Observed: badge 1, then 2; one row; quantity "2". It
  earns a spec because the failure is silent in both directions — two rows of
  one total the same money as one row of two, so every assertion about the
  order total still passes while the cart has stopped meaning what it says.
- **`TOOL-4-05` `@boundary`** — the catalogue's stated page range. Read off the
  envelope rather than written down (`per_page` 9, `last_page` 6, `total` 50),
  and asserting both halves: that the first page is full and the last reaches
  the total, *and* that a page past the end answers 200 with an empty set. The
  second half alone would be satisfied by a service that returned nothing for
  every request.

**And the fifth cell was not written, on purpose.** Toolshop has no audit
surface: measured, its cart lives in per-tab `sessionStorage` (`cart_id`,
`cart_quantity`) with only `auth-token` in `localStorage`, and its API layer is
a read-only catalogue. An audit spec asserts a change was *recorded* somewhere
a different surface can see; there is nowhere to ask. Raised as item 56,
because the same measurement contradicts the profile's `serverState: true` and
the three-account pool built on it — and that is a claim to investigate, not to
quietly edit.

**Verify:** `npm run verify` passes, exit 0 — **1065 tests**. `catalog:build`
was needed and is committed: the client grew a page parameter, and a stale
catalog is the hallucination it exists to prevent.

**Live suites: 5 of 5, 45/45** — toolshop 22/22, up from 20.

**Learned:**

- **My own two tests had a real race, and only the heaviest run found it.** The
  `<details>` persistence tests passed alone and under framework+dashboard, and
  failed twice under a full `TARGET=toolshop` build. `toggle` is dispatched
  asynchronously, so the handler that stores the choice can still be pending
  when the reload starts — the page comes back closed and the test reports that
  remembering is broken. Fixed by waiting for the *stored value*, which is this
  repository's own rule: wait for the fact, not for the click. Worth
  generalising: a test that asserts persistence must wait for the write, and
  clicking is not writing.
- **Two of four "missing" cells were present and invisible.** The gap between
  what a suite proves and what its tags say it proves is a real one, and it is
  invisible to every measure that reads tags — including the new check. Worth
  looking for before writing anything: the cheapest coverage is the coverage
  that already exists.
- **Refusing to write the fifth cell was the right call and cost the most
  time.** Three probes went into looking for an audit surface, and the finding
  is that there isn't one. A spec that reloaded the page and asserted the cart
  survived would have been an `@audit` tag on a claim the application does not
  make — the measure would have gone green and said nothing true.

**Next:** `orangehrm` needs `@audit` and `@boundary`; `saucedemo` and
`parabank` need four each. Item 56 wants a measurement before anybody touches
toolshop's pool.

## 2026-08-19 · run 69 · A template's guess, propagated to four packs

**Picked:** item 52 for `saucedemo` — four coverage cells, chosen over
`orangehrm` because saucedemo's pack stays read-only and nothing about it is
blocked. It turned into a framework fix on the way, which is the entry.

**All four cells landed, and every claim was read off the running application
first:**

| | |
|---|---|
| `SD-2-01` `@negative` | `locked_out_user` is refused *and says so* — a published account that exists to be refused, so no lockout budget is spent |
| `SD-3-01` `@idempotency` | a product in the cart offers Remove, not a second Add |
| `SD-4-01` `@audit` | the checkout summary charges for what the listing priced |
| `SD-5-01` `@boundary` | the cart reaches the whole catalogue, and empties again |

**The framework fix, and it is rule zero's own worked example arriving live.**
`SD-2-01` failed with `readError` returning **null** while the banner plainly
said *"Epic sadface: Sorry, this user has been locked out."* The locator was
`page.getByRole('alert')`, and saucedemo's banner carries no role.

That is the exact failure `docs/CONVENTIONS.md` uses to explain why a pack must
not be hand-fixed — so it was not. The mechanism is the **scaffold template**,
which emitted that bare guess into every pack it has ever written, with a
comment admitting it: *"`error` is still a guess: nothing can read it off a
page that has not had a sign-in refused."* Four of the five packs on disk
carried it verbatim.

The template now emits the priority the conventions already mandate for every
other locator — role first, this target's own test id second:

```ts
error: (page) => page.getByRole('alert').or(page.getByTestId('error')),
```

and the reasoning is in the template, including why onboarding cannot simply
derive it: deriving an error locator means being refused on purpose, and on a
shared deployment that spends a lockout budget belonging to everybody.

**`target:upgrade` could not propagate it**, and that is the honest gap. It
reports `locators/sign-in.ts` as differing and stops — correctly, because it
cannot tell a hand-written locator from a stale template. So the corrected line
was applied to the four packs carrying the bare guess, which is what rule zero
prescribes for an output left behind by a corrected mechanism. Raised as item
57, because a template fix that reaches no existing pack is half a fix.

**A lint rule caught a defect in my own spec, which is the other thing worth
recording.** `SD-2-01` was written into `coverage.spec.ts` and
`auth-project-boundary` refused it: a spec tagged `@auth` there runs in `e2e`
with a session already established, and *"passes without testing anything"*. It
now lives in `login.spec.ts` and runs in `auth-flows`, signed out. A reviewer
would very likely have missed that; the rule did not.

**Verify:** `npm run verify` passes, exit 0 — **1065 tests**, catalog rebuilt
for the new verbs.

**Live suites: 4 of 5, 48/49.** saucedemo **6/6** with all five kinds,
orangehrm 5/5, parabank 3/3, restful-booker 13/13; toolshop 21/22 — `TOOL-1-02`
timed out on the search grid, which is the ~800ms caption-then-grid race its own
action comments describe on a shared demo, not this change.

**Learned:**

- **A guessed locator that returns null is worse than one that throws.**
  `readError` answering null is indistinguishable from "the form reported no
  error", which is the sentence that sent this session to the wrong file twice
  — once on toolshop's locked account in run 63, and once here. The fix is a
  locator that can match what applications actually ship; the deeper lesson is
  that a scaffolded guess should fail loudly or not be written.
- **Four packs carrying one wrong line is a template defect, not four
  mistakes.** Grepping `error: (page` across `src/targets/*/locators/` took
  seconds and turned "saucedemo has a bad locator" into "the scaffolder has
  been writing this since the first target". Worth doing for any pack file that
  looks wrong: if the other packs agree with it, the template is the defect.
- **The vocabulary gap was the application telling me something.** The first
  draft of `SD-3-01` called `addToCart` twice and died on a fifteen-second
  timeout — because this application *replaces* Add with Remove rather than
  repeating it. The verb the spec actually needed was `isInCart`, which asks
  the application which state a product is in. A missing verb is a design
  question, and the answer here was better than the spec I set out to write.

**Next:** `parabank` needs four cells and `orangehrm` two — orangehrm's need
data the spec creates, which is where its pack stops being read-only. Item 57
(propagating a corrected template) is small and unblocks the next one of these.

## 2026-08-19 · run 70 · The template can reach the packs it already wrote

**Picked:** item 57, raised by run 69 an hour earlier — a corrected template
reaching no pack that already exists. Run 69 had to paste the fixed sign-in
error locator into four packs by hand, which is the manual step the scaffolder
exists to remove.

**Did.** A template can now mark the lines it owns, and `target:upgrade`
reports and repairs exactly those:

```ts
error: (page: Page): Locator => page.getByRole('alert').or(page.getByTestId('error')), // @template:sign-in-error
```

`staleManagedLines` compares marked lines by **key** rather than by position —
a pack that has grown a locator above the marked one has moved it down the
file, and a line number would then match the wrong thing, which is the class of
silent wrongness this whole tool refuses to produce. `applyManagedLines`
returns the new contents rather than writing them, so the rule is testable
without a filesystem, which is the split the rest of the module already keeps.

**The escape hatch is the part that makes it safe to write at all.** A key the
pack does not have is not reported: deleting the marker is how a pack says the
line is its own now, and the tool stops asking. `parabank` is the case that
proves it — its error locator is a CSS selector with a written justification,
for an application whose banner is neither an alert nor a test id, and it is
untouched and unmarked.

**Proven end to end with the tool itself, not only in tests.** saucedemo's
marked line was put back to the old `getByRole('alert')`; the report named the
file, the key, and both renderings; `--apply` restored it and reported
*"updated 1 template line(s)"*; `git diff --stat` showed **one line changed**.

**Verify:** `npm run verify` passes, exit 0 — **1071 tests**, up from 1065.

**Live suites: 5 of 5, 49/49.** First all-green step 5 since run 66, and the
highest count this file has recorded.

**Learned:**

- **The mechanism was invisible until it had a marker to look for, and that is
  a feature.** After run 69's hand-edits the packs were byte-correct, so the
  new check reported nothing at all — correctly, because an unmarked line is by
  definition not the template's. Adding the markers is what put those lines
  under management, and it had to be a deliberate act rather than a guess. A
  tool that inferred ownership from "this looks like what the template writes"
  would eventually claim a line somebody meant to change.
- **`diverged` was never the wrong answer; it was the wrong granularity.** The
  module's own reasoning — that a pack is half generated shape and half
  somebody's work, so a differing file is never rewritten — is right and is
  untouched. What was missing was a way to say *this line inside it was never
  yours*, and stating it in the file is what let both rules coexist.
- **Marking one line was the right size.** The temptation was to mark every
  template-owned line in every file at once, which would have meant deciding
  ownership for a hundred lines with no failure to guide any of them. One line
  that actually went wrong, with a mechanism general enough for the next one,
  is the version that can be reviewed.

**Next:** item 52's remaining cells — `parabank` needs four, `orangehrm` two.
Item 58 (`sharedEnvironment` enforced by nothing) still wants the product
decision stated in the item before anything is built.

## 2026-08-19 · run 71 · Four cells for a bank that broke while they were written

**Picked:** item 52 for `parabank` — the last application needing all four
kinds beyond the happy path.

**All four are written and grounded, and the application went down in the
middle of it.** Every claim was measured against the running ParaBank first;
by the time the specs were ready to run end to end, its own login and overview
endpoints were answering **HTTP 500** again — the same fault run 65 found and
that had cleared within hours. Three checks, five minutes apart, all 500.

**What was measured while it was up**, and the first two are the finding:

| | |
|---|---|
| a **negative** amount | accepted — *"Transfer Complete! -$5.00 has been transferred"* |
| an amount **far beyond the balance** | accepted — `999999999` transferred |
| an **empty** amount, and the string `abc` | accepted, reported complete with no amount at all |
| reloading a completed transfer | does **not** re-post — the form comes back empty |
| the receiving account's activity | records the transfer, once, with All as the period |

So `PB-2-01 @negative` and `PB-6-01 @boundary` assert what a bank must do and
**fail**, which is the honest output: a defect in the application is a failure
and it stays one.

**`test.fail()` was tried and withdrawn, and that is the entry.** Both defect
specs were briefly marked as expected failures — the mechanism `run-result.ts`
documents for exactly this. Then the run showed them *passing* while failing at
`openOverview`, two pages before their own assertion, because the application
was 500ing. `test.fail()` inverts the whole test, so it cannot tell *the defect
is still there* from *this stopped testing anything*. That is run 56's
"fixture failed for the wrong reason" in a different costume, and §10 already
says known-failure handling belongs in triage and the report rather than in the
code under the assertion. Both markers are gone and the specs fail honestly.

**The framework half: `openOverview` could not express a broken application.**
It waited only for the account rows, so an overview answering *"An internal
error has occurred and has been logged."* failed as a bare fifteen-second
timeout on `#accountTable`. Every spec in the pack reported a missing table
while the application was saying plainly what was wrong, and triage saw a
locator timeout it could not classify.

It now waits for **either** the rows or the error and says which — the shape
the `transfer` verb in the same file already had. The whole chain works from
one sentence:

```
Error: The accounts overview did not load. The application said:
       "An internal error has occurred and has been logged."

5 failure(s) → 1 cluster(s)
  [application-defect] The application reported a fault of its own on a valid
  request  (rule: server-error)
```

Five failures, one cluster, one verdict, routed to `dev-team`. Before this run
the same outage produced five unclassifiable timeouts.

**Verify:** `npm run verify` passes, exit 0 — **1071 tests**, catalog rebuilt.

**Live suites: 4 of 5.** orangehrm 5/5, restful-booker 13/13, saucedemo 6/6,
toolshop 22/22; **parabank 2/7, every failure `application-defect`** and left
red, because the application is broken and that is what the suite is for.

**Learned:**

- **A known-failure marker has to be narrower than the test.** `test.fail()` is
  the only tool Playwright offers and it inverts everything, so it reports a
  green tick for a spec that never reached the defect it is about. On an
  application that fails upstream — which is exactly the kind that has known
  defects — that is not a corner case, it is the normal case.
- **The verb that could describe a refusal could not describe an outage**, in
  the same file. `transfer` waits for complete-or-refused and reports which;
  `openOverview` waited for one fact and timed out on everything else. Worth
  checking every verb that waits for a happy fact: the question is not "does it
  wait" but "what does it do when the application says something else".
- **Writing four specs against an application that then broke was still worth
  it.** Two of them are the reason to have written them, and the third and
  fourth will report the day ParaBank comes back. The alternative — waiting for
  a green window on somebody else's demo — is how coverage never gets written.

**Next:** `orangehrm` needs `@audit` and `@boundary`, which are the two that
need data the spec creates — the point at which its pack stops being read-only.
That finishes item 52 apart from toolshop's blocked `@audit` (item 56).

## 2026-08-19 · run 72 · Parking an application, without losing it

**Picked:** the owner's instruction — park parabank. It had answered **HTTP
500** on its own login and accounts pages twice in one day, so all five of its
specs failed at the first page and every run showed a red nobody in this
repository can act on.

**There was no mechanism for it, and that was the gap.** Nothing in the profile
type, `suites:live` or the doctor knew what "parked" meant, so the only ways to
stop the noise were to delete the specs or to live with it. Both are the trade
the conventions refuse: the specs include two that report *real defects* — this
bank accepts a negative transfer and one larger than the account holds — and a
red that cannot be acted on costs the signal on the four applications that pass.

**Did.** `parked: { reason, reviewBy }` on the profile, shaped exactly like the
contract and accessibility waivers already there, and for the same stated
reason: a decision somebody has to revisit rather than a suite somebody deleted.

- `suites:live` reports it as **parked** rather than running it —
  `⏸ parabank — parked — ParaBank answers HTTP 500 on its own login and
  accounts pages` — and names it in the total, because a parked application is
  coverage nobody is getting.
- **`--target=parabank` still runs it.** Asking for one by name is a deliberate
  act, and refusing would leave nobody a way to find out whether the reason
  still holds.
- `target:doctor` says so on **every** check, not only when the date passes.
  The cost of parking is invisible by construction — the suites do not run, so
  nothing turns red, so nothing reminds anybody — where a waiver at least sits
  beside a spec that still runs.
- Past its review date it becomes a different finding, `parked-review-due`,
  whose fix is *decide again*.

**The trap it would otherwise set is covered by a test.** Parked is a zero, but
**everything** parked is a **two**: a command reporting success having run
nothing at all is the silent zero this model refuses everywhere else. A failure
beside a parked application is still a one.

**Verify:** `npm run verify` passes, exit 0 — **1079 tests**, up from 1071.

**Live suites: 4 passing, 0 failing, 1 parked.** orangehrm 5/5,
restful-booker 13/13, saucedemo 6/6, toolshop 22/22.

**Learned:**

- **Parking had to cost something visible or it is just deletion with better
  manners.** The three things that make it honest are the line in the report,
  the count in the total, and the doctor saying it every time. Any one of them
  missing and a parked application quietly stops being anybody's problem.
- **The distinction between *parked* and *could not be run* is worth the extra
  state.** One is a decision and the other is something going wrong; reporting
  them alike would let a broken command hide inside a deliberate pause, which
  is the same argument that separates `flaky` from `passed`.
- **One toolshop failure appeared and did not reproduce.** `TOOL-4-05`, the
  boundary spec written in run 68, failed once inside a full `suites:live` and
  then passed three times alone and again in the next full run; the API answers
  exactly what it asserts. Recorded rather than acted on — three singletons are
  not a flake rate, and this repository has quarantine machinery for the
  question.

**Next:** `orangehrm`'s `@audit` and `@boundary` finish item 52 apart from
toolshop's blocked one. They need data the spec creates, which is where that
pack stops being read-only.

## 2026-08-19 · run 73 · The last two cells, and a verb that waited for something already true

**Picked:** item 52's last application — `orangehrm`'s `@audit` and
`@boundary`, the pair that need data the spec creates. Its pack stops being
read-only here.

**Both landed, and `orangehrm` now has all five kinds** — `target:doctor`
reports no `coverage-incomplete` for it, and the live suite is **7/7**.

- **`OHRM-2-01` `@boundary`** — the password rule *the form states* is the rule
  it enforces. The bound is read from the application, never written down: it
  answers *"Should have at least 7 characters"*, so the spec matches that
  sentence rather than asserting a 7 it decided on. Both ends, and the accepted
  one is the half usually skipped — a form that refused everything would
  satisfy the refusal alone.
- **`OHRM-3-01` `@audit`** — a user added on the form is on the *list*, and
  gone once removed. The change is made on one surface and asked about on
  another, through the application's own `(N) Records Found` rather than a row
  count.

**Three things had to be got right before either could run**, and all three
were the same mistake in different clothes.

**The autocomplete's first option was `"Searching...."`.** Waiting for "an
option is visible" and clicking it selected the placeholder, so the Employee
Name field kept the single letter typed into it and the form refused with a
bare *"Invalid"* — while the spec reported a password rule it had never
reached. Measured: the clicked option's text was `"Searching...."` and the
field's value afterwards was `"a"`. The verb now waits for the options to stop
saying that, and then confirms the field holds the name it picked.

**The save was detected with a case-sensitive URL test that could not match.**
`/systemUsers/` never matches `viewSystemUsers`, so a successful save looked
like a form that had neither saved nor complained. It is now `viewSystemUsers`,
and the case genuinely matters: the form itself lives at `saveSystemUser`, so a
looser match would call every refusal a save.

**And `searchByUsername` waited for a fact that was already true — which is the
entry.** It polled until the application had reported a count or said it found
nothing. Both are true *before* the search: arriving on the page shows every
user and a count of them. So the poll returned instantly and the table was read
exactly as it had been before the filter. Caught by creating a user and
searching for it: the count came back as **30**, the whole list.

The comment above that poll said *"wait for the answer, not the click"*. It was
right and the code did not do it. It now waits for the rows to *match* — every
username on screen contains what was searched for, or the application says it
found none.

**That is very likely what `OHRM-1-03` was failing on**, once, earlier today,
settled as `timing-synchronisation` in a live run. Not proven — the failure did
not recur — but it is the same verb, the same race, and the fix removes it.

**Verify:** `npm run verify` passes, exit 0 — **1079 tests**, catalog rebuilt.

**Live suites: 3 passing, 1 failing, 1 parked.** orangehrm **7/7**,
restful-booker 13/13, saucedemo 6/6, parabank parked; toolshop 21/22 —
`TOOL-3-01`, the pre-existing cart spec, on a demo whose cart is shared state.

**Learned:**

- **A poll is only as good as the thing it polls for, and "something is on
  screen" is almost never it.** All three defects here were that: an option
  exists, a count exists, a URL contains a word. The version that works asks
  whether the *answer* arrived — the options stopped saying Searching, the rows
  match the filter, the page is the list rather than the form.
- **A correct comment above incorrect code is worse than no comment.**
  `searchByUsername` explained the "wait for the fact" rule in four lines and
  then waited for the wrong fact, which is why nobody reading it spotted the
  race. The comment now says what it got wrong and what caught it.
- **Writing the first spec that creates data is where a read-only pack's
  latent races surface.** Everything else in this pack reads a list somebody
  else populated, so a filter that returned the unfiltered list still contained
  the row being looked for. The first spec to search for something it had *just
  created* is the one that could tell the difference.

**Next:** item 52 is finished apart from toolshop's `@audit`, which is blocked
on item 56 — that application has no second surface to ask, and the profile
claim underneath it needs a measurement rather than an edit.

## 2026-08-19 · run 74 · A step the page has answered folds to one line

**Picked:** item 53, the last open part of the owner's onboarding-wizard ask
and the top-ranked `ready` item, which is also the standing priority.

**Re-read the worklist before picking, and it had moved.** Three commits landed
on `main` during this session (runs 72 and 73), and `backlog.md`'s own rule about
overlapping runs is why that was checked rather than assumed — item 52's
remaining cells were gone and item 53 had risen to the top.

**Measured before touching anything**, per this loop's rule. Driving the running
wizard to its last step at 1280x720:

| | before | after |
|---|---|---|
| whole page | 4090px · **5.68 screens** | 2184px · **3.03 screens** |
| the four settled steps | 2675px — 65% of it | 357px |

Run 23 fixed the *opening* of this page, 3888px down to 1714px, and nobody had
ever measured the *end* of it. It was worse than the state that started the
whole exercise.

**Did:** a step the preview has an answer for folds to its heading plus one line
stating what it holds. Full reasoning is item 53 in `backlog.md`.

**The trigger is the finding.** The obvious hook was the rail's existing `done`
state, and it is wrong: `done` means *behind the current step*, which after a
preview is true of **step 4** — the credentials somebody still has to type.
Folding on position would have folded the field they were about to fill. The
preview is the single moment the page holds an answer for all three steps above
it, because it is computed from every one of them.

**Verify:** `npm run verify` passes, exit 0 — **1085 tests**, up from 1060.

**Live suites: 4 of 4 running applications passing, 48/48.** orangehrm 7/7,
restful-booker 13/13, saucedemo 6/6, toolshop 22/22. parabank **parked** as run
72 left it, still answering HTTP 500 on its own pages.

**Triage agreement, unchanged, which is the check that mattered for a change
that touches no rule:** toolshop **4 agreed · 0 contradicted · 0 declined**,
orangehrm **4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **The item's own warning was right, and measuring it is what shaped the
  change.** A first attempt that also folded step 1 on the read broke **38** of
  248 dashboard tests. Moving to the preview-only trigger took that to 24
  without giving up any of the height win — the end state is identical, because
  everything folds by the end either way. The cheaper design was found by
  running the suite, not by thinking harder.
- **A setup helper run twice is not a setup helper.** One Vault test called the
  whole of `readyForCredentials` and then called it again inside
  `checkedConnection`. Every wait in it asks "is this already unlocked", which a
  second run satisfies instantly — so everything after it raced a preview still
  in flight. That was latent long before this change; the fold is only what made
  it fail. Worth looking for elsewhere: a helper whose waits are all
  already-true assertions is a race waiting for a reason.
- **`.all()` on a selector the clicks change goes stale.** My first
  `reopenSteps` resolved the folded buttons up front and clicked them by index;
  unfolding one drops it out of the selector, so the third click waited fifteen
  seconds for a locator that could no longer match. The same lesson
  `Locator.count()` already carries in the conventions, one step over.
- **`/onboard` had no height budget at all.** `page-height.spec.ts` covers the
  other seven pages, and the page whose whole design is progressive disclosure
  was the one nothing measured — which is exactly how its far end reached 5.68
  screens with a green suite. A tripwire went in with the fix.
- **The backtick trap caught me again**, in a doc comment inside the page's
  script template literal. Run 67 recorded the same thing. It is written down in
  two places and still cost a cycle.

**Validated live, after the owner asked for exactly that.** The change had been
proven by driving the page and by 254 dashboard tests against a fake service,
but nothing had let the framework *generate a target's artifacts* with the fold
in place. So a scratch target was onboarded end to end through the running
dashboard against `https://www.saucedemo.com`:

- the real probe read `data-test` (×7), `Username` / `Password` / `Login`, and
  correctly reported no published API document;
- **step 1 did not fold on the read** and all three folded on the preview,
  which is the trigger behaving as designed on a real journey;
- the summaries were accurate — `fold-scratch · https://www.saucedemo.com`,
  `data-test · / · Username, Password, Login`, `standard · local · no optional
  layers`;
- **steps 4 and 5 stayed open** at 654px and 527px — the case that folding on
  the rail's `done` state would have broken;
- **Create wrote 6 files**, and the credential landed in the gitignored
  `config/secrets.private.json` with the tracked file's checksum byte-identical
  before and after.

Removed afterwards with `target:remove`, which took the pack, the profile and
the credential; both secret files ended byte-identical to their pre-run
checksums and the tree was clean.

**That live pass found item 60**, which none of the 1085 tests did: the result
panel tells you to *"Add credentials for standard to
`config/secrets.local.json`"* — the **tracked** file — moments after writing
them to the private one. `scaffold.ts:419` hardcodes it. It is item 15's defect
one layer over: run 17 fixed where onboarding *writes* a credential and left
what it *tells you to do* naming the old destination. Raised with the evidence
rather than fixed here, because this run's item was already landed and pushed.

**The lesson, and it is the reason the owner asked:** driving the page proves
the page; only letting the framework generate a target proves the journey. The
finding was in the last panel of that journey, which no unit or dashboard test
reads.

**Next:** item 60 or item 59 — 60 is small and fully evidenced; 59 is a
known-failure marker that cannot tell "the defect is still there" from "this
stopped testing anything". Then 58 and 56, which are the same shape twice: a
declared capability nothing checks.

## 2026-08-19 · run 75 · A known failure says what it should fail with

**Picked:** item 59, the top-ranked `ready` item and the one that makes a
*reported* failure trustworthy.

**Re-read the worklist immediately before picking, and it had moved under me
again.** Item 60 landed on `main` in `7195c9e` during this session, after
`open-items.md` had been read — a docs-only commit from run 74's live
validation pass. It says to take it or 59 first, so 59 still stood. This is the
third run to meet the overlap the working agreement warns about, and re-reading
is what catches it.

**Did:** a known failure is declared, not inverted. Full reasoning is item 59 in
`backlog.md`. Three pieces:

- `src/support/triage/known-failures.ts` — pure, one run model in, a row per
  declaration out: **confirmed**, **drifted** or **resolved**.
- `summariseLiveRun` folds a confirmed one into `expectedFailures` and leaves a
  drifted one an ordinary failure, so a suite goes red for a spec that has
  stopped testing what it claims.
- `known-failures-declared`, a lint rule refusing `test.fail()` in a spec and
  refusing an empty declaration.

**The signature is error text, not a triage category, and finding that out was
the work.** A category was the obvious shape — `triage-ground-truth` already
proves the annotation channel — and it does not survive contact with the rules.
None of the seven rules in `rules.ts` keys on a hand-written business assertion
like *"a bank accepted a negative transfer"*; they key on transport, timeout,
auth and schema text. So a rule-based category is `null` for exactly the
failures this exists to track, and every confirmed known failure would have
been reported as having drifted. The spec's own `expect()` message is already
the distinguishing fact and needs no triage pass to read.

**No target pack was touched.** ParaBank's two specs are the intended first
users — item 59 was found writing them — and applying the marker there would be
editing a pack to make an existing failure stop counting, which is rule zero's
exact shape. The mechanism ships; adoption is authoring work, not
troubleshooting.

**Verify:** `npm run verify` passes, exit 0 — **1091 tests**, up from 1085.

**Live suites: 3 passing, 1 failing, 1 parked.** orangehrm 7/7, saucedemo 6/6,
restful-booker 12/13 with 1 flaky, parabank parked. **toolshop 21/22** —
`TOOL-3-03 · Adding the same product twice is one line of two @idempotency`,
failing in `cart.ts:147` on `line.waitFor({ state: 'detached' })` during the
cart's own cleanup, settled by no rule. Run 74 recorded toolshop 22/22, so this
is new since yesterday and it is on the shared-cart demo item 56 is about.
Recorded rather than chased: it is not this run's item, and item 56 already
says the next step there is a measurement.

**Triage agreement, unchanged, which is the check that matters for a change
touching no rule:** toolshop **4 agreed · 0 contradicted · 0 declined**,
orangehrm **4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.
Identical to run 74 on all four.

**Learned:**

- **A new mechanism's hardest question is what it keys on, not what it
  reports.** The three outcomes were obvious within a minute; the category
  versus error-text choice took the rest, and picking the wrong one would have
  produced a mechanism that reported every known failure as drifted — worse
  than the marker it replaced, and green in every test I would have written for
  it.
- **`resolved` and `not-reproduced` are opposites wearing the same status
  field.** A ground-truth spec that passes is a broken fixture and exits 1. A
  known-failure spec that passes means the defect got fixed. Both are "declared
  to fail, did not", and folding them into one outcome would have made good
  news fail a run.
- **Shipping a mechanism without adopting it is the correct end of a
  troubleshooting item.** Every instinct said to finish by marking ParaBank's
  two specs, which would have been a pack edit making an existing failure stop
  counting. Rule zero draws the line at exactly the point where the work stops
  feeling finished.

**Next:** item 58 — `sharedEnvironment` is declared, documented and enforced by
nothing — then 56. Item 60 is small and evidenced if a shorter run is wanted.

## 2026-08-19 · run 76 · The shared-environment flag finally does something

**Picked:** item 58, the top-ranked `ready` item after 59 closed. Re-read the
worklist and `git log origin/main` first; nothing had moved this time.

**The item is mostly a design question and insists it be answered first.** It
was, and both halves of the answer mattered.

**Which instrument.** A lint rule, because the damage is done by the *first*
failed attempt and is permanent until somebody else's administrator clears it —
so the only useful moment to catch it is before the spec has ever run. A
fixture cannot: it hands over a credential and cannot see what the spec does
with the password afterwards, and intercepting the sign-in would mean framework
code reaching into a pack's verbs. `target:doctor` reads tags but not spec
bodies. Reasoning table in item 58 in `backlog.md`.

**What the hazard actually is**, and this is the half that would have gone
wrong. Not the `@negative @auth` tag — skipping those on a shared target drops
both negative sign-in specs this repository has, and both are safe. The shape
that spends a budget is **a real account's username paired with a password that
is not that account's**. Everything else is fine, including a spec that signs
in as an account the vendor publishes *in order to* refuse it, because that
generates no failed-password attempt at all.

**Did:** `no-lockout-on-shared`, firing only where a profile declares
`sharedEnvironment: true`, plus `isSharedEnvironment` beside the existing
`authFlowPatternFor` textual profile reader. The convention text was corrected
too — it promised "skip them entirely", which is the fix the item rules out.

**Validated against every existing spec before the rule was written.** Grepped
every `username:`/`password:` pair in every pack and worked out by hand which
the rule must not touch: `TOOL-2-02` (disposable address), `SD-2-01` (published
locked account, real credential), `TOOL-2-01`/`TOOL-2-03`/`auth.setup.ts` (both
halves from the store), OrangeHRM's user creation (literal password, but the
username is the test's own data). All silent; only the historical shape fires.

**Proven through real lint, not only the RuleTester.** A scratch spec of the
harmful shape went into a shared target, `npx eslint` reported it with the
message naming both safe identities, and it was removed — `git status
src/targets/` clean afterwards. No pack ships a change.

**Verify:** `npm run verify` passes, exit 0 — **1093 tests**, up from 1091.

**Live suites: 3 passing, 1 failing, 1 parked.** orangehrm 7/7, saucedemo 6/6,
restful-booker 12/13 with 1 flaky, parabank parked. **toolshop 21/22** —
`TOOL-1-02 · A search that matches nothing says so`, settled
`timing-synchronisation` by `short-wait`. **Note this is a different spec from
run 75's**, which was `TOOL-3-03` in the cart's cleanup. Two singletons on two
different toolshop specs across two consecutive runs. Recorded rather than
chased: this repository's own rule is that singletons are not a flake rate, and
`quarantine.ts` plus `FLAKE_MINIMUM_RUNS` is the machinery for deciding when
they become one. A third sighting now has something to join.

**Triage agreement, unchanged on all four:** toolshop **4 agreed · 0
contradicted · 0 declined**, orangehrm **4 · 0 · 0**, restful-booker
**3 · 0 · 1**, saucedemo **1 · 0 · 3**. Identical to runs 74 and 75.

**Learned:**

- **The item was right that the question outranked the code.** The rule is
  about 200 lines and took an hour; picking the tag as the hazard would have
  taken ten minutes and produced a framework that silently stopped running two
  good tests — which the item predicted in writing, and which no test I wrote
  would have caught, because I would have written the tests to match the wrong
  definition.
- **Enumerate what the rule must *not* flag before writing it.** Grepping every
  credential pair in every pack took five minutes and produced the valid cases
  in the test file directly. It also found the second-hop and destructuring
  shapes (`auth.setup.ts`) that the first draft of the detection would have
  reported.
- **A rule test that names a target breaks when the target leaves.** This one
  discovers a shared target from `config/targets/` and skips visibly when there
  is none, which keeps it honest on a `main` pointed at no application.
- **Two consecutive runs, two different toolshop specs, one failure each.** Not
  yet a rate, but worth watching — and worth writing down *where somebody will
  look*, which is why it is in `open-items.md` and not only here.

**Next:** item 56 — the other half of 58's shape, a declared capability nothing
checks — and its own next step is already written as a measurement rather than
an edit. Item 60 is smaller if a shorter run is wanted.

## 2026-08-19 · run 77 · The account pool gets a measurement instead of an argument

**Picked:** item 56, the top-ranked `ready` item. Its stated next step was a
measurement rather than an edit, and that is what it got — plus the framework
half the item called "the interesting one".

**The finding, measured.** Both arms at three workers, so the only difference
is how many identities they share:

| arm | result |
|---|---|
| the declared pool of 3 | **0 of 2 runs green** |
| every worker on one account | **2 of 2 runs green** |

The collapsed arm was *cleaner than the control*. Sharing one account produced
fewer failures than spreading across three, so toolshop's pool is not
preventing the interference its profile says it prevents. Three separate hand
measurements agree — the cart specs alone, one account, three concurrent
workers, 4 of 4 green, with the worker indices checked in the JSON to confirm
they really were concurrent rather than serialised into one worker.

**Did:** `npm run pool:measure`, plus `POOL_SIZE_OVERRIDE` honoured in
`resolveTarget`. The override is the part that matters for rule zero: until it
existed, the only way to ask whether a pool was earning its cost was to edit
the profile of the application under test.

**The tool shipped wrong first, and fixing it is the entry.** Version one ran
only the collapsed arm. It reported 1 of 2 green with a cart spec failing —
which reads as proof the pool is needed, and I nearly wrote that down. It is
not: the same suite had failed at its *declared* pool on each of the two
previous runs, on a different spec each time. A background failure rate is
indistinguishable from contention unless both arms are measured, so the command
now runs a control and has a fourth verdict — "both arms failed, so this
measures nothing about the pool" — that version one could not express.

**Two caveats kept in the item.** The control runs at the pool's own worker
count (3), above toolshop's normal ceiling of 2, so neither arm is a normal
run. And with `poolSize: 3` and `authFlowAccount: 3` the usable accounts are
`[1, 2]` — the declared pool was never giving three workers three identities.

**The wider finding.** All five profiles declare `serverState: true` and four
still carry the scaffolder's comment verbatim — `// does state need cross-test
cleanup?` — which is the question, not an answer. Only toolshop pays for it
because only toolshop declares a `poolSize`, but the next application to
declare one inherits the same unexamined claim.

**Item 56 is `blocked`, not `done`.** What remains is a decision between
dropping the pool and correcting its stated reason, both of which are profile
edits the owner should take. Rule zero forbids me doing it as troubleshooting,
and the item already said this half needs a person.

**Verify:** `npm run verify` passes, exit 0 — **1102 tests**, up from 1093.

**Live suites: 4 of 4 running applications passing, 48/48.** orangehrm 7/7,
restful-booker 13/13, saucedemo 6/6, toolshop 22/22; parabank parked. Toolshop
green again at its normal ceiling after failing once in each of runs 75 and 76,
which supports the reading that its failures are concurrency-dependent rather
than a spec defect.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **A measurement without a control is an anecdote.** This is the second time
  in three runs that the *shape of the evidence* was the hard part rather than
  the code — item 58 was choosing the right discriminator, this was realising
  one arm proves nothing. Both would have shipped something confidently wrong.
- **Check that concurrency is real before believing a concurrency result.**
  The first cart measurement looked green at three workers; `fullyParallel` is
  true here, but had it not been, all three specs would have run in one worker
  and the green would have meant nothing. Reading the worker indices out of the
  JSON took a minute and made the number trustworthy.
- **A verbatim scaffolder comment is a tell.** `// does state need cross-test
  cleanup?` sitting unedited in four of five profiles is a reliable signal that
  nobody answered the question — worth grepping for wherever a scaffold writes
  a default that costs something.
- **Heredoc escapes cost three cycles.** Writing TypeScript containing `\n`
  through a shell heredoc into Python mangled the escape every time. The Edit
  tool is the right instrument for content with escapes; this is the same class
  of trap as the backtick-in-template-literal one recorded in runs 67 and 74.

**Next:** item 60, then 46 and 48 together — one command per application.

## 2026-08-23 · run 78 · The next step stops naming the file onboarding refuses to use

**Picked:** item 60, the only small `ready` item. Checked `git log origin/main`
first — no runs had landed in the four days since run 77, so the worklist was
where run 77 left it.

**Did:** the credential step in `planScaffold` varies instead of being a
constant. It says nothing when the caller has already written the credential,
and names the gitignored file rather than the tracked one when it does speak.
Full table in item 60 in `backlog.md`.

**Saying nothing is the half worth recording.** The obvious fix is to correct
the filename, and that would have left a numbered instruction telling somebody
to do what they did four seconds earlier — items 14 and 17 in a third costume.
`target:doctor` is already in the list and already confirms the credentials
resolve, so the step had nothing left to contribute.

**Proven by driving the running dashboard**, because that is where run 74 found
it and 1085 tests did not. Onboarded a scratch target against the real
application through the live server: the page's `options()` carried
`credentialLocation: 'private-file'`, the preview named
`config/secrets.private.json`, and **Create returned a next-steps list with no
"Add credentials" line and no mention of `secrets.local.json`**. The credential
was in the private file and absent from the tracked one. Removed with
`target:remove`; both secret files ended byte-identical to their pre-run
checksums.

**Verify:** `npm run verify` passes, exit 0 — **1110 tests**, up from 1102.

**Live suites: 3 passing, 1 failing, 1 parked — and the failure is new and
real.** restful-booker 13/13, saucedemo 6/6, toolshop 22/22, parabank parked.
**orangehrm 6/7**: `A11Y-001 · The landing page meets the declared standard`
now reports **critical `button-name` on 1 node**, plus serious
`color-contrast` on 3 and `list` on 1, scanning
`/web/index.php/dashboard/index`. Only `html-has-lang` is waived and it still
is. That pack was 7/7 in run 77 four days ago and nothing here changed for it,
so this is the vendor's regression. **Left failing**, per §10, and raised as
item 61 — the decision between waiving, parking and living with it is the
owner's, and silencing it with a waiver is the move rule zero forbids.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **A wrong instruction and a redundant one are the same bug.** Item 60 was
  filed as "names the wrong file", and half the fix turned out to be deleting
  the step. Fixing only the filename would have closed the item and left the
  contradiction — worth asking, of any message that is wrong, whether it should
  exist at all.
- **The a11y suite paid for itself today.** Four applications' accessibility
  specs have been green for weeks and it was fair to wonder what they were for.
  The first vendor-side regression they caught is a critical one, on a page
  every user of that demo lands on, four days after the same spec was green.
- **`triage:measure` across four targets exceeds a ten-minute command budget.**
  It timed out at the third target and had to be finished in a second call.
  Worth knowing before somebody puts it in a script that assumes one invocation.

**Next:** item 61 — a live red outranks the rollout work. Then 46 and 48
together, one command per application.

## 2026-08-23 · run 79 · The accessibility suite had been reporting false passes

**Picked:** item 61, the top-ranked `ready` item — a live red, which outranks
rollout work.

**It was not what I filed it as, and that is the entry.** Run 78 saw one red
a11y spec on an application green four days earlier and I wrote it up as a
vendor regression. On a single sighting. One run after recording that
"singletons are not a rate" and building a control arm for exactly this reason.

**It did not reproduce.** Three runs of the a11y project alone: green. Two full
live runs: 7/7. Then, scanning the dashboard repeatedly straight after `goto`,
the transient showed itself — and pointed the other way:

| scan | findings |
|---|---|
| 1–3 | `html-has-lang` only — waived, a clean pass |
| 4–5 | `button-name`, `color-contrast` ×3, `list` |

**The violations appear later, not earlier.** The suite scans a shell and calls
it clean. Run 78's red was the honest result and every green before it was not.
With a proper wait, four attempts out of four: **one waived violation
immediately after `goto`, against seventeen across four rules once the tree
went quiet** — four of them critical.

**Did:** `settle.ts` — a `MutationObserver` that resolves once the DOM has been
still for a quiet period, bounded by a deadline — and `createScanner` settles
before every scan, carrying `scan.settled`. Plus an `accessibility-violation`
triage rule, because both newly-visible failures arrived as "no rule matched"
and an axe violation is a measured fact that routes somewhere specific.
Reasoning in item 61 in `backlog.md`.

**Verify:** `npm run verify` passes, exit 0 — **1117 tests**, up from 1110.

**Live suites: 2 passing, 2 failing, 1 parked — and the two reds are the point
of the change.** restful-booker 13/13, saucedemo 6/6, parabank parked.
**orangehrm 6/7** and **toolshop 21/22**, both on accessibility, both now filed
as `application-defect (rule: accessibility-violation)` rather than left as a
judgement call. These are real violations that were always there. Raised as
item 62, `blocked` on the owner: accept, waive with a review date, or park.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**. The new
rule contradicted nothing.

**Learned:**

- **I filed a vendor regression from one sighting, having just built a control
  arm to stop exactly that.** Writing the rule down does not install it. The
  thing that saved it was the item's own first instruction — "confirm it
  reproduces" — which is worth keeping at the top of any item raised from a
  single red.
- **A flaky failure can mean the passes are wrong.** The instinct with an
  intermittent red is to find what makes it fail. Here the failure was correct
  and the *passes* were the defect, and the fix roughly doubles the number of
  red specs. Worth asking, of any intermittent failure: which of the two
  outcomes is the honest one?
- **A green suite is evidence to whoever reads it.** Four applications' a11y
  specs had been green for weeks; on two of them the green was worth nothing.
  That is worse than having no accessibility suite, and it is the same silent
  zero this repository refuses everywhere else.
- **`page.evaluate(fn)` does not survive this build.** esbuild's `__name`
  helper does not exist in a browser. The string form works and takes no
  arguments, so values must be interpolated — and therefore coerced.

**Next:** items 46 and 48 together — one command per application. Item 62 is
blocked on an owner decision, not on work.

## 2026-08-23 · run 80 · The journey runs for every application, not one

**Picked:** items 46 and 48, together, as the file says they should be — one
gap seen from two ends.

**The cause was a literal in a tool.** `fake-services.ts` carried `TF-RB-01…04`
and three `RB-*` stories as constants, so the journey traced green for
`restful-booker` and reported "nothing traced" for the other four. Nothing
application-specific was needed; the seed is derived now, from the
`practitest`, `jira` and `triage-ground-truth` annotations the specs already
carry.

| | before | after |
|---|---|---|
| cases | 4 | **62** |
| stories | 3 | **22** |
| applications covered | 1 | **5** |

**Running it for all five is what found the interesting defect**, which is the
whole argument for item 46 being a doing task rather than a reading one. Stage
2's story fallback took the first `stories/*.json` on disk — committed files,
so `TOOL-*.json` every time. The `orangehrm` journey reported *"story TOOL-1
pulled from Jira"* and marked traceability **done**: a stage built to catch
"traced to nothing" was satisfiable by "traced to another application's
requirement". It now asks the target's own specs which story they cite.

**Also fixed:** a parked application's run line said nothing about being
parked. `parabank` reported "2/7 passed · 5 failed" for a suite somebody had
deliberately paused with a review date.

**Where every application stands:**

| application | stages | what is left |
|---|---|---|
| **saucedemo** | **6 of 6** | — |
| orangehrm | 5 of 6 | run — item 62 |
| restful-booker | 5 of 6 | run — 12/13, one flake |
| parabank | 5 of 6 | run — parked |
| toolshop | 4 of 6 | coverage (item 52), run (item 62) |

Every application reaches stages 1, 2, 5 and 6.

**Verify:** `npm run verify` passes, exit 0 — **1126 tests**, up from 1117.

**Live suites** were exercised through the journey per application rather than
in one pass: orangehrm 6/7, restful-booker 12/13, saucedemo 6/6, toolshop
21/22, parabank 2/7 parked. The two a11y reds are item 62, unchanged and
deliberate.

**Triage agreement, per application, from the journey's own stage 5:** toolshop
**4 · 0 · 0**, orangehrm **4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo
**1 · 0 · 3**, parabank **4 · 0 · 0**. Unchanged.

**Learned:**

- **A false green survives precisely as long as nobody runs the thing twice.**
  Stage 2 had been green for `restful-booker` since run 59 and would have
  stayed green for every application the moment the seed covered them — on a
  story belonging to whichever target sorted first. Running it for the second
  application is what exposed it, and that is the entire content of item 46.
- **Committed state makes a per-run bug look stable.** `stories/TOOL-*.json`
  are tracked, so the wrong answer was the *same* wrong answer on every machine
  and every run, which is exactly how it passed for months.
- **I deleted tracked files while tidying.** `rm -rf stories cases` took ten
  committed case files and five stories with the run's own artifacts;
  `git status` caught it and `git checkout --` restored them. Scratch cleanup
  needs to name what it created, not a directory that also holds repository
  content.
- **A section-removal script must verify what it removed.** Cutting items 46
  and 48 from `open-items.md` also took 62, 52 and 56, because a `rindex` for
  the preceding separator walked back past a heading. The file already warns
  about this — run 66 lost item 52's body the same way — so the fix is to
  print the section list before and after, which is what caught it this time.

**Next:** item 63. Everything else `ready` is closed, and 62, 56, 52 and 49 are
waiting on the owner.

## 2026-08-23 · run 81 · One PractiTest set per application

**Picked:** item 63, the only `ready` item.

**The item insisted the design question be answered before anything was
built**, and the answer is a **set per application, looked up by the
application's own name**. The alternative — a `practitestSetId` in each
profile — is refused by the conventions' own rule about internal identifiers:
a transcribed id is unverifiable by anyone reading it and points at the wrong
set the day the project is rebuilt. Looking it up by name also costs no edit
to any of the five profiles, which keeps rule zero out of it entirely.

**A missing set pulls nothing and says so.** Falling back to the whole project
is not a fallback, it is the wrong answer: 62 cases, mostly other
applications', counted as this suite's traceability.

**`filter[name]` is a match rather than an equality** in the real API, so
`findSetByName` filters again for exactness — and the fake matches loosely on
purpose, so a client that assumed exactness fails in a test rather than in
production.

**Proven end to end:** five sets seeded from the packs — saucedemo (9),
orangehrm (9), parabank (10), restful-booker (16), toolshop (18) — `pull-cases`
returns 9 for saucedemo and 18 for toolshop rather than 62 for both, and
**saucedemo's journey traced stage 2 through cases for the first time** while
still completing all six stages.

**Verify:** `npm run verify` passes, exit 0 — **1132 tests**, up from 1126.

**Live suites: 1 passing, 3 failing, 1 parked.** saucedemo 6/6; orangehrm and
toolshop on item 62's accessibility violations; parabank parked. **And
restful-booker joined them, which is a new finding rather than the same one.**

**Raised as item 64, and it is a weakness in run 79's own fix.**
restful-booker's a11y spec is green 3 of 3 run alone and red 1 of 2 under full
suite load, reporting `[critical] label` ×3. The settle waits for the DOM to be
still for a quiet period measured in wall-clock time — and under contention a
page that is mid-render is easily still for 500ms because it is starved, not
because it has finished. So the scan fires early and reports a shell clean:
the same false pass run 79 removed, less often, through the same door.
`scan.settled` reads `true` in those runs, which is the sharpest part of it.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **A heuristic that measures time measures the machine, not the page.** The
  settle is right in principle and its unit is wrong: "still for 500ms" means
  something different on a loaded machine, and the failure mode is silent
  because the scan believes it settled. Every wall-clock threshold in a suite
  that runs in parallel has this shape.
- **Measuring before concluding worked this time.** Run 78 filed a vendor
  regression from one sighting; here the same instinct was checked with 3 runs
  alone and 2 under load before writing anything down, and the answer was the
  opposite of "flaky test".
- **`git clean -nd` is the instrument for scratch, not `rm -rf`.** Last run I
  deleted ten committed case files while tidying. This run produced 20
  untracked case files in the same directories, and a dry run then
  `git clean -fd` removed exactly those.

**Next:** item 64. Everything else is waiting on the owner.

## 2026-08-23 · run 82 · A scan is a result when scanning again says the same thing

**Picked:** item 64, the only `ready` item. Re-read `git log origin/main` before
starting and it had moved — run 81 landed item 63 (a PractiTest set per
application, found by name) while this session was reading. Re-read the
worklist rather than trusting the copy loaded at the start, which is what the
file's own instruction says to do, and 64 was what it now pointed at.

**Did:** `createScanner` settles, scans, settles and scans again, and accepts
the findings only when two consecutive scans agree on a fingerprint of what axe
found. `A11yScan` carries `stable` and `scans`; `describe()` prints an
`UNSTABLE` caveat when they never agreed. The scaffolded a11y spec asserts
`scan.stable`. Full reasoning in item 64 in `backlog.md`.

**The choice worth recording: measure the fact, not a better proxy.** The item
offered three directions and two of them were more arithmetic on the same
proxy — anchor on `readyState`, or scale the quiet period by mutation cadence.
Both still guess at "has this page finished" from the outside. Agreement asks
the question the caller actually has: does the answer repeat? It needs no
theory about *why* the page was slow, which is exactly why it survives a cause
nobody predicted.

**Settling twice is not a confirmation, and it took a minute to see why.** It
was the obvious cheap version — settle, settle, then scan — and it is
arithmetically just a longer quiet period, because the second observer resets
on the same mutations the first one did. The item explicitly forbade raising
the quiet period; settling twice is that, wearing a disguise. The confirmation
has to be of the *answer*, which means paying for a second axe run.

**Proven live, and the proof turned out to be better than the fix.**
`restful-booker` was the symptom: green 3 of 3 alone, red only under full-suite
load. After the change it is red **run alone, three times running, with
identical findings** — `[critical] label` ×3, `[serious] color-contrast` ×4,
`[serious] link-name` ×3.

`link-name` ×3 is **not** in the findings run 81 recorded from the load-only
sighting. Even that accidental late scan had caught the page mid-render. A
mechanism built to stop early scans is reporting a fuller page than the
accident was.

**Verify:** `npm run verify` passes, exit 0 — **1144 tests**, up from 1126.

**One existing test failed and was rewritten to the new guarantee**, which is
the suite working as the loop's own notes predict. "The scan waits before it
looks" asserted `['settled', 'scanned']` — it was relying on the single-scan
default rather than asserting what it cared about. It now asserts the
invariant: every scan is preceded by a settle, however many there are.

**Live suites: 1 passing, 3 failing, 1 parked.** saucedemo 6/6; orangehrm 6/7,
restful-booker 12/13 and toolshop 21/22, all three red on accessibility and all
three filed as `application-defect (rule: accessibility-violation)`; parabank
parked. **All three reds are item 62, which is the owner's decision.**
restful-booker's line changed meaning rather than colour — it was "12/13, one
flake" and is now 12/13 for a reason that reproduces.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**. The
change contradicted nothing.

**Raised:** item 65, and it is this change's own loose end. The guarantee
exists and the four packs already on disk do not ask for it — they were written
before `stable` did. Adding the assertion to four packs by hand is the wrong
fix and is the whole point of the item: `upgrade.ts` already exists for pushing
a corrected template line into packs that exist (run 70), and `target:doctor`
already reports a pack missing something it should have. Fix the mechanism.

**Learned:**

- **A proxy that is right most of the time is the hardest kind to replace,**
  because every failure looks like tuning. Run 79's settle was correct and the
  three obvious follow-ups were all "settle harder". The move was to stop
  improving the proxy and measure the thing it stood for.
- **The confirmation found more than the accident did.** The load-only sighting
  was treated as the ground truth for what restful-booker's violations *are*,
  and it was a subset. Worth distrusting any finding whose only evidence is one
  unlucky run — including a finding that is real.
- **Backslashes do not survive this shell's heredoc.** `\\n` in a quoted
  heredoc reached Python as a real newline, so a replacement against a TS
  template literal silently matched nothing. Building the escape with
  `chr(92)` works. Same family as the trap runs 67, 74 and 77 all recorded;
  this is the third costume.
- **Cut a section by heading boundary and assert what survived.** The file
  warns about this twice — runs 66 and 80 both lost content — so the cut
  asserted that no other heading was inside the removed span, and the heading
  list was printed before and after.

**Next:** item 65. Everything else is the owner's: 62 (accept, waive or park
the accessibility violations on three applications), 56 (drop toolshop's pool
or correct its stated reason), 52 (follows from 56), 49 (a real Teams webhook
and SMTP relay).

## 2026-08-23 · run 83 · The stability guarantee reaches the packs that predate it

**Picked:** item 65, the only `ready` item — item 64's own loose end. The owner
also answered the four blocked items in the same message, so this run records
those decisions and acts on the one that needed code.

**Did:** a lint rule, `a11y-scan-stability`. A spec that calls `a11y.scan()`
and never reads `.stable` is refused. It caught exactly the four packs on disk
and nothing else, and each now asserts it. Reasoning in item 65 in
`backlog.md`.

**The mechanism question was the work, and the item guessed wrong.** Item 65
proposed `upgrade.ts` — which exists precisely for pushing a corrected template
line into packs that already exist (run 70) — plus `target:doctor` as a
backstop. Reading `upgrade.ts` says it cannot do this and should not be made
to: `staleManagedLines` moves a marked line the template has *changed*, and
deliberately **skips a key the pack does not have**, because a deleted marker
is the documented way to keep a local change. It cannot tell "never had this
line" from "removed it on purpose", and guessing would overwrite somebody's
work. Adding a line is not what that mechanism does.

So the requirement went where every file is checked on every run instead, which
is also what the conventions ask for first: "every convention worth having
should be expressible as a lint rule, a type, or a failing test."

**The rule is deliberately not prescriptive.** Any reference to `.stable`
satisfies it — an assertion, a branch that annotates, a filter. A spec may
legitimately report on an unstable page so long as it says that is what it is
doing; what is refused is silence. Same reasoning the scanner already follows
by asserting nothing itself.

**Editing four packs' specs is not a rule-zero breach and it is worth saying
why.** Nothing was failing. The framework grew a guarantee, a framework
mechanism now requires it, and the packs gained an assertion they should always
have had — that is authoring coverage, which is the rule's stated exception.
Troubleshooting would have been editing a pack to make a red go away, and no
red was involved.

**The owner's four decisions are recorded in `open-items.md`.** 62 accepted as
red on all three applications, 52 accepted at 4 of 5, 49's `TEAMS_ALWAYS` and
`DIGEST_ALWAYS` staying off. The fourth is the entry below.

**I recommended the wrong thing on item 56, applied it, measured it, and put it
back.** The recommendation was "drop `poolSize` for `customer` and get a worker
back". Applied, toolshop's worker ceiling went from 2 to **1**.

`workerCeiling` derives the cap from `serverState` *and* the pool: with
`serverState: true` and no pool it is 1; three accounts with the third reserved
for `auth-flows` gives 2. **The pool is the only parallelism that suite has.**

Run 77's measurement was read as "the pool buys nothing", and its own caveat
says why that was too strong — both arms ran at three workers, above this
target's normal ceiling, and **at the normal ceiling of 2 the same suite went
22/22 in the same session**. What was actually disproved was the pool's *stated
reason*: the cart is per-tab `sessionStorage`, so two workers never shared one.

So option 2 was taken instead — the pool stays and its reason is corrected, in
the profile and in the `serverState` comment beside it. The ceiling is 2 again
and toolshop runs 21/22. **Raised item 66** for the real question underneath:
`serverState` decides both "does this need cleanup" and "can two workers share
an identity", those came apart on toolshop, and four of five profiles still
carry the scaffolder's `// does state need cross-test cleanup?` verbatim.

**Verify:** `npm run verify` passes, exit 0 — **1145 tests**, up from 1144.

**Live suites: 1 passing, 3 failing, 1 parked**, unchanged from run 82 and
every failure now an accepted decision. saucedemo 6/6; orangehrm 6/7,
restful-booker 12/13, toolshop 21/22, all three on accessibility and all filed
`application-defect (rule: accessibility-violation)`; parabank parked. **The
three specs now assert `stable` and still fail on the violations rather than on
stability**, which is the useful confirmation: those pages do settle, and the
reds are real findings rather than early scans.

**Triage agreement, unchanged on all four:** toolshop **4 · 0 · 0**, orangehrm
**4 · 0 · 0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **Check which knob the ceiling actually reads before recommending turning
  it.** I recommended dropping a pool on a measurement about *contention* when
  the pool's real job was *worker count*, and the two are set by different
  fields. One `workerCeiling` call would have caught it; instead the owner
  agreed to something wrong and it took applying the change to find out.
- **A measurement's caveats are load-bearing.** Run 77 wrote down that both
  arms ran above the normal ceiling and that the suite was 22/22 at the normal
  one. That caveat contained the whole correction and I read past it twice —
  once writing the recommendation, once accepting it.
- **An item's proposed mechanism is a hypothesis.** Item 65 named `upgrade.ts`
  first and it was the wrong tool for a reason its own source comments state
  plainly. Reading the mechanism before extending it cost ten minutes and
  saved building an "add missing marked line" feature that would have
  overwritten deliberate deletions.
- **Cutting four adjacent sections at once needs the same guard as one.** The
  span was asserted to contain the four wanted headings and none of the three
  that had to survive, and the heading list was printed before and after — the
  file has lost content to this twice.

**Next:** nothing is `ready`. 66 needs a measurement, 49 needs credentials only
the owner has, 11 is standing. **The next run is a scan run** — drive the
dashboard and the onboarding journey and raise what is found, with item 66 as
the fallback if the scan turns up nothing better.

## 2026-08-23 · run 84 · `serverState` was answering two questions, and four applications ran serially for it

**Picked:** item 66, at the owner's direction.

**The cheapest check came first and it was the whole finding.** Four of five
profiles carry the scaffolder's `// does state need cross-test cleanup?`
verbatim. Computing the ceiling each one actually gets:

| application | pool | ceiling |
|---|---|---|
| orangehrm, parabank, restful-booker, saucedemo | — | **1** |
| toolshop | `{customer: 3, admin: 1}` | 2 |

**Four applications running serially**, because `workerCeiling` caps at the
usable accounts and one account plus `serverState: true` is one worker. So
declaring a pool of three buys parallelism *back* — backwards from how the
field reads, and nobody had noticed because the field is called `serverState`
and reads as a claim about cleanup.

**The measurement instrument was blind exactly there.** `whatThereIsToMeasure`
returned `null` for a pool of one — a pool of one buys no partitioning, which
is true and is not the question. `pool:measure` was declining to measure the
four applications paying the most for the claim. That had to be fixed before
anything could be measured, which is itself the answer to "why did this sit for
so long".

**Measured**, control at the ceiling and experiment above it on one identity:

| application | at its ceiling | above it, one account |
|---|---|---|
| saucedemo | 2/2 green at 1 | **2/2 green at 6** |
| restful-booker | 2/2 green at 1 | **2/2 green at 4** |
| orangehrm | 2/2 green at 1 | **2/2 green at 3** |

**`orangehrm` is what settled it.** Its specs create and delete real system
users, so it genuinely needs `serverState: true` for cleanup — and it tolerated
three workers on one identity anyway. That is the two claims coming apart
inside one application, which is the evidence item 66 demanded before letting
anybody touch the type.

**Did:** `sharedIdentitySafe?: boolean` on `TargetCapabilities`, honoured by
`workerCeiling`, with **undefined keeping the old cap** so nothing silently
speeds up. Plus the instrument fix, reframed `pool:measure` arms (control at
the ceiling, experiment above — the old both-arms-at-`poolSize` is what made
run 77's control over-subscribed), a `worker-cap-unmeasured` doctor warning,
and a scaffold that writes both questions with the cost stated.

**I did not set the flag on any profile, and that is item 67.** Two runs per
application is thinner than this repository's own `FLAKE_MINIMUM_RUNS` of 5,
and run 83's lesson was exactly about acting on a measurement with a hole in
its framing. The capability exists and the doctor asks; turning it on wants
five runs.

**Verify:** `npm run verify` passes, exit 0 — **1148 tests**, up from 1145.

**Three existing tests were rewritten to the new guarantee.** The doctor's
"says nothing when everything agrees" fixture had to *answer* the new question,
which is the right outcome: a profile leaving it open is not one that agrees,
it is one nobody has finished.

**Live suites: unchanged from run 83** — saucedemo 6/6; orangehrm 6/7,
restful-booker 12/13, toolshop 21/22, all three on the accessibility violations
the owner accepted as red; parabank parked.

**Triage agreement, unchanged:** toolshop **4 · 0 · 0**, orangehrm **4 · 0 ·
0**, restful-booker **3 · 0 · 1**, saucedemo **1 · 0 · 3**.

**Learned:**

- **A measurement command that declines to measure something is a finding
  about the command.** `pool:measure` said "nothing to measure" for four of
  five applications and everyone read that as "nothing is wrong". The blind
  spot was in the instrument, and it was one boolean.
- **A field name that reads as one claim will be answered as one claim.**
  `serverState` sounds entirely like cleanup, so every author answered the
  cleanup question and none of them knew they had also set the worker count.
  A second field with an honest name fixes it in a way no comment on the first
  one would have.
- **Default to the old behaviour when adding a capability that changes
  concurrency.** `sharedIdentitySafe === undefined` keeps the cap, so this
  change is inert until somebody opts in with evidence. The alternative —
  making the fast path the default — would have uncapped four suites on the
  strength of two runs each.
- **The cheapest check was a grep.** Four profiles carrying an unedited
  scaffold comment took thirty seconds to confirm and was the entire shape of
  the item. Item 56 flagged it as a "wider finding" three runs ago; nobody ran
  the grep.

**Next:** item 67 — five runs per application, then set the flag where they
agree.

## 2026-08-23 · run 85 · Five runs was the right number and the wrong width

**Picked:** item 67, at the owner's direction — five `pool:measure` runs per
application, then set `sharedIdentitySafe: true` where all five agree.

**Did what the item asked, and all three agreed.** saucedemo, restful-booker
and orangehrm each came back **5/5 green at their ceiling and 5/5 green above
it**, which clears `FLAKE_MINIMUM_RUNS`. The flag went on all three.

**Then two of them fell over at the width the flag actually buys.**

| application | at the real width | what failed |
|---|---|---|
| **restful-booker** | 1 of 3 live passes clean | `RB-1-01`, then `RB-1-02` — a different room-list spec each pass |
| **orangehrm** | 4 of 5 e2e runs clean at 5 workers | `OHRM-3-01`, the `@audit` spec |
| saucedemo | 5/5 e2e at 4 workers, 3/3 live | — |

Both reverted the same day, with the evidence in their profiles.

**The finding is about the instrument, not the applications.**
`pool:measure`'s experiment arm ran at `ceiling + 1` — two workers for a target
capped at one. Lifting the cap does not run the suite at two; it runs it at
whatever the runner picks, which was **five**. So the command answered *"may
two workers share this identity"* and I read it as *"may this suite run
uncapped"*.

Those come apart the moment an application has **global** state. A room list
and a user list are not owned by whoever signed in, so workers collide over the
*data* long before they collide over the login — and both failures were list
assertions. Neither was an authentication problem.

**The reasoning I wrote that morning was exactly backwards**, which is the part
worth keeping. The profile comment justifying the lift said rooms are *"global
rather than owned by the signing-in identity — so two workers sharing the
administrator collide over nothing."* Being global is precisely why they
collide.

**Shipped:** `runOnce` takes `number | null` and the experiment arm omits
`--workers` entirely, so it runs as an uncapped profile would; the verdict now
carries "run the live suites a few times with it lifted" and says why; the
conventions carry the finding. `saucedemo` keeps the flag — its state is
per-browser-context, a cart and an inventory rather than a shared list, which
is the structural reason it survives.

**Verify:** `npm run verify` passes, exit 0 — **1148 tests**.

**Live suites, with the caps restored:** unchanged from run 84 — saucedemo 6/6;
orangehrm 6/7, restful-booker 12/13, toolshop 21/22, all three on the
accessibility violations the owner accepted as red; parabank parked.

**Raised:** item 68. Both reverted applications keep a cap that is a blunt
answer to a narrow problem — the fix is worker-safe list assertions
(`OHRM-1-01` filters by username and passes at five workers; `OHRM-3-01`
asserts on the unfiltered list and does not), not a wider pool. The order
matters: make the assertions safe, prove it at width, *then* lift.

**Learned:**

- **Ask what the number will decide, then measure that.** Five runs was the
  right count and two workers was the wrong width, so a measurement that
  cleared the repository's own flake threshold still produced two wrong
  answers. The runs axis was fine; nobody had checked the other axis.
- **Third correction in three runs, same family.** Run 83 corrected a
  conclusion whose arms both ran above the normal ceiling; run 84 declined to
  act on two runs; run 85 acted on five and still had to revert. Each time the
  count was the thing being argued about and the *conditions* were the thing
  that was wrong.
- **A false justification survives right up until it is tested.** "Global, so
  they collide over nothing" reads plausibly and is the inverse of the truth.
  Writing the reason down is what made it falsifiable — a bare
  `sharedIdentitySafe: true` would have been reverted with nothing learned.
- **Reverting well is cheap if the evidence is written down.** Both profiles
  now say what was measured, what failed, and why the cap is earned, so the
  next person does not re-run this.

**Next:** nothing is `ready`. 68 is a hypothesis, 49 needs credentials only the
owner has, 11 is standing — so the next run is a scan run.

## 2026-08-23 · run 86 · A scan run, and the crowding was state nobody clears

**Picked:** nothing — a scan run, which the file's own rule calls for when
nothing is `ready`. Drove the dashboard and the onboarding page rather than
reading them.

**Raised item 69, and it is the standing priority exactly.** The onboarding
page, measured on the running page at 1280×720:

| state | height | screens | steps revealed | name field |
|---|---|---|---|---|
| no draft on disk | **1761px** | 2.45 | 1 of 5 | empty |
| the draft this machine had | **3173px** | **4.41** | **3 of 5** | `fold-scratch` |

**+80% height and two extra steps**, from `.onboarding-draft.json` written on
2026-08-19 by a run testing something else. It names a scratch target that no
longer exists and pre-fills twelve fields with that application's readings.

The 1761px matches the 1714px item 23 recorded when progressive disclosure
shipped — so **the disclosure mechanism is working perfectly**, and what
defeats it is state nobody clears. `savedAt` is written and read only for
non-emptiness (`dashboard-page.ts:904`, `:917`); its value is never compared to
anything, so there is no expiry. `offboard.ts` and `tools/offboard.ts` contain
the string `draft` zero times, so `target:remove` takes the profile, the pack,
the credentials and the sessions and leaves the draft describing what it just
removed.

**Raised item 70**, small: `npm run onboard`'s own docstring says it opens the
onboarding page, and the server always opens `/`. The root adapts — onboarding
with nothing onboarded, Runs with five — so the claim holds for a first-time
user and fails for everybody else.

**Three things nearly went in wrong, and that is the entry.**

- A **copy bug** — the accessibility tree rendered *"Two at a time. A third is
  rather than queued"* with "refused" as a detached node. `get_page_text` shows
  the sentence intact. An artifact of how the tree flattens an inline element.
- A **truncated sentence** — *"…so this is"* in the tree, complete on the page.
  Same cause.
- **Item 70 as a much larger finding.** First seen with five applications, and
  written up as "the onboarding command does not open onboarding". Driving the
  zero-application case showed the root adapts. Reading `onboard.ts` would have
  *confirmed* the wrong conclusion — nine lines, no routing in them, because
  the routing is elsewhere.

**And a fourth**, which is the one worth keeping: the revealed steps 2 and 3
looked like a regression of item 18 until the draft on disk explained them.
Filing that would have sent somebody to fix a mechanism that is working.

**Nothing was committed to a finding until it had been reproduced on a rendered
page.**

**Also checked, and clean:** 375px phone width — no horizontal scroll, nothing
overflowing, so item 25's fix holds. The Runs page with no application selected
says *"Choose an application in the bar at the top of the page. A run has to be
against one."*, which is clear.

**Method note.** Reproducing the zero-application state meant moving all five
profiles out of `config/targets/` and the draft aside, then restoring both.
`git status` was empty afterwards and the draft is byte-intact — worth doing
that way rather than reasoning about an empty repository, because the root
route's adaptation is exactly what nobody would have predicted.

**Verify:** `npm run verify` passes, exit 0 — **1148 tests**. No code changed
this run.

**Live suites:** not re-run — nothing in this run touched a target, a fixture
or a rule, and run 85 ended with two clean passes an hour earlier.

**Learned:**

- **The accessibility tree is a lossy view of the text.** Two of four candidate
  findings were flattening artifacts. Read the rendered text before believing a
  copy defect — the tree is the right tool for structure and roles, not for
  prose.
- **Check the environment before blaming the code.** The crowded page was a
  four-day-old file, not a regression. "What is on this machine that would not
  be on a fresh one?" is a cheaper first question than reading the renderer.
- **A route that adapts is invisible until you remove its input.** `/` serving
  onboarding-or-runs cannot be seen from the file that opens it, and the
  entrypoint's own docstring describes the case that is now the rarer one.

**Next:** item 69 — start with clearing the draft in `target:remove`, which is
the unambiguous bug and the case that actually happened.

## 2026-08-23 · run 87 · The draft was the fifth thing a target owns, and two predicates only knew about four

**Picked:** items 69 and 70, at the owner's direction, with the standing note
that a fix is framework-level or it is not a fix. Nothing here names an
application.

**Item 69 — a draft that outlives the visit it belongs to.** Three parts, and
driving the dashboard found two more defects on the way.

1. **`target:remove` clears it.** `OffboardFacts` grows `draftName`,
   `OffboardPlan` grows `clearDraft`, and the match is **exact** — a draft for
   `acme-shop-staging` is not `acme-shop`'s to delete, the same rule credential
   keys already follow. `ONBOARDING_DRAFT_PATH` moved to `src/support/paths.ts`
   because two tools now need it and a second hand-written copy of a path is
   how the two come to disagree.
2. **It expires.** `draftIsStale(draft, now, maxAgeMs)` in `draft.ts`, one day
   by default, `now` injected so the rule is testable without waiting one.
   `savedAt` has carried the comment *"ISO, so a stale draft can be recognised
   as one"* since it was written; nothing ever recognised one. A stale draft is
   not restored **and the file goes**, because one that is read, refused and
   left behind is refused again forever while `target:remove` keeps offering to
   clear it.
3. **It says where it came from.** The draft-state line reads *"kept as you
   type · saved today"*. Runtime-filled, so it costs nothing against the page's
   copy budget.

**Item 70 — `npm run onboard` opens the onboarding page.** It claimed to and
did not: the body was `import './dashboard'` and the server always opened `/`,
which `landingPath()` sends to Runs as soon as one application exists.
`landingPath` is a deliberate product decision and is untouched — `/` stays
adaptive for `npm run dashboard`. The entrypoint asks for a specific page
instead, via `DASHBOARD_OPEN_PATH`, sanitised against `DASHBOARD_PAGES` so an
environment variable cannot aim it anywhere it likes. `require` rather than a
static import, because an `import` is hoisted above the assignment and the
ordering would have been a timing accident.

**Two defects found by driving the dashboard, and both are item 16's, alive
where nobody had looked.**

- **The page threw the plan away.** `dashboard-page.ts` printed *"Nothing named
  X is onboarded"* and returned the moment `alreadyGone` was true — discarding
  the credential entries, the stored sessions and the warnings the plan had
  already collected. That is the exact wording item 16 was raised to remove,
  and the CLI has been right about it since. Somebody who removed a pack by
  hand, or offboarded twice, was told there was nothing to do while a real
  password sat in `config/secrets.private.json`.
- **`hasAnythingToRemove` counted four things.** With the draft as a fifth, a
  plan whose *only* leftover was the draft answered "nothing to remove", so
  `isRemovable` refused and the route replied *"nothing it owned is left"*
  while the file was on disk. Caught by clicking **Remove it** and watching the
  file survive.

**Proven through the dashboard UI, end to end**, which is the owner's standing
instruction for this kind of work:

| driven | result |
|---|---|
| a four-day-old draft | ignored, 0 of 5 steps revealed, fields empty, "nothing in progress", **and the file deleted** |
| a draft saved today | restored, 3 steps revealed, **"kept as you type · saved today"** |
| `npm run onboard` | opens `…/onboard`; `npm run dashboard` still opens `/` |
| Remove an application → `fold-scratch` | *"Would remove the onboarding draft"* + a confirmation, where it used to say *"Nothing named fold-scratch is onboarded"* and offer nothing |
| typing the name → **Remove it** | *"Removed 1 item(s)"*, and the draft gone from disk |

**Verify:** `npm run verify` passes, exit 0 — **1161 tests**, up from 1148.

**Two existing tests were rewritten to the new guarantee.** One declared a plan
that was `alreadyGone` yet still carried a credential and a session, and
asserted the page said "nothing is onboarded" — the precise case item 16 says
must not say that. It is now two tests: one for genuinely nothing left, one for
a pack that is gone while its credentials are not.

**Live suites:** not re-run — nothing here touches a target, a fixture or a
rule, and run 85 ended with two clean passes.

**Learned:**

- **A list of what a thing owns lives in more than one place, and somebody will
  extend one of them.** The draft had to be added to `OffboardFacts`, the plan,
  the tool's removal loop, `hasAnythingToRemove`, `describeOffboard`, the
  page's renderer and the panel's copy. The type system caught four of those
  and the last three needed a person clicking the button.
- **The backtick trap, twice in one run.** A comment containing backticks
  inside `dashboard-page.ts` closes its template literal; so does a nested
  template literal, which would also have interpolated at render time instead
  of in the browser. Both are documented in the working notes and both were
  walked into anyway.
- **The CLI being right is not evidence the dashboard is.** Item 16 fixed
  `planOffboard` and its tests, and two consumers kept the old behaviour for
  months because nothing drove them. That is the argument for the owner's
  instruction to interact through the UI.

**Next:** items 69 and 70 are closed. Nothing is `ready`; 68 is a hypothesis,
49 needs credentials only the owner has, 11 is standing.

## 2026-08-23 · run 88 · A deep scan of all seven pages: the dashboard says less than it knows

**Picked:** nothing — the owner asked whether the dashboard exposes everything
useful. Driven through the UI, every page, per the standing instruction.

**Two findings, and both are the shape run 87 found twice: the CLI is right and
nothing drove the page.**

**Item 71 — parked is invisible, and the doctor is unreachable.** Selecting
`parabank` on `/runs` leaves **Run it enabled with no mention that the
application is parked**. `suites:live` refuses to run it — *ParaBank answers
HTTP 500 on its own login and accounts pages* — because somebody paused it
deliberately, with a reason and a review date. The dashboard hands back a wall
of red that looks like a finding.

And there is no health control anywhere for an existing application. Every
visible button on `/onboard` with one selected: *Change its settings · Add
another service · Read the application · Skip and fill in by hand · Check where
credentials come from · Preview what will be written · Show me what would go.*
The doctor runs once inside Create and is never offered again, hiding six
findings across the five applications — including `target-parked` and
`coverage-incomplete`.

**Item 72 — the page called Runs cannot show a run.** No history, hidden or
otherwise; confirmed by searching its DOM. The history already fills dropdowns
on `/triage` and `/publish`, so a finished run is reachable only from the two
pages that are about something else. Nothing links to `report:render` either.

**Ten other capabilities are absent and most should stay absent.** The full
table is under item 72. The pattern: everything left out is an *authoring*
command (`catalog`, `explore`), a *once-per-application measurement*
(`pool:measure`), or something whose danger is being easy (`rotate:passwords`,
`heal`). Everything raised is the page failing to report state it already has.

**Verify:** `npm run verify` passes, exit 0 — **1161 tests**. No code changed.

**Learned:**

- **"Is anything missing" is two questions.** What the tool cannot *do*, and
  what it will not *say*. The second list was shorter, sharper and entirely
  defects; the first was mostly things that would make the tool worse.
- **The declined list is the deliverable.** Ten absent capabilities, and
  writing down why eight of them should stay absent is what stops the next
  scan filing eight items. The standing brief already says a capability that
  adds a step is a net loss; this is that rule applied with names attached.
- **Three runs, three instances of the same defect family.** Item 16's
  behaviour in two consumers (run 87), and now parking in a third. When a rule
  lands in a pure module, its consumers are where it fails to arrive.

**Next:** item 71 — the dashboard should not start a run against an application
somebody parked.

## 2026-08-23 · run 89 · The bar carries the verdict, and Runs can show you a run

**Picked:** items 71 and 72, at the owner's direction. Both were run 88's scan
findings; both are the dashboard reporting state it already had.

**Item 71 — the doctor, and parking.** A health chip beside the application
switcher on every page, fetched from `/api/health` **after load** rather than
rendered: deciding it reaches the secret store, and on a Vault target that is
somebody else's server, so a page render would wait on a network call. Driven,
and the counts match `npm run target:doctor` exactly — saucedemo hidden and
clean, three applications at `1 smell`, parabank at **`parked`** with the reason
and the review date in its title.

`packSpecTags` is exported from `tools/check-target.ts` so the chip and the
command read the same tags, and that file's `main()` is guarded with
`require.main === module` — importing it used to run the whole doctor and then
`process.exit`, which is why the dashboard had been missing
`coverage-incomplete` entirely.

`/runs` states the parking beside the control, with the reason and the date.
**It still allows the run**, which is the decision worth recording:
`suites:live --target=` runs a parked application when it is named, because
naming one is deliberate, and selecting it in the switcher is that same act.
The silence was the defect, not the running.

**Item 72 — Finished runs**, newest first, each row linking on to triage or
publish. Two things came out of building it: triage is offered only where there
is something to triage, because "Why it failed" beside a passing run reads as
the tool being confused; and the page sorts rather than trusting the route to,
because the copy above the list promises an order and a page that promises one
should keep it. A test asserts that against a deliberately unsorted fake.

**Verify:** `npm run verify` passes, exit 0 — **1169 tests**, up from 1161.
Eight new dashboard tests, and the harness grew `/api/health` and
`/api/runs/history` fakes.

**Live suites:** not re-run — nothing here touches a target, a fixture or a
rule.

**Learned:**

- **I cut a section while archiving, again.** The declined-capabilities list —
  ten things that should stay out of the dashboard, written specifically so the
  next scan does not file them — lived inside item 72's block and went with it.
  Recovered from `git show HEAD:` and re-seated as its own section, which is
  where a standing decision belongs. Runs 66 and 80 lost sections the same way;
  the file warns about it; the warning is not enough on its own. **Grep for the
  content, not just the headings, before and after a cut.**
- **A degenerate viewport reads as a layout bug.** A background tab reports
  `clientWidth: 0`, and the overflow check then flags half the page. Second time
  this run. Set the viewport before believing any measurement taken through the
  browser tools.
- **An unguarded `main()` is an import hazard nobody notices.** `check-target.ts`
  had run its whole doctor on import since it was written; nothing imported it,
  so nothing found out. Its sibling had the guard already.

**Next:** nothing is `ready`. 68 is a hypothesis, 49 needs credentials only the
owner has, 11 is standing.

## 2026-08-23 · run 90 · Four applications through the UI: the scoping is not uniform

**Picked:** a scan, at the owner's direction — the four live applications
(`orangehrm`, `restful-booker`, `saucedemo`, `toolshop`; `parabank` is parked),
driven through the dashboard. A **per-application** pass, where run 88's was
per-page, and that is what made the difference: everything below is invisible
with one application selected.

**Item 73 — the Stories page shows another application's stories, and it is
live.** With the bar reading `orangehrm`, the page lists TOOL-1 to TOOL-5:
*search the catalogue*, *put a tool in the cart*. `/api/stories` returns the
identical five for all four applications.

**This is run 80's defect, unfixed one layer over.** That run found
`app:journey`'s stage 2 taking the first `stories/*.json` on disk — committed,
so `TOOL-*.json` every time — and reporting *"story TOOL-1 pulled from Jira"*
for `orangehrm`. It fixed the journey by asking the target's own specs which
story they cite. Nobody gave the dashboard the same fix, and the cause is
identical: `stories/` is flat and a story file names no application.

**Item 74 — `/api/cases` is unscoped, and is right by accident.** Identical
payload for every application: 10 toolshop cases, 63 orphan specs spanning all
five including parked `parabank`, and a `counts` summary true of the repository
and false of the page. The page filters and recomputes, so what renders is
correct — *"0 cases · 10 specs read"* for `orangehrm`. The trap is the `counts`
field sitting beside the data that does get filtered, waiting for somebody to
render the obvious thing.

**Verified correctly scoped**, so the finding is precise rather than a
suspicion: `/users` (`orangehrm` → `qa/orangehrm/…`, 1 account, all resolving),
the `/cases` page's own rendering, and the health chip, which matches
`npm run target:doctor` per application.

**Also seen, and it is the pack's data rather than the tool's:** toolshop's 10
case files carry ids like `TOOL-1-search-matching-nothing` while its specs cite
`TOOL-4-01`. So the coverage view reports 10 cases with no spec *and* 18 specs
citing a case that is not there — two counts describing the same work from
either end. The page is reporting that correctly; the ids never matched.

**Verify:** `npm run verify` passes, exit 0 — **1169 tests**. No code changed.

**Learned:**

- **Sweep the applications, not just the pages.** Run 88 walked all seven pages
  with one application selected and found two structural gaps. Switching
  applications across the same pages found two scoping defects that one
  application cannot expose — a page showing *somebody else's* data looks
  perfectly correct until somebody else exists.
- **A defect fixed in one consumer is not fixed.** Item 16 reached
  `planOffboard` and not two callers (run 87). Run 80 reached `app:journey` and
  not the dashboard. Three instances now of a rule landing in one place while
  its siblings keep the old behaviour, and in every case the fix already
  existed and needed applying rather than inventing.
- **"Right today" is worth filing.** `/api/cases` renders correctly and is still
  wrong; the payload disagrees with the page it was built for. Filing it while
  it is latent costs one item, and the alternative is finding it as a wrong
  number somebody trusted.

**Next:** item 73 — the fix exists in `run-journey.ts` and needs applying to
`/api/stories`.

## 2026-08-23 · run 91 · Re-verified run 90 one application at a time

**Why:** the owner pointed out that run 90's scan switched applications in a
scripted loop and called the APIs directly — neither one application at a time
nor driving the UI, and a method that could have raced the selection write.
That is a fair objection to the *evidence*, so the answer was to re-run it
rather than defend it.

**Both findings survive, and item 73 reproduces more cleanly than it was first
found.** A fresh server, a fresh browser session, `/stories` opened directly
with `orangehrm` already selected and **nothing switched at all**: the page
offers *"Search the catalogue for a tool by name"*. One deliberate switch to
`saucedemo` through the control itself — the way a person switches — shows the
same five. The switching was never the cause.

**Item 74 in a stable single-application state:** `saucedemo` selected before
the page loaded, page reads *"0 cases · 9 specs read"* — correct — while the
payload behind it carries toolshop's cases, orphans from all five applications,
and `counts` of 10 and 63.

**The race objection is ruled out by the orphans**, which is the part worth
keeping: a route that scoped to the selection could not return orphan specs for
five applications whichever one it had read. Only an unscoped route can. That
was true of the original evidence too — it just was not the evidence I led
with.

**Verify:** `npm run verify` passes, exit 0 — **1169 tests**. No code changed.

**Learned:**

- **A sloppy method makes a real finding arguable.** Both items were correct and
  both were reported from evidence that could not rule out its own obvious
  failure mode. The cost was not a wrong item; it was an item nobody should have
  had to take on trust.
- **Ask what would falsify it, and check that first.** The orphan list spanning
  five applications settles the scoping question on its own, and it was in the
  first run's own output. Leading with it would have made the method irrelevant.
- **One application at a time is the method, and it is now in memory.** Run 90's
  sweep was faster and produced findings that then needed re-doing at full cost.

## 2026-08-23 · run 92 · One item shipped, one withdrawn as never having been a defect

**Picked:** items 73 and 74, at the owner's direction.

**Item 73 shipped, and it is run 80's fix applied where it had been missed.**
`stories/` is flat and a story file names no application, so every application
was shown every story. `src/support/cases/story-scope.ts` reads the `jira`
annotations the specs already carry — the same link `run-journey.ts` was taught
to read when its stage 2 reported *"story TOOL-1 pulled from Jira"* for
whichever application asked.

The rule has three cases and the middle one is the one that matters: a story
**nobody** cites is shown, because that is a story somebody has just pulled and
not yet written a spec against, which is the workflow the page exists for.
Hiding it would have fixed the reported defect and removed the reason to open
the page. Proven both directions through the UI — `saucedemo` reads *"No stories
pulled yet."*, one switch to `toolshop` shows its five.

**Item 74 withdrawn. It was never a defect, and finding that out is the entry.**

`/api/cases` already took a target, and `cases-page.ts:176` already sent one.
Measured with `saucedemo` selected: the call the page makes returns 0 cases and
9 orphans, all saucedemo's. The call *I* made — `{}` — returns 10 and 63,
because an absent target legitimately means the whole repository, which is what
`collectCoverage(undefined)` is for.

**It survived a re-verification, which is the part I got most wrong.** When the
owner challenged run 90's method, I re-ran the probe. The *same* probe, with the
same empty body, and recorded that the finding "held". Re-running a flawed
measurement is not verifying it — and I had already been told the method was the
problem.

Item 73 was real and survived because it was checked on the rendered page. Item
74 was never anything but an API probe. That is the entire difference between
them, and it is now in the scan-run memory.

**Verify:** `npm run verify` passes, exit 0 — **1180 tests**, up from 1169.
Eleven new tests for the scoping rule.

**Learned:**

- **Re-running a flawed measurement is not verification.** The correction to
  ask for is not "does it reproduce" but "what would show this is wrong" — and
  for item 74 that was one line of the page's own source, which sends the
  argument I claimed it did not.
- **A route's answer is not the page's behaviour.** Two of three findings from
  the last two scans came from calling routes directly; the one that was real
  came from reading a rendered page. The routes were doing their jobs.
- **A fix that hides everything passes the first check.** The counter-check —
  switch to the application that *should* see the data and confirm it still does
  — is what makes the first result mean anything, and it took one switch.

## 2026-08-23 · run 93 · Set up leaves the rail, and a budget that could not fail

**Picked:** the owner's observation — the dashboard is used for one live
application, occasionally two, and *Set up* should not hold a permanent slot in
the rail after onboarding.

**The instinct was already half-implemented**, which is the argument for
finishing it rather than against. *Set up* was a `<details>` shipping **closed**
once anything was onboarded: somebody had already decided it was not an everyday
destination and left it holding the first slot of a list of five things opened
daily. `landingPath()` reached the same conclusion about `/`. It cost ~40px of
720, so space was never the argument — prominence was.

**Applications and Test users now sit beside the application switcher**, and the
health chip routes by cause: a credentials finding to `/users`, a coverage
finding to `/cases`, everything else to the profile. Matched on code *prefix*,
because the doctor has forty-odd codes and grows one whenever somebody finds a
condition worth catching. Driven: toolshop's chip reads `1 smell` and points at
`/cases`.

**The collapsed group had left a live defect.** `nav.rail a { display: grid }`
beat the closed-`<details>` default the same way an author rule beats
`[hidden]` — which this stylesheet had already learned once, thirty lines up.
Measured: `/onboard` and `/users` with real 58px boxes behind Stories and Cases,
and **both in the keyboard tab order**. Item 18's lesson, on a different control.

**Item 76 is the more useful half.** The suite had *"the bar does not overflow
the viewport at phone width"*, at 375px, written for item 25 — and it passed
while the running page overflowed. Its fixture gave the bar no `available`
list, so the switcher rendered a short read-only label instead of a `<select>`
sized by its longest option. The test's bar was narrow enough that the budget
could not fail. Fixed with a realistic fixture and **proven by reverting the CSS
and watching it go red**.

**Three defects introduced and caught before shipping**, two of them the same
mistake twice: the links hidden below 60rem (unreachable on a phone, caught by
the suite's own reachability rule); the links inside the switcher's *switchable*
branch, so an environment-decided target lost them, and again for a page with no
target context; and `.ctx` unable to wrap, which is item 25's defect returning.

**Verify:** `npm run verify` passes, exit 0 — **1178 tests**. Eleven tests
described the disclosure and were rewritten to the new shape rather than
deleted.

**Learned:**

- **A budget nobody has seen fail is a budget nobody should trust.** Reverting
  the fix to watch the strengthened test go red took one minute and is the only
  thing that makes it evidence.
- **A fixture that renders what does not ship fails by passing.** Same lesson
  as items 73 and 74 in a third costume: the harness's bar, the unscoped route,
  the empty-body probe.
- **The rail filters itself, rather than its callers filtering.** The first
  attempt narrowed the list in `tools/dashboard.ts` and the test harness kept
  rendering the old rail — a rule living in one consumer while its siblings
  keep the old behaviour, for the fourth time in a week.

## 2026-08-23 · run 94 · The health chip's own promise was false for /onboard

**Picked:** scan — nothing in `open-items.md` is `ready` (68 and 11 are `hypothesis`, 49 is `blocked`), so the run drove the dashboard rather than reading it, per the file's own rule for that case.

**Found and fixed:** run 93 shipped "the health chip routes by cause… to the page that fixes the finding" — true for `/users` and `/cases`, which already read the top bar's shared application selection, and false for `/onboard`, which keeps its own picker and defaults it to blank on every visit (item 6). Driven live: selected `orangehrm` in the top bar, which carries a real `worker-cap-unmeasured` warning (`target:doctor`'s own output, confirmed with `TARGET=orangehrm npx tsx tools/check-target.ts`); the chip read "1 smell" and linked to bare `/onboard`. Clicking it landed on the blank "add one" form — orangehrm was still listed as an option, not selected — so the operator had to notice the picker and re-pick the very application the chip had just been reporting on. Confirmed against the DOM (`document.querySelectorAll('select')`): the top bar's `ctxTarget` select correctly held `orangehrm`; the onboarding page's own `pick` select held `''`. The two have never been the same control (`pick` is deliberately independent, per item 6), and nothing carried the intent across.

**Fixed in the framework, not a pack.** `whereToFix` (`src/support/onboarding/where-to-fix.ts`) still decides the page family; a new `chipHref(page, target)` in the same file composes the actual URL, appending `?target=<name>` only for `/onboard` — `/users` and `/cases` already read the shared selection and need nothing extra. `tools/dashboard.ts`'s `/api/health` route calls it. On the page, `dashboard-page.ts`'s `loadState()` now reads `?target=` on its true initial load only (`consumeTargetParam()`, wired in exactly where the old `keepSelection ? select.value : null` fell through to `null`) and drops it from the address bar immediately with `history.replaceState`, so a plain reload — or a second visit to the bare `/onboard` — still opens blank, which is item 6's guarantee, unchanged and unrelaxed.

**Proven live** against the real dashboard, not only in tests: restarted `npm run dashboard`, selected `orangehrm` through the switcher, confirmed `#ctxHealth`'s `href` reads `/onboard?target=orangehrm`, followed it, and watched `#pick` land on `orangehrm` with its settings on screen — the unpatched page landed on a blank form with orangehrm merely listed as an option among five.

**Verify:** `npm run verify` passes, exit 0 — **1190 tests**, up from 1178. Nine new framework tests cover `whereToFix`/`firstWorthFixing`/`chipHref` in `tests/framework/where-to-fix.spec.ts` (the module had none before this, despite being two commits old and carrying the whole routing decision the chip rests on); three new dashboard tests in `section0-choosing-an-application.spec.ts` drive the actual query-string arrival, its address-bar cleanup, and the unknown-name fallback.

**Live suites:** `npm run suites:live` — 1 application passing (saucedemo, 6/6), 3 failing (orangehrm, restful-booker, toolshop, each on exactly the accepted-red `A11Y-001` / `TOOL-5-01` accessibility spec, per the owner's 2026-08-23 decision on item 62 — no waivers, accepted as red on all three), 1 parked (parabank, reviewed 2026-09-19). Matches the accepted state exactly; nothing new here.

**Learned:**

- **A promise made in one commit needs checking against every consumer it touches, not only the ones that already worked.** Run 93's own log said the chip "routes by cause… to the page that fixes the finding" and was right for two of three destinations, silently wrong for the third — the exact shape flagged four times in the preceding week's entries ("a rule living in one consumer while its siblings keep the old behaviour"), and it shipped because nothing had driven the third case yet.
- **A blank-by-default picker (item 6) and a link that already knows the answer are not actually in tension**, once the second is spelled out as a one-shot query string consumed and discarded rather than adopted as a new standing default — the two behaviours coexist and neither one's existing test needed to change.
- **Leftover `tools/dashboard.ts` processes are piling up on this machine** — dozens found running (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` filtered to `tools/dashboard.ts`), evidently one or more per prior run that were never stopped. Not cleaned up here — killing processes this run did not start is outside this fix's scope — but worth a look: either the loop needs to stop its own server before finishing, or the server needs to notice its parent is gone.

## 2026-08-23 · run 95 · The top bar was nine elements and one visual rank

**Picked:** the owner's observation, raised mid-session — *"The header with application and selection, followed by applications then test users are kind of off and it's really not that intuitive."* Raised as item 77.

**Measured before touching anything**, because the standing rule is that reading the source produces confident wrong answers about this UI. The whole right-hand side of the bar — label, switcher, environment tag, health chip, two set-up links, three theme buttons — renders as **one flat run of nine elements**, no divider, no grouping. Computed styles said the rest: `.ctx-label`, `.ctx-env` and both `.ctx-setup-link`s were **the same `--muted` grey, same weight, no underline**. Two defects fall out of that, and they are different defects:

- **A lexical collision.** `.ctx-label` reads *"Application"* and a link ~350px along the same row read *"Applications"* — same colour, same weight, one letter apart. Nothing but the "s" told a static caption from a link to another page.
- **No affordance at rest.** The links' only sign of being clickable was a hover background. Hover is the one affordance a keyboard and a touchscreen never see, so at rest the two destinations in this bar were styled exactly like the captions naming the switcher.

**Item 75 is the cause, and this is the other half of it.** That change was right that onboarding and recovery are not steady-state destinations, and it moved them out of the rail — then set them down at the end of the switcher's own row with nothing to say the two jobs are different. "Which application is everything scoped to" and "go and configure the set-up" became one undifferentiated row.

**Three changes, one rank each.** A hairline `.ctx-divider` between the switcher cluster and the set-up cluster — rendered only when there *is* a switcher to separate from, `aria-hidden` because the grouping is already in the markup, and dropped at the 60rem wrap because a rule between two clusters that are no longer side by side points at nothing. The `/onboard` link renamed **"Applications" → "Onboarding"**. And `.ctx-setup-link` moved to `--ink-2` with a real underline.

**Two things I recommended and then did not do, both on evidence:**

- **No icons.** I had proposed icon + underline. The dashboard has **zero inline SVG and no icon font**, and `navigation()` carries an explicit principle — *"Labels are words. An icon rail looks tidier and costs a guess per icon"* — with a test enforcing it. Introducing the design system's first icon to solve an affordance problem that an underline already solves was the wrong trade.
- **`/users` keeps its name.** I had proposed "Test users" → "Credentials". But `/users` is titled *and* eyebrowed **"Test users"**, so renaming only the link would have made it disagree with its own destination — introducing the exact mismatch this change removes from `/onboard`, whose page eyebrow is "Onboarding". And "Test users" collided with nothing; only "Applications" did. The rename is now scoped to the link that actually had the defect.

**Proven by reverting.** All five new tests passed first time, which run 93's own lesson says is not yet evidence. Reverted the label, the divider and the CSS: **4 of the 5 go red**. The fifth is the negative case guarding the conditional — with no divider rendered anywhere it correctly stays green.

**Driven live**, at three states rather than one. Dark 1280px: the divider lands at x=898, between the health chip ending at 890 and the links starting at 913, and the links compute to `#BEC9D1` against the label's `#8D9AA4`. **375px**: no overflow (`scrollWidth` 375 = viewport), divider `display: none`, both links still visible and reachable — item 75's own mistake was hiding *links* at this breakpoint, and a decorative rule is a different thing. **Light 1280px**: link contrast **8.84:1**, up from 5.3:1 as `--muted`; the divider is **3.29:1**, above the 3:1 floor WCAG 1.4.11 sets for non-text UI.

**Verify:** `npm run verify` passes, exit 0 — **1195 tests**, up from 1190. Five new.

**Live suites:** not re-run for this change and deliberately so — it touches `src/support/ui/` only, no target pack and no spec. The result recorded in run 94 earlier in this same session stands: 1 passing, 3 failing on the accepted-red accessibility specs, 1 parked.

**Learned:**

- **A change can be right about the problem and incomplete about the fix.** Item 75 correctly diagnosed that set up was not a daily destination and correctly moved it — and left it visually identical to the switcher it now sat inside. The follow-on defect was created by the fix, in the fix's own commit, and nothing caught it because no test had an opinion about visual rank.
- **Check a rename against the destination's own name.** "Credentials" sounded better than "Test users" right up to reading what `/users` calls itself. A link that disagrees with its page is the defect being fixed here, one page over.
- **A recommendation made from a mockup is a hypothesis.** Two of the three things I proposed changed on contact with the codebase — the icon against an existing principle, the second rename against the page's own title. The divider and the affordance, which came from *measured* computed styles rather than from taste, both survived intact.

## 2026-08-23 · run 96 · Sixty dashboards, 5.4 GB, none of them serving anybody

**Picked:** the finding runs 94 and 95 both flagged and neither acted on. Raised as item 78. Nothing in `open-items.md` is `ready`, so the alternative was a scan, and this was already scanned twice.

**Measured first.** 60 live `tools/dashboard.ts` processes holding **5,412 MB**, oldest 15:17, newest 21:32 — about six hours of accumulation on one day. That is "actually broken", which the standing brief puts above UX work.

**The cause, and `shutdown.ts` is the thing that made it findable.** A well-built teardown already exists and is wired to `SIGINT` and `SIGTERM` — Ctrl-C and an explicit kill. Neither is what happens when whatever launched a backgrounded dashboard simply goes away: on Windows no signal is delivered, so the process runs until reboot. Compounding it, the server binds **port 0**, so every invocation is a new server that knows nothing of the others and none of them ever collides or complains.

**`idleWatcher` in `shutdown.ts`, routed through the existing `stopEverything`** so an idle exit closes browsers exactly the way Ctrl-C does rather than becoming a second teardown path — which is the mistake that file's own header warns about. Default 60 minutes, `DASHBOARD_IDLE_MINUTES=0` to opt out, and the window is printed on the startup line, because a server that leaves on its own must never be a mystery.

**Two ways to get this wrong, both found by looking rather than reasoning, and both now tested:**

- **"No recent request" is not idle.** The Runs page holds an `EventSource` open, so a page actively watching a run makes no new request for minutes. A watchdog counting requests would close the server underneath it. The test is zero *connections*.
- **"Nobody watching" is not "nothing happening".** Start a run, close the tab: no socket, no request — and a browser driving a suite that `stopSync` would cancel. `runManager.active()` guards it, and the deadline restarts from the end of the run rather than the server leaving the instant the last one finishes. `active()` was extracted from `slotsFree()`, which already computed it.

**The live proof corrected my own assumption, which is the entry.** Wired up and run against a real server with a 3-second window, it **did not exit**. Instrumented rather than guessed: `conns: 3`, settling to `conns: 1`. Traced the other end of the socket through `Get-NetTCPConnection` — **msedge**. The dashboard calls `open(url)` unconditionally on startup, so every one of those 60 servers also spawned a browser tab, and the tab was still holding the connection. The watchdog was **right to decline**; my test was wrong. So `getConnections() > 0` turns out to mean exactly "a browser has this page open", which is the semantics I wanted and had not proven.

Then the transition the whole feature rests on, proven directly: client connects → `conns = 1`, watchdog holds off; client destroyed → count **lingers at 1 for about four seconds** through TCP teardown → reaches 0 → fires immediately. Irrelevant against a 60-minute window, and worth knowing it is not instant.

**Also changed, because a fixed interval made the behaviour unobservable:** `IDLE_CHECK_MS` scales to the window rather than sitting at a minute. A short window could not be watched happen, and a thing nobody can watch happen is a thing nobody should trust.

**Verify:** `npm run verify` passes, exit 0 — **1200 tests**, up from 1195. Five new.

**Live suites:** not re-run; this touches `src/support/ui/`, `src/support/runs/` and `tools/` only — no target pack, no spec. Run 94's result stands.

**Not done, and it is the next thing here.** `open(url)` is unconditional, so a scheduled or headless run spawns a browser window on somebody's desktop every time — 60 servers meant 60 tabs, and the tabs are why the servers looked busy. That wants a flag, and it is item 79 rather than scope creep on this one. The 60 existing orphans are still running; the watchdog only reaps the server it lives in.

**Learned:**

- **The feature not working was the feature working.** Ninety seconds from "the watchdog is broken" to "the watchdog is correct and my test was naive", and the only reason it was ninety seconds is that I instrumented the three conditions instead of reasoning about which one was false.
- **Trace the socket, do not infer it.** `getConnections()` returning 1 on an untouched server is a mystery until `Get-NetTCPConnection` names msedge, and then it is obvious. The first `OwningProcess` lookup answered "node", which is the server's own end and tells you nothing — the remote port has to be looked up separately.
- **A tool that starts an unbounded number of copies of itself will.** Port 0 is the right default for a local dev server and it removes every natural limit; nothing here noticed sixty until somebody counted.

## 2026-08-23 · run 97 · The window nobody asked for was keeping the server alive

**Picked:** item 79, `ready`, raised by run 96 an hour earlier. At the owner's direction, together with clearing the orphans run 96 left running.

**The orphans first.** 60 processes, 5,412 MB. Killed only those with **no established connection** — 44 of them, 2,953 MB — on the reasoning that a connection means somebody has the page open and losing their tab is not cleanup. All 60 went, because each logical dashboard is about three processes (`npx-cli`, `tsx`, the server) and taking the untethered ones out took their partners with them. Worth knowing rather than glossing: the safe filter was safe, and it was also less surgical than it looked.

**Then the item, and it is the reason 78 could not work.** `main()` ended with an unconditional `open(url)`. Right for a person typing `npm run dashboard`; wrong for a scheduled run, a headless check, or this loop. And the two defects were feeding each other — sixty servers had spawned sixty tabs, those tabs were holding the connections, and run 96's watchdog was therefore *correctly* declining to reap servers that looked occupied. **The window nobody asked for was keeping alive the server nobody wanted.**

**The default is a fact rather than a flag.** `shouldOpenBrowser(env, isTTY)` in a small pure module: a terminal attached to stdout is what separates "a person is running this" from "something is running this". An environment variable alone would have been useless here, because the callers that most need the fix are the automated ones nobody is watching and nobody would have set it for. `DASHBOARD_OPEN=1`/`0` overrides in both directions, and the *automatic* refusal explains itself on the console — an explicit one says nothing, because saying "no browser, as you asked" on every start is noise.

**Proven end to end, which run 96 could not do:** an automated caller now prints *"No terminal attached, so no browser was opened. DASHBOARD_OPEN=1 to open one."*, opens nothing, and **the server closes itself and exits 0**. That is items 78 and 79 working as one thing for the first time.

**One edge worth the test it has:** `DASHBOARD_OPEN=` set to empty — a shell profile or a CI runner exporting nothing — is somebody having *not* chosen, so the terminal still decides. Reading an empty string as "no" would silently take the browser away from a person at a terminal.

**Verify:** `npm run verify` passes, exit 0 — **1207 tests**, up from 1200. Seven new.

**Live suites:** not re-run; `src/support/ui/` and `tools/` only, no target pack and no spec. Run 94's result stands.

**Not verified, and stated rather than assumed:** the interactive path was not driven, because doing so puts a real browser window on the owner's desktop. `open(url)` is unchanged and the only new gate is a boolean the unit tests cover exhaustively — but if `npm run dashboard` in a real terminal ever reports no TTY, the failure is graceful and self-explaining rather than silent, which is the property that made this default acceptable.

**Learned:**

- **Two defects can hold each other up.** 78 was correct and inert; 79 was the reason. Neither log entry alone would have explained why the watchdog "did not work" — and the thing that connected them was tracing a socket to msedge, not reading either file.
- **A default that needs remembering is not a default.** The callers that needed the browser suppressed are exactly the ones with nobody present to set a variable. `isTTY` is the fact that was already there.
- **"Safe" filters can still be broad.** Killing only unconnected processes was the right rule and still took all 60, because process trees are not the unit the rule was written about.

## 2026-08-23 · run 98 · Scan: the run list never had a target in it

**Picked:** scan, at the owner's direction after items 78 and 79 landed. Nothing was `ready`.

**Method, per the standing rule and the memory note:** drove the running dashboard one application at a time, starting from whatever was already selected — **parabank**, which is the parked one — and read rendered pages rather than calling routes.

**Result: one finding, on three pages, and it is one defect rather than three.** With parabank in the bar, `/runs` "Finished runs" lists four runs — one `default`, three `toolshop`, **none parabank's**. The same list backs the run picker on `/triage` and `/publish`.

**The counter-check is what makes it a finding rather than a guess.** Switched to `toolshop` and got a **byte-identical list**. So this is not "parabank has no runs, so it showed everything" — there was never a target in it. That check took one switch and is the thing run 92 said to always do.

**`/triage` is the sharp case.** It does not merely *offer* another application's run, it **defaults to one and invites verdicts**: parabank in the bar, toolshop's `20260816T164527-dl50` on screen, two clusters under "needs judgement". A verdict recorded there is attached to an application the bar says you are not looking at.

**Checked at both ends, because run 92's lesson is that a route's answer is not the page's behaviour.** Here they agree and both are unscoped: all three pages post `{}`, and all three routes call `service.runs()` with no target. That is the opposite of item 74, where the page *was* passing a target and only my probe was not — and the difference is exactly why the rendered page came first this time.

**The data is already there**, read off the wire rather than assumed: `{"id":"20260816T164527-dl50","target":"toolshop",…}`. Every record carries its target, so a fix needs no migration.

**What is correctly scoped, checked rather than presumed:** `/cases` (0 cases, 10 specs for parabank), `/stories` ("No stories pulled yet" — item 73's fix, and toolshop still sees its five), `/users` (`qa/parabank/pools/workforce/customer/1`, one slot). `/runs` also states the parking properly — reason, review date, and that a run is allowed and expected to fail.

**Regression check on the same pass**, since items 77–79 all shipped today: the top bar renders its divider and its `Onboarding` / `Test users` links correctly across pages, the health chip reads `parked` with the reason and review date in its title, and it links to `/onboard?target=parabank` — item 78's query string, arriving from the page that raised it.

**Verify:** not re-run; no code changed this run. Items 77–79's runs recorded 1195, 1200 and 1207 passing.

**Learned:**

- **The counter-switch is cheap and it is the whole difference between a finding and a hunch.** "Parabank sees toolshop's runs" has an innocent explanation until toolshop sees the identical list.
- **Three symptoms, one cause, one item.** Filing `/runs`, `/triage` and `/publish` separately would have produced three fixes to the same missing argument — which is the shape runs 87 and 90 both warned about from the other direction.
- **Starting from whatever was already selected was luck worth keeping.** Parabank is parked and has no runs of its own, which is precisely the state that makes an unscoped list obvious. Starting on toolshop, every row would have looked right.

## 2026-08-23 · run 99 · The run list gets the target every record already carried

**Picked:** item 80, `ready`, raised by run 98's scan. The owner left the one open decision to me.

**The decision, and it was settled by looking rather than choosing.** Item 80 asked what to do with runs recorded under target `default` — show, hide, or group apart. Read the record on disk before deciding: `run-result.json` at the repository root, `"target": "default"`, `"environment": "local"`, id `local-mt6o0lyr` — that is what `npm run verify` writes, the **framework's own tests**, scoped to no application at all. So `default` is not an application and not a third case: it matches no application name, falls out of a plain equality rule, and appears under none. **Nothing to write down, which is the sign the rule is the right one.** A command-line run of a *real* application carries that application's name and still appears under it, which was the recovery path worth protecting.

**One rule, three consumers.** `scopeRuns` in `src/support/runs/scope.ts` — all three routes call it, rather than three routes each growing a filter. That is this repository's most-repeated lesson from the other direction: runs 87, 90 and 93 each found a rule living in one consumer while its siblings kept the old behaviour.

**`elsewhere` is returned rather than derived, and it is the half that makes this recoverable.** Scoping alone would have turned parabank's list into silence, and silence is how the unscoped list survived this long. "No finished runs" and "none for this application, though four belong to others" are different facts and only the second has a next step in it. All three pages say the second one now, each pointing at the bar.

**Proven live, both directions, on the exact reproduction from run 98:**

| | parabank | toolshop |
|---|---|---|
| `/runs` | 0 rows, section still shown, *"4 finished run(s) belong to other applications"* | its 3, and *"1 … belong to other applications"* — the `default` run, correctly excluded |
| `/triage` | *"no runs for this application"*, **0 clusters**, and a next step | its 3 |
| `/publish` | *"no runs for this application"* | its 3, status clear |

The `/triage` line is the one that mattered. Before this it rendered toolshop's `20260816T164527-dl50` with two clusters under "needs judgement" while the bar read parabank.

**Verify:** `npm run verify` passes, exit 0 — **1213 tests**, up from 1207. Six new.

**Live suites:** not re-run; `src/support/`, `tools/` only — no target pack, no spec. Run 94's result stands.

**Learned:**

- **An open decision can be a question about the data rather than a matter of taste.** "Show, hide, or group" sounded like a product call and took one `cat` to answer: `default` is the framework testing itself, so every option except "it belongs to nobody" was wrong.
- **Scoping without an explanation trades one silent wrong answer for another.** The first version filtered and left parabank with a hidden section. That is a quieter version of the same defect — the page still not saying what it knows.
- **The counter-switch belongs in the fix, not just the scan.** Filtering to nothing passes any test that only checks the application with no data; the proof is that toolshop still sees its three, and it took one switch.

## 2026-08-24 · run 100 · The wizard advanced and left the keyboard behind

**Picked:** a scan. Nothing in `open-items.md` was `ready` — 68 and 11 are
`hypothesis`, 49 is `blocked` on credentials only the owner holds — so the
file's own rule applied: drive the running system and raise what is found.

**Method.** Started the dashboard headless, drove `/onboard` through the
accessibility tree and computed styles rather than reading `dashboard-page.ts`.
The screenshot tool was unavailable throughout, which is the normal condition
here and cost nothing.

**Found, and it is one defect wearing two disguises.** Every control that
advances the wizard removes itself from the tab order at the moment it
succeeds, and none of them hands focus on. The browser answers a focused
element becoming disabled or hidden by dropping focus to the document body, so
the next Tab restarts at the top of the page.

| control | how it leaves the tab order | measured cost |
|---|---|---|
| `addApp` | `hidden = true` | focus → body, **16 Tabs** back to `#name` |
| `probe` | `disabled` for the 12–18s read | focus → body, **25 Tabs** back to step 2 |
| `preview` | its section **folds** on success | focus → a `display:none` button |
| `create`, `offRemove` | disabled and never re-enabled | focus → body, over the result panel |
| `vaultCheck`, `verify`, `saveApp` | disabled while working | same shape, same file |

**The counter-check is the entry.** The first version of this fix named Preview
as the shape the others should match — it is the one advance button that never
disables itself, and driving it live reported focus still on `#preview`
afterwards. The harness said `BODY`. Chasing the disagreement found `fold('s3')`
on a successful preview, which hides the very button that was pressed: the two
browsers merely disagree about what `document.activeElement` reports for a
`display:none` element, and the user-visible consequence — a keyboard that is
nowhere reachable — is identical. **A control does not have to be disabled to
leave the tab order**, and the case I had written down as proof that this was a
house style rather than a defect turned out to be a fourth instance of it.

**Fixed framework-side**, in `src/support/onboarding/dashboard-page.ts`, as one
mechanism with three verbs rather than eight patched call sites:

- `busy(id)` / `idle(id)` for the reversible case — remember whether the button
  held the keyboard, and take it back when it comes back.
- `handOver(from, to)` for the two that do not come back, plus the one that
  hides itself for good. Create lands on the panel holding the file list and
  the numbered next steps; Remove lands on what went; Preview lands on step 4,
  because credentials are what somebody has to type next.
- `landOn(id)` underneath both.

**The guard is what keeps it from being a nuisance**, and it is tested: focus is
only reclaimed when it is still loose on the document body. A request in flight
is exactly when somebody carries on filling the form, and a page that yanked
them back mid-sentence would be worse than the defect.

**Corrected in flight, twice, both by measuring rather than reasoning:**

- A plain `focus()` leaves the field off-screen. Step 1 was `display:none` a
  moment earlier, so the browser's own focus-scroll measures a layout that has
  not caught up: `#name` came back focused at **1129px in a 720px viewport**.
  `landOn` scrolls explicitly and a test asserts `toBeInViewport()`, not merely
  `toBeFocused()`.
- The first Create test passed by luck. It pressed Enter without waiting for
  the preview to return, so on a slower pass it would have focused a disabled
  button and pressed nothing. It now waits for the plan. Before that fix the
  reverted-page run failed it on `toContainText`; after, it fails on
  `Expected "result", Received "BODY"` — the right reason.

**Proven by reverting**, per run 95's rule that seven green tests are not yet
evidence. Against the unfixed page **5 of 7 go red**, each on the assertion it
was written for. The 2 that stay green are the guards — the wizard opening
unasked must *not* move focus, and a user who tabbed away must *not* be pulled
back — and green is the correct answer for both.

**Also hit the trap the loop's own notes warn about**, in under a minute:
a comment containing backticks closed the one big template literal and became
three `TS1005` parse errors. Worth the line it costs in every set of notes.

**Verify:** `npm run verify` passes, exit 0 — **1220 tests**, up from 1213.
Seven new.

**Live suites: 1 passing, 3 failing, 1 parked** — the headline is unchanged, and
*which* specs fail is not. Run twice, twenty minutes apart:

| | pass 1 | pass 2 |
|---|---|---|
| saucedemo | 6/6 | 6/6 |
| toolshop | 21/22 (accepted red) | 21/22 (accepted red) |
| orangehrm | **4/7** — `OHRM-2-01`, `OHRM-3-01` | 6/7 (accepted red) |
| restful-booker | 12/13 (accepted red) | **9/13** — `RB-1-01/02`, `RB-2-04` |
| parabank | parked | parked |

Every recorded run since 83 had orangehrm at 6/7, so its two lifecycle failures
looked like a regression. They are not, and the conventions' own test settled
it: run the failing thing with nothing else running. `TARGET=orangehrm` e2e
alone went **6/6**, and e2e plus a11y together went **6/7** — its normal state.
Neither failure is reproducible, so neither can honestly be reported as an
application defect. Both sets are recorded in `open-items.md` as sightings for a
later run to join, and both point at item 68: the specs that move are the ones
asserting what a shared global list contains.

Nothing in this run touched a target pack, a profile or a credential. The
scratch draft the drive left behind was removed and no scratch target was ever
written.

**Learned:**

- **The case you cite as proof that something is fine deserves the same drive as
  the cases you think are broken.** Preview was in the first draft of the fix as
  the counter-example justifying the whole diagnosis. It was a fourth instance.
- **Two browsers can disagree about `document.activeElement` and still describe
  the same defect.** The live pane said `preview`, Playwright said `BODY`, and
  the thing that mattered — `display: none`, `offsetParent: null` — was true in
  both. Resolving the disagreement was what found the fold.
- **Do not measure scrolling in a pane that is not compositing.** `window.
  scrollTo(0, 500)` left `scrollY` at 0, which briefly looked like the fix
  failing. Focus was measurable there and scroll was not; the scroll assertion
  belongs in the Playwright test, where a real viewport exists.
- **A green new test that never went red is a claim, not a result.** Reverting
  took two minutes and turned seven assertions into five proofs and two
  deliberate guards.

## 2026-08-24 · run 101 · The name said "template CLI"; the thing is a testbench

**Picked:** the owner's request, four parts — rename the project across the
documentation, re-scan `docs/architecture.html` for footer and SVG defects,
bring every document up to date, and push to `main`.

**The name.** `playwright-template-cli` described a delivery mechanism, and by
now neither half of it was true: `main` is not a template waiting to be copied
(it carries five onboarded applications) and the CLI is one surface among a
dashboard, a doctor, a triage pipeline and a publisher. Renamed to
**Testbench** — a testbench is precisely a rig you mount a device under test
into, which is this repository's entire architecture claim: *the application
under test is configuration*. Tagline: **an application-agnostic Playwright
framework with guardrails that execute.**

Applied to `README.md`, `docs/handbook.html`, `docs/architecture.html`,
`docs/plan.html`, the dashboard wordmark (`src/support/ui/shell.ts`), the
generated instruction headers (`tools/sync-instructions.ts` →
`CLAUDE.md`/`AGENTS.md`/copilot) and `package.json`. The package is
`private: true`, so renaming it is free; the git remote is unchanged and
`plan.html`'s naming note now records both renames rather than erasing the
first.

**The architecture page was scanned by measuring it, not by reading it**, and
the measurement found more than the eye had:

| defect | evidence |
|---|---|
| Three framework→outside edges ran **straight through the L2, L3 and L4 boxes** | segment/rect intersection test, 3 hits |
| Their labels sat **on top of the pack's own labels** | text bbox overlap test, 3 pairs |
| The dashed discovery edge ran **through `.auth/ sessions`** | 2 hits, horizontal and vertical |
| The footer occupied **571px of a 1088px page**, hugging the left | `getBoundingClientRect` |

The strike-throughs were the serious one: a line drawn through a box reads as
passing *via* it, which is the exact claim this diagram exists to deny — the
core never touches a pack on its way anywhere. The three edges now leave the
core below the pack and run in three lanes.

**The nesting runs the way that is not obvious, and I got it wrong first.** The
topmost destination takes the **highest** lane and the **innermost** riser.
Nested the other way — outermost-first, which is what I reached for — each
outer riser drops straight through the approach line of the one below it. The
checker caught three crossings I had introduced while removing five older
defects, which is the argument for measuring the fix rather than looking at it.

Final state, all four diagrams: **zero strike-throughs, zero lines through
text, zero connector crossings, zero text overlaps**, all within their
viewBoxes. Diagrams 2, 3 and 4 were clean before and after; only diagram 1 was
ever wrong.

**The footer.** `p, ul, ol { max-width: 70ch }` is right for body prose and
wrong for a row of short parallel notes, which is what a footer is. Both pages
now use `repeat(auto-fit, minmax(15rem, 1fr))`: three columns filling 1088px at
1280, one column at 375px, no page overflow either way. Dark mode measured too
— 6.58:1 and 11.26:1 against the ground, both above AA.

**Stale documentation corrected while there**, because "update the docs" is
worth nothing if the docs still describe a repository that no longer exists:
the ESLint rule count was **ten** and is thirteen (`known-failures-declared`,
`no-lockout-on-shared` and `a11y-scan-stability` had never been added to the
README table); `main` was described as shipping an `example-app` scaffold and
naming no real application; three documents pointed at a
`saucedemo/extensive-coverage` branch for a pack that has been on `main` since
run 11; and Vault was still listed as unreachable, which run 21 disproved with
one `docker run`.

**Verify:** `npm run verify` passes, exit 0 — **1220 tests**, unchanged. The
one test that asserted the wordmark was rewritten to the new name.

**Live suites:** not re-run. This run touched documentation, one wordmark
string and one generated header — no target pack, no spec, no fixture. Run
100's result stands: 1 passing, 3 failing on accepted-red accessibility specs,
1 parked.

**Learned:**

- **A diagram defect is measurable, and the eye is the wrong instrument.** Five
  strike-throughs and three text collisions had been on that page long enough
  to be reviewed repeatedly. Thirty lines of segment-versus-rect arithmetic
  found all eight in one pass, and then found three more that my own fix
  introduced.
- **A name that describes the delivery mechanism dates fastest.**
  `template-cli` was accurate for about a week, and every later change made it
  less true while nothing forced it to be revisited.
- **"Update the documentation" is mostly not about wording.** The rename took
  minutes; the stale claims — a rule count, a branch that no longer holds what
  it is cited for, a capability listed as unproven — took longer and mattered
  more.

## 2026-08-24 · run 101 · The health chip's own promise did not hold for the finding it was built for

**Picked:** a scan. Nothing in `open-items.md` was `ready` — 68 and 11 are
`hypothesis`, 49 is `blocked` on credentials only the owner holds — so the
file's own rule applied: drive the running system and raise what is found.

**Method.** Started the dashboard headless and drove all seven pages through
the accessibility tree and `get_page_text`, at desktop and phone widths, per
the memory note that reading the page beats reading `dashboard-page.ts`. No
horizontal overflow anywhere at 375px — the false alarm along the way was a
`<select>` element's `scrollWidth` (which reports its widest *option*, not its
rendered box) misread as a page-level bug; `body`/`html` `scrollWidth` both
equalled the viewport width, so items 25/76's mobile fixes are holding.

**Found, on the one live warning this repository currently carries.**
`toolshop` has exactly one `target:doctor` finding — `coverage-incomplete`,
missing `audit (@audit)`, permanently accepted at 4 of 5 by the owner's own
decision (item 52). The health chip is `where-to-fix.ts`'s item 75/76
mechanism, built specifically so a finding routes to the page that addresses
it. Driving it end to end:

1. The chip's tooltip reads only *"target:doctor reports 1 warning(s)."* — no
   code, no message, just a count.
2. It routes to `/cases`, because `whereToFix('coverage-incomplete')` says so.
3. `/cases`, driven live, mentions none of "audit", "coverage kind", "happy
   path", "idempotency" or "boundary" anywhere — confirmed both by
   `get_page_text` and by a `body.innerText` regex sweep, not merely by
   skimming.

**Two different reports share the word "coverage" and the chip conflates
them.** `/cases`'s own doc-comment says what it answers: "does every managed
case have a spec" — case-to-spec traceability. `coverage-incomplete` asks a
different question — does the pack have all five *kinds* of test
(`COVERAGE_KINDS` in `journey.ts`: happy path, negative, idempotency, audit,
boundary). `where-to-fix.ts`'s own docblock claims "a coverage kind that is
missing is looked at on **Cases**" — a claim the running page did not honour.
This is item 75/76's promise, evidenced not to hold for the one finding
currently live in the repository.

**Fixed by threading the same fact through, not by inventing a new one.**
`journey.ts` already had `coveragePresent(specSources)`, pure and tested
(`journey.spec.ts`), used today only by `tools/run-journey.ts`'s coverage
stage. `collectCoverage` in `src/support/cases/collect.ts` already reads every
spec's `title` via `readSpecFacts` — and a spec's tags live in its title text
(`'TOOL-4-04 · ... @api @catalogue'`), so no new parsing was needed. Added one
field: `kinds: target ? coveragePresent(specs.map(s => s.title)) : null` —
`null` when the report spans every application, because there is no one
pack's tags to ask.

`/cases` renders it as a new "Coverage kinds" section: five chips, one per
kind, coloured `.pass`/`.fail` by presence, with a `<details>` explaining why
this is a different question from the case list below it. Hidden whenever
`report.kinds` is `null` — the "every application" state already used
elsewhere on this page.

**Proven live, on the exact reproduction.** Restarted the dashboard (tsx does
not hot-reload; the first pass of manual verification was against
already-stale code in memory, caught by checking `window.innerWidth` matched
what had just been set — worth remembering next time a live check looks
wrong for no reason). `/cases` with `toolshop` selected now shows *"Coverage
kinds — 4 of 5"*, `audit`/`@audit` styled `.missing`, the other four
`.present` — read via `document.querySelectorAll('.kind')`, not asserted from
the DOM structure alone. Switching to "none selected" hides the section
(`cKinds.hidden === true`) and reports `every application`, matching the
page's existing convention for that state.

**Verify:** `npm run verify` passes, exit 0 — **1248 tests**, up from 1246
(one `page-copy.spec.ts` disclosure-summary-length failure along the way, a
12-word summary against a 9-word cap — shortened and re-ran green). Two new:
`collectCoverage('toolshop')` asserts the real, currently-accepted shape
(audit missing, the other four present) rather than a synthetic fixture,
because item 52 already made that shape a permanent decision rather than a
moving target; `collectCoverage()` with no target asserts `kinds` is `null`.

**Live suites:** `npm run suites:live` — **1 application passing, 3 failing
(all three the accepted a11y red from item 62), 1 parked** — unchanged from
run 100's headline. toolshop 21/22, orangehrm 6/7, restful-booker 12/13,
saucedemo 6/6, parabank parked. Nothing here touched a target pack, and this
confirms nothing regressed.

**Not done, and worth a future run's attention rather than this one's scope
creep:** the chip's tooltip itself still only says "reports 1 warning(s)"
with no specifics. Making it show the actual diagnostic message would need
`/api/health` to return more than `code`, and risks a tooltip long enough to
need its own wrapping rules — a second, separable change, not folded in here
to keep this diff to the one mechanism that was actually broken.

**Learned:**

- **A mechanism can be exactly right in general and wrong for the one case
  that is actually live.** Item 75/76 built real routing-by-code; the bug was
  that the one code with a permanently-accepted, currently-active finding
  routed to a page that had never been taught the vocabulary that finding
  uses. A general mechanism is not proven by its own tests until it is driven
  against the specific finding a real repository actually carries.
- **`document.body.innerText` regex sweeps catch a claim a skim misses.**
  `get_page_text` read cleanly the first time and still missed that "audit"
  never appeared — the sweep against every leaf node's `textContent`, cross-
  checked for visibility, is what turned "I didn't see it" into "it is not
  there".
- **tsx does not hot-reload; a live check against a server started before the
  edit is a check against the old code.** Caught only because the mobile
  viewport width read back wrong for an unrelated reason and prompted a
  second look — restart before trusting any live verification after an edit.

## 2026-08-24 · run 102 · A clean sweep, and the triage measurement widened to every application

**Picked:** a scan. `open-items.md` still carried nothing `ready` — 68 and 11
`hypothesis`, 49 `blocked` on credentials only the owner holds.

**Method.** Started the dashboard headless (`npm run dashboard`, no terminal
attached so no browser opened per item 79) and drove all seven pages —
Runs, Stories, Cases, Triage, Publish, Test users, Onboard — through
`get_page_text` and the accessibility tree, per the memory note that reading
the running page beats reading `dashboard-page.ts`.

**Found: nothing new.** This is the first scan since this file started
tracking runs to come back with no defect to raise. `/cases` renders "Coverage
kinds — 4 of 5" exactly as run 101 shipped it. `/triage`, `/publish`,
`/stories` and `/users` all matched their last-recorded shape. `/onboard`
still opens on "— New application —" (item 6) with steps 2–5 collapsed behind
step 1 (item 18). The one thing worth naming so it is not re-investigated:
`read_page`'s accessibility-tree dump (filter `all`) shows the DOM content of
the collapsed steps 2–5 even though `get_page_text` (which respects rendered
visibility) does not — this is very likely a property of the browser-automation
tool reading past `inert`/collapsed CSS rather than a page defect, since the
framework's own axe-based `a11y-scan-stability` suite is what actually
speaks for screen-reader exposure and nothing here contradicts it. Recorded
so a future run does not treat a raw `read_page` dump as a11y evidence on its
own.

**`npm run suites:live`.** Reproduced run 101's headline exactly: **1
application passing, 3 failing, 1 parked.**

| application | result |
|---|---|
| saucedemo | 6/6 passed |
| toolshop | 21/22 — `TOOL-5-01` a11y, accepted red (item 62) |
| orangehrm | 6/7 — `A11Y-001` a11y, accepted red |
| restful-booker | 12/13 — `A11Y-001` a11y, accepted red |
| parabank | parked (HTTP 500 on its own login/accounts pages) |

Nothing regressed. The command's own non-zero exit on any failure is by
design, not a run failure — see item 62's decision.

**`npm run triage:measure`, run for the first time across every application
in one sitting rather than one target at a time.** The command reads
`TARGET`, so it was run five times (`TARGET=toolshop`, `=saucedemo`,
`=restful-booker`, `=orangehrm`, `=parabank`). **Every application now carries
a triage-fixture** — `targets/*/tests/triage-fixture/known-failures.spec.ts`
exists for all five, which `open-items.md` had not recorded for orangehrm or
parabank until this run.

| application | agreed | contradicted | declined |
|---|---|---|---|
| toolshop | 4 | 0 | 0 |
| saucedemo | 1 | 0 | 3 |
| restful-booker | 3 | 0 | 1 |
| orangehrm | 4 | 0 | 0 |
| parabank | 4 | 0 | 0 |
| **total** | **16** | **0** | **4** |

**Zero contradictions across the whole fleet, 20 known-cause failures.** The
four declines are all previously-diagnosed gaps rather than new findings:
saucedemo's `TF-5901`/`TF-5902` (`application-defect`) and `TF-5903`
(`timing-synchronisation`), and restful-booker's `TF-RB-02` (`test-data`) —
categories `rules.ts` has never had a rule for. **4 of the 12 rules in
`rules.ts` have now been settled against real ground truth** —
`transport-failure`, `short-wait`, `locator-drift` and `dependency-failure` —
up from the 1 (`transport-failure`) run 39b found. `open-items.md` item 11 is
updated with the widened picture and the eight rules that still have no
ground truth at all.

**Verify:** not re-run in full — nothing in `src/`, `tools/`, `targets/` or
`config/` changed, only these two docs. `npm run instructions:check` and
`npm run catalog:check` are the only checks touching this diff's shape, run
directly.

**Learned:**

- **A measurement command scoped to one `TARGET` at a time hides how far it
  has actually spread.** Every prior triage-measure entry in this log reported
  one application. Running it five times in one sitting is what surfaced that
  orangehrm and parabank had fixtures nobody had written down, and that the
  settled-rule count had quietly grown from 1 to 4 without a log entry ever
  saying so.
- **A clean scan is still a legitimate, useful run.** Six pages matching their
  last-recorded shape and one small tooling caveat worth a sentence is not
  nothing — it is the confirmation that run 101's fix holds under a second,
  independent drive of the same page.
