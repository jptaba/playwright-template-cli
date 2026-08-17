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
