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
