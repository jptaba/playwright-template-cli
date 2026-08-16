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
  :root {
    --bg: #EAEDF1;
    --surface: #FBFCFD;
    --surface-2: #F1F4F7;
    --ink: #151A21;
    --ink-2: #39424F;
    --muted: #5F6B7C;
    --rule: #CFD6DF;
    --rule-strong: #AFBAC7;
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
      --rule: #272D38; --rule-strong: #3A4250;
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
    --rule: #272D38; --rule-strong: #3A4250;
    --accent: #D9AC57; --accent-ink: #E8C382; --accent-soft: #2B2417;
    --pass: #4FB88C; --pass-soft: #16281F;
    --fail: #E4757F; --fail-soft: #2C1A1D;
    --warn: #D2A03F; --warn-soft: #2A2214;
    --code-bg: #1A1F28;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -16px rgba(0, 0, 0, .8);
  }

  * { box-sizing: border-box; }

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
  .ctx { display: flex; align-items: center; gap: .5rem; font-size: .82rem; }
  .ctx-label { color: var(--muted); }
  .ctx-name { font-weight: 640; color: var(--ink); }
  .ctx-env {
    padding: .05rem .45rem; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--rule);
    font-size: .72rem; color: var(--muted);
  }
  .ctx-none { color: var(--muted); font-style: italic; }

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
  .badge.auto {
    color: var(--pass); background: var(--pass-soft);
    border-color: color-mix(in srgb, var(--pass) 25%, transparent);
  }
  .badge.manual {
    color: var(--accent-ink); background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .badge.locked { color: var(--muted); background: var(--surface-2); border-color: var(--rule); }

  p.explain { color: var(--ink-2); font-size: .9rem; margin: .8rem 0 1.1rem; max-width: 68ch; }
  p.explain b { color: var(--ink); font-weight: 620; }

  label { display: block; font-weight: 620; margin: 1rem 0 .3rem; font-size: .87rem; }
  label small { font-weight: 400; color: var(--muted); }
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
  .check span small { display: block; color: var(--muted); }

  button {
    margin-top: 1.1rem; padding: .5rem 1rem; border-radius: 5px;
    border: 1px solid var(--accent); background: var(--accent); color: var(--surface);
    font: inherit; font-size: .89rem; font-weight: 620; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--ink-2); border-color: var(--rule-strong); }
  button.destructive { background: var(--fail); border-color: var(--fail); color: #fff; }
  button[disabled] { opacity: .45; cursor: not-allowed; }

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

  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
`;
