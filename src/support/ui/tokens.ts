/**
 * The dashboard's shared stylesheet — §08.
 *
 * One copy of the design system, served to every page. These are
 * `docs/handbook.html`'s tokens: the same palette, the same warm accent, the
 * same three-state theme handling. The handbook, the plan and this tool are the
 * three things a person meets, and a tool that looks like a different product
 * from its own documentation reads as a bolt-on.
 *
 * Everything here is page-agnostic. Anything a single page needs goes in that
 * page's own block, so this file never grows a rule that only one screen uses.
 */
export const DASHBOARD_STYLES = `
  /*
     The palette holds to WCAG 2.2 AA in both themes, and that is a constraint
     on the tokens rather than a claim about them: every pair is measured on a
     rendered page by tests/dashboard/contrast.spec.ts, in light and in dark,
     and a token moved to look better in one theme fails there rather than in
     somebody's eyes six months later.

     Text carries 4.5:1 and was already comfortable everywhere — the worst pair
     in either theme was 4.61. Two things were not, and both were the kind that
     a reviewer's eye does not catch:

     - **White on the dark theme's --fail was 2.94:1.** Below AA, on the one
       control in the tool that removes anything.
     - **The border of every input and select was 1.9:1 in light and 1.7:1 in
       dark**, against the 3:1 that 1.4.11 asks of a control's own boundary —
       the line that says where a field is.

     Section and card borders are deliberately left soft. 1.4.11 covers what is
     *required to identify a component or its state*, and the edge of a card is
     not that; darkening every rule to satisfy a rule that does not apply would
     be a repaint wearing a standard's name. The contrast test says which
     borders it holds to 3:1 and why.
  */
  :root {
    --bg: #EAEDF1;
    --surface: #FBFCFD;
    --surface-2: #F1F4F7;
    --ink: #151A21;
    --ink-2: #39424F;
    --muted: #596474;
    --rule: #CFD6DF;
    --rule-strong: #7C8794;
    --accent: #8A5E12;
    --accent-ink: #6E4A0C;
    --accent-soft: #EFE4CC;
    --pass: #1C6B4F;
    --pass-soft: #DCEBE3;
    --fail: #9F2B37;
    --fail-soft: #F3DDDF;
    --warn: #855F0F;
    --warn-soft: #F1E6CC;
    --code-bg: #EEF2F6;
    --shadow: 0 1px 2px rgba(21, 26, 33, .06), 0 8px 24px -16px rgba(21, 26, 33, .3);
  }

  /*
     Three theme states, not two. An explicit choice stamps the root element;
     the default "system" setting stamps nothing, and only the media query
     separates light from dark there. A colour defined solely inside one of
     these blocks never applies in the unstamped state, which is how a page ends
     up rendering one theme's text on the other theme's ground.
  */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #10131A; --surface: #171B23; --surface-2: #1C212A;
      --ink: #E6E9EE; --ink-2: #C2C9D4; --muted: #929CAB;
      --rule: #272D38; --rule-strong: #6B727E;
      --accent: #D9AC57; --accent-ink: #E8C382; --accent-soft: #2B2417;
      --pass: #4FB88C; --pass-soft: #16281F;
      --fail: #E4757F; --fail-soft: #2C1A1D;
      --warn: #D2A03F; --warn-soft: #2A2214;
      --code-bg: #1A1F28;
      --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -16px rgba(0, 0, 0, .8);
    }
  }

  :root[data-theme="dark"] {
    --bg: #10131A; --surface: #171B23; --surface-2: #1C212A;
    --ink: #E6E9EE; --ink-2: #C2C9D4; --muted: #929CAB;
    --rule: #272D38; --rule-strong: #6B727E;
    --accent: #D9AC57; --accent-ink: #E8C382; --accent-soft: #2B2417;
    --pass: #4FB88C; --pass-soft: #16281F;
    --fail: #E4757F; --fail-soft: #2C1A1D;
    --warn: #D2A03F; --warn-soft: #2A2214;
    --code-bg: #1A1F28;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -16px rgba(0, 0, 0, .8);
  }

  * { box-sizing: border-box; }

  /*
     The hidden attribute means hidden, whatever the element's own rule says.

     A browser's own sheet has [hidden] { display: none }, and any author rule
     setting display beats it — so a Runs card, which is a flex column, stayed
     on screen after showFirst had hidden it, and the page measured the same
     eight screens with ten rows supposedly put away. Anything that hides by
     attribute needs this, and it is the reason normalising sheets have carried
     the same line for twenty years.
  */
  [hidden] { display: none !important; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: ui-sans-serif, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 16.5px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }

  code, pre, .mono {
    font-family: ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", monospace;
  }
  code { background: var(--code-bg); padding: .05em .35em; border-radius: 3px; font-size: .86em; }

  /* ---------- the app shell ---------- */
  /*
     Three regions: a rail that never moves, a slim bar saying which
     application everything is about, and the page.

     The rail is a grid column rather than a fixed-position overlay, so the
     page's own scrollbar stays the page's and nothing has to be padded around
     an element that is out of flow.
  */
  .app { display: grid; grid-template-columns: 16.5rem minmax(0, 1fr); min-height: 100vh; }
  .main { min-width: 0; }
  .shell { max-width: 68rem; margin: 0 auto; padding: 0 clamp(1.25rem, 4vw, 3rem) 5rem; }

  /*
     A keyboard user's way past the rail. Six links plus their group headings
     is a lot to tab through on every page, and this is the one-line fix that
     has been the answer since long before anybody called it a design system.
  */
  .skip {
    position: absolute; left: -9999px; top: 0; z-index: 100;
    background: var(--accent-soft); color: var(--accent-ink);
    padding: .6rem 1rem; border-radius: 0 0 6px 0; font-weight: 640;
  }
  .skip:focus { left: 0; }

  /* ---------- masthead ---------- */
  .masthead {
    position: relative;
    border-bottom: 1px solid var(--rule-strong);
    padding: 3.25rem 0 2rem;
    margin-bottom: 2rem;
  }
  .masthead::before {
    content: "";
    position: absolute;
    top: 2.2rem;
    left: 0;
    width: 2.25rem;
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
  }
  .eyebrow {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .68rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--accent-ink);
    margin: 0 0 .6rem;
  }
  h1 {
    font-size: clamp(1.7rem, 3.4vw, 2.3rem);
    line-height: 1.15;
    letter-spacing: -.018em;
    margin: 0 0 .8rem;
    font-weight: 660;
    text-wrap: balance;
  }
  .lede {
    font-size: 1.02rem;
    color: var(--ink-2);
    border-left: 2px solid var(--accent);
    padding-left: 1.1rem;
    margin: 0 0 1.6rem;
    max-width: 64ch;
  }
  .factbar {
    display: flex; flex-wrap: wrap; gap: 0 2.5rem; row-gap: 1rem;
    padding-top: .9rem; border-top: 1px solid var(--rule); margin: 0;
  }
  .fact { display: flex; flex-direction: column; gap: .1rem; }
  .fact dt {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
  }
  .fact dd { margin: 0; font-size: .95rem; font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ---------- the rail ---------- */
  /*
     Rendered only when there is more than one page: a nav with one entry is
     furniture pretending to be a choice.

     Sticky and full height. Every page here is taller than a window and
     several are much taller — step 5 of onboarding, a run's event stream, a
     triage cluster list — and from the bottom of any of them the way anywhere
     else used to be scrolling all the way back.
  */
  nav.rail {
    position: sticky; top: 0; align-self: start;
    height: 100vh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--surface); border-right: 1px solid var(--rule);
    padding: 1.15rem 0 2rem;
  }
  .wordmark {
    display: block; margin: 0 1.15rem 1.4rem; padding-bottom: 1rem;
    border-bottom: 1px solid var(--rule);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .74rem; letter-spacing: .13em; text-transform: uppercase;
    color: var(--muted); text-decoration: none; font-weight: 600;
  }
  .wordmark:hover { color: var(--ink); }

  .nav-group {
    margin: 1.25rem 1.15rem .3rem;
    font-size: .68rem; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
  }
  .nav-group:first-of-type { margin-top: 0; }
  nav.rail ul { list-style: none; margin: 0; padding: 0; }
  nav.rail a {
    display: grid; grid-template-columns: 1fr auto; align-items: baseline;
    gap: 0 .5rem; padding: .5rem 1.15rem;
    color: var(--ink-2); text-decoration: none;
    border-left: 2px solid transparent;
  }
  .nav-label { font-size: .95rem; font-weight: 620; }
  /*
     The one-line description under each label. It is the difference between a
     rail that names six routes and one that explains what the tool does, and
     it costs a line each — worth it on a screen somebody meets once.
  */
  .nav-hint {
    grid-column: 1 / -1; font-size: .76rem; line-height: 1.4;
    color: var(--muted);
  }
  nav.rail a:hover { background: var(--surface-2); color: var(--ink); }
  nav.rail a[aria-current="page"] {
    background: var(--accent-soft); border-left-color: var(--accent);
    color: var(--accent-ink);
  }
  nav.rail a[aria-current="page"] .nav-hint { color: var(--accent-ink); opacity: .85; }

  /*
     What is waiting, against the page it is waiting on — the reason a rail is
     worth its width. Four failures nobody has looked at is the most useful
     fact this tool holds, and it used to be two navigations away from every
     page that was not Triage.
  */
  .nav-badge {
    justify-self: end; align-self: center;
    min-width: 1.45rem; padding: .05rem .4rem; border-radius: 999px;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .72rem; font-weight: 700; text-align: center;
  }
  .nav-badge.attention { background: var(--fail-soft); color: var(--fail); }
  .nav-badge.busy { background: var(--accent-soft); color: var(--accent-ink); }

  /* ---------- the context bar ---------- */
  /*
     Which application everything below is about. Every page but Onboard is
     scoped to one and not one of them said which, so a run, a triage cluster
     and a set of cases were all read without the application named anywhere.
  */
  .topbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: .55rem clamp(1.25rem, 4vw, 3rem);
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: saturate(1.6) blur(10px);
    border-bottom: 1px solid var(--rule);
  }
  .crumb {
    margin: 0; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
  }
  .topbar-end { display: flex; align-items: center; gap: 1rem; }
  .ctx { display: flex; align-items: center; gap: .5rem; font-size: .82rem; }
  .ctx-label { color: var(--muted); }
  .ctx-name { font-weight: 640; color: var(--ink); }
  .ctx-env {
    padding: .05rem .45rem; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--rule);
    font-size: .72rem; color: var(--muted);
  }
  .ctx-none { color: var(--muted); font-style: italic; }
  /*
     The switcher. Sized to its content and styled down to look like part of
     the bar rather than like a form control that wandered into it — this is
     the org-switcher slot, and a full-width input here would read as something
     to fill in rather than something to change.
  */
  .ctx-pick {
    width: auto; padding: .15rem 1.4rem .15rem .45rem;
    font-size: .82rem; font-weight: 640; color: var(--ink);
    background-color: var(--surface-2); border-color: var(--rule-strong);
    border-radius: 5px; cursor: pointer;
  }
  .ctx-pick:hover { border-color: var(--ink-2); }
  .ctx-why {
    font-size: .72rem; color: var(--muted);
    padding: .05rem .4rem; border-radius: 999px; border: 1px dashed var(--rule-strong);
  }
  /*
     The sentence behind the chip. Visible rather than a title attribute — a
     tooltip is not reachable by keyboard, and "none selected · TARGET not
     found" explains nothing to somebody who cannot hover. It drops out on a
     narrow bar, where the chip alone still names the cause.
  */
  .ctx-detail { font-size: .76rem; color: var(--muted); }
  @media (max-width: 78rem) { .ctx-detail { display: none; } }

  /* ---------- the theme control ---------- */
  /*
     Three states, and the middle one is the absence of a choice: no
     data-theme attribute means "follow the system", which is what the palette
     above is written around. Lifted from docs/handbook.html, which had this
     and the dashboard did not — a tool that looks like a different product
     from its own documentation reads as a bolt-on.

     Segmented rather than a single toggle, because a two-state switch cannot
     say "follow the system" and that is the state most people want.

     (No backticks in this comment, deliberately: the whole stylesheet is one
     template literal, and a backtick here closes it.)
  */
  .theme {
    display: flex; gap: 2px; padding: 2px;
    border: 1px solid var(--rule-strong); border-radius: .35rem; background: var(--surface-2);
  }
  .theme button {
    font: inherit; font-size: .72rem; letter-spacing: .03em;
    color: var(--muted); background: none; border: 0; border-radius: .25rem;
    padding: .26rem .55rem; margin: 0; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .theme button:hover { color: var(--ink-2); background: none; }
  /*
     The pressed segment carries a ring, not only a lighter fill.

     Which one is chosen is a *state*, and 1.4.11 asks 3:1 of the visual
     information that identifies one. The fill alone is --surface on
     --surface-2, which is 1.07:1 — a difference that exists in the palette and
     not really on the screen. The ring is drawn as a shadow so nothing moves,
     and the soft shadow still sits under it.
  */
  .theme button[aria-pressed="true"] {
    background: var(--surface); color: var(--accent-ink);
    box-shadow: 0 0 0 1px var(--rule-strong), var(--shadow);
  }

  /* ---------- notes that stay out of the way ---------- */
  /*
     Every page carried its reasoning inline, and the reasoning is worth
     keeping: it is why a rule exists, and somebody meeting a refusal wants it.
     It is not worth a hundred words above the field they came to fill in —
     onboarding's step 2 opened with a 108-word paragraph.
     So the instruction stays inline in one line, and the reasoning goes behind
     a disclosure that costs one line closed. A native details element, so it is
     keyboard-operable and announced without a line of JavaScript.
  */
  details.more { margin: .5rem 0 0; }
  details.more > summary {
    cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: .4rem;
    font-size: .82rem; color: var(--muted); border-bottom: 1px dotted var(--rule-strong);
    width: fit-content;
  }
  details.more > summary::-webkit-details-marker { display: none; }
  details.more > summary::before { content: "?"; 
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.05rem; height: 1.05rem; border-radius: 50%;
    border: 1px solid var(--rule-strong); font-size: .7rem; font-weight: 700;
  }
  details.more > summary:hover { color: var(--ink); }
  details.more[open] > summary { margin-bottom: .5rem; }
  details.more .body {
    font-size: .87rem; line-height: 1.6; color: var(--ink-2);
    border-left: 2px solid var(--rule); padding: .1rem 0 .1rem .8rem;
  }
  details.more .body p { margin: 0 0 .5rem; }
  details.more .body p:last-child { margin-bottom: 0; }

  /*
     A single word that needs a gloss, inline in a sentence. Same mechanism at
     a smaller size, so there is one thing to learn rather than two.
  */
  details.gloss { display: inline; }
  details.gloss > summary {
    display: inline; cursor: pointer; list-style: none;
    border-bottom: 1px dotted var(--accent); color: var(--accent-ink);
  }
  details.gloss > summary::-webkit-details-marker { display: none; }
  details.gloss .body {
    display: block; margin: .4rem 0; font-size: .85rem; color: var(--ink-2);
    background: var(--surface-2); border-radius: 6px; padding: .5rem .7rem;
  }

  /* ---------- the right rail ---------- */
  /*
     Only where a page supplies one. It holds what is *about* the page — where
     you are in a long flow — rather than more of the page, and it stays put
     while the content beside it scrolls.
  */
  .content-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
  .content-row:has(.sidecar) { grid-template-columns: minmax(0, 1fr) 15rem; }
  .sidecar { position: sticky; top: 4.5rem; align-self: start; font-size: .85rem; }

  /*
     Anchored below the context bar rather than under it. Without this every
     in-page jump lands with its heading hidden, which is the classic way a
     sticky header breaks a table of contents.
  */
  section, .masthead { scroll-margin-top: 4.5rem; }

  /*
     Narrow: the rail goes above the page and stops being sticky. A 16rem
     column out of a 40rem window is chrome winning an argument it should
     lose, and the guidance against hiding navigation is about hiding it —
     moving it is different.
  */
  @media (max-width: 60rem) {
    .app { grid-template-columns: minmax(0, 1fr); }
    nav.rail {
      position: static; height: auto; border-right: 0;
      border-bottom: 1px solid var(--rule); padding: 1rem 0;
    }
    nav.rail ul { display: flex; flex-wrap: wrap; gap: .25rem; padding: 0 .6rem; }
    nav.rail a { border-left: 0; border-radius: 6px; padding: .35rem .7rem; }
    .nav-hint { display: none; }
    .content-row:has(.sidecar) { grid-template-columns: minmax(0, 1fr); }
    .sidecar { position: static; }
    /*
       Three things in one row stops fitting somewhere around a phone. Wrapping
       is the graceful end of that — the alternative is the theme control
       hanging off the right edge, which is what it did before this rule.

       Wrapping .topbar itself is not enough: .topbar-end holds the
       application switcher and the theme control as two flex items with no
       wrap of their own, so on a real phone width (375px) their combined
       content width (408px, measured) overflowed the viewport rather than
       dropping to a second line — .topbar had wrapped, but its one remaining
       child had nothing left to shrink into.
    */
    .topbar { flex-wrap: wrap; row-gap: .4rem; }
    .topbar-end { flex-wrap: wrap; justify-content: flex-end; row-gap: .4rem; }
    .theme button { padding: .26rem .4rem; font-size: .68rem; }
    /* A wrapped bar is taller, so what a jump has to clear is taller too. */
    section, .masthead { scroll-margin-top: 6rem; }
  }

  /*
     Nothing sticks when the window is too short for it: on a laptop held in
     landscape, a pinned bar plus a pinned rail is most of the screen.
  */
  @media (max-height: 26rem) {
    .topbar, nav.rail, .sidecar { position: static; }
    nav.rail { height: auto; }
  }

  @media (prefers-reduced-motion: no-preference) {
    html { scroll-behavior: smooth; }
  }

  /* ---------- shared furniture ---------- */
  section {
    background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
    padding: 1.4rem 1.5rem 1.6rem; margin-bottom: 1.1rem; box-shadow: var(--shadow);
  }

  /*
     Which of these is the one to act on.

     A wizard whose steps are five identical cards has to be read to be
     navigated: the badges say "needs your input" and "done for you", and
     finding the live one means reading all of them. The current step gets an
     accent edge and a lift; the ones behind it recede to a flat border.

     Colour is not carrying this on its own — the edge is a change of shape and
     elevation as well, and the badge still says in words which step wants
     something. A cue only a sighted reader with normal colour vision can use
     is not a cue this dashboard is allowed to rely on.
  */
  section[data-state="open"] {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent), var(--shadow);
  }
  section[data-state="done"] { box-shadow: none; }
  .head { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
  .step {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
  }
  h2 { font-size: 1.12rem; letter-spacing: -.012em; margin: 0; font-weight: 640; }

  .badge {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: .66rem; letter-spacing: .08em; text-transform: uppercase;
    padding: .15rem .5rem; border-radius: 999px; border: 1px solid transparent; font-weight: 600;
  }
  /*
     A badge says what state something is in, and there is one way to draw one.

     There were twelve of these across five files, each restating the same
     three declarations, and the one that mixes the border had drifted to four
     different values for the same role — 25%, 30%, 40%, and a hand-written
     pair with none. Nothing about that was visible; the cost is that the
     thirteenth badge is written by copying whichever one was nearest, and
     there is no way to be right by default.

     So a page sets the two colours and gets the recipe. The status-ink
     property is separate from status because the accent needs a darker ink
     than the line it is mixed from — exactly the sort of exception that used
     to be re-derived by hand each time. (No backticks in here: the stylesheet
     is one template literal and one would close it.)
  */
  .badge {
    --status: var(--muted);
    --status-soft: var(--surface-2);
    --status-ink: var(--status);
    color: var(--status-ink);
    background: var(--status-soft);
    border-color: color-mix(in srgb, var(--status) 28%, transparent);
  }
  .badge.pass { --status: var(--pass); --status-soft: var(--pass-soft); }
  .badge.fail { --status: var(--fail); --status-soft: var(--fail-soft); }
  .badge.warn { --status: var(--warn); --status-soft: var(--warn-soft); }
  .badge.note {
    --status: var(--accent); --status-soft: var(--accent-soft); --status-ink: var(--accent-ink);
  }
  .badge.quiet { --status: var(--rule); --status-soft: var(--surface-2); --status-ink: var(--muted); }

  /* The two the shell itself uses, named for what they mean here. */
  .badge.auto { --status: var(--pass); --status-soft: var(--pass-soft); }
  .badge.manual {
    --status: var(--accent); --status-soft: var(--accent-soft); --status-ink: var(--accent-ink);
  }
  .badge.locked { --status: var(--rule); --status-soft: var(--surface-2); --status-ink: var(--muted); }

  /* ---------- what a page needs, before any of it is on screen ---------- */
  /*
     The overview panel. Lifted out of the onboarding page in run 36, because
     it was never about onboarding: it is the half that pays for hiding things.
     A reveal with no stated shape is a wizard nobody can see the end of, and a
     page that only shows you what it needs one field at a time is the same
     problem wearing a shorter form.

     Two columns by default, and one on a narrow screen, because the pairing
     that earns its place is "what you bring" against "what it does" — a list
     of requirements with no matching list of outcomes reads as a warning.
  */
  .preflight { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 1.4rem; }
  .pf-title {
    margin: 0 0 .4rem; font-size: .68rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); font-weight: 700;
  }
  .preflight ul { list-style: none; margin: 0; padding: 0; }
  .preflight li {
    position: relative; padding: .22rem 0 .22rem 1.1rem;
    font-size: .9rem; color: var(--ink-2); line-height: 1.45;
  }
  .preflight li::before {
    content: "·"; position: absolute; left: .3rem; color: var(--accent); font-weight: 700;
  }

  p.explain { color: var(--ink-2); font-size: .9rem; margin: .8rem 0 1.1rem; max-width: 68ch; }
  p.explain b { color: var(--ink); font-weight: 620; }

  /*
     A measure, for every kind of prose rather than two of them.

     The lede and the explanatory paragraph have been set for reading since
     they were written; nothing else was. Measured at 1280 x 720, Triage's
     disclosure paragraphs ran at 125 characters a line and Publish's note at
     125, directly under an explain paragraph running at 76 — the same prose,
     one set to be read and one not. Somewhere around 75 is where a line stops
     being scanned and starts being tracked back to, and 68ch lands there for
     this font.

     Enumerated rather than inferred, because CSS cannot select "an element
     holding a long run of text". What keeps the list honest is the budget in
     tests/dashboard/page-measure.spec.ts, which measures the rendered page and
     names any block that reads wider than it should — the same arrangement as
     the height budget beside it.
  */
  .note, .diag, .error, .status, .empty, details.more .body { max-width: 68ch; }
  /*
     A file list and a block of commands are not prose. Both are appended into
     a status container — the offboarding plan lists every file it would remove
     in two columns, and the write result ends in a pre of next steps — and a
     measure narrow enough to read a sentence at wraps a path and puts a
     command line behind a horizontal scrollbar.
  */
  .status:has(ul.files), .status:has(pre) { max-width: none; }

  label { display: block; font-weight: 620; margin: 1rem 0 .3rem; font-size: .87rem; }
  label small { font-weight: 400; color: var(--muted); }

  /*
     A field is its name, its description and its control.

     The description used to live inside the label, where it read correctly
     and became part of the accessible name — so the Target name input
     announced twelve words, of which two were its name. It sits outside the
     label now and is referenced by aria-describedby; this rule is what keeps
     it looking like it always did, on the same line as the name.
  */
  .field { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: .4rem; }
  .field > label, .field > .fieldname { flex: 0 0 auto; }
  /* A group names itself with a span, because a label pointing at a div names
     nothing. It should still look like every other field name. */
  .fieldname { display: block; font-weight: 620; margin: 1rem 0 .3rem; font-size: .87rem; }
  .field > .hint {
    flex: 1 1 auto; min-width: 0; align-self: baseline;
    font-weight: 400; font-size: .87rem; color: var(--muted);
  }
  /* The control takes the next line whatever the name and hint did on this one. */
  .field > input, .field > select, .field > textarea, .field > .field-body { flex: 1 0 100%; }
  .field > button { flex: 0 0 auto; }

  /* A checkbox names itself in its label, so its hint goes underneath, indented
     past the box rather than hanging under it. */
  .check-field { display: block; }
  .check-field > .hint {
    display: block; margin: -.25rem 0 .55rem 1.55rem;
    color: var(--muted); font-size: .85rem; max-width: 68ch;
  }
  input[type=text], input[type=password], select {
    width: 100%; padding: .5rem .6rem; border: 1px solid var(--rule-strong); border-radius: 5px;
    background: var(--surface-2); color: var(--ink); font: inherit; font-size: .9rem;
  }
  input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  .row { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
  .check {
    display: flex; align-items: flex-start; gap: .55rem;
    margin: .55rem 0; font-size: .9rem; font-weight: 400;
  }
  .check input { margin-top: .35rem; }
  /* The hint under a checkbox is a sentence, and on Runs it is two. */
  .check span small { display: block; color: var(--muted); max-width: 68ch; }

  button {
    margin-top: 1.1rem; padding: .5rem 1rem; border-radius: 5px;
    border: 1px solid var(--accent); background: var(--accent); color: var(--surface);
    font: inherit; font-size: .89rem; font-weight: 620; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--ink-2); border-color: var(--rule-strong); }
  /*
     The label follows the surface rather than being white.

     White on the dark theme's --fail is 2.94:1, which is a plain failure of
     1.4.3 on the one control in the tool that removes anything. The surface
     token is dark where --fail is light and light where it is dark, so one
     declaration reads 7.1:1 in light and 5.9:1 in dark — the same trick the
     primary button has always used.
  */
  button.destructive { background: var(--fail); border-color: var(--fail); color: var(--surface); }
  button[disabled] { opacity: .45; cursor: not-allowed; }

  /*
     A button that answers the pointer.

     The served stylesheet had five hover rules and not one of them was on a
     button: the rail link responded, the application switcher responded, the
     theme control responded, and the thing that actually writes the target sat
     there like a picture of a button. A control that does not react reads as
     disabled, which is the wrong thing to say next to controls that do.

     The mix moves each variant **toward the ink**, which is the whole trick:
     --ink is dark in light and light in dark, so one declaration darkens on a
     light page and lightens on a dark one, and hover goes the direction it is
     expected to in both without a second block to keep in step.

     Not on a disabled button. The change would be a promise the button will
     not keep, and the reason it is refused belongs to the page rather than to
     the pointer.

     Contrast holds either way: mixing a fill toward the ink moves it away from
     the surface the label is painted in, so the label gets easier to read
     rather than harder. Asserted in controls.spec.ts rather than reasoned
     about, in both themes.
  */
  button:hover:not([disabled]) {
    background: color-mix(in srgb, var(--accent) 85%, var(--ink));
    border-color: color-mix(in srgb, var(--accent) 85%, var(--ink));
  }
  button.secondary:hover:not([disabled]) {
    background: var(--surface-2); color: var(--ink); border-color: var(--ink-2);
  }
  button.destructive:hover:not([disabled]) {
    background: color-mix(in srgb, var(--fail) 85%, var(--ink));
    border-color: color-mix(in srgb, var(--fail) 85%, var(--ink));
  }
  @media (prefers-reduced-motion: no-preference) {
    button { transition: background .12s, border-color .12s, color .12s; }
  }

  pre {
    background: var(--code-bg); border: 1px solid var(--rule); border-radius: 5px;
    padding: .8rem; overflow-x: auto; margin: .6rem 0 0; font-size: .82rem;
  }
  .note {
    border-left: 2px solid var(--warn); background: var(--warn-soft);
    padding: .5rem .8rem; margin: .6rem 0; font-size: .88rem; border-radius: 0 4px 4px 0;
  }
  .found { color: var(--pass); font-weight: 640; }
  .missing { color: var(--warn); font-weight: 640; }
  .error {
    border-left: 2px solid var(--fail); background: var(--fail-soft);
    color: var(--ink); padding: .5rem .8rem; border-radius: 0 4px 4px 0;
  }
  .diag { border-left: 2px solid var(--rule-strong); padding: .4rem .8rem; margin: .45rem 0; font-size: .88rem; }
  .diag.error { border-color: var(--fail); background: var(--fail-soft); }
  .diag.warning { border-color: var(--warn); background: var(--warn-soft); }
  .diag b { font-family: ui-monospace, Consolas, monospace; font-weight: 640; font-size: .82rem; }
  .fix { color: var(--muted); }
  ul.files { list-style: none; padding: 0; margin: .6rem 0 0; columns: 2; column-gap: 2rem; }
  ul.files li {
    font-family: ui-monospace, Consolas, monospace; font-size: .8rem;
    break-inside: avoid; color: var(--ink-2);
  }
  .status { margin-top: .85rem; font-size: .89rem; color: var(--ink-2); }

  /*
     A list whose length nobody chose.

     Every page here renders something whose size is a property of the
     repository rather than of the design: the cases with no spec, the specs
     citing a case that is not there, the results of a run. Measured on a real
     one, Cases came to 7.3 screens and Publish to 7.8 — and a page that long
     is one where the controls at the bottom are found by scrolling past
     everything, which is the crowding this is about.

     Capped and scrolled rather than truncated: none of it is hidden, and the
     page keeps a shape. The Publish results list has done this since it was
     written; this is that rule, shared, for the lists that missed it.
  */
  .longlist { max-height: 24rem; overflow-y: auto; }

  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
`;
