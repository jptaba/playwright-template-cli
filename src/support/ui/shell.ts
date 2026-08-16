import { DASHBOARD_STYLES } from './tokens';

/**
 * The frame every dashboard page is served in — §08.
 *
 * A page supplies its masthead copy, its body, and whatever styles and script
 * only it needs. The shell supplies the document, the design system, the
 * navigation between pages, and the session token.
 *
 * The split exists so that adding a page is adding a page, rather than adding a
 * page *and* a copy of the stylesheet, the theme handling and the masthead. The
 * onboarding screen was a whole document before this; every screen after it
 * would have been another one.
 */

export interface PageLink {
  /** Route this page is served at, e.g. `/onboard`. */
  href: string;
  /** What the link says. A word, not an icon — see `DASHBOARD_PAGES`. */
  label: string;
  /**
   * Which stage of the work this belongs to. Links are grouped under it.
   *
   * Six flat destinations is a list to read; six under four headings is a
   * shape to recognise, and the shape happens to be the pipeline.
   */
  group: 'Set up' | 'Author' | 'Execute' | 'Report';
  /** One line under the label, for somebody who has not been here before. */
  hint: string;
}

/**
 * Something waiting on this page, shown against its link.
 *
 * The reason the rail is worth its horizontal space: it stops being a list of
 * places and starts being a list of what needs doing. Four failures nobody has
 * looked at is the single most useful fact this tool holds, and it was
 * previously two navigations away from every page that is not Triage.
 *
 * Counted things only. A badge that means "something changed" teaches people
 * to ignore badges.
 */
export interface NavBadge {
  count: number;
  /** `attention` is the amber dot; `busy` is a run in progress. */
  tone: 'attention' | 'busy';
  /** Read out to a screen reader in place of the bare number. */
  label: string;
}

/** The application every page other than Onboard is scoped to. */
export interface TargetContext {
  /** Target name, or null when nothing is selected. */
  name: string | null;
  /** Which deployment its profile points at. */
  environment?: string;
}

export interface PageFact {
  label: string;
  value: string;
}

export interface DashboardPageContent {
  /** Browser tab and document title. */
  title: string;
  /**
   * The small-caps line naming the section. Rendered in the context bar, once
   * — it used to be there *and* above the heading, forty pixels apart.
   */
  eyebrow: string;
  heading: string;
  /** The standfirst, in the accent-ruled block. Plain text or safe markup. */
  lede: string;
  /** The facts under the masthead rule. Omit for a page with nothing to state. */
  facts?: PageFact[];
  /** Styles only this page needs. The shared ones are already there. */
  styles?: string;
  /** The page body, inside the shell. */
  body: string;
  /**
   * The right rail, for what is *about* this page rather than in it: where you
   * are in a long flow, what the numbers on screen mean, what to do next.
   *
   * Optional, and omitted rather than filled: a rail with nothing in it is
   * chrome charging rent. Onboarding uses it because that page is five steps
   * and two screens tall, and "which step am I on" was answerable only by
   * scrolling.
   */
  aside?: string;
  /** The page's script, run after the body. */
  script?: string;
}

/**
 * Every page the dashboard serves, left to right in the order the work
 * actually happens in.
 *
 * They used to sit in `tools/dashboard.ts` in the order they were built, which
 * put the end of the pipeline first and the beginning of it last: Runs,
 * Triage, Publish, then Stories, Cases, Onboard. Nothing about that is wrong
 * to somebody who already knows the flow, and it is unreadable to somebody who
 * does not — a navigation bar is the one place a system explains its own
 * shape, and this one explained it backwards.
 *
 *   Onboard   nothing exists until an application is registered
 *   Users     the logins it signs in with, and where they are kept
 *   Stories   a story arrives and is normalised
 *   Cases     the story becomes test cases
 *   Runs      the cases are run
 *   Triage    what failed is classified
 *   Publish   the results go back out to PractiTest and Jira
 *
 * The competing order is by how often each is opened, which would put Runs
 * first. Frequency is the weaker claim: somebody opening Runs every morning
 * learns where it is once, and somebody meeting the dashboard for the first
 * time reads this bar as the pipeline it is.
 *
 * It lives here rather than in the tool because the tool starts a server when
 * it is imported, and an order nothing can assert on is an order that drifts
 * back the next time a page is added.
 */
export const DASHBOARD_PAGES: readonly PageLink[] = [
  {
    href: '/onboard',
    label: 'Applications',
    group: 'Set up',
    hint: 'Read an application and write its pack',
  },
  {
    href: '/users',
    label: 'Test users',
    group: 'Set up',
    hint: 'Where each login lives, and how',
  },
  { href: '/stories', label: 'Stories', group: 'Author', hint: 'What the work is meant to do' },
  { href: '/cases', label: 'Cases', group: 'Author', hint: 'Stories, turned into test cases' },
  { href: '/runs', label: 'Runs', group: 'Execute', hint: 'Start a run and watch it' },
  { href: '/triage', label: 'Triage', group: 'Execute', hint: 'Why the failures failed' },
  { href: '/publish', label: 'Publish', group: 'Report', hint: 'Results back to PractiTest and Jira' },
];

export interface ShellOptions {
  /** Minted per run; every mutating request must carry it back. */
  token: string;
  /** Every page the dashboard serves, for the navigation. */
  pages: readonly PageLink[];
  /** Which one is being rendered, matched on `href`. */
  current: string;
  /** What is waiting, by href. Anything absent or zero shows no badge. */
  badges?: Readonly<Record<string, NavBadge>>;
  /**
   * The selected application, shown in the top bar on every page.
   *
   * Every page but Onboard is scoped to one, and none of them said which —
   * so a run, a triage cluster and a set of cases were all being read without
   * anything on screen naming the application they belonged to.
   */
  target?: TargetContext;
}

/**
 * Escape text that is about to sit inside markup.
 *
 * Page copy is authored here rather than supplied by a user, so this is not
 * guarding against an attacker — it is guarding against an ampersand in a
 * target name silently breaking a page.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The left rail.
 *
 * A vertical list rather than a row of tabs, and the reasons are the ones
 * NN/g measures: a vertical list is scanned in fewer fixations than a
 * horizontal one, the left half of a window is where people look, and it
 * takes a seventh destination without rearranging itself. This information
 * architecture has grown once per phase and will grow again.
 *
 * It is always on screen. Hiding desktop navigation behind a hamburger is the
 * one thing that guidance is unambiguous about, and the whole point here is
 * that Triage's count is visible from Cases.
 *
 * Labels are words. An icon rail looks tidier and costs a guess per icon.
 */
function navigation(
  pages: readonly PageLink[],
  current: string,
  badges: Readonly<Record<string, NavBadge>>,
): string {
  // One entry is not a choice, so it is not rendered as one.
  if (pages.length < 2) return '';

  const groups: { name: string; pages: PageLink[] }[] = [];
  for (const page of pages) {
    const last = groups[groups.length - 1];
    if (last && last.name === page.group) last.pages.push(page);
    else groups.push({ name: page.group, pages: [page] });
  }

  const rendered = groups
    .map((group) => {
      const items = group.pages
        .map((page) => {
          const here = page.href === current;
          const badge = badges[page.href];
          return [
            `        <li><a href="${escapeHtml(page.href)}"${here ? ' aria-current="page"' : ''}>`,
            `<span class="nav-label">${escapeHtml(page.label)}</span>`,
            badge && badge.count > 0
              ? `<span class="nav-badge ${badge.tone}" aria-label="${escapeHtml(badge.label)}">` +
                `${badge.count > 99 ? '99+' : String(badge.count)}</span>`
              : '',
            `<span class="nav-hint">${escapeHtml(page.hint)}</span>`,
            '</a></li>',
          ].join('');
        })
        .join('\n');
      return (
        `      <p class="nav-group" id="nav-${slug(group.name)}">${escapeHtml(group.name)}</p>\n` +
        `      <ul aria-labelledby="nav-${slug(group.name)}">\n${items}\n      </ul>`
      );
    })
    .join('\n');

  return (
    `\n  <nav class="rail" aria-label="Dashboard sections">\n` +
    `    <a class="wordmark" href="${escapeHtml(pages[0]!.href)}">Test framework</a>\n` +
    `${rendered}\n  </nav>`
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * The slim bar above the content: which application everything below is about.
 *
 * The org-switcher position, for the same reason products put one there —
 * every page under it is scoped to one thing, and that thing was invisible.
 */
function topbar(page: DashboardPageContent, target: TargetContext | undefined): string {
  const context = !target
    ? ''
    : target.name
      ? `<span class="ctx-label">Application</span>` +
        `<span class="ctx-name mono">${escapeHtml(target.name)}</span>` +
        (target.environment
          ? `<span class="ctx-env">${escapeHtml(target.environment)}</span>`
          : '')
      : `<span class="ctx-label">Application</span><span class="ctx-none">none selected</span>`;

  return (
    `\n    <div class="topbar">\n` +
    `      <p class="crumb">${escapeHtml(page.eyebrow)}</p>\n` +
    `      <div class="ctx">${context}</div>\n` +
    `    </div>`
  );
}

function sidecar(aside: string | undefined): string {
  if (!aside) return '';
  return `\n        <aside class="sidecar" aria-label="About this page">${aside}</aside>`;
}

function factbar(facts: readonly PageFact[] | undefined): string {
  if (!facts || facts.length === 0) return '';
  const items = facts
    .map(
      (fact) =>
        `<div class="fact"><dt>${escapeHtml(fact.label)}</dt><dd>${fact.value}</dd></div>`,
    )
    .join('\n      ');
  return `\n    <dl class="factbar">\n      ${items}\n    </dl>`;
}

export function renderPage(page: DashboardPageContent, options: ShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<style>${DASHBOARD_STYLES}${page.styles ?? ''}
</style>
</head>
<body>
<a class="skip" href="#content">Skip to the page</a>
<div class="app">${navigation(options.pages, options.current, options.badges ?? {})}
  <div class="main">${topbar(page, options.target)}
    <div class="shell">
      <header class="masthead">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">${page.lede}</p>${factbar(page.facts)}
      </header>
      <div class="content-row">
        <main id="content">
${page.body}
        </main>${sidecar(page.aside)}
      </div>
    </div>
  </div>
</div>
<script>
const TOKEN = ${JSON.stringify(options.token)};
const $ = (id) => document.getElementById(id);
const text = (value) => document.createTextNode(value);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** Every mutating call carries the session token; the server refuses without it. */
async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-onboard-token': TOKEN },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status));
  return data;
}
${page.script ?? ''}
</script>
</body>
</html>`;
}
