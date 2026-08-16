# Where an application's artifacts live

Written in answer to a direct question — *is everything for one application
inside `src/targets/<app>/`, and if not, what could move?* The short answer is
**no, and mostly for good reasons**, with one thing that was genuinely wrong
and is now fixed, and one open recommendation.

---

## Everything a target leaves behind

| Artifact | Where | Scoped by | In the pack? | Verdict |
|---|---|---|---|---|
| Profile | `config/targets/<app>.ts` | filename | no | **Stays** |
| Locators, actions, endpoints, api, db, queries, fixtures | `src/targets/<app>/` | directory | yes | — |
| Specs | `src/targets/<app>/tests/` | directory | yes | — |
| Vendored contract document | `src/targets/<app>/contracts/` | directory | yes | — |
| Test cases | `cases/<app>/*.yaml` | directory **and** a `target:` field | no | **Should move** |
| Stories | `stories/<KEY>.json` | nothing at all | no | **Stays — see below** |
| Credentials | `config/secrets.local.json`, keyed `qa/<app>/…` | key prefix | no | **Stays** |
| Stored sessions | `.auth/<app>.<role>[.<n>].json` | filename | no | **Stays** |
| Capability catalog | `docs/generated/catalog.md` | section headings | no | **Stays** |
| Run results, triage | `run-result.json`, `.runs/`, `triage-result.json` | not target-scoped | no | **Stays** |

---

## Why the ones outside the pack stay there

**The profile** is the discovery mechanism. `config/targets/` is read at
startup to find out which applications exist; a profile inside
`src/targets/<app>/` would mean scanning for packs to find profiles to know
which packs to load. It is also the one file that must be readable *without*
loading the pack — `target:doctor` checks a profile against a pack precisely
because they can disagree.

**Credentials** are one store with one access-control boundary. Splitting
`secrets.local.json` per target would put a secret file inside every pack, and
the whole point of §11 is that a credential is never near the code. The keys
are already namespaced by target, which is what makes offboarding able to
remove exactly one application's entries.

**Stored sessions** are gitignored, ephemeral and regenerated per run. Putting
live session tokens inside a source tree is how one gets committed. `.auth/`
being a single directory outside `src/` is a deliberate blast door — and
`target:doctor` now reports sessions whose target has gone.

**The catalog** is one document describing every application, because its
reader is an agent deciding what vocabulary exists. Splitting it per target
would mean the agent has to know which file to read before knowing what it can
reach for.

**Run results and triage** belong to a *run*, not to an application. A run can
span projects; triage clusters failures across them.

---

## Why `stories/` is at the root

Because a story is not a test artifact. It is the **upstream requirement** —
a Jira issue, normalised — and the binding to an application happens one step
later, in the case:

```
stories/TOOL-1.json        →  no target field anywhere in it
cases/toolshop/*.yaml      →  target: toolshop
```

That is the design of Track A and it is defensible: one requirement can
legitimately produce cases for more than one application (a shared sign-on
rule, a group-wide privacy requirement), and a story is *evidence about the
product* rather than an asset belonging to a test pack.

**But it does not scale as written, and that is worth saying plainly.** With
two applications onboarded, `stories/` is a flat directory in which nothing
records which application a story was pulled for. `check-hashes.ts` reads all
of them. Somebody opening the folder cannot tell.

Two honest options:

1. **Leave it flat and make the intent explicit** — document that stories are
   product-level, and let the case's `source.key` be the only binding. Correct
   for genuinely shared requirements; unhelpful the other 95% of the time.
2. **Scope it: `stories/<app>/<KEY>.json`** — matches `cases/<app>/`, makes
   offboarding able to take the stories with it, and costs the ability to
   share one story file across targets (which nothing does today, and which a
   symlink or a duplicate would handle anyway).

**Recommendation: option 2**, done at the same time as moving cases. It is a
path change plus an offboarding change, and it removes the last place where
"which application is this about?" has no answer on disk.

---

## The one that was actually wrong

`target:remove` deleted the profile, the pack, the credential entries and the
stored sessions — and **left `cases/<app>/` behind entirely**. A target taken
back out left its whole test-case library on disk: files carrying
`target: <app>` for an application the repository no longer had, still read by
`cases:gate` and still counted by the dashboard's coverage view.

Exactly the orphan we had just fixed one directory up for stored sessions, and
missed here. Fixed: the removal plan now lists the case files by name and the
`cases/<app>/` directory, and refuses to invent a directory that was never
there.

---

## What I would move, and what it would cost

`cases/<app>/` → `src/targets/<app>/cases/`.

**For:** cases are unambiguously target-scoped — the `target:` field inside
each one says so. They are the direct input to spec generation, which lives in
the pack. Offboarding would take them without needing to know about a second
directory. And "everything for one application is in one directory" becomes
true rather than nearly true.

**Against:** cases are *managed test assets* that outlive a pack — Track B
pulls them from PractiTest, where they exist independently of any code. A pack
is code and gets deleted casually while trying an application out; a case
library is a record. Keeping them apart makes `target:remove` destroying them
a deliberate decision rather than a side effect. That argument is why they are
where they are, and it is not a bad one.

Both readings are reasonable, so this is a judgement call rather than a defect,
and it is **not** something to change without deciding which reading is
intended. It is written down here so the next person meets the argument rather
than the surprise.
