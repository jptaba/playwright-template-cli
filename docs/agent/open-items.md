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
| 50 | The dashboard explains itself in the framework's own vocabulary | `ready` |
| 51 | Three applications cannot reach the triage stage at all | `ready` |
| 52 | Fourteen coverage cells are missing across four applications | `ready` |
| 46 | The journey has been run for one application, not five | `ready` |
| 48 | Seeded failure cases exist for one application, not five | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Take 50 first.** The dashboard and the onboarding journey are the standing
priority and always have been; the owner has now asked for the same treatment
on its *words* as the framework has had on its behaviour. 51 before 52 because
a triage fixture is four specs and unblocks a whole journey stage, where
coverage is the longer grind.

---

### 50. The dashboard explains itself in the framework's own vocabulary — `ready`

**The owner's ask, 2026-08-18:**

> There are very vague description or instructions there that needs to be
> revisited. It should be concise but very clear. Make it more intuitive and ui
> look and feel should be very pleasing.

Measured on the running page rather than recalled — 14 explanatory blocks,
**264 words** before anybody has typed anything.

**Headings name internal concepts, or nothing at all.** A first-time operator
meets, in order: *"What it says about itself"*, *"The shape of the pack"*,
*"Write it"*. The first is poetic and says nothing; the second uses **"pack"**,
which is this repository's word for a directory the reader has never seen; the
third does not say what is written or where.

**Jargon arrives before the thing it names.** `setup:auth`, `getByTestId` and
`OpenAPI` are all on screen before step 1 is complete. `setup:auth` is a
Playwright project this person has not run; `getByTestId` is an API they may
never call.

**The copy budget does not cover the longest text on the page.**
`tests/framework/page-copy.spec.ts` caps a `p.explain` at 34 words — and the
two longest blocks are `.note` elements at **48 and 27 words**, which the
budget never counts. That is a framework gap, not a copy problem, and it is why
the page grew a 48-word paragraph without any test objecting.

**Labels carry their own hint, and the accessible name swallows it.** The
Target name field's accessible name is the whole of *"Target name lower-case,
hyphenated — becomes a directory and a TARGET value"*. A screen reader reads
the explanation every time the field is focused.

**Shape, and the order matters:**

1. **Extend the budget to every explanatory block**, not just `p.explain` —
   otherwise the rewrite is unenforced and drifts straight back.
2. **Rewrite the headings and the first-screen copy** to say what the operator
   gets, in their words: what an application is, what will be read from it,
   what will be written. Jargon earns its place only after the thing exists.
3. **Separate hint from label** so the accessible name is the field's name.
4. **Then the visual pass** — the look-and-feel half of the ask, which is worth
   doing after the words are settled rather than before.

Everything the previous UI work established still holds and should not be
undone: the four budgets (copy, height, measure, contrast), progressive
disclosure, the theme control, one application switcher.

---

### 51. Three applications cannot reach the triage stage at all — `ready`

`toolshop`, `parabank` and `orangehrm` have no `tests/triage-fixture/`, so
`npm run app:journey` reports stage 5 as **failed** for each: *"triage
classifies failures, and a green run exercises none of it"*. Confirmed by
running it against `orangehrm`.

`saucedemo` and `restful-booker` have fixtures. Four specs each is the size of
the job, and it unblocks a whole journey stage per application.

**Worth pairing with the rules that have no ground truth.** Three of the
taxonomy's categories still have no rule — `test-data` deliberately, and
`contract-drift` and the rest untested. A fixture written for the *categories*
rather than for interesting failures is what turns that into a measurement.

---

### 52. Fourteen coverage cells are missing across four applications — `ready`

Counted from `coverage-phase.md` and confirmed against the tags in each pack:

| application | has | missing |
|---|---|---|
| toolshop | `@smoke` | negative, idempotency, audit, boundary |
| saucedemo | `@smoke` | negative, idempotency, audit, boundary |
| parabank | `@smoke` | negative, idempotency, audit, boundary |
| orangehrm | `@smoke` `@negative` `@idempotency` | audit, boundary |

`restful-booker` is the only application with all five, and is the worked
example of what each looks like.

**OrangeHRM's two need data the spec creates** — adding a system user — which
is the point at which its pack stops being read-only.

---

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
