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
| 42 | A framework improvement never reaches an existing pack | `ready` |
| 41 | The framework cannot see what an application said at sign-in | `ready` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Item 38 resolved itself in run 48.** The lockout cleared — `POST /users/login`
now answers **HTTP 200** — and toolshop is back to **20/20** live. Nothing in
this repository changed it, which is the point: the failure was left red and
legible rather than tailored around, and it went away on its own.

`npm run suites:live` runs every onboarded application's specs against the real
deployment, and **step 5 of the working agreement in `backlog.md` says every
run does this and records the result.**

---

### 41. The framework cannot see what an application said at sign-in — `ready`

**The item that replaces run 46's reverted target fix**, framed at the
mechanism instead of the symptom, per the standing instruction that
troubleshooting fixes go in the framework and never in a target pack.

When `setup:auth` cannot establish a session it asks the target's
`signIn.readError`, which reads a locator the **scaffolder guessed**:
`error: (page) => page.getByRole('alert')`. On an application whose banner
carries no `role` attribute that matches nothing, `readError` returns null, and
the run reports *"the form reported no error … check the signed-in locator
rather than the credential"* — while the application says *"Account locked, too
many failed attempts"* on screen. It cost three runs of this loop once.

**Four mechanisms produced that. Two are fixed.**

| mechanism | state |
|---|---|
| triage has no rule for a lockout | **done** — `account-locked`, run 46 |
| the scaffolder guesses the error locator | **done** — `readVisibleError`, run 48 |
| nothing preflights whether a credential can actually sign in | open |
| a framework improvement never reaches an existing pack | open — **item 42** |

**Run 48 fixed the second**, framework-side: `src/support/sign-in-error.ts`
tries the pack's own named locator first and reads the page itself when it
finds nothing, so a diagnostic is never emptier than the screen. The scaffolder
wires it into every new pack, and that was validated end to end — scaffold a
target, typecheck, lint, `target:doctor`, remove.

**And it exposed item 42, which is the more important one:** toolshop,
saucedemo and ParaBank were all scaffolded before this and still carry the old
`readError`. Rule zero forbids hand-editing them, and nothing regenerates them.

**A constraint worth keeping, because it ruled out the obvious answer.** The
tempting fix for the second mechanism was to derive the banner during
onboarding by submitting a wrong password — and **that must not be done**. The
conventions are explicit that negative authentication spends a lockout budget,
and on a shared deployment it would lock the very account it was onboarding.
The shipped fix reads the page at the moment of a *real* failure instead, which
costs no attempt at all.

**Shape for the remaining one:** `target:doctor` currently asks the secret store
whether a credential *exists* and stops there. Existence is not usability: a
locked, expired or disabled account describes perfectly and fails every run.
A preflight that attempts one real authentication per role and reports what the
application said would have caught this before the suite ran at all — and is
the "preflight … these type of issues" the owner asked for. It needs a decision
about cost (one sign-in per role per doctor run) and about which surface it
uses on a target with no API.


### 42. A framework improvement never reaches an existing pack — `ready`

**Found by fixing item 41 properly**, and it is the structural consequence of
rule zero rather than a defect in any one file.

Run 48 improved the scaffolder so every pack reads the page when its guessed
error locator finds nothing. Every pack scaffolded *from now on*. toolshop,
saucedemo and ParaBank were written before it and still carry the old
`readError`, so the applications that actually exposed the defect are the three
that do not benefit from the fix.

**And rule zero is exactly why this cannot be waved through.** Hand-editing the
three packs is forbidden, correctly — but that leaves the framework unable to
deliver its own improvements, which is not a tenable end state. Every future
template fix has this same problem.

`target:new` **never overwrites**, deliberately: that guarantee is what makes
onboarding safe to re-run, and it should not be weakened.

**Shape:** a `npm run target:upgrade -- --name=<app>` that regenerates the
scaffold-owned parts of a pack from current templates and *reports a diff*
rather than applying one. The hard part is not the writing, it is knowing what
is safe to touch: a pack is half generated shape and half hand-written work,
and the hand-written half is the whole point of the pack.

Two candidate ways to tell them apart, and they want deciding before building:

- **Compare against a fresh scaffold of the same options.** Anything identical
  to what the template would have written is untouched and safe to replace;
  anything that differs is somebody's work and is only ever *reported*. Needs
  no bookkeeping and degrades honestly.
- **Record a provenance marker** when a file is generated, and treat its
  absence as hand-written. Precise, and it means every existing pack — the
  ones that need this most — has no marker at all.

The first is the one to try. It needs the original scaffold options, which the
profile mostly carries already.

Until this exists, a framework template fix reaches new applications only, and
the log entry for it should say so plainly rather than implying otherwise.

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

## The coverage phase

A separate, time-boxed piece of work with its own log:
[`coverage-phase.md`](coverage-phase.md). Five new applications alongside the
two already here, each taken end to end through happy path, negative,
idempotency, audit and boundary coverage, one at a time.

It is kept out of this file on purpose. It is a programme with its own
per-application state, and folding it in would put this list back where
`backlog.md` was.
