# The coverage phase

Seven applications, each taken end to end through five kinds of coverage, one
at a time. Own log, kept terse on purpose — `backlog.md` reached 1,900 lines by
narrating every decision, and this is a programme with per-application state
rather than a list of arguments.

**Owner's brief, 2026-08-18:**

> let's find 5 more live test apps with at least UI and API, having a DB would
> be a plus … then let's run the live apps that we already have plus the
> additional 5 and run them through the entire process end to end 1 at a time
> including happy path, negative, idempotency, audit, boundary testing.

## The five, verified live rather than remembered

Checked on 2026-08-18 with an actual request to each — UI and API separately,
status code recorded. Two obvious candidates were **rejected because they are
down**, which is exactly why this table exists: `api.realworld.io` answers
**530** and `petstore3.swagger.io/api/v3/store/inventory` answers **500**.

| # | Application | UI | API | DB | Why this one |
|---|---|---|---|---|---|
| 3 | **ParaBank** `parabank.parasoft.com` | 200 | 200 REST + SOAP | server-side HSQLDB, no external access | Banking. Transfers are the idempotency case, transaction history is the audit case, amounts are the boundary case. The richest of the seven for this brief. |
| 4 | **restful-booker-platform** `automationintesting.online` | 200 | 200 `/api/room` | yes, behind the API | Purpose-built for testing. Auth, rooms, bookings, admin — a clean CRUD surface with real negative cases. |
| 5 | **DemoBlaze** `demoblaze.com` | 200 | 200 `api.demoblaze.com` | yes, behind the API | Shop with a genuinely separate API host, which is the shape `capabilities.api.baseURL` exists for. |
| 6 | **AutomationExercise** `automationexercise.com` | 200 | 200 `/api/productsList` | yes, behind the API | Publishes a documented API list including endpoints that deliberately return errors — negative testing with a stated expected result. |
| 7 | **OrangeHRM** `opensource-demo.orangehrmlive.com` | 200 | session-auth `web/index.php/api/v2` | yes | HR, with roles and record history. The only one of the five where authorisation differs by role, which is its own negative surface. |

Already here: **1 toolshop** (`practicesoftwaretesting.com`, UI + API), **2
saucedemo** (`saucedemo.com`, UI only).

**No OpenAPI document was found on any of the five.** Hunted at the usual paths
(`/swagger.json`, `/v3/api-docs`, per-service variants) — all 404. So
`capabilities.contracts` stays **off** for these, which is the honest setting:
`target:doctor` treats a contract capability with no vendored document as a
finding, and declaring one we do not have would be a lie the tool then reports.

## The five kinds of coverage

Per application, and every one of them a spec a manual tester could read:

| Kind | What it proves | Tag |
|---|---|---|
| **Happy path** | The journey the application exists for | `@smoke` |
| **Negative** | A refusal is a refusal — stated, and not a crash | `@negative` |
| **Idempotency** | Doing it twice does not do it twice | `@idempotency` |
| **Audit** | The system recorded who did what, and it survives a re-read | `@audit` |
| **Boundary** | The edges of a range, on both sides | `@boundary` |

**Two constraints that are not negotiable**, both already in the conventions:

- **Negative authentication spends a lockout budget.** Where a deployment is
  shared with strangers the profile declares `sharedEnvironment: true` and those
  specs are skipped. Negative coverage then means *validation* refusals, not
  repeated bad passwords. toolshop already locks an account after three.
- **Never assert on data the spec did not create.** Every one of these
  applications is shared with the public. Anything asserted about must be
  registered, booked or ordered by the spec that asserts it — run 39b is the
  cost of not doing that: two `@smoke` specs took whatever was first on a shared
  listing and one of them was out of stock.

## Order, and why

**3 ParaBank first.** It is the only one where all five kinds are natural rather
than contrived — a transfer is idempotency, a statement is audit, an overdraft
is boundary. If the framework's vocabulary is going to be short of anything,
this is the application that finds it, and finding that on the first of seven is
worth more than on the last.

Then **4**, **6**, **5**, **7** — cleanest API surface to messiest. OrangeHRM
last because its API is session-authenticated and undocumented, so it is the one
most likely to need exploration rather than reading.

## State

`—` not started · `WIP` in progress · `✓` passing live · `✗` failing · `n/a` not
applicable to this application

| # | Application | Onboarded | Happy | Negative | Idempotency | Audit | Boundary | Live |
|---|---|---|---|---|---|---|---|---|
| 1 | toolshop | ✓ | ✓ | — | — | — | — | 20/20 (incl. 7 contract) |
| 2 | saucedemo | ✓ | ✓ | — | — | — | — | 2/2 |
| 3 | ParaBank | ✓ | ✓ | — | — | — | — | 3/3 (`setup:auth`, `@smoke`, `@a11y`) |
| 4 | restful-booker-platform | — | — | — | — | — | — | — |
| 5 | DemoBlaze | — | — | — | — | — | — | — |
| 6 | AutomationExercise | — | — | — | — | — | — | — |
| 7 | OrangeHRM | — | — | — | — | — | — | — |

**toolshop and saucedemo have happy-path coverage only.** Their existing specs
are the journey and nothing else, so they need the other four kinds like the new
five do — the brief says "the live apps that we already have plus the additional
5", and this table is the honest starting position rather than a claim that two
are already done.

**toolshop also has contract coverage as of run 43**, which is not one of the
five kinds and is tracked here only because it changed the live number: six
specs in `tests/contract/`, validating 5 of the document's 87 operations. The
suite found real provider drift on its first run — `/products/search` answers
`from: null, to: null` on an empty result set where the published document
types both as `integer` — recorded as an expected failure with a review date
rather than deleted. See `backlog.md` item 33.

## Per-application log

One short entry each, appended as work lands. What was built, what the live run
said, and anything the application taught the framework. Long reasoning goes in
`improvement-log.md`; this stays a status file.

### 3 · ParaBank — onboarded, happy path passing

**Onboarded** with `target:new` and then rewritten from the running
application. `setup:auth` passes and `PB-1-01 · A transfer between two accounts
is confirmed with its amount @smoke` passes live. **2/2.**

**What it taught the framework**, all of it found by driving rather than
reading:

- **The sign-in fields have no accessible name at all.** "Username" and
  "Password" are `<b>` elements in a layout table, not labels, so the
  accessibility tree shows two bare `textbox` nodes and `getByLabel` matches
  nothing. A DOM dump reports them as labelled — this is the conventions'
  warning reproduced exactly, and it is why the pack uses CSS with
  justifications here.
- **The page pre-renders every error it might show.** `p.error` matches three
  hidden paragraphs on a page reporting nothing, so `isVisible()` is a
  strict-mode violation rather than an answer. **The presence of an error
  element is not the presence of an error** — `:visible` is load-bearing.
- **The transfer pickers are filled by script after load**, and hold zero
  options in the served HTML. Selecting before they fill selects nothing and
  the transfer silently uses a default — a wrong answer that looks like a pass.
  The verb waits on the option count.
- **`accounts` is already a framework fixture** (the account pool, with
  `lease`). A target fixture of that name does not shadow it, it fails to
  typecheck. This pack's verb is `banking`.
- **The `no-raw-locators` rule reads exactly one line above the call.** A
  two-line justification fails even when it says the right thing, and a
  multi-line chained locator needs the comment above the *call*, not above the
  property. Tripped it thirteen times — and the rule declining a misplaced
  justification is what sent me back to `getByRole('row')`/`getByRole('link')`
  for the overview table, which is the better locator anyway.

**Accessibility: shipped in run 44**, once the framework gap below was closed.
`PB-5-01` passes live and asserts two things: no unwaived critical or serious
violation, and that the five accepted exceptions are still exactly five. The
undecided check that blocked it turned out to be **`color-contrast` across 30
nodes** in the left menu — substantial, and completely invisible behind the
number `1` that `summarise()` used to report. The spec records it by name via
`describeUndecided`.

The original note follows, because the reason it waited is the useful part.

**Accessibility: measured, waived, and the spec deferred.** The sign-in page
fails with **one critical** (`image-alt`) and **four serious**
(`color-contrast` ×6 nodes, `html-has-lang`, `link-name`, `target-size` ×15).
These are the vendor's defects on a demo this repository does not own, so they
are recorded as **profile waivers with a reason and a review date of
2026-11-18**, scoped by `urlPattern` to that page so the rest of the rule stays
live everywhere else.

The spec itself is **not shipped**, and the reason is a real framework gap
rather than the application: after the waivers apply, the scan reports
`incomplete: 1` — one check axe could not decide. The conventions are right
that this is not a pass. But `summarise()` stores `incomplete:
raw.incomplete.length` and throws the rule ids away, so **there is no way to
find out which check needs a human.** I could not honestly claim to have
reviewed it, and loosening the assertion is what the conventions forbid, so the
spec waits on the gap being closed. Raised in `open-items.md`.

**Availability, measured:** the host returned Cloudflare **502s for about forty
seconds** in a sixty-second window, then stayed up for twelve consecutive
probes. Failures here are as likely to be the deployment as the suite.

**The API layer is still the scaffold's guess and must not be trusted.**
`--with=api` wrote `endpoints/orders.ts` and `api/orders.ts`; ParaBank has no
orders, and every path in them is invented. They are shipped because the
capability is declared and `target:doctor` expects the directories, but nothing
imports them and no spec calls them. Rewrite them from
`/parabank/services/bank/*` before writing the API specs — the endpoints that
matter are `customers/{id}/accounts` and `accounts/{id}/transactions`, both
confirmed returning real JSON on 2026-08-18.

**Still to write:** negative, idempotency, audit and boundary. The vocabulary
was built for them — `transfer()` returns a receipt that can describe a refusal
as well as a success, which is what lets one verb serve all four without
near-copies — and the evidence is captured: the form's own refusals are "The
amount cannot be empty." and "Please enter a valid amount.", and the REST API
exposes `/accounts/{id}/transactions`, which is the audit surface.

