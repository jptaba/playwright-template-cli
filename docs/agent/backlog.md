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

So **UX of the dashboard and the onboarding journey outranks everything else**
unless something is actually broken. "Fewer decisions in front of the user" and
"the page tells you what went wrong and what to do about it" beat new features.

A change that adds a capability but adds a step to the wizard is a net loss
here. Say so in the PR if you think an exception is warranted.

---

## Ranked items

### 1. Map the onboarding wizard as a real journey — `hypothesis`

`src/support/onboarding/dashboard-page.ts` is a linear five-section wizard
(`s0`–`s4`) where later sections are held `inert` until earlier ones complete.
Nobody has written down what the actual click-path costs a first-time user.

Before changing anything: drive the dashboard end to end as a new user with a
real application, and record every step, every field, every place the page goes
quiet, and every point where you had to know something the page did not tell
you. Write it to `docs/agent/journey-notes.md`. **This is the highest-value
first run** — every other UX item below is guesswork until it exists.

### 2. The `inert` gating gives no reason — `hypothesis`

Sections `s2`–`s4` start `inert`. A disabled control that does not say why it
is disabled is the classic wizard failure: the user sees the thing they want,
cannot reach it, and is told nothing. Check whether each gated section explains
its precondition in the page, and whether the explanation is visible before the
user tries to interact rather than after.

### 3. Long-running routes and the silence problem — `hypothesis`

`/api/probe`, `/api/verify` and `/api/create` all drive a browser or write
files, so they take real time. `/api/assist/start` + `/api/assist/poll` +
`/api/assist/finish` suggests at least one flow already needed progress
reporting. Audit whether *every* slow route reports progress, or only that one.
A button that looks dead for forty seconds is read as a broken page.

### 4. Failure messages that name the fix — `hypothesis`

`target:doctor` is held to a high standard by the conventions: "Every finding
names the file to fix." Check whether the dashboard's own failure paths meet
that same bar, or whether they surface a raw error. Where the CLI is better
than the dashboard at explaining a failure, that gap is the item.

### 5. Recoverability of a part-finished onboarding — `hypothesis`

There is a draft state (`/api/onboard/draft`, `/api/onboard/state`, a
`draftState` badge, and a disclosure titled "What is kept when you leave this
page"). The disclosure existing at all hints this was confusing enough to need
explaining. Test what actually happens across a reload, a browser crash, and a
second tab, and make the answer obvious without opening the disclosure.

### 6. The disclosure pattern may be carrying too much — `hypothesis`

Every section has a `<details class="more">`. If essential information lives
behind them, the page is under-explaining by default and the disclosures are
doing the real work. Audit what is behind each one and promote anything a user
needs *in order to act* into the section body.

---

## Out of scope

- Load and performance testing. Refused by the conventions, and not the ask.
- Renaming or restructuring the four layers. That architecture is deliberate
  and settled; do not relitigate it.
- Anything requiring a live credential the run does not have.
