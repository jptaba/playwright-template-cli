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
| 41 | The framework cannot see what an application said at sign-in | `ready` |
| 38 | toolshop's first customer account is locked (HTTP 423) | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Item 38 needs a person, not a change.** Nothing in this repository can unlock
a vendor's account, and the standing instruction forbids tailoring the suite
around it.

**Run 46 confirmed what item 38 could only measure**, and it is not
instability: `customer@practicesoftwaretesting.com` is **locked**. The login
API answers **HTTP 423** — *"Account locked, too many failed attempts. Please
contact the administrator."* — on every attempt, and only an administrator can
clear it.

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

**Three mechanisms produced that, and only one is fixed.**

| mechanism | state |
|---|---|
| triage has no rule for a lockout | **done** — `account-locked`, run 46 |
| the scaffolder guesses the error locator | open |
| nothing preflights whether a credential can actually sign in | open |

**Shape for the second**, and it has a real constraint worth stating up front:
the obvious answer is to derive the banner during onboarding by submitting a
wrong password, and **that must not be done** — the conventions are explicit
that negative authentication spends a lockout budget, and on a shared
deployment it would lock the very account it was onboarding. So either derive
it from a *failed* sign-in the operator opts into on a disposable identity, or
stop relying on a single guessed locator: have the framework, when the target's
error locator finds nothing, report the page's own visible error text so the
message is never emptier than the screen.

The second half of that is the smaller and safer one, and it fixes every
existing pack without regenerating any of them — which matters, because
`target:new` never overwrites.

**Shape for the third:** `target:doctor` currently asks the secret store
whether a credential *exists* and stops there. Existence is not usability: a
locked, expired or disabled account describes perfectly and fails every run.
A preflight that attempts one real authentication per role and reports what the
application said would have caught this before the suite ran at all — and is
the "preflight … these type of issues" the owner asked for. It needs a decision
about cost (one sign-in per role per doctor run) and about which surface it
uses on a target with no API.

### 38. toolshop's first customer account is locked — `blocked`, and the failure stays

**Confirmed in run 46 by asking the application directly** rather than
inferring it from a spec:

```
POST /users/login  ->  HTTP 423
{"error":"Account locked, too many failed attempts. Please contact the administrator."}
```

Four attempts, four 423s. This is not flakiness and never was. The earlier
readings — "1 sign-in failure in 4", failures moving between specs — were this
account entering and then sitting in lockout.

**toolshop's own profile predicted it exactly**: *"this application locks an
account after three consecutive failures (HTTP 423) and only an administrator
can unlock it"*, which is why `sharedEnvironment: true` is set and why the
negative-auth spec uses a disposable address. The suite did not spend the
lockout budget — `TOOL-2-02` signs in as `nobody-<runid>@…invalid` precisely so
it cannot. On a demo whose credentials the vendor publishes in a README,
anybody on the internet can lock it, and did.

**The owner's standing instruction applies and decides what happens next:**

> If there are failures because it is a defect on the app should stay and not
> force us to fix or tailor our code to it.

So the spec stays red. What was actually broken here is the framework's
*reporting*, not its behaviour — and it is still broken: `setup:auth` cannot
see the message the application is showing. That is item 41, above, and it is
framework work rather than a locator edit in this target.

**Blocked on something only a person can do**, and the options are not
equivalent:

- **Ask the vendor to unlock it.** The only thing that restores account 1.
  Nothing in this repository can do it.
- **Wait.** Unknown, and possibly never — the lockout is permanent until an
  administrator clears it.
- **Drop account 1 from the pool.** Tempting and *rejected under the standing
  instruction*: it is tailoring the suite around the application's state, and
  it would turn a legible red into a green that hides a locked account.

Until then toolshop reports **13/20 with 6 skipped**, and that number is
correct — the six e2e specs cannot run without a session, and saying so is
better than pretending.

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
