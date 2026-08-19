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
| 53 | Onboarding: one step at a time, and a way back | `ready` |
| 52 | Six coverage cells are missing across three applications | `ready` |
| 57 | A corrected template reaches no pack that already exists | `ready` |
| 58 | `sharedEnvironment` is declared, documented, and enforced by nothing | `ready` |
| 56 | Toolshop's cart is per-tab, and its profile says it is per-account | `ready` |
| 46 | The journey has been run for one application, not five | `ready` |
| 48 | Seeded failure cases exist for one application, not five | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Items 51 and 55 are `done`** and archived in `backlog.md`. **Item 52 is
under way** — `toolshop` went from one coverage kind to four in run 68, and
`target:doctor` now names the missing ones itself rather than leaving it to a
six-stage journey. **Carry on with 52**, one application at a time: `parabank` needs four and
`orangehrm` two. Run 69 gave `saucedemo` all five kinds and turned up items 57
and 58 doing it — 57 is small and makes the next one of these cheaper.

*(Item 52's section below was restored in run 68. Run 66 removed it by
accident while archiving item 51 — the two were adjacent, and the row in the
table above survived while its body did not. Worth a glance whenever a section
is cut from this file.)*

---

### 53. Onboarding: one step at a time, and a way back — `ready`

**The owner's ask, 2026-08-18:**

> Onboarding an app is not something that will always be done but it is always
> there as a first page. Figure out how we can make that only called if a new
> app will be onboarded. Also make it like a wizard like process.

Two asks, and the second is nearly done already — which makes the first the
real work.

**Onboard is the rail's first destination and the route `/` redirects to.** So
the page everybody lands on, every day, for the whole life of a repository, is
the one page they will use once per application and never again. The steady
state of this tool is *run, triage, publish*; the first screen says *add an
application*.

**The wizard is most of the way there already** — checked on the running page,
not recalled. Five sections revealed in turn, locked badges, and a *Where you
are* rail listing all five numbered steps with the current one marked. Two of
the three things that make a wizard tolerable are done: how many are left, and
where I am.

**What is missing is the third: getting back.** The step links scroll, and a
completed step stays open below the current one, so the page grows downward
into one long form rather than showing one step at a time. That is the part
that still reads as a scrolling document rather than a wizard.

**Shape, and the first two landed in run 62:**

1. ✅ **Onboarding is an action, not a destination.** Step 1 starts closed like
   the four after it, behind an *Add an application* button. It still opens
   unasked when a draft is in progress or no application exists at all.
2. ✅ **`/` lands somewhere useful.** `landingPath()` sends it to `/runs` when
   anything is configured, and serves onboarding when nothing is. `/onboard`
   stays a real route either way.
3. ⬜ **Show one step at a time**, with the *Where you are* rail switching
   between them rather than scrolling to them — and a completed step reopenable
   without losing what the later ones hold.

**Point 3 is deliberately still open, and is worth a second look before it is
done.** The case for it is weaker after 1 and 2 than it was when this was
written: the wizard now only runs when somebody asked for it, the current step
carries an accent edge (run 61), and the rail already jumps. What is left is
that completed steps stay open above the current one — which is a scroll, but
it is also how somebody checks what they typed two steps ago. Collapsing them
to a summary line is the version worth building; hiding them outright would
cost more than it returns, and would churn a large number of tests that read
fields across steps.

---

### 52. Six coverage cells are missing across three applications — `ready`

Read off the tags in each pack, and **`target:doctor` now reports it directly**
(`coverage-incomplete`, added in run 68) rather than leaving it to
`npm run app:journey`:

| application | has | missing |
|---|---|---|
| toolshop | `@smoke` `@negative` `@idempotency` `@boundary` | audit |
| saucedemo | all five | — |
| parabank | `@smoke` | negative, idempotency, audit, boundary |
| orangehrm | `@smoke` `@negative` `@idempotency` | audit, boundary |

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

**OrangeHRM's two need data the spec creates** — adding a system user — which
is the point at which its pack stops being read-only.

---

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

---

### 57. A corrected template reaches no pack that already exists — `ready`

**Found in run 69**, fixing the scaffolded sign-in error locator.

The template had emitted `page.getByRole('alert')` into every pack it ever
wrote, and it matched nothing on an application whose banner carries no role.
The template is fixed. **`target:upgrade` cannot deliver the fix**: it reports
`locators/sign-in.ts` as *differing* and stops, because the file legitimately
differs — its names were read off the real application.

```
Differ from the templates. Not touched, and mostly should not be:
  ~ src/targets/<app>/locators/sign-in.ts
A file differs either because somebody wrote it … or because the template has
moved on since. This tool cannot tell those apart, so it reports and stops.
```

Stopping is the right default and should stay. What is missing is a way to say
*this one line moved on*, so run 69 applied the corrected line to four packs by
hand — which works once and does not scale, and is exactly the manual step the
scaffolder exists to remove.

**Shape worth trying**, and it is smaller than a merge tool. The template knows
which parts of a file are *derived* (the accessible names, the marker) and
which are **template-owned** — the error locator, the doc comments, the
imports. If the scaffolder marked the template-owned lines, `target:upgrade`
could offer to replace exactly those and leave the derived ones alone, which is
the distinction it currently says it cannot make.

**Do not solve it by making `upgrade --apply` overwrite the file.** That would
throw away locators somebody read off a running application, which is the
single most expensive thing in a pack to recreate.

---

### 58. `sharedEnvironment` is declared, documented, and enforced by nothing — `ready`

**Checked in run 69** and it holds: `sharedEnvironment` appears in the profile
type, in `docs/CONVENTIONS.md`, in the Test users page and in one sign-in
message. **No lint rule reads it, `playwright.config.ts` does not consult it,
and `target:doctor` does not check it.**

The conventions are unambiguous about what it should do:

> Negative authentication specs spend the account's lockout budget… on a
> deployment shared with strangers, declare `sharedEnvironment: true` in the
> profile and skip them entirely.

Nothing skips them, and the harm is not hypothetical — **run 63 watched
toolshop's shared customer account get locked** (`423 Account locked, too many
failed attempts`), taking its whole suite red until the vendor's counter
cleared hours later.

**The specs that exist today are written correctly**, which is why this is a
warning about the future rather than a defect to fix: `TOOL-2-02` signs in as
an unregistered address unique per run, and `SD-2-01` uses a published account
that exists to be refused. Neither spends anybody's budget. Nothing stops the
next one being written the other way.

**Do not fix it by skipping every `@negative @auth` spec on a shared target.**
That would silently drop both specs above, which are safe and valuable — and a
framework that quietly stops running tests is worse than one that lets a
mistake through. The hazard is narrower than the tag: *a sign-in expected to
fail, using a pooled credential*. Whether that is reachable by a lint rule, by
a fixture-level refusal, or only by a preflight warning is the open question,
and it should be answered before anything is built.

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
