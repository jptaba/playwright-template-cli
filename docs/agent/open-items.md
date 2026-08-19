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
| 55 | Set-up is two pages a team visits twice, and they hold a quarter of the rail | `ready` |
| 53 | Onboarding: one step at a time, and a way back | `ready` |
| 52 | Fourteen coverage cells are missing across four applications | `ready` |
| 46 | The journey has been run for one application, not five | `ready` |
| 48 | Seeded failure cases exist for one application, not five | `ready` |
| 49 | Point the notifications at a real Teams channel and Outlook relay | `blocked` |
| 11 | A repeatable learn-fix-optimise loop over a full run | `hypothesis` |

**Item 51 is `done`** — all five applications carry a triage fixture as of run
66, and it is archived in `backlog.md`. **Take 55 next**: it is the standing
priority and the owner's own words. Then 52, the coverage cells.

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

### 55. Set-up is two pages a team visits twice, and they hold a quarter of the rail — `ready`

**The owner's ask, 2026-08-19:**

> Hide the entire onboarding and test users inside a button or something
> that's not always present on the page. Again, for each team, they most
> likely just do the application onboarding once or twice then after that the
> day to day would be focused on the Authoring, Executions and Reporting.

**The shape of it, read off `DASHBOARD_PAGES` in `src/support/ui/shell.ts:137`
rather than recalled.** Seven pages in four groups, and the first group is the
one nobody uses twice:

| group | pages | how often |
|---|---|---|
| **Set up** | Applications, Test users | once or twice per application, ever |
| Author | Stories, Cases | every day |
| Execute | Runs, Triage | every day |
| Report | Publish | every day |

So two of seven links — a whole quarter of the rail, and the *first* thing read
in it — are permanently occupying the most valuable space on every page for a
job that is finished by the end of the first week.

**This is the third and largest turn of the same screw**, and the first two
landed, which is what makes the case for this one concrete rather than
speculative:

- Run 62 stopped `/` serving onboarding and sent it to `/runs`, so the page
  everybody met daily was no longer the one they use once.
- Run 62 also put step 1 behind an *Add an application* button, so the wizard
  no longer runs at somebody who came to look at a list.
- **What is left is the navigation itself**, which still presents the setup
  pages as co-equal with the daily ones.

**Shape, and the constraint that matters.** Neither page may become
unreachable, and neither may become hard to find on the day somebody does need
it — the first week of a repository is exactly when a person is least able to
go hunting. A disclosure in the shell that reveals the *Set up* group — off by
default, remembered when opened, and opened automatically when nothing is
onboarded — keeps both properties. The precedent is already in the page:
`landingPath()` and the wizard's auto-open both make the same judgement, which
is that an empty repository has genuinely nothing else to do.

**Do not solve it by deleting the group from the rail and relying on a URL.**
`/onboard` and `/users` are real routes and must stay linked from somewhere
visible, or the second application anybody onboards becomes a support question.

**Ranked above the coverage items but below anything broken.** It is the
standing priority — the dashboard being simpler for the person using it every
day — and it is the owner's own words, twice now.

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
