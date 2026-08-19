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
| 60 | The scaffold's next step names the file onboarding refuses to write to | `ready` |
| 52 | One coverage cell is left, and it is blocked | `blocked` |
| 56 | Toolshop's cart is per-tab, and its profile says it is per-account | `ready` |
| 46 | The journey has been run for one application, not five | `ready` |
| 48 | Seeded failure cases exist for one application, not five | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 51, 53, 55, 58 and 59 are `done`** and archived in `backlog.md`.
**Item 58 closed in run 76**: `sharedEnvironment` is read by
`no-lockout-on-shared`, which refuses a real account's username paired with a
made-up password — the shape that actually spends a lockout budget. It is
deliberately narrower than the `@negative @auth` tag, so both existing negative
sign-in specs still run. **Item 59
closed in run 75**: a known failure is now *declared* — the spec states the text
its failure should contain, `suites:live` checks the failure against it, and a
lint rule refuses `test.fail()`, which is the mechanism that could not tell
"the defect is still there" from "this stopped testing anything". **Item 53
closed in run 74**: a step the preview has an answer for folds to one line, and
the finished wizard went from 5.68 screens to 3.03 measured on the running
page. **Item 52 is
under way** — `toolshop` went from one coverage kind to four in run 68, and
`target:doctor` now names the missing ones itself rather than leaving it to a
six-stage journey. **52 is finished** apart from `toolshop`'s `@audit`, which is blocked on item
56: that application has no second surface to ask whether a change was
recorded, and the profile claim underneath it wants a measurement rather than
an edit. `parabank` is **parked** as of run 72 — its
five specs stay, two of them reporting real defects, and `suites:live` reports
it as parked rather than running it until ParaBank's own 500s clear. Its review
date is 2026-09-19 and `target:doctor` says so on every check. Run 69 gave `saucedemo` all five kinds and turned up items 57
and 58 doing it; **57 shipped in run 70**, so a corrected template line now
reaches the packs that already exist.

**Item 60 was found in run 74's live validation** — onboarding a scratch target
through the running dashboard, against the real application, and reading what
the page said afterwards. It is small and well-evidenced; take it or 59 first.

**Take item 56 next.** It is the other half of 58's shape — a capability a
profile declares that nothing checks — and its own next step is already
written: a measurement, not an edit. Run the cart specs against a one-account
pool and see whether they still interfere. Item 60 is smaller and evidenced if
a shorter run is wanted.

**Toolshop's live suite failed on a different spec in each of runs 75 and 76** —
`TOOL-3-03` in the cart's cleanup, then `TOOL-1-02` settled as
`timing-synchronisation`. Two singletons on two different specs is not yet a
flake rate, and `src/support/quarantine.ts` plus `FLAKE_MINIMUM_RUNS` is the
machinery for deciding whether it becomes one. Recorded here so a third
sighting has something to join.

*(Item 52's section below was restored in run 68. Run 66 removed it by
accident while archiving item 51 — the two were adjacent, and the row in the
table above survived while its body did not. Worth a glance whenever a section
is cut from this file.)*

---

### 60. The scaffold's next step names the file onboarding refuses to write to — `ready`

**Found in run 74**, by onboarding a scratch target end to end through the
running dashboard against `https://www.saucedemo.com` and reading the result
panel — not by reading source. The credential was written to the **gitignored**
`config/secrets.private.json`, which is the default step 4 offers and the
correct one. The panel then said:

> 1. Add credentials for standard to `config/secrets.local.json` — the keys are
>    listed above.

Both halves are wrong at that moment. The credential **had just been written**,
so there is nothing to add; and the file named is the **tracked** one, which
`.gitignore`, the Test users page and item 15 all say is the wrong place for
anything real.

**Where it is.** `src/support/onboarding/scaffold.ts:419` hardcodes the path:

```ts
secretSource === 'local'
  ? `Add credentials for ${roles.join(', ')} to config/secrets.local.json — …`
  : `Write username and password to ${credentialPaths[0]} in Vault (…)`
```

**This is item 15's defect one layer over, and that is the useful part.** Run 17
fixed *where onboarding writes* a credential and left *what onboarding tells you
to do* naming the old destination. The same shape as items 14 and 17: the page
contradicting what it just did. Verified on disk in the same run — the tracked
file's checksum was byte-identical before and after, so the write is right and
only the instruction is wrong.

**Shape.** `buildScaffold` already takes `secretSource`; it needs to know
whether credentials were supplied and which of `WRITABLE_LOCATIONS` they went
to, and to say either nothing or the right file. The CLI path — where nobody
typed a credential — still needs the instruction, so this is a message that
varies rather than one to delete. Prefer naming the location the caller
actually used over defaulting to either file.

**Do not fix it by editing a pack.** The message is generated; the generator is
the thing that is wrong.

---

### 52. One coverage cell is left, and it is blocked — `blocked`

Read off the tags in each pack, and **`target:doctor` now reports it directly**
(`coverage-incomplete`, added in run 68) rather than leaving it to
`npm run app:journey`:

| application | has | missing |
|---|---|---|
| toolshop | `@smoke` `@negative` `@idempotency` `@boundary` | audit — **blocked**, see item 56 |
| saucedemo | all five | — |
| parabank | all five | — **parked** (run 72): the application answers HTTP 500 |
| orangehrm | all five | — (run 73) |

`restful-booker` and `saucedemo` have all five. **saucedemo is the better
worked example of the four beyond the happy path**, because each one is a
claim about a UI-only application with no service to ask — which is the harder
case and the one the other two are in.

**Look for cells that already exist before writing any.** Two of toolshop's
four were present and merely untagged — genuinely negative specs that
`--grep @negative` did not run and no measure could see. That is the cheapest
coverage there is, and an untagged negative spec is itself a defect in the
suite's own selectors.

**Toolshop's `@audit` is blocked rather than unwritten**, and item 56 is why:
its cart lives in per-tab `sessionStorage` and its API layer is a read-only
catalogue, so there is no second surface to ask whether a change was recorded.
Do not tag a reload as an audit — the measure would go green having proved
nothing.

**OrangeHRM's two landed in run 73**, and they are the first specs in that
pack to create data — adding a system user, and removing it in a `finally`.
Writing them surfaced three latent races in its verbs, including one in
`searchByUsername` that had been waiting for a fact that was already true.

**What is left is `toolshop`'s `@audit` only, and it is blocked on item 56.**

### 56. Toolshop's cart is per-tab, and its profile says it is per-account — `ready`

**Found in run 68 while looking for an audit surface**, by driving the running
storefront with a signed-in session rather than by reading the pack.

**What the profile and the pack say.** `serverState: true`, and
`config/targets/toolshop.ts` explains the three-customer pool with it: *"the
cart lives on the server against the signed-in account… so two workers signing
in as `customer` share one cart."* `cart-totals.spec.ts` opens with the same
claim and records that the cart specs once emptied each other mid-assertion.

**What the application does.** Measured, signed in as the pooled customer:

| | |
|---|---|
| `sessionStorage` | `cart_id`, `cart_quantity` |
| `localStorage` | `auth-token` only — no cart |
| a **new tab in the same context** | empty cart |
| a **fresh context** with the same session | empty cart |

`sessionStorage` is per-tab. So the cart is keyed by something a tab holds, not
by the account — and two workers signed in as the same customer would *not*
share a cart, because each has its own context.

**Why it matters, and why it was not acted on in the run that found it.**

- **The pool's stated rationale may be wrong**, and `poolSize: { customer: 3 }`
  costs a worker (`e2e` runs at two rather than three, and the profile says so).
  If the cart is per-tab, that cost buys nothing on this application.
- **There is no audit surface for the cart**, which is why toolshop still has
  no `@audit` cell. An audit spec asserts a change was *recorded* where a
  different surface can see it; toolshop's API layer is a read-only catalogue,
  and a cart that does not outlive its tab cannot be asked about from anywhere.
- **The old observation is not obviously false**, which is the part needing a
  person rather than another probe. Cart specs really did interfere when there
  was one account — recorded at the time, not recalled. Either the application
  changed, or that interference had a different cause and the pool fixed it by
  accident. Both are worth knowing and neither is settled by what is above.

**Do not fix this by editing the profile.** Rule zero: the claim is an output,
and the question is which mechanism should have caught a declared capability
that the application does not have. `serverState` is human-declared and nothing
checks it — that is the framework-shaped half, and it is the interesting one.

**Next step is a measurement, not an edit**: run the cart specs against a
one-account pool and see whether they still interfere. That answers which of
the two stories is true, and it is one command plus a profile value nobody has
to keep.

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
