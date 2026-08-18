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
| 1 | toolshop | ✓ | ✓ | — | — | — | — | 13/13 at `--workers=3` |
| 2 | saucedemo | ✓ | ✓ | — | — | — | — | 2/2 |
| 3 | ParaBank | — | — | — | — | — | — | — |
| 4 | restful-booker-platform | — | — | — | — | — | — | — |
| 5 | DemoBlaze | — | — | — | — | — | — | — |
| 6 | AutomationExercise | — | — | — | — | — | — | — |
| 7 | OrangeHRM | — | — | — | — | — | — | — |

**toolshop and saucedemo have happy-path coverage only.** Their existing specs
are the journey and nothing else, so they need the other four kinds like the new
five do — the brief says "the live apps that we already have plus the additional
5", and this table is the honest starting position rather than a claim that two
are already done.

## Per-application log

One short entry each, appended as work lands. What was built, what the live run
said, and anything the application taught the framework. Long reasoning goes in
`improvement-log.md`; this stays a status file.

<!-- entries appended below -->
