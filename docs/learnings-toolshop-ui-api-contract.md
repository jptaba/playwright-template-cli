# What Toolshop taught the framework, across three kinds of testing at once

ParaBank exercised one layer — a browser against a storefront. This pass was
chosen to exercise three: **UI, typed HTTP clients, and schema conformance
against a published document**, on one application, in one run.

Toolshop (`practicesoftwaretesting.com`) is an Angular storefront over a
Laravel API with a live OpenAPI 3.2 document at
`/docs?api-docs.json` — 56 documented paths, 50 products, and a deployment
anyone on the internet can write to. That last property turned out to matter.

**51 specs, all green: 17 UI, 18 API, 16 contract.** One framework check was
added, one genuine provider defect was found, and one defect report was very
nearly filed against an application that was behaving correctly.

---

## What could not be done, and why

**Database testing.** The ask was three kinds; this application supports two
and a half. There is no public database endpoint for a hosted demo, and
`package.json` carries no driver — no `pg`, no `mysql2` — because the `db/`
layer is deliberately driver-agnostic and, in the doctor's own words, *"ready
for one"*. Docker is installed on this machine but its daemon was not running,
so the local stack that ships a MariaDB could not be brought up either.

Real DB coverage needs one of:

- the Toolshop compose stack running locally, and a driver added, so
  `capabilities.db` can point at it; or
- any reachable database with credentials in the secret store.

Neither is a framework gap. The read-only query vocabulary, the write refusal
and the redaction path all have framework tests already; what is missing is a
database to point them at.

---

## The framework check this pass added

### An endpoint descriptor the published document does not describe

`GET /categories/{categoryId}` was written into the endpoints layer from REST
convention — a collection has members, so a member must be readable. The
service answers **405 Method Not Allowed**, and the document agrees with the
service: that path declares `put`, `delete` and `patch`, and no `get` at all.

This is the API's version of a hallucinated locator, and it deserves the same
treatment. §Locators says ground a locator in the accessibility tree rather
than in priors; nothing said the equivalent about endpoints, even though the
document was **already vendored in the pack** and had the answer.

`target:doctor` now compares every endpoint descriptor against the operations
in the vendored document and names the ones that are not there:

```
WARN [endpoint-not-documented] 2 endpoint descriptor(s) are not in the
published document: GET /categories/{categoryId}, GET /status.
  → Check each against the vendored schema. An endpoint written from REST
    convention rather than from the document is the API's version of a
    hallucinated locator — it fails as a 405 or a 404 that reads like an
    application fault (§05).
```

A warning rather than an error: an undocumented endpoint is a real thing, and
the point is that somebody looked. It caught `GET /status` too, which is
genuinely absent from Toolshop's document — a true positive nobody was looking
for. → **`main`**, with tests in `tests/framework/onboarding.spec.ts`.

---

## A defect found, and a defect not filed

### Found: the empty page breaks the published pagination schema

The contract project caught real provider drift on `GET /products/search`:

```
document : from { type: integer }   to { type: integer }
service  : { "from": null, "to": null, "total": 0 }   when nothing matched
service  : { "from": 1,    "to": 4,    "total": 4 }   when something did
```

Laravel's paginator nulls `from` and `to` on an empty page; the schema does not
allow null. It is invisible on every populated response, which is exactly why
it survived — nobody generates an example for the empty case.

Kept in the suite as `test.fail` rather than deleted: the finding stays, the
suite stays green while the defect stands, and the day it is fixed the spec
turns red and asks to become an ordinary assertion. Reported as **contract
drift**, not as an application defect, because it routes to whoever owns the
document rather than to the storefront team.

### Not filed: the caption that appeared to lie

Search for a term nothing matches and the storefront reads **"45 products found
for 'zzzz…'"** over an empty page. Forty-five is the whole catalogue. That was
written up as an application defect, with a `test.fail` and a paragraph
explaining it.

It is not a defect. Watched over time:

| after | caption | cards |
|---|---|---|
| 200ms | `45 products found for 'zzzz…'` | 9 |
| 600ms | `45 products found for 'zzzz…'` | 9 |
| 1200ms | `0 products found for 'zzzz…'` | 0 |
| 5000ms | `0 products found for 'zzzz…'` | 0 |

The caption updates its **term** before its **count**, so for about a second it
pairs this search's term with the previous search's number. The application
settles to the correct answer. The defect was in the test.

This is the §22 failure mode — *a wrong verdict stated fluently is
indistinguishable from a right one* — arriving from the direction nobody
guards: not a model's verdict, but a test author's, written up confidently
because a screenshot supported it. What separated them was watching the page
over time rather than at one instant.

---

## Synchronisation, four attempts

Getting `search()` right took four goes, and the three wrong ones are worth
keeping because each was plausible and each failed differently:

1. **Wait for the first card.** Cannot describe an empty result — a search
   matching nothing hangs fifteen seconds and reports a timeout. The §State
   rule about a vocabulary being able to express every state the application
   has, met head on.
2. **Wait for the card count to stop changing.** Settles on whatever is on
   screen, and a moment after the click that is still the previous result set —
   nine products returned for a term matching none of them, consistently enough
   to look correct.
3. **Wait for the caption to name the term.** Nearly right, and the most
   dangerous: it is the wait that produced the false defect above.
4. **Wait for the search response, then for the page to agree with it.**
   Correct, and it needs no guess about how long rendering takes.

Along the way: the storefront issues its search as an HTTP **QUERY**, not a
GET. A `waitForResponse` predicate filtering on `'GET'` waits the full timeout
for a response that already arrived under a different verb. The published
document says so plainly — `/products` lists `get`, `post` *and* `query` — and
it was read only after the timeout.

---

## What a shared public deployment does to assertions

`TS-107` asserted that every brand slug is url-safe. It failed on:

```
Patched Updated Playwright Brand Deepa Alpha-INVALID-1786593691628-0
  slug: updated-playwright-brand-deepa-alpha-INVALID-1786593691628-0
```

Somebody else's automation left that behind. Whether the service should
sanitise a slug on create is a fair question — and it is a question about a
record this suite did not create. §State says never assert on data the spec did
not create; a public demo makes the rule concrete rather than theoretical. The
assertion became "every brand has a slug", which is true of any record however
it got there.

---

## Smaller things, recorded

**The framework owns the fixture name `api`, and target packs should not shadow
it.** The Toolshop fixture is `catalogApi`, built on top of the framework's
`api` client so it inherits schema validation, cleanup tracking and credential
handling. A pack that constructed its own client would silently lose all three.

**The CLI scaffolder cannot probe.** `target:new` defaults `testIdAttribute` to
`data-testid` and the secret source to `vault`. Toolshop uses `data-test` and
public credentials, so both were wrong, and nothing catches it — the dashboard's
onboarding *does* read the attribute off the running page, but the CLI path
never opens a browser. The doctor cannot know either; it is offline by design.
Worth knowing when onboarding from the command line: check those two fields
against the application before the first run.

**`--with=contracts` writes a `.yaml` spec path.** Toolshop publishes JSON, so
the scaffolded `contracts.spec` pointed at a file that would never exist. The
registry reads either format; only the default path is opinionated.

---

## What was validated, end to end

| Stage | Evidence |
|---|---|
| Onboard | `target:new --with=api,contracts,a11y`, 12 files, no overwrite |
| Doctor | `OK — profile, pack and credentials agree` after two profile corrections |
| Sign-in | `setup:auth` green; the account menu is the marker, because "My account" is inside a collapsed dropdown and never visible |
| UI | 17 specs: listing, search, empty search, clearing a search, product detail, specifications, quantity, sign-in, refusal, session, basket, language |
| API | 18 specs: pagination, one product, a 404 refusal, search, empty search, related, brands, categories, the tree, filters, sign-in, refusal, status |
| Contract | 16 specs walking the documented endpoints; **1 drift found** |
| Mixed | The price on the page equals the price the service holds, and every product listed is one the service knows |
| Report | `toolshop/staging`, 51 passed, capability notes reading "validated against …/openapi.json" and "accessibility checked against wcag22aa" |
| Triage | 0 failures → 0 clusters; heal brief empty |
| Offboard | Pack, profile, credentials and stored session removed; `git status` clean |

51 target specs and 417 framework tests, green together.
