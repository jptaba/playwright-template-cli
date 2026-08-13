# What ParaBank taught the framework

The dashboard was finished — seven phases, every page proved end to end against
in-process fakes for Jira, PractiTest and the model. So the next question was
the only one those fakes cannot answer: **does the whole thing work on an
application nobody wrote it for?**

ParaBank is Parasoft's public banking demo. It was chosen for the reasons that
make it awkward rather than the ones that make it easy: it is a real Java web
application from an older generation, it is mounted under a path rather than at
a domain root, its forms are unlabelled, and nobody involved in this framework
has ever seen its markup.

The exercise ran the full loop, in order, and put the repository back
afterwards:

```
offboard the example → onboard ParaBank from nothing → explore → write the pack
→ run → report → break a locator → triage → heal → run green → offboard →
verify the repository is byte-identical
```

It found **seven defects in the framework** and confirmed one that had already
been written down. This file records each: what it looked like, what actually
caused it, why it mattered, and where the fix landed.

The rule that decides where a fix belongs is unchanged:

> **A learning true of *any* application under test belongs on `main`. A
> learning true of *this* application belongs in its target pack.**

Every fix below is on `main`. The ParaBank pack itself was deliberately never
committed — it existed to be driven and then removed, which is the last thing
the exercise was testing.

---

## Framework defects found

### 1. Removing the last application left a repository that could not build

**Symptom.** `npm run target:remove --confirm` removed the only target, printed
"Run `npm run catalog:build`", and that command crashed:

```
TargetSelectionError: No target profiles found in config/targets/.
    at profiles (config/target.ts:96)
    at targetNames (config/target.ts:139)
    at build (tools/build-catalog.ts:52)
```

`npm run verify` failed with it, at `catalog:check`.

**Cause.** `targetNames()` went through `profiles()`, which threw when
`config/targets/` was empty. Discovery and selection were the same code path.

**Why it mattered.** The tool's own closing note says: *"This is the last
target. Afterwards the repository is the agnostic framework again — with
nothing selected, only the `framework` project builds, and `npm run verify`
keeps passing."* Both halves were false, and the first command the tool
recommends was the one that failed. It is also the state the repository ships
in, so nobody could have taken the template, removed the example and built.

**Fix.** "Which applications are in this repository?" has a valid answer of
"none". `profiles()` no longer throws on an empty directory; the refusal moved
to `defaultTarget()`, where a target is actually being *selected*, and raises
the same error with the same message. `playwright.config.ts` still reads a
`TargetSelectionError` as "run the framework's own tests only". → **`main`**

### 2. The framework's own test suite was coupled to one application

**Symptom.** With the last target removed, `no-target-coupling stops the
framework growing a special case for one application` failed:
`Should have 1 error but had 0`.

**Cause.** The test asserted that framework code naming `example-app` is an
error — but the rule reads target names from `config/targets/`, so the test was
really asserting against whichever application happened to be onboarded.

**Why it mattered.** Two ways. With no target it proved nothing while still
appearing to pass elsewhere, and with a *different* target onboarded it failed
outright — so onboarding ParaBank broke the framework's own suite for a reason
that had nothing to do with ParaBank. It is precisely the coupling the rule
exists to prevent, inside the tests of that rule.

**Fix.** The rule takes the names as an option, defaulting to disk discovery,
which is what every real run uses — `eslint.config.js` passes nothing. The test
supplies its own names and gains the case it was missing: with nothing
onboarded there is no name to couple to, and the rule finds nothing rather than
throwing. → **`main`**

### 3. The probe never looked at the landing page

**Symptom.** Onboarding ParaBank reported:

> Sign-in form: not found. No sign-in form found on any of `/auth/login`,
> `/login`, `/signin`, `/sign-in`, `/account/login`, `/users/sign_in`,
> `/session/new`.

ParaBank's login form is in a panel on its home page.

**Cause.** `SIGN_IN_PATHS` began at `/auth/login`. The probe loads the base URL
first — it counts test-id attributes on it — and then navigated *away* from the
page holding the form it was looking for.

**Why it mattered.** Banking demos, intranet portals and most line-of-business
applications put the sign-in panel on the home page. The probe exists to save
an operator from writing the sign-in locators by hand, and on that whole class
of application it did the opposite while sounding certain.

**Fix.** `/` is the first candidate. → **`main`**

### 4. "No sign-in form" and "a form nothing can name" were the same message

**Symptom.** With `/` added, ParaBank *still* reported no sign-in form.

**Cause.** Not a bug — the correct refusal, wearing the wrong words. ParaBank's
inputs carry no id, no label, no `aria-label` and no placeholder; the visible
"Username" is a sibling paragraph, which a screen reader does not associate
with the field. The accessibility tree is:

```
- paragraph: Username
- textbox            ← no accessible name
- paragraph: Password
- textbox            ← no accessible name
- button "Log In"
```

`parseSignInFields` needs named textboxes and there were none, so it returned
null — and the null was reported as "no form found anywhere".

**Why it mattered.** The probe was *right* to refuse: a name lifted from the
text beside the field produces `getByRole('textbox', { name: 'Username' })`,
which matches nothing and fails fifteen seconds later as a bare timeout on a
field plainly on screen — the hallucinated locator §Locators is built around
preventing. But the message sent the operator hunting for a login page that was
in front of them. The two findings need different actions.

**Fix.** They are now separate messages. The second names the path the form was
found on, says the fields have no accessible names, says a guessed name will
not match, and adds the part a testing framework is well placed to notice:
unlabelled inputs fail **WCAG 1.3.1 and 4.1.2**, and that is worth raising with
whoever owns the application. → **`main`**

### 5. A base URL with a path silently sent every navigation to the wrong host

**Symptom.** `setup:auth` failed against a page that was demonstrably fine:

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
  waiting for locator('input[name="username"]')
```

**Cause.** ParaBank is served from `https://parabank.parasoft.com/parabank`.
The scaffolded profile wrote that as `baseURL` with no trailing slash, and the
scaffolded action navigates with `page.goto('/index.htm')`. URL resolution:

| baseURL | goto | resolves to |
|---|---|---|
| `…/parabank` | `/index.htm` | `https://parabank.parasoft.com/index.htm` ❌ |
| `…/parabank` | `index.htm` | `https://parabank.parasoft.com/index.htm` ❌ |
| `…/parabank/` | `index.htm` | `https://parabank.parasoft.com/parabank/index.htm` ✅ |
| `…/parabank/` | `/index.htm` | `https://parabank.parasoft.com/index.htm` ❌ |

Only one combination works, and the scaffold produced neither half of it.

**Why it mattered.** Applications mounted under a path — `/portal`, `/myapp`,
`/parabank` — are the norm in enterprise deployments, and this is silent: the
run reaches a real page, gets a 200, and fails as a locator timeout. The error
names the locator, so every instinct points at the selector. It cost the
longest single detour in the exercise.

**Fix in the pack.** `baseURL` ends with `/` and every navigation is relative
without a leading slash.

**Still open, and recorded here deliberately.** The framework does not yet stop
anyone repeating this. The right guard is small and belongs in two places: the
scaffolder should normalise a base URL that has a path so it ends in `/`, and
`target:doctor` should warn when a profile's `baseURL` has a path but no
trailing slash — it is exactly the kind of "the profile and the pack disagree"
check the doctor exists for. → **`main`, not yet written**

### 6. The report showed another run's failures

**Symptom.** The first green ParaBank run rendered a report headed **"All
passed"** whose Triage panel read *"4 failure(s) in 4 cluster(s), 1 settled by
rule"*, with a `network-infrastructure` verdict.

**Cause.** `triage-result.json` is a fixed path, so what sits there is whatever
the last triage produced. `tools/triage.ts` already refuses to carry a stale
file forward. The renderer read the same file without asking.

**Why it mattered.** Every figure on that page is supposed to come from one
run — the report says so in its own footer. A report that shows last week's
failures above this week's green run is worse than no report, because it is
believed.

**Fix.** `triageIsForRun()` in `src/support/triage/types.ts`, used by the
renderer and by the triage tool, so there is one description of the rule. The
renderer says out loud when it is ignoring a file, naming both run ids.
→ **`main`**

### 7. The healing brief sent the healer to a file with no locators in it

**Symptom.** A deliberately drifted locator produced a correct brief that named
`src/targets/parabank/tests/e2e/transfer-funds.spec.ts`.

**Cause.** The brief names what the run model records as having failed, which
is the spec.

**Why it mattered.** In a four-layer pack a locator is *never* in the spec —
`layer-boundaries` forbids a spec from even importing `locators/`. A healer
agent opening the named file finds a business verb and no selector, and its
options from there are all bad.

**Fix.** The constraints now say where the repair actually goes: locators in
`locators/`, waits in `actions/`, and specs contain assertions and never
selectors. → **`main`**

---

## Confirmed, not discovered

**`--reporter=list` replaces the config's reporter list.** Recorded during the
dashboard's phase 2, after a run produced no live events. It caught this
exercise too: four runs were launched with `--reporter=list` for readable
output, and none of them wrote `run-result.json` — so the first report was
rendered from a stale model belonging to a completely different suite. The
existing note is right, and the lesson is that it applies to every flag-driven
convenience, not just to `--reporter=dot`.

---

## What the target pack taught, which stays with the target

These were not framework defects. They are what writing a real pack against a
real application looks like, and they are recorded because the next person will
meet them.

**The framework already owns the name `accounts`.** A pack fixture called
`accounts` shadows the framework's account-pool fixture, which has `lease`.
TypeScript caught it at the fixture interface — which is the point of typing
that surface at all — and the verb was renamed `overview`.

**`isVisible()` and `readError()` do not wait.** Both specs failed first time:
`isSignedIn` returned false on a page that was signing in, and `readError`
returned null on a page displaying the error. §Waiting says this about
`count()`; it is true of every boolean and string read. The framework's own
`auth.setup.ts` wraps `isSignedIn` in `expect.poll` for exactly this reason,
and a spec has to do the same. A returned value cannot auto-wait; only an
assertion can.

**Options of a closed `<select>` are never visible.** Waiting for the account
picker to populate with `waitFor()` times out on a form that is perfectly
ready. `waitFor({ state: 'attached' })` is the fact being waited for.

**Four locators needed a justification comment, and all four were the same
defect.** ParaBank's username, password, amount and both account pickers have
no accessible names. `no-raw-locators` demanded a written reason for each, and
writing them made the pattern impossible to miss: this application has an
accessibility problem, and the test suite is the thing that noticed.

---

## What was validated, end to end

| Stage | Evidence |
|---|---|
| Offboard | Plan-only by default; a mismatched confirmation refused; 4 places removed; uncommitted files counted and named |
| Onboard | Dashboard probe read the live application, refused to guess the unnamed fields, wrote 6 files, never overwrote |
| Doctor | `OK — profile, pack and credentials agree` before the first run |
| Sign-in | `setup:auth` green; storage state written once and reused |
| Run | 5 specs green against the live application — sign-in, a refused password, accounts overview, a funds transfer |
| Report | `parabank · demo`, 100% pass rate, capability notes reading "not applicable for parabank" rather than silent zeros |
| Triage | 1 failure → 1 cluster; rules **declined** to classify a locator timeout, which is the correct answer |
| Heal | Brief named it a locator candidate with its failing step and the constraints; repair made in `locators/`; suite green again |
| Offboard | 13 files, 1 credential entry and 1 stored session removed; `git status` clean afterwards |
| Pristine | 414 framework tests pass with ParaBank gone; only `example-app` remains |

The last row is the one that matters most. The repository the exercise finished
with is byte-identical to the one it started with, plus seven fixes — which is
what "the application under test is configuration" has to mean if it means
anything.

---

## One thing that did not fit anywhere

`config/secrets.local.json` comes back from an offboard **reformatted** — the
tool rewrites the whole file to remove one key, and a blank line between the
comment block and the first entry does not survive. It is cosmetic and it is
committed, so every offboard produces a small spurious diff. Not worth a fix on
its own; worth knowing before you review one.
