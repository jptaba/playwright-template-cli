# Spec generation: a case becomes a hardened Playwright spec

**This is the live worklist.** It supersedes the item list in
[`open-items.md`](open-items.md), which is now parked — see *What this replaced*
at the bottom. The working agreement in [`backlog.md`](backlog.md) (how a run
starts, branching, pushing, rule zero) is unchanged and still binding.

Opened 2026-08-25, at the owner's direction:

> Ultimately i want an actual playwright spec ts file to be created … before an
> actual playwright test script is run deterministically, it has to do a
> pre-flight, ensuring it truly ties up to the correct test cases, including the
> preconditions and user journey and truly understanding the intent, the data it
> needs, seed the data if need, run it, look at its output, triage it, the
> circle back again until the playwright test script is robust enough. During
> the actual execution, that is where we need to execute the test script
> deterministically.

---

## The finding this started from

**This was designed for and left unfinished.** Not a new idea bolted on — a
socket with no plug. Read these before proposing anything:

| Where | What it already says |
|---|---|
| `src/support/cases/schema.ts:6-8` | *"`cases/` is the junction … **generation reads only from it**. One input format to the generator regardless of where a case came from."* |
| `src/support/cases/schema.ts:50-53` | `specPath?` — *"Where the generator put the spec, once one exists"* — and `caseHash?`, both in the validated schema |
| `src/support/cases/specs.ts:17-19` | The `practitest` / `case` / `case-hash` annotation triple, described as living on **generated files** |
| `src/support/cases/gate.ts:6-8` | *"'Automatically create scripts just by looking at test cases' holds only for cases that are actually specific."* The specificity gate exists **as the precondition for this work** |
| `tools/check-hashes.ts` | Already enforces `case ──caseHash──▶ spec` |

Nothing had ever written the spec side. Phase 1 is that writer.

---

## The pipeline

```
Jira story ──▶ case ──▶ [PRE-FLIGHT] ──▶ draft ──▶ verify ──▶ spec.ts
             (exists)                                            │
                                                                 ▼
                                                    ┌──── run ───────┐
                                                    │                │
                                              triage the failure     │
                                                    │                │
                                        repair (gated) ──────────────┘
                                                    │
                                          stable N runs → commit
                                                    │
                                                    ▼
                                       DETERMINISTIC EXECUTION
                                        (no model, ever)
```

**The two phases are different in kind, and the boundary is the point.**
Authoring and hardening have a model in the loop and are nondeterministic.
Execution is a plain `.spec.ts` run by Playwright with **zero runtime model
dependency**. The artifact crossing that line is auditable: `case-hash` says
which version of which case it was hardened against.

---

## Invariants

Non-negotiable. Anything here that a future run wants to change needs the
owner, not a judgement call.

### 1. The case is the oracle. The model never sees the running application.

`author.ts:78-88` makes this argument for the case author and it binds harder
here: *"a model that can read the application will write assertions describing
what the application currently does — those pass on day one, pass on a broken
build, and can never catch a regression."*

The spec author gets **the case** (what should happen) and **the catalog** (what
verbs exist). Not a browser. Not a DOM snapshot. Not a failing test's screenshot.

### 2. Repair may change mechanics. It may never change a claim.

This is what makes the run→triage→repair loop safe rather than oracle collapse.

| Failure | Repair? |
|---|---|
| Wrong page state, missing wait, missing seed data, wrong verb | **Yes.** The claim is untouched. |
| An assertion edited to match what the application did | **Never.** The test now proves the application agrees with itself. |

Worked example from the session that opened this: `users.remove` went straight
to `searchByUsername`, which needs the list page, so a spec whose `add` was
*refused* died in cleanup. Repairing the verb's precondition was legitimate.
Changing `toBe(false)` to `toBe(true)` because OrangeHRM accepted the duplicate
would not have been — that is a defect report.

### 3. Hardening triage and production triage share every mechanism and answer different questions.

**The owner's distinction, 2026-08-25**, and it is load-bearing:

> the triage in preflight vs the triage in the actual run should be different
> but could share the same logic or functions but it's intent are different

| | Production triage | Hardening triage |
|---|---|---|
| Asks | *what broke, and who owns it?* | *is this spec finished yet?* |
| A failure is | unexpected — a red build | expected — a normal step in authoring |
| Audience | a team, the report, PractiTest, Teams | the repair loop, then one reviewer |
| Routed by | `RecommendedAction` — file-defect, heal, fix-test | `RepairAct` — repair, retry, stop |

`clusterFailures` and `classifyByRule` are called **unchanged**, and a category
means what it means everywhere else. What differs is only the policy laid over
the verdict — which is why `repair.ts` holds a table and no rules of its own. A
second classifier tuned for authoring would drift from the one a run is judged
by, and a spec would then be hardened against a different idea of what a failure
is than the suite it is about to join.

The clearest case is `application-defect`. In production it means *file a defect,
tell the team, the build is red*. In hardening it means **the spec is finished
and it works** — it caught a real defect on its first outing. Same verdict,
opposite conclusions; the right end state there is a spec committed with a
declared `known-failure` annotation, not a repair.

### 4. Repair is gated on the triage category.

The machinery already exists (`triage:cluster`, `triage:rules`, the taxonomy).
The gate is the category:

| Category | Action |
|---|---|
| `locator-drift`, `timing-synchronisation`, `test-data` | repair, loop again |
| `network-infrastructure` | retry — not a repair |
| `application-defect` | **stop.** Hand to a human as a finding. Never repair. |

Without this gate a repair-until-green loop eventually "fixes" a real defect
into silence, which §"A defect in the application is a failure, and it stays
one" forbids outright.

### 5. Checks are enforced in code, never requested in a prompt.

`authorCases`'s rule. A model cannot be trusted to enforce its own citation
rules — so every claim it makes is verified against the artifact.

### 6. Nothing is published. Git is the staging area.

`cases:author` writes for review and publishes nothing. A generated spec is
code, which makes that more important, not less.

### 7. A missing verb is a design question, not a workaround.

§"When the vocabulary is missing". The generator returns `needs-vocabulary`
naming the action somebody must write. It never invents a helper and never
reaches for `page.locator`.

---

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Case quality gate | **done** — `gateCase`, pre-existing |
| 1 | Draft, verify, pre-flight, render | **done** — this branch |
| 2 | Data: preconditions → a seeding plan | `ready` |
| 3 | Run, triage, gated repair loop | **done** |
| 4 | Stability: N consecutive green before commit | `ready` |
| 5 | The real model (`AnthropicSpecAuthor`) | `blocked` — needs `ANTHROPIC_API_KEY` |
| 6 | Dashboard surface | `hypothesis` |

---

### Phase 1 — draft, verify, pre-flight, render · `done`

`npm run spec:author -- <CASE-ID> --draft=<file.json> [--write]`

**Two draft shapes, both supported, sharing one renderer and one verifier.**

- **Free TypeScript** (`kind: 'spec'`) — the model writes the body; we verify it
  afterwards. `tsc` is the real authority because fixtures are fully typed.
- **IR** (`kind: 'spec-ir'`) — the model describes the test in a structured
  form; **we** render the TypeScript.

Measured side by side on `OHRM-4-01`: after two renderer fixes (property
shorthand, expanding the trailing object rather than stranding `authedPage`),
the two produced **byte-identical output** apart from the generator line.
So the choice was not decided by expressiveness.

**What the IR makes impossible rather than merely checked:** there is no node
for a locator, a fixed wait or a raw HTTP call, so those three checks have
nothing to catch. And an assertion carries the case assertions it proves *on
itself*, so a coverage claim cannot be fabricated — where the free form needs a
verbatim-substring check to tell a claim from a lie. **Removing a class of
dishonesty beats detecting it.**

**What the IR costs:** the renderer has to learn what a model already knows
(shorthand, wrapping — Prettier's job, re-implemented), and it asks the draft
for facts the catalog already has (`async?`, because `testData.*` is
synchronous). Its expressiveness ceiling is untested past arrange/act/assert/
cleanup — `RB-4-03` iterates a list and would need a node that does not exist.

**Decision: IR is the default; the free form stays as the escape hatch.** A
draft that cannot be expressed as IR falls back, and **the fallback rate is
evidence** — if most cases need free TypeScript, the IR was the wrong bet and
the number will say so. Count it.

#### Checks that run today

| Check | Shape | Severity |
|---|---|---|
| `unknown-fixture` | both | blocker |
| `unknown-verb` | both | blocker |
| `raw-locator` / `hard-wait` / `raw-request` | free only (unrepresentable in IR) | blocker |
| `no-assertion` | both | blocker |
| `citation-not-verbatim` | free only (impossible in IR) | blocker |
| `citation-out-of-range` | both | blocker |
| `unbound-reference` | IR only | blocker |
| `assertion-gap` | both | blocker |
| `preconditions-unplanned` / `precondition-unplanned` | both | blocker |
| `precondition-unattributed` / `-unknown-fixture` / `-fixture-unused` / `-not-established` | both | blocker |
| `precondition-assumed` | both | **warning** |
| `precondition-unsatisfiable` | both | blocker → refusal |
| `journey-unmapped` / `step-unmapped` / `step-out-of-range` / `step-no-calls` | both | blocker |
| `step-cites-uncalled-verb` | both | blocker |
| `journey-out-of-order` | both | blocker |

**Pre-flight is the half that makes "ties up to the case" true.** Assertion
coverage alone never was: a spec can prove every assertion the case ends with,
start from a state the case never described, take a different route, and pass.
So the draft states *how each precondition is met* (`fixture` / `established` /
`assumed` / `unsatisfiable`) and *which calls carry out each step*, and both
claims are checked against what the draft actually does — including **order**,
matched greedily against the call sequence.

`precondition-assumed` is a warning rather than a blocker on purpose: some
preconditions genuinely are environmental, and blocking them would push people
to write `established` and mean nothing by it. But it is never silent —
§"State the suite does not own" is why.

The generated spec **shows its work**: the plan is rendered into its doc
comment, so a reviewer holding the case beside the file does not have to infer
which line arranges precondition 2.

#### Proven

- Generated `OHRM-4-01` for `orangehrm` from a case: `tsc` clean, lint clean,
  **passes live**, full orangehrm e2e 7/7.
- Bad free draft → 6 blockers, exit 1, nothing written.
- Bad IR draft → 6 blockers including `unbound-reference`.
- Pre-flight-only bad draft (**every earlier check passes**) → caught
  `journey-out-of-order` and `precondition-fixture-unused`.
- Refusal path: `OHRM-5-01` needs the role shown in the user list; `users.read`
  returns usernames only, so it wrote **no spec** and named `users.roleOf`.
- Drift: editing the case makes `hashes:check` report *"the spec for case
  OHRM-4-01 tests a previous version of it."*
- 42 framework tests.

#### Found on the way, and fixed

- **`users.remove` had an undocumented precondition** and died in cleanup after
  a refused add. Its sibling `users.read` documents exactly this lesson.
  *A human avoids an undocumented precondition by accident because they have
  seen the page; a generator has only the signature and walks into it.
  Generation pressure-tests the vocabulary.*
- **`recordGeneratedSpec` was missing** — the first cut wrote `case-hash` into
  the spec and nothing back into the case, so `check-hashes`'s
  `if (testCase.specPath)` had nothing to compare and drift passed silently.
  The identical omission `recordPublishedHash` exists to fix, one hop later.

---

### Phase 2 — data: preconditions become a seeding plan · `ready`

Today a precondition is *classified* (`fixture` / `established` / `assumed`) and
nothing acts on it. `assumed` is the interesting one: it is a warning, and the
owner's ask says *"the data it needs, seed the data if need"*.

**Scope.** An `established` precondition names a verb. Extend the plan so it can
name a verb **plus arguments**, and render those calls into an arrange block
ahead of the journey — so the spec creates what it needs rather than the draft
happening to include it inline. Then `assumed` becomes a genuine last resort
rather than the path of least effort.

**Do not** build a general fixtures/factory system. Test data is created through
the API or the UI so caches and derived state stay consistent (§"API, contract
and database work"), and `run.runId` already tags everything for cleanup. The
vocabulary for seeding is the pack's own verbs.

**Open question for the implementer:** whether cleanup for seeded data is
inferred (every `established` call gets a matching removal) or stated. Inferring
is tidier and wrong the moment a verb has no inverse. Prefer stated.

### Phase 3 — run, triage, gated repair · `done`

`npm run spec:harden -- <CASE-ID> --draft=a.json[,b.json…]`

Generate → write → run → triage → gate → repair → repeat. **Invariants 2, 3 and
4 govern it entirely.**

**Two guards, both mechanical.**

1. **The hardening policy decides whether a repair is permitted**, from the
   category the *shared* classifier produced. All twelve categories have a
   stated decision; the four that live in the spec (`locator-drift`,
   `test-data`, `test-logic-defect`, `timing-synchronisation`) are the only ones
   repaired.
2. **The claims are frozen.** `extractClaims` reduces a rendered body to its
   `subject|matcher(expected)` list — dropping the failure message, which is
   diagnostic and may be improved — and a repair whose claim list differs in any
   way is refused before it reaches disk.

**Why the second guard is not redundant, proven rather than argued.** A draft
that "repairs" the failure by flipping `.toBe(false)` to `.toBe(true)` **passes
every phase-1 check** — real verbs, real fixtures, correct journey, both case
assertions cited, `publishable: true`. Phase 1 cannot see it, because from its
point of view nothing is wrong. Only the comparison against the previous draft
catches it:

```
[blocker] repair-changed-claims: expectation 2 was `second.saved|.toBe(false)`
          and the repair made it `second.saved|.toBe(true)`
```

**`MAX_REPAIR_ATTEMPTS = 3`**, deliberately more than the static gate's 1. A
static gate hands the model the complete problem on the first reply; a run hands
it one failure at a time, and fixing a precondition can legitimately reveal a
wait, which reveals a missing seed. Three covers that chain and is far too few to
grind toward green by attrition.

**`RUN_RESULT_PATH`** is redirected to a scratch file, so hardening never
clobbers the `run-result.json` the report, triage and publish stages read.

#### Proven

- **Pass path, live:** the loop generated, wrote, ran and passed `OHRM-4-01`
  against the real orangehrm demo, then recorded `specPath` in the case. The
  regenerated file was **byte-identical** to the committed one — `git status`
  clean afterwards.
- **Escalate path, live:** a draft with an option the form does not offer
  (`status: 'Active'`) — a flaw pre-flight cannot see, since every verb is real,
  every step mapped and the order correct — failed live with a 15s locator
  timeout, triaged to **no verdict**, and the loop **stopped rather than
  guessing**. That is `locator-drift`'s own documented reasoning holding: an
  ambiguous timeout is *either* a moved control *or* a control missing because
  something upstream is broken, and nothing in the text says which.
- **Claims guard:** proven against the real generated artifacts, plus 25
  framework tests covering every category, every way a claim can move
  (flipped, dropped, added, loosened, re-subjected) and every way the loop ends.

#### Not proven, and stated rather than implied

**A live repair→pass cycle has not been observed.** The stand-in model reads
drafts from disk and therefore cannot respond to a failure it was shown — so the
`repair` disposition is exercised by tests and by the policy table, not yet by a
model actually fixing something. That needs phase 5. What *is* proven live is
the more important half: the loop declining to repair when it must not.

### Phase 4 — stability before commit · `ready`


A spec that passed once is not hardened. `FLAKE_MINIMUM_RUNS` and
`src/support/quarantine.ts` already encode this repository's view that a rate
needs a threshold before it means anything.

**Evidence it matters, from phase 1:** the generated spec failed one live run
and passed the next, on a byte-identical body — 35.4s versus 16.7s against a
slow public demo. A one-run gate would have called that a bad spec.

**Open question:** N, and whether the runs must be spread rather than
consecutive. Contention is the variable that matters, so N runs back to back on
an idle machine may prove less than two under load.

### Phase 5 — the real model · `blocked`

`AnthropicSpecAuthor implements SpecAuthorModel`, mirroring
`AnthropicCaseAuthor`: schema-constrained completion, no tools, no browser, no
filesystem. The IR is already a JSON schema, so `output_config.format` takes it
almost directly.

**Blocked only on a key** — no `ANTHROPIC_API_KEY` on this machine. Everything
around it is built and tested against a draft-on-disk model, which is the right
order: the harness is what makes a model's output safe to accept.

### Phase 6 — dashboard surface · `hypothesis`

`open-items.md` already recorded the judgement that `/cases` *"shows the gap
sharply — 10 cases with no spec — and offers no way to act on either. That is a
recovery gap, which the standing brief cares about."*

**But hold the line that file draws:** the dashboard should say more, not do
more. Generating a spec from a page is a write into a pack with nobody reading
the diff — the same reason `heal` was left out. The defensible surface is
*reporting* which cases have no spec and which specs have drifted, with the
command to run. Decide deliberately; do not drift into a Generate button.

---

## How to work on this

Everything in [`backlog.md`](backlog.md)'s working agreement applies unchanged —
branch naming, `npm run verify`, `npm run suites:live`, the improvement log,
rule zero.

Two additions specific to this programme:

1. **Prove it against a real case on a real application**, not only in
   `tests/framework/`. Every phase-1 claim above was driven against `orangehrm`
   live, and two of the four most valuable findings came from that rather than
   from the tests.
2. **Record the IR fallback rate** whenever a case needs the free-TypeScript
   shape, and say which node the IR lacked. That number is how the phase-1
   decision gets revisited on evidence instead of taste.

---

## What this replaced

`open-items.md` carried three items and none was `ready`: **68** (worker caps —
`hypothesis`, and its two suite-side fixes were landed on 2026-08-24), **49**
(Teams/Outlook credentials — `blocked` on the owner), and **11** (the standing
learn-fix-optimise objective — never a task).

They are **parked, not deleted**, and 11 in particular is a standing objective
this programme serves rather than replaces: a generated spec that is hardened by
a triage-gated repair loop *is* "learned, fixed and optimised until it is
bulletproof", applied at authoring time.

`backlog.md` (the working agreement plus the 48-item archive),
`coverage-phase.md` and `improvement-log.md` are untouched.
