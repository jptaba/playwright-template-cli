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
  /** What the tab says. */
  label: string;
}

export interface PageFact {
  label: string;
  value: string;
}

export interface DashboardPageContent {
  /** Browser tab and document title. */
  title: string;
  /** Small caps line above the heading. */
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
  /** The page's script, run after the body. */
  script?: string;
}

export interface ShellOptions {
  /** Minted per run; every mutating request must carry it back. */
  token: string;
  /** Every page the dashboard serves, for the navigation. */
  pages: PageLink[];
  /** Which one is being rendered, matched on `href`. */
  current: string;
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

function navigation(pages: readonly PageLink[], current: string): string {
  // One entry is not a choice, so it is not rendered as one.
  if (pages.length < 2) return '';
  const links = pages
    .map((page) => {
      const currentAttribute = page.href === current ? ' aria-current="page"' : '';
      return `<a href="${escapeHtml(page.href)}"${currentAttribute}>${escapeHtml(page.label)}</a>`;
    })
    .join('\n      ');
  return `\n    <nav class="pages" aria-label="Dashboard sections">\n      ${links}\n    </nav>`;
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
<div class="shell">${navigation(options.pages, options.current)}
  <header class="masthead">
    <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
    <h1>${escapeHtml(page.heading)}</h1>
    <p class="lede">${page.lede}</p>${factbar(page.facts)}
  </header>
${page.body}
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
