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
