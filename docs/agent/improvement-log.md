# Improvement log

Append-only. One entry per scheduled run, newest at the bottom.

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
