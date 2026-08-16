# Improvement backlog

A living, ranked list of work the scheduled improvement agent may pick up. It
is **state that survives between runs** — every firing starts a fresh session
with no memory, so without this file the agent re-discovers the same three
things forever and never compounds.

## How the agent uses this file

1. Read this file and `improvement-log.md` before doing anything else.
2. Pick the **highest-ranked item that is `ready`**. Do not pick a second one.
3. If nothing is `ready`, spend the run scanning instead: investigate the
   application, promote `hypothesis` items to `ready` with concrete evidence
   (file paths, line numbers, a reproduction), and add new items found.
   A scan-only run is a legitimate outcome and should still open a PR
   containing the updated backlog.
4. After implementing, move the item to `done` with the PR number, and append
   to `improvement-log.md`.

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
real application (saucedemo), on 2026-08-16. Items 1–8 below are numbered to
match the findings in that file. **Everything ranked `ready` below was observed,
not inferred.** Three of the original six items were guesses that turned out
wrong and have been deleted — see "Deleted guesses" at the bottom.

---

## Ranked items

### 1. The derived signed-in marker is never checked for uniqueness — `ready`

**This is the one that is actually broken, so it outranks the UX work.**

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

### 2. Verifying after Create silently discards the derived marker — `ready`

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

### 3. Sign-in is labelled optional but the stated aim depends on it — `ready`

Step 4 says *"Signing in once is optional, and worth it."* The banner says the
aim is that `setup:auth` passes unedited. Skipping the sign-in guarantees it
does not: the scaffold writes a guessed `signedInMarker` that fails as a
10-second timeout minutes later, far from the choice that caused it.

Fix is words plus one warning at the point of decision: step 5 should say, when
no verification has happened, that it is about to write a guessed signed-in
locator and what that will cost. Do **not** add a step — make the existing one
tell the truth about its consequence.

### 4. The credential source defaults to the option that cannot complete — `ready`

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

### 5. The preview goes stale and Create writes something else — `ready`

Preview renders its plan into step 5. Change step 3 afterwards and the plan is
not recomputed, not cleared, and keeps its "Done for you" badge. Observed:
previewed 6 files, ticked the Accessibility layer, pressed Create, got **7
files** — the extra one never shown. Confirmed on disk.

Create re-reading the live form is correct. The preview being allowed to
disagree with it is the defect. Invalidate the plan on any step-3 change and
return step 5 to locked, or recompute it live.

### 6. `npm run onboard` opens on an application you already have — `ready`

With no draft, the picker preselects the most recently onboarded application,
read-only, all five steps locked. The command whose purpose is onboarding greets
a returning user with a different application and nothing to do.

Default the picker to "— New application —". The onboarded ones stay one
selection away. Smallest diff on the list and the first thing anybody sees.

### 7. Preview's output lands two sections from its button — `ready`

Step 3's button renders into step 5, below step 4 and off-screen at 1280×720,
and step 3's badge stays "Needs your input" after a successful preview. The
section that owns the button gives no sign it worked.

Either summarise the plan in step 3 and keep the full list in step 5, or move
the badge. Small, and it makes item 5's invalidation legible when it lands.

### 8. Create runs several seconds with no status line — `ready`

Probe and verify both disable their button and show a status ("Loading the
application…", "Signing in once…"). Create shows nothing. Same treatment, one
line.

Also worth doing here: the probe takes 12–18 seconds behind a static string with
no elapsed time and no cancel. Not silence, but not progress either.

### 9. Reloading throws away the unlock state, not the answers — `ready`

The draft keeps all of step 1 *and* step 2's probe results across a reload, and
correctly excludes credentials. But steps 2–5 return to `inert`, so the 12–18
second probe must be re-run purely to reopen sections whose fields are already
populated from the draft.

If the draft has probe results, the sections they fill should open. This is the
recoverability item that survived contact with the running system; the rest of
the original item 5 was wrong.

### 10. Pick a live application to hold the framework to, end to end — `hypothesis`

Owner's ask, 2026-08-16: find a real application on the internet usable for a
comprehensive end-to-end run, so the framework is exercised as a whole rather
than at the seams.

`toolshop` (practicesoftwaretesting.com) is already the committed target and has
a UI, a published API and a database story. saucedemo is much simpler but proved
useful precisely because it is *different* — item 1 exists because saucedemo
breaks an assumption toolshop does not.

The decision to take: whether "comprehensive" means deepening toolshop, or
keeping a second, deliberately unlike target so agnosticism is continuously
tested. **Needs a sentence from the owner before it becomes work** — the wrong
answer costs a lot of specs. Everything ranked above it is independent of it.

### 11. A repeatable learn-fix-optimise loop over a full run — `hypothesis`

Owner's ask, 2026-08-16: every end-to-end test should be learned, fixed and
optimised, continuously, until it is bulletproof.

This is a standing objective, not a PR. Before it can be worked it needs
decomposing into things a single run can finish. Candidate first slices, all
cheap and all independent:

- Run the whole suite against the chosen target and record the failure
  categories, not just the count — the triage ground-truth fixture already
  exists for exactly this and nothing has been measured against it.
- Compare what `triage:rules` settles against the fixture's recorded expected
  categories. The conventions call that the agreement measurement and say it is
  available on day one.
- Only then decide what "optimise" means here, in numbers.

Depends on item 10. Do not start it before that sentence exists.

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
- **"Long-running routes go silent."** Mostly wrong: probe and verify both
  report progress. Only Create does not, which survives as item 8.
- **"The disclosure pattern may be carrying too much."** Not supported. The
  disclosures hold reasoning; the instruction is in the section body. Nothing
  needed to act was found behind one.
- **"Recoverability of a part-finished onboarding."** Half wrong — the draft
  keeps more than expected. Only the unlock-state half survives, as item 9.

---

## Out of scope

- Load and performance testing. Refused by the conventions, and not the ask.
- Renaming or restructuring the four layers. That architecture is deliberate
  and settled; do not relitigate it.
- Anything requiring a live credential the run does not have.
