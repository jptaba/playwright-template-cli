# Where an application's artifacts live

Written in answer to a direct question — *is everything for one application
inside `targets/<app>/`, and if not, what could move?* The short answer is
**no, and mostly for good reasons**, with one thing that was genuinely wrong
and is now fixed, and one open recommendation.

---

## Everything a target leaves behind

| Artifact | Where | Scoped by | In the pack? | Verdict |
|---|---|---|---|---|
| Profile | `targets/<app>/profile.ts` | filename | no | **Stays** |
| Locators, actions, endpoints, api, db, queries, fixtures | `targets/<app>/` | directory | yes | — |
| Specs | `targets/<app>/tests/` | directory | yes | — |
| Vendored contract document | `targets/<app>/contracts/` | directory | yes | — |
| Test cases | `targets/<app>/cases/*.yaml` | directory **and** a `target:` field | yes | **Done** |
| Stories | `targets/<app>/stories/<KEY>.json` | directory | yes | **Done — see below** |
| Credentials | `config/secrets.local.json`, keyed `qa/<app>/…` | key prefix | no | **Stays** |
| Stored sessions | `.auth/<app>.<role>[.<n>].json` | filename | no | **Stays** |
| Capability catalog | `docs/generated/catalog.md` | section headings | no | **Stays** |
| Run results, triage | `run-result.json`, `.runs/`, `triage-result.json` | not target-scoped | no | **Stays** |

---

## Why the ones outside the pack stay there

**The profile** is the discovery mechanism. `targets/` is read at
startup to find out which applications exist; a profile inside
`targets/<app>/` would mean scanning for packs to find profiles to know
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

## Why `stories/` is at the root, and why it no longer is

**Resolved: option 2 was taken.** Stories live at `stories/<app>/<KEY>.json`.
What follows is the argument as it stood, kept because the reasoning still
governs the part that did *not* change — the citations.



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

### What actually happened

Option 2, and ahead of the cases rather than with them, because the flat
directory turned out to be costing more than tidiness.

**`target:remove` was leaving every story behind.** The removal plan knew about
the profile, the pack, the case library, the credentials, the sessions and the
draft. It could not know about stories, because there was no directory to name
— so a target taken back out left every requirement it was onboarded to prove
sitting on disk, still read by `hashes:check`, belonging to nothing at all.
Exactly the orphan that had already been found for stored sessions and then for
the case library, in the one place nobody had looked.

**And the derived scoping could not answer for a story nobody had cited yet.**
`story-scope.ts` reads which application's specs cite a story, which is a real
fact and stays. But at the moment a story is pulled from Jira no spec cites it,
so the rule had to be *"cited by nobody, shown to everybody"* — the original
defect narrowed rather than closed. A freshly pulled story still appeared under
every application, which is the workflow the page exists for.

So the two facts now answer different questions, and a story is shown when
either says so:

- **The directory** — which application a story was pulled *for*. True the
  moment it lands, before any spec exists.
- **The citations** — which suites actually *prove* it. A requirement two
  applications both cover is a real state, and one directory cannot hold it.

That is strictly narrower than what it replaced: nothing is now visible to an
application that neither owns nor cites it.

**The cost predicted above was real but small.** A story pulled under one
application and proved by another is still visible to both, because the
citation says so. What is lost is only the ability to have *no* owner, which
was never a state anybody wanted.

**One thing the move added, and it needs saying.** A story file loose at the
root of `stories/` now belongs to no application, so every tool that scopes by
directory skips it in silence — the same defect in a new costume.
`hashes:check` reports those by name rather than adopting one, because guessing
an owner is precisely what the flat directory did.

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

## What was moved, and what it cost

`cases/<app>/` → `targets/<app>/cases/`, and `stories/<app>/` →
`targets/<app>/stories/`, alongside the profile and the pack. One directory
per application now holds everything about it that is committed.

**The argument against, as it stood.** Cases are *managed test assets* that
outlive a pack — Track B pulls them from PractiTest, where they exist
independently of any code. A pack is code and gets deleted casually while
trying an application out; a case library is a record. Keeping them apart made
`target:remove` destroying them a deliberate decision rather than a side
effect.

**It was already overtaken.** `planOffboard` had listed `cases/<app>` in
`removeDirectories` since the orphan above was fixed, so removal was a side
effect already. What preserves the intent is not the directory's location but
the confirmation gate, which refuses to act until the target's own name is
typed back — and which now counts the case library and the stories as their
own lines rather than folding them into a file count labelled as the pack.
Somebody about to remove an application is told, in the sentence they are
agreeing to, that ten test cases and five stories are going with it.

**What the move actually cost.** Three defects surfaced, all of them latent
before it:

- The profile inside the pack tripped `no-hardcoded-urls` and
  `secrets-via-fixture`, which exist to stop *pack code* naming a host or
  reading the environment. A profile does both by definition. Stated once now,
  as `isProfile`.
- `target:upgrade` stopped offering a missing `fixtures.ts`, because the
  profile made every pack root look like it already held work.
- The layout was written down in three grammars — a string literal, a
  `path.join` argument list and a regular expression — and only the first is
  visible to a search for it. `gatherFacts` was one of the others: offboarding
  reported "Nothing to remove" for a target whose pack was in front of it.

**What is deliberately still outside**, and the reasons above still hold:
credentials, stored sessions, run and triage output, and the capability
catalog. `config/targets/` keeps `types.ts` alone — the shape a profile is
written against belongs to the framework, not to any application.
