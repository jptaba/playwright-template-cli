# Onboarding journey notes

What actually happens when you run `npm run onboard` and add an application,
observed rather than inferred. Written for backlog item 1, which existed
because the other five items were written from reading
`src/support/onboarding/dashboard-page.ts` instead of using it.

**Method.** `npm run onboard` on Windows, dashboard on a random loopback port.
Application under test: **saucedemo** (`https://www.saucedemo.com`) — a public
demo application, chosen because `toolshop` already exists in this repository
and a second onboarding is the only way to see the first-time path. Its
credentials are printed on its own login page, which is the case the dashboard
itself names as legitimate for the local secret file.

The whole journey was driven twice: once in the order a first-time user
naturally takes it, and once deliberately re-ordered, to isolate finding 6.

---

## The click path, as it happened

| # | What I did | What happened | Time |
|---|---|---|---|
| 1 | Opened the dashboard | Page opened **preselected on `toolshop`**, read-only, every step locked | — |
| 2 | Changed the picker to "— New application —" | Form became editable, step 1 "Needs your input" | — |
| 3 | Typed name + base URL, pressed **Read the application** | Refused: "Confirm this is a test environment before probing." | — |
| 4 | Ticked the confirmation, pressed it again | Status "Loading the application…", button disabled | **12.3 s** (17.6 s on the second run) |
| 5 | — | Steps 2 *and* 3 unlocked together; step 2 correctly filled in `data-test`, `/`, `Username`, `Password`, `Login` | — |
| 6 | Pressed **Preview what will be written** (step 3) | Steps 4 and 5 unlocked. The plan rendered **in step 5**, two sections below the button | 0.16 s |
| 7 | Pressed **Sign in once** with the default Vault source | Refused, with an excellent message naming the exact fix | 0.2 s |
| 8 | Switched step 3 to "Local file" | Credential fields appeared in step 4 immediately | — |
| 9 | Ticked the Accessibility layer (after previewing) | Step 5 still said "6 file(s)", still badged "Done for you" | — |
| 10 | Filled credentials, pressed **Create the target** | "Wrote **7** file(s)" | ~10 s, no status line |
| 11 | Ran `target:doctor` as instructed | "OK — profile, pack and credentials agree." | — |
| 12 | Ran `setup:auth`, the page's own stated aim | **Failed** | — |

---

## Findings

### 1. `npm run onboard` opens on an application you already have

With no draft present, the picker preselects the **most recently onboarded**
application, read-only, with all five steps locked and the note *"read-only. Use
'Change its settings' to edit."*

So the command whose entire purpose is "onboard an application" greets you with
a different application and nothing you can do. The fix is one line of default —
but confirmed twice: clean draft, reload, preselected on `saucedemo` the moment
`saucedemo` existed.

This is invisible on a truly empty repository and appears permanently after the
first target. It is the first thing a second-time user sees.

### 2. The preview goes stale silently, and Create honours the form, not the preview

Step 3's **Preview what will be written** renders its plan into **step 5**.
Change anything in step 3 afterwards and the plan is not recomputed, not
cleared, and step 5 keeps its "Done for you" badge.

Observed: previewed with the Accessibility layer off (6 files listed), then
ticked it on, then pressed Create. Result: **"Wrote 7 file(s)"**, the extra one
being `src/targets/saucedemo/tests/a11y/landing.spec.ts` — a file the user was
never shown. Confirmed on disk.

Create re-reads the live form, which is the right behaviour; the preview being
allowed to disagree with it is the defect. "Nothing is written until step 5" is
the page's promise, and the thing it writes is not the thing it showed.

### 3. The preview's result is two sections away from its button

Pressing a button in step 3 renders output in step 5, below step 4. At 1280×720
the plan is off-screen. Step 3's own badge stays "Needs your input" even after a
successful preview, so the section that owns the button gives no sign it worked.

### 4. The credential source defaults to the one that needs infrastructure

"Credentials resolve from" defaults to **Vault**. On that setting step 4 shows no
credential fields at all, and **Sign in once** — which the same section calls
"optional, and worth it" — cannot work.

Pressing it gives a genuinely good message:

> Credentials for this target live in Vault, so there is nothing to type here
> and nothing for this button to send. Switch step 3 to a local file to sign in
> from this page, or prove the sign-in afterwards with: `TARGET=<name> npx
> playwright test --project=setup:auth`

That names the fix precisely. The problem is upstream: the default routes a
first-time user into a step that cannot complete, and the encouragement to sign
in is printed regardless of whether signing in is possible.

Minor, same area: after switching to local, the stale Vault refusal stays on
screen until the next action.

### 5. Signing in is labelled optional, but the stated aim depends on it

Step 4 says *"Signing in once is optional, and worth it."* The page banner says
the aim is that **`setup:auth` passes unedited**.

Both cannot be true. `signedInMarker` is, in the conventions' own words, the one
locator that cannot be read from a page at rest. Skip the sign-in and the
scaffold writes a guess — for saucedemo, `getByRole('button', { name: 'Account'
})`, which does not exist — and `setup:auth` fails with a 10-second timeout
several minutes later, far from the decision that caused it.

Nothing at step 5 warns that creating without having verified bakes in a guess.

### 6. Verifying *after* Create derives the right marker and throws it away

This is the ordering trap, and it is invisible.

- **Verify → Create**: the derived marker is written into
  `locators/sign-in.ts`, and the file's comment changes to say it was derived.
- **Create → Verify**: the sign-in succeeds, the page reports the derived
  marker, and **nothing is written**. The locators file keeps the guess, and its
  comment still reads *"that was skipped or did not succeed"* — which is now
  false.

Both were run end to end. Nothing on the page indicates that the order matters,
and step 4 sits above step 5, so the intended order is there in the numbering
and nowhere else. "Nothing is ever overwritten" is why the second path cannot
write, which is a defensible rule producing an indefensible outcome: the user
did the optional-but-worth-it thing, was told it worked, and got nothing.

### 7. The derived marker is never checked for uniqueness — `setup:auth` cannot pass

The real reason the aim is not met on saucedemo, even doing everything in the
right order:

```
Error: Sign-in for role 'standard' did not establish a session.
locator.isVisible: Error: strict mode violation:
  getByRole('link', { name: 'Sauce Labs Backpack' }) resolved to 2 elements:
    1) <a id="item_4_img_link" data-test="item-4-img-link">
    2) <a id="item_4_title_link" data-test="item-4-title-link">
```

`proposeSignedInMarker` (`src/support/onboarding/probe.ts:178`) parses the aria
snapshot into `{role, name}` pairs, diffs before against after, and proposes a
control that appeared. It ranks identity-shaped names last — thoughtfully, with
a long comment about why — but **never checks that the name it proposes occurs
exactly once** in the after snapshot. Product listings routinely give the image
link and the title link the same accessible name, so the very first thing a
shop-shaped application offers is a duplicate.

The dashboard then reported "Signed in." and a confident warning about the
marker being account-specific, having never established that the locator it was
about to write resolves at all.

This is a framework bug in the sense the conventions define: the fix is a
capability of the derivation, not a special case for any application. It is also
the single reason `npm run onboard` does not deliver its stated outcome here.

### 8. Cosmetic: "Signed in. Signed in."

`verifySignIn` returns a `detail` that already begins "Signed in.", and the page
prepends its own. Both runs showed the doubled sentence.

---

## What turned out to be fine — guesses to delete

Recorded so the loop does not re-investigate these.

- **Backlog item 2, "the `inert` gating gives no reason" — wrong.** Every gated
  section states its precondition in the section body, above the fold, before
  any interaction: *"Unlocks once step 1 has read the application."* /
  *"Unlocks once step 3 has previewed what will be written."* Accurate in both
  cases. Nothing to do.

- **Backlog item 4, "failure messages may surface raw errors" — wrong, and
  backwards.** Every failure I could provoke named the fix and often the exact
  command: the test-environment refusal, the Vault refusal, the `setup:auth`
  message (*"the credential was accepted but no session marker appeared — check
  the signed-in locator rather than the credential"*), and the post-create next
  steps, which name seven files and commands in order. The dashboard's messages
  are better than most of the framework. The gap is not wording, it is that
  finding 7 makes one of those correct messages point at a locator the tool
  itself wrote wrongly.

- **Backlog item 3, "long-running routes go silent" — mostly wrong.** Probe and
  verify both disable their button and show a status line ("Loading the
  application…", "Signing in once…"). Only **Create** runs several seconds with
  no status line at all. Narrow the item to that, or drop it — nobody is looking
  at a dead-seeming page for forty seconds. There is no cancel and no elapsed
  time on a 12–18 s probe, which is worth noting but is not the silence problem
  the item assumed.

- **Offboarding is good and should not be touched.** The plan names all seven
  files, says which git has never seen and therefore cannot restore, warns that
  the credential entries go too, and does nothing until the target's own name is
  typed. It is the best-behaved surface on the page.

- **The probe itself is accurate.** It read `data-test` (7 occurrences), the
  sign-in path, and all three accessible names correctly on an application it
  had never seen, and correctly reported "Published API document: none found".

- **The draft keeps more than expected.** All of step 1 *and* step 2's probe
  results survive a reload, and credentials are deliberately excluded. What does
  **not** survive is the unlock state: steps 2–5 return to `inert` and the 12–18
  second probe must be re-run purely to re-open sections whose fields are
  already filled from the draft.

---

## Reproducing any of this

Takes about a minute:

```bash
npm run onboard
```

Then: picker → "— New application —", name `saucedemo`, base URL
`https://www.saucedemo.com`, tick the test-environment box, **Read the
application**, **Preview**, switch credentials to "Local file", username
`standard_user`, password `secret_sauce`, **Create the target**.

Undo it completely with:

```bash
npm run target:remove -- --name=saucedemo --confirm=saucedemo
```
