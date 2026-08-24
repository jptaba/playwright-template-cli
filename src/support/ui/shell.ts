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
  /**
   * Every onboarded application, so the bar can switch between them.
   *
   * Omitted renders the old read-only label, which is what the tests that are
   * about something else pass — a page is not required to know the list.
   *
   * An **empty** list is a different statement from an absent one, and the
   * rail reads it: nothing is onboarded, so the *Set up* group opens itself
   * rather than making somebody find the only useful work in the tool behind
   * a disclosure. The same judgement `landingPath()` makes about `/`.
   */
  available?: readonly string[];
  /** False when the environment decided; the bar then says so, and refuses. */
  switchable?: boolean;
  /**
   * Why it cannot be switched. `label` is shown against the name, `detail` is
   * the sentence — visible, not a tooltip, so it reaches a keyboard too.
   */
  refusal?: { label: string; detail: string } | null;
}

/**
 * What `target:doctor` says about the selected application — item 71.
 *
 * **Not rendered from the server.** Deciding it reaches the secret store, and
 * on a Vault target that is a network call: putting it in the page render
 * would make every navigation wait on somebody else's server. The bar ships an
 * empty chip and fills it from `/api/health` after load, so a slow or
 * unreachable store costs a chip rather than the tool.
 */
export interface TargetHealth {
  /** Blocking findings. A run against one of these is not going to work. */
  errors: number;
  /** Smells. Worth seeing, not worth stopping for. */
  warnings: number;
  /**
   * Set when the profile parks this application, with the reason and the date
   * somebody promised to look again.
   *
   * Its own field rather than one warning among many, because it changes what
   * the tool should let you do rather than what it should tell you. Driven
   * before this existed: `/runs` offered to start a run against an application
   * parked because it answers HTTP 500, and said nothing at all.
   */
  parked: { reason: string; reviewBy: string } | null;
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
    /*
       "Onboarding", not "Applications" — the bar already says "Application".

       Both sat in the same row, in the same muted grey, about 350px apart,
       differing by one letter: a static label naming the switcher, and a link
       to a different page. Measured on the running bar, nothing but the "s"
       told them apart. This is also the word the page uses for itself — its
       eyebrow reads "Onboarding" — so the link and its destination now agree,
       which "Applications" never did either.

       `/users` is deliberately left alone. It collides with nothing, and its
       page is titled "Test users"; renaming the link would fix no defect and
       introduce the mismatch this one just removed.
    */
    label: 'Onboarding',
    group: 'Set up',
    hint: 'Add one, or change what it declares',
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
/**
 * The overview a page opens with: what you bring, and what it does.
 *
 * Onboarding has had one since item 18, and it is the half that paid for
 * hiding the steps — a reveal with no stated shape is a wizard nobody can see
 * the end of. The same argument holds for a page that is not a wizard: what
 * makes a dense page bearable is knowing its shape before reading it.
 *
 * Here rather than copied into each page, per item 19's own rule: seven
 * hand-rolled versions is the outcome to avoid, and it is the likely one.
 *
 * **Two columns, and the pairing is the point.** A list of what a page needs,
 * with no matching list of what it produces, reads as a warning; the second
 * column is what makes the first one an orientation rather than a hurdle.
 *
 * The copy budget in `tests/framework/page-copy.spec.ts` counts these words
 * against the page's total, so an overview is paid for out of the same budget
 * as everything else — which is what stops it becoming a second lede.
 */
/** Joined out of line: a literal newline inside a nested template is a parse error. */
const NEWLINE = String.fromCharCode(10);

export interface Overview {
  /** Column heading, e.g. "You bring". Two or three words. */
  title: string;
  /** One line each. A phrase, not a sentence. */
  items: string[];
}

export function overview(columns: [Overview, Overview]): string {
  const column = (one: Overview): string => `
      <div>
        <p class="pf-title">${escapeHtml(one.title)}</p>
        <ul>
${one.items.map((item) => `          <li>${item}</li>`).join(NEWLINE)}
        </ul>
      </div>`;
  return `    <div class="preflight">${columns.map(column).join('')}
    </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A labelled control, where the hint is a *description* rather than part of the
 * name.
 *
 * Every field on every page was written as
 * `<label for="x">Name <small>the hint</small></label>`, which reads correctly
 * and computes an accessible name of the whole thing. The Target name field
 * announced as *"Target name lower-case, hyphenated — becomes a directory and a
 * TARGET value"*, and it did that on focus, on every arrow key, on every
 * re-read of the form. Eighteen fields across four pages were doing it, the
 * longest at 21 words.
 *
 * That matters more here than it would elsewhere: this dashboard is the front
 * end of a suite whose product is an accessibility scan, and 1.3.1/4.1.2 is
 * exactly the failure it reports about other people's applications.
 *
 * So the hint moves out of the label and is referenced by `aria-describedby`,
 * which is what the attribute is for — a name is announced first and always, a
 * description is announced after it and can be skipped. The visual result is
 * unchanged: `.field` lays the two out on one line, and the control below.
 */
export interface Field {
  /** The control's `id`. `-hint` is appended for the description's id. */
  id: string;
  /** The accessible name. A name, not a sentence — the budget is six words. */
  label: string;
  /** The description. May contain markup; omitted when there is nothing to add. */
  hint?: string;
  /** The control itself, rendered by the caller. */
  control: string;
}

/**
 * Point the control at its description.
 *
 * The caller writes the control, because a select with eight options and a
 * text input with a placeholder have nothing in common worth abstracting. What
 * they do have in common is needing to reference the hint, and a helper that
 * silently failed to add the attribute would produce markup that looks right
 * and announces nothing — so this throws rather than returning the string
 * unchanged.
 */
function describedBy(control: string, id: string): string {
  const patched = control.replace(
    /(<(?:input|select|textarea)\b[^>]*?)(\s*\/?>)/,
    `$1 aria-describedby="${id}-hint"$2`,
  );
  if (patched === control) {
    throw new Error(`field("${id}"): the control has no input, select or textarea to describe`);
  }
  return patched;
}

export function field(spec: Field): string {
  if (!spec.hint) {
    return (
      `<div class="field">` +
      `<label for="${spec.id}">${escapeHtml(spec.label)}</label>` +
      spec.control +
      `</div>`
    );
  }
  return (
    `<div class="field">` +
    `<label for="${spec.id}">${escapeHtml(spec.label)}</label>` +
    `<small class="hint" id="${spec.id}-hint">${spec.hint}</small>` +
    describedBy(spec.control, spec.id) +
    `</div>`
  );
}

/**
 * A checkbox, same rule.
 *
 * The wrapping-label form makes the whole span the name, so the hint sits
 * outside the label and is described rather than announced. The control keeps
 * its `id` so `aria-describedby` has something to point at.
 */
export function checkField(spec: Field): string {
  if (!spec.hint) {
    return (
      `<div class="field check-field">` +
      `<label class="check">${spec.control}<span>${escapeHtml(spec.label)}</span></label>` +
      `</div>`
    );
  }
  return (
    `<div class="field check-field">` +
    `<label class="check">${describedBy(spec.control, spec.id)}` +
    `<span>${escapeHtml(spec.label)}</span></label>` +
    `<small class="hint" id="${spec.id}-hint">${spec.hint}</small>` +
    `</div>`
  );
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
 * It is always on screen, and that has not changed: hiding desktop navigation
 * behind a hamburger is the one thing that guidance is unambiguous about, and
 * the whole point here is that Triage's count is visible from Cases.
 *
 * **One group is a disclosure, and it is not the same thing.** The objection
 * to a hamburger is that it hides the navigation — where you can go, and what
 * is waiting for you there. Collapsing *Set up* hides neither: the group's own
 * heading stays on screen, everything with a badge stays expanded, and the two
 * pages behind it are ones a team uses in its first week and then stops. See
 * `COLLAPSED_GROUPS`.
 *
 * Labels are words. An icon rail looks tidier and costs a guess per icon.
 */
function navigation(
  pages: readonly PageLink[],
  current: string,
  badges: Readonly<Record<string, NavBadge>>,
  nothingConfigured: boolean,
): string {
  /*
     The rail decides what the rail shows — item 75.

     Set-up pages are filtered here rather than by whoever calls this, because
     a caller that forgets is a caller that puts Applications and Test users
     back at the top of the daily list. That is exactly the shape of defect
     this repository keeps finding: a rule that lives in one consumer while its
     siblings keep the old behaviour. Every caller passes the full list and
     gets the right rail.
  */
  const railPages = pages.filter((page) => page.group !== 'Set up');

  // One entry is not a choice, so it is not rendered as one.
  if (railPages.length < 2) return '';

  const groups: { name: string; pages: PageLink[] }[] = [];
  for (const page of railPages) {
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
      const id = `nav-${slug(group.name)}`;
      const list = `      <ul aria-labelledby="${id}">\n${items}\n      </ul>`;

      if (!COLLAPSED_GROUPS.has(group.name)) {
        return `      <p class="nav-group" id="${id}">${escapeHtml(group.name)}</p>\n${list}`;
      }

      /*
         `<details>` rather than a button and a class. It is a disclosure in
         the markup as well as on screen, so a screen reader announces the
         state and the keyboard works before a line of script runs — and the
         script only has to remember the choice, never to implement it.
      */
      const open = groupHolds(group.pages, current) || nothingConfigured;
      return (
        `      <details class="nav-collapsible" data-nav-group="${slug(group.name)}"` +
        `${open ? ' open' : ''}>\n` +
        `        <summary class="nav-group" id="${id}">${escapeHtml(group.name)}</summary>\n` +
        `  ${list}\n      </details>`
      );
    })
    .join('\n');

  /*
     The wordmark goes to `/`, which is the route that already decides where
     home is — `/runs` when anything is configured, onboarding when nothing
     is. It used to go to `pages[0]`, which is `/onboard`: the one page this
     change exists to stop putting in front of people every day.
  */
  return (
    `\n  <nav class="rail" aria-label="Dashboard sections">\n` +
    `    <a class="wordmark" href="/">Testbench</a>\n` +
    `${rendered}\n  </nav>`
  );
}

/**
 * Groups that are not on screen unless somebody asks for them.
 *
 * The owner's ask, and the arithmetic behind it: *Set up* is two of seven
 * links — a quarter of the rail, and the first thing read in it — for a job a
 * team finishes in its first week. The day-to-day is Author, Execute, Report.
 *
 * A set rather than a flag on `PageLink`, because this is a property of the
 * *stage of work* and not of a page: a third set-up page added later should
 * inherit the answer rather than restate it.
 */
const COLLAPSED_GROUPS: ReadonlySet<string> = new Set([]);

/**
 * Set up leaves the rail — item 75.
 *
 * **Onboarding and recovery are not steady-state destinations.** Applications
 * is used once per application; Test users when a login breaks. They held the
 * first two slots of a list of five things somebody opens daily, and the group
 * had already been collapsed by default in recognition of that — which is the
 * argument for finishing the job rather than the counter-argument.
 *
 * `landingPath()` reached the same conclusion about `/` for the same reason,
 * and its comment says so: *the steady state of this tool is run, triage,
 * publish.* This is that judgement applied to the rail.
 *
 * They move beside the **application switcher**, which is exactly what they are
 * about: one adds and configures the thing the switcher selects, the other
 * holds its logins. The health chip already sat there and already linked to
 * `/onboard`.
 *
 * Derived from the group rather than listed, so a third set-up page added later
 * lands in the right place without anybody remembering this file.
 */
export const SETUP_PAGES: readonly PageLink[] = DASHBOARD_PAGES.filter(
  (page) => page.group === 'Set up',
);

/**
 * Whether the page being rendered is inside this group.
 *
 * A collapsed group holding the current page would hide the `aria-current`
 * link that says where you are, so navigating to Test users would leave the
 * rail claiming you are nowhere.
 */
function groupHolds(pages: readonly PageLink[], current: string): boolean {
  return pages.some((page) => page.href === current);
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
function topbar(
  page: DashboardPageContent,
  target: TargetContext | undefined,
  current: string,
): string {
  /*
     Set up sits in the bar unconditionally — item 75.

     It lived inside the switcher at first, which meant it disappeared twice:
     on an environment-decided target, where the bar is a label rather than a
     control, and on any page rendered without a target context at all. Since
     the rail no longer carries them there is nowhere else to reach them from,
     so they are appended to the bar rather than to one branch of it.

     The hairline between them is the whole point of item 77. Item 75 put two
     links at the end of the switcher's own row and gave the reader nothing to
     tell the two jobs apart: "which application is everything scoped to" and
     "go and configure the set-up" were one flat run of nine elements at the
     same size and weight. A rule is the cheapest thing that says "these
     belong together and those do not", and it costs no height and no click.

     Only when there is a switcher to separate *from*. A bar with no target
     context renders the links alone, and a rule with nothing on one side of
     it is a mark whose meaning the reader has to invent.
  */
  const switcher = target ? applicationSwitcher(target) : '';
  const context = switcher + (switcher ? setupDivider() : '') + setupLinks(current);

  return (
    `\n    <div class="topbar">\n` +
    `      <p class="crumb">${escapeHtml(page.eyebrow)}</p>\n` +
    `      <div class="topbar-end">\n` +
    `        <div class="ctx">${context}</div>\n` +
    `${themeControl()}\n` +
    `      </div>\n` +
    `    </div>`
  );
}

/**
 * Which application everything below is about — and the way to change it.
 *
 * It was a `<span>` for as long as it existed, so the one place the dashboard
 * names its own scope was the one place that could not set it. Meanwhile four
 * pages each carried their own copy of the choice under four different ids,
 * shared none of them, and defaulted to whichever the API listed first.
 *
 * A `<select>` rather than a menu of links: it is a choice between named
 * things, it is the control every product puts in this position, and it needs
 * no script to be usable if the one below fails to parse.
 *
 * When the environment decided, this renders as text with the reason. A click
 * that could override `TARGET` would be a bar disagreeing with the run it is
 * about to start.
 */
function applicationSwitcher(target: TargetContext): string {
  const label = `<span class="ctx-label">Application</span>`;
  const environment = target.environment
    ? `<span class="ctx-env">${escapeHtml(target.environment)}</span>`
    : '';

  if (target.switchable === false || !target.available) {
    const name = target.name
      ? `<span class="ctx-name mono">${escapeHtml(target.name)}</span>${environment}`
      : `<span class="ctx-none">none selected</span>`;
    const why = target.refusal
      ? `<span class="ctx-why">${escapeHtml(target.refusal.label)}</span>` +
        `<span class="ctx-detail">${escapeHtml(target.refusal.detail)}</span>`
      : '';
    /*
       Set up belongs here too. It reached only the switchable branch at first,
       so an environment-decided target — where TARGET is set and the bar is a
       label rather than a control — lost Applications and Test users
       altogether. They are not reachable from anywhere else since item 75 took
       them out of the rail.
    */
    return `${label}${name}${why}`;
  }

  const options = [
    `<option value=""${target.name ? '' : ' selected'}>none selected</option>`,
    ...target.available.map(
      (name) =>
        `<option value="${escapeHtml(name)}"${name === target.name ? ' selected' : ''}>` +
        `${escapeHtml(name)}</option>`,
    ),
  ].join('');

  return (
    `${label}` +
    `<select id="ctxTarget" class="ctx-pick" aria-label="Application everything is scoped to">` +
    `${options}</select>${environment}` +
    // Filled after load — see TargetHealth for why it is not rendered here.
    `<a id="ctxHealth" class="ctx-health" href="/onboard" hidden></a>`
  );
}

/**
 * The rule between the switcher and the set-up links — item 77.
 *
 * Decorative, and `aria-hidden` because of it: the grouping it draws is
 * already in the markup, where `.ctx-setup` wraps the two links and nothing
 * else. A screen reader gets that structure without being read a vertical
 * line, and the stylesheet drops the rule at the width where the bar wraps —
 * a separator between two things that are no longer side by side points at
 * nothing.
 *
 * Hiding it there is safe in the way item 75's mistake was not: that hid two
 * *links*, and made Applications and Test users unreachable on a phone. This
 * hides a mark that carries no destination.
 */
function setupDivider(): string {
  return `<span class="ctx-divider" aria-hidden="true"></span>`;
}

/**
 * Onboarding and recovery, beside the switcher they are about — item 75.
 *
 * Plain links rather than a menu behind a button. There are two of them; a
 * disclosure would add a click and a state to the one part of the chrome that
 * is on every page, to save a few pixels that are already there.
 *
 * **They look like links now — item 77.** They were `--muted` with
 * `text-decoration: none`, which is exactly the styling of the plain text
 * labels beside them, so at rest nothing said either one was clickable; the
 * only affordance was a background that appeared on hover, and a mouse is the
 * one input that has to find a control before it can hover over it. The
 * comment below is still right that they should be quieter than the switcher.
 * Quieter than a control is not the same as indistinguishable from a caption.
 */
function setupLinks(current: string): string {
  return (
    `<span class="ctx-setup">` +
    SETUP_PAGES.map((page) => {
      // The rail marked the current page and these have the same duty: on
      // /users, something has to say so.
      const here = page.href === current ? ' aria-current="page"' : '';
      return (
        `<a class="ctx-setup-link" href="${escapeHtml(page.href)}"${here} ` +
        `title="${escapeHtml(page.hint)}">${escapeHtml(page.label)}</a>`
      );
    }).join('') +
    `</span>`
  );
}

/**
 * Light, dark, or follow the system.
 *
 * `DASHBOARD_STYLES` has shipped the whole three-state palette since it was
 * written — a light `:root`, a `prefers-color-scheme: dark` block guarded so an
 * explicit light choice still wins, and a `[data-theme="dark"]` block so an
 * explicit dark one wins the other way. Nothing ever stamped `data-theme`, so
 * every page followed the operating system and offered no say in it, while
 * `docs/handbook.html` — the same design system — had the control.
 *
 * Three buttons rather than a switch: a two-state toggle has nowhere to put
 * "follow the system", and that is the state most people are actually in. Auto
 * is the *absence* of the attribute, not a third value of it, which is what
 * keeps the stylesheet's guards meaning what they say.
 *
 * In the shell, so a page gets it by being a page.
 */
function themeControl(): string {
  const button = (choice: string, label: string): string =>
    `<button type="button" data-theme-choice="${choice}">${label}</button>`;
  return (
    `        <div class="theme" role="group" aria-label="Colour theme">` +
    `${button('light', 'Light')}${button('dark', 'Dark')}${button('auto', 'Auto')}` +
    `</div>`
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
<script>
/*
   Restore the chosen theme before anything paints.

   In the head and synchronous on purpose. Run this from the body script that
   sets everything else up and a reader who chose dark gets a white page first,
   which is the flash the choice was made to avoid — and it is worst on the
   pages that take longest to render, which are the ones somebody stares at.

   Storing only an explicit choice is what makes "auto" the default and keeps
   it the default: no key means no attribute means the media query decides.
*/
(function () {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {
    /* Storage can be denied outright. The system preference still applies. */
  }
})();
</script>
</head>
<body>
<a class="skip" href="#content">Skip to the page</a>
<div class="app">${navigation(options.pages, options.current, options.badges ?? {}, options.target?.available?.length === 0)}
  <div class="main">${topbar(page, options.target, options.current)}
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
/*
   The application every page below is scoped to, decided server-side.

   A constant rather than a lookup, because it is the same answer the top bar
   was rendered from — a page reading it out of its own control was how four
   pages managed to disagree with the bar and with each other.
*/
const TARGET_NAME = ${JSON.stringify(options.target?.name ?? '')};
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

/*
   Show the first few of a queue, and a button for the rest.

   For a list somebody works through rather than scans — triage clusters, the
   defects that would be filed. Those are not capped and scrolled the way the
   Cases lists are: you read one, act on it, and move to the next, and doing
   that inside a 24rem box is worse than doing it on a long page.

   What a long page actually costs is the sections after it. Measured at 60
   clusters, Triage was 22 screens with "Passed on retry" and "Quarantine"
   below all of them, and Publish was 12.7 with the whole Jira section sitting
   past 7605px of defect cards.

   Everything is rendered and the overflow is hidden, rather than the rest
   being left unrendered. Publish decides what to file by reading
   the checkbox of every defect in the preview — a row that does not exist
   would throw on send, and a row that exists but was never scrolled to still
   carries the recommendation the preview computed. What gets filed must not
   depend on how far somebody scrolled.
*/
function showFirst(container, selector, limit, noun, onShowAll) {
  const rows = Array.from(container.querySelectorAll(selector));
  const rest = rows.slice(limit);
  if (rest.length === 0) return;
  for (const row of rest) row.hidden = true;

  const more = document.createElement('button');
  more.className = 'secondary';
  more.textContent = 'Show the other ' + rest.length + ' ' + noun;
  more.onclick = () => {
    for (const row of rest) row.hidden = false;
    more.remove();
    /*
       For a page that redraws itself. Triage and Publish render once and the
       unhiding above is the whole answer; Runs redraws twice a second off its
       event stream, so without somewhere for the decision to live it is undone
       before anybody can read what they asked to see.
    */
    if (onShowAll) onShowAll();
  };
  container.append(more);
}

/*
   The application switcher.

   It reloads rather than re-rendering. Every page here is a whole document
   already, the selection changes what the server puts in all of them —
   masthead, badges, page body — and a partial update would be a second
   rendering path to keep in step with the first. The cost is one navigation of
   a local page.
*/
(function () {
  const pick = $('ctxTarget');
  if (!pick) return;
  pick.onchange = async () => {
    pick.disabled = true;
    try {
      await post('/api/select', { target: pick.value });
      location.reload();
    } catch (error) {
      /*
         Say it in the bar rather than silently reverting. A switcher that
         snaps back with no explanation reads as the click not registering,
         which is how somebody clicks it four more times.
      */
      pick.disabled = false;
      const note = el('span', 'ctx-why', error.message);
      pick.parentNode.append(note);
    }
  };
})();

/*
   The doctor's verdict, fetched rather than rendered — item 71.

   After load, and failing silently: deciding it reaches the secret store, and
   on a Vault target that is somebody else's server. A chip that does not
   arrive is a chip that does not arrive; a page that waits for one would be
   every navigation in the tool waiting on a network call.

   Parked outranks a count, because it says something different in kind: not
   "this needs attention" but "somebody decided this is not to be run", with a
   reason and a date. Before this existed, /runs offered to start a run against
   an application parked for answering HTTP 500 and said nothing at all.
*/
(function () {
  const chip = $('ctxHealth');
  if (!chip || !TARGET_NAME) return;

  post('/api/health', { target: TARGET_NAME })
    .then((health) => {
      // Where the finding is fixed, not always the profile page — item 75.
      if (health.fixAt) chip.href = health.fixAt;
      if (health.parked) {
        chip.dataset.state = 'parked';
        chip.textContent = 'parked';
        chip.title =
          health.parked.reason + ' — review by ' + health.parked.reviewBy;
      } else if (health.errors > 0) {
        chip.dataset.state = 'errors';
        chip.textContent = health.errors + ' to fix';
        chip.title = 'target:doctor reports ' + health.errors + ' blocking finding(s).';
      } else if (health.warnings > 0) {
        chip.dataset.state = 'warnings';
        chip.textContent = health.warnings + ' smell' + (health.warnings === 1 ? '' : 's');
        chip.title = 'target:doctor reports ' + health.warnings + ' warning(s).';
      } else {
        return; // Clean applications cost no pixels.
      }
      chip.hidden = false;
    })
    .catch(() => {
      /* A verdict nobody could reach is not a verdict to display. */
    });
})();

/*
   The theme control. The head has already applied the stored choice; this is
   the part that changes it, and it is here rather than in the head because
   nobody can press a button that has not been parsed yet.
*/
(function () {
  const buttons = Array.from(document.querySelectorAll('[data-theme-choice]'));

  const paint = (choice) => {
    for (const button of buttons) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.themeChoice === choice ? 'true' : 'false',
      );
    }
  };

  /** What is stored, not what is on screen: "auto" has no attribute to read. */
  const chosen = () => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (error) {
      /* Unreadable storage means the system preference is in charge. */
    }
    return 'auto';
  };

  for (const button of buttons) {
    button.onclick = () => {
      const choice = button.dataset.themeChoice;
      if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', choice);
      try {
        if (choice === 'auto') localStorage.removeItem('theme');
        else localStorage.setItem('theme', choice);
      } catch (error) {
        /* The choice still applies to this page; it just will not persist. */
      }
      paint(choice);
    };
  }

  paint(chosen());
})();

/*
   Remember a collapsed group somebody opened.

   Only the *opening* is stored, and only per group. A person who opens Set up
   to add an application and check its credentials should not have to open it
   again on the next page; a person who never opens it should never see it
   open. So there is no key until there is a choice, which is the same shape
   the theme control uses and for the same reason.

   A server-rendered open state wins where it is set — the current page being inside
   the group, or nothing being onboarded — because both are statements about
   this page rather than a preference, and a remembered "closed" must not hide
   the link saying where you are.
*/
(function () {
  const groups = document.querySelectorAll('details[data-nav-group]');
  for (const group of groups) {
    const key = 'nav-open:' + group.dataset.navGroup;
    try {
      if (localStorage.getItem(key) === 'yes') group.open = true;
    } catch (error) {
      /* Storage can be denied outright. The group still opens on a click. */
    }
    group.addEventListener('toggle', () => {
      try {
        if (group.open) localStorage.setItem(key, 'yes');
        else localStorage.removeItem(key);
      } catch (error) {
        /* The choice still applies to this page; it just will not persist. */
      }
    });
  }
})();
${page.script ?? ''}
</script>
</body>
</html>`;
}
