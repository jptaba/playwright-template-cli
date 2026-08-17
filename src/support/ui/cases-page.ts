import type { DashboardPageContent } from './shell';

/**
 * The cases page — §08, phase 3.
 *
 * Two lists, and the second one is the reason this page exists. *Cases with no
 * spec* is a backlog, and a team knows roughly what is in it. *Specs citing a
 * case that is not there* is the one nobody has: the spec runs, passes, and
 * posts its result against an id that will never reconcile, and nothing in the
 * pipeline notices — `require-case-id` checks that an annotation is present,
 * not that it points at something real.
 *
 * Everything here is read from the repository at the moment it is asked for.
 * There is no run, no history and nothing stored: cases are files and specs are
 * files, so the answer is always current and never needs invalidating.
 */

const STYLES = `
  .counts-line {
    font-size: .92rem; color: var(--ink-2); font-variant-numeric: tabular-nums;
    margin: .9rem 0 0;
  }
  .counts-line b { color: var(--ink); font-weight: 640; }
  .counts-line .sep { color: var(--rule-strong); margin: 0 .5rem; }

  .case { border-top: 1px solid var(--rule); padding: .7rem 0 .75rem; }
  .case:first-child { border-top: 0; padding-top: .2rem; }
  .case .line { display: flex; align-items: baseline; gap: .55rem; flex-wrap: wrap; }
  .case .cid {
    font-family: ui-monospace, Consolas, monospace; font-size: .72rem;
    color: var(--muted); letter-spacing: .04em;
  }
  .case .ct { font-weight: 620; }
  .case .paths {
    font-family: ui-monospace, Consolas, monospace; font-size: .75rem;
    color: var(--muted); margin-top: .2rem; overflow-wrap: anywhere;
  }
  .case .paths .arrow { color: var(--rule-strong); padding: 0 .35rem; }
  .case .paths .how { font-style: italic; }
  .case .why {
    border-left: 2px solid var(--warn); background: var(--warn-soft);
    padding: .35rem .7rem; margin: .45rem 0 0; font-size: .85rem; border-radius: 0 4px 4px 0;
  }

  .badge.stale {
    color: var(--fail); background: var(--fail-soft);
    border-color: color-mix(in srgb, var(--fail) 25%, transparent);
  }

  details.gate { margin-top: .4rem; }
  details.gate summary { font-size: .82rem; color: var(--muted); cursor: pointer; }
  details.gate .finding {
    border-left: 2px solid var(--rule-strong); padding: .3rem .7rem;
    margin: .4rem 0 0; font-size: .85rem;
  }
  details.gate .finding.blocker { border-color: var(--fail); }
  details.gate .finding b {
    font-family: ui-monospace, Consolas, monospace; font-size: .78rem; font-weight: 640;
  }
  details.gate .finding .fix { display: block; color: var(--muted); }

  .empty { color: var(--muted); font-size: .9rem; padding: .4rem 0 .1rem; }
`;

const BODY = `
  <section>
    <div class="head">
      <h2>Coverage</h2>
      <span class="badge manual" id="cScope">every application</span>
    </div>
    <p class="explain">
      Read from the repository as it stands, not from a run.
    </p>
    <details class="more">
      <summary>What counts as covered here</summary>
      <div class="body">
        <p>Cases are files under <code>cases/</code>, specs are files under a pack's
        <code>tests/</code>, and the link between them is the annotation the spec carries.</p>
        <p>Nothing here comes from a run: a case with a passing spec and a case with a spec nobody
        has run yet are the same answer to <b>is this automated</b>.</p>
      </div>
    </details>
    <p class="counts-line" id="cCounts"></p>
    <div class="status" id="cStatus"></div>
  </section>

  <section id="cNothing" hidden>
    <div class="head"><h2>No cases in the repository yet</h2></div>
    <p class="explain">
      <code>cases:pull</code> brings a PractiTest set in; <code>cases:author</code> writes them
      from a story. Either way they arrive as files, reviewed as a diff.
    </p>
    <details class="more">
      <summary>Why nothing below is flagged as wrong yet</summary>
      <div class="body">
        <p>Until something lands in <code>cases/</code>, every spec in the repository cites a case
        this page cannot see — and calling those specs wrong would be the report's own gap
        talking.</p>
      </div>
    </details>
  </section>

  <section id="cUncovered">
    <div class="head">
      <h2>Cases with no spec</h2>
      <span class="badge manual" id="uCount">0</span>
    </div>
    <p class="explain">
      Somebody decided each of these was worth testing, and no spec covers it yet.
    </p>
    <details class="more">
      <summary>Why some of these have no spec</summary>
      <div class="body">
        <p>Usually the quality gate is unhappy with the case itself: one a machine cannot
        automate is generally one a person could not follow either.</p>
      </div>
    </details>
    <div id="uList"></div>
  </section>

  <section id="cOrphans">
    <div class="head">
      <h2>Specs citing a case that is not there</h2>
      <span class="badge manual" id="oCount">0</span>
    </div>
    <p class="explain">
      Each of these reports a result against an id that matches nothing — a missing case, or a
      typo in the annotation.
    </p>
    <details class="more">
      <summary>Why this is worse than a failure</summary>
      <div class="body">
        <p>Both look exactly like a passing test until somebody reconciles the numbers, which is
        usually a quarter later and usually not the person who wrote it.</p>
      </div>
    </details>
    <div id="oList"></div>
  </section>

  <section id="cAutomated">
    <div class="head">
      <h2>Cases with a spec</h2>
      <span class="badge auto" id="aCount">0</span>
    </div>
    <p class="explain">
      Drifted ones first: the spec was written against a version of the case that has since been
      edited, so it now proves something the case no longer says.
    </p>
    <div id="aList"></div>
  </section>
`;

const SCRIPT = `
let report = null;

const plural = (value, one, many) => (value === 1 ? one : many);

const STATUS_BADGE = { automated: 'auto', drifted: 'stale', 'no-spec': 'manual' };
const STATUS_LABEL = { automated: 'automated', drifted: 'drifted', 'no-spec': 'no spec' };
const MATCH_LABEL = {
  'case-file': 'matched by case file',
  'case-id': 'matched by case id',
  'spec-path': 'matched by the case naming the spec',
};

/*
   This page had its own application picker with an "Every application" option
   at the top. The bar above chooses now — and "none selected" *is* that
   option here, which is why this page needs no empty state: coverage across
   every application in the repository is a real and useful answer, and it is
   the one nothing-selected already gives.
*/

async function load() {
  const status = $('cStatus');
  status.className = 'status';
  status.textContent = 'Reading…';
  try {
    report = await post('/api/cases', { target: TARGET_NAME });
    status.textContent = '';
    render();
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
}

function caseRow(row) {
  const item = el('div', 'case');

  const line = el('div', 'line');
  line.append(el('span', 'cid', row.id ? '#' + row.id : 'unpublished'));
  line.append(el('span', 'ct', row.title));
  line.append(el('span', 'badge ' + STATUS_BADGE[row.status], STATUS_LABEL[row.status]));
  item.append(line);

  const paths = el('div', 'paths');
  paths.append(text(row.file));
  for (const spec of row.specs) {
    paths.append(el('span', 'arrow', '→'));
    paths.append(text(spec));
  }
  if (row.matchedBy) {
    paths.append(el('span', 'arrow', '·'));
    paths.append(el('span', 'how', MATCH_LABEL[row.matchedBy]));
  }
  item.append(paths);

  if (row.note) item.append(el('div', 'why', row.note));
  if (row.gate.findings.length) item.append(gateDetails(row.gate));

  return item;
}

function gateDetails(gate) {
  const box = document.createElement('details');
  box.className = 'gate';
  const summary = document.createElement('summary');
  const blockers = gate.findings.filter((finding) => finding.severity === 'blocker').length;
  summary.textContent = gate.passed
    ? gate.findings.length + plural(gate.findings.length, ' gate warning', ' gate warnings') +
      ' — score ' + gate.score
    : blockers + plural(blockers, ' blocker', ' blockers') +
      ' at the quality gate — score ' + gate.score;
  box.append(summary);

  for (const finding of gate.findings) {
    const entry = el('div', 'finding ' + finding.severity);
    entry.append(el('b', '', finding.check), text(' ' + finding.detail));
    entry.append(el('span', 'fix', '→ ' + finding.remedy));
    box.append(entry);
  }
  return box;
}

function orphanRow(orphan) {
  const item = el('div', 'case');
  const line = el('div', 'line');
  line.append(el('span', 'ct', orphan.title || '(untitled test)'));
  line.append(el('span', 'badge stale', 'cites ' + orphan.citedAs + ' ' + orphan.cites));
  item.append(line);
  item.append(el('div', 'paths', orphan.file));
  return item;
}

function fill(id, rows, emptyMessage) {
  const box = $(id);
  box.replaceChildren();
  if (rows.length === 0) {
    box.append(el('div', 'empty', emptyMessage));
    box.className = '';
    return;
  }
  /*
     How long these get is a property of the repository, not of the page: on a
     real one this page came to 7.3 screens, and the last section was found by
     scrolling past two lists nobody had asked to read in full. Capped and
     scrolled only when there is something to scroll, so a one-row answer does
     not sit in a box built for forty.
  */
  box.className = rows.length > 6 ? 'longlist' : '';
  for (const row of rows) box.append(row);
}

function render() {
  const counts = report.counts;
  const chosen = TARGET_NAME;
  $('cScope').textContent = chosen || 'every application';

  /*
     With nothing in cases/, every spec cites a case this cannot see. Listing
     them all as wrong would be the report's own gap talking, so the empty
     state says which it is instead — and the count of them goes with the
     list, because a page cannot say "nothing to compare against" beside the
     number of specs it just judged.
  */
  const bare = counts.cases === 0;

  const line = $('cCounts');
  line.replaceChildren();
  const stat = (value, label) => {
    if (line.childNodes.length) line.append(el('span', 'sep', '·'));
    line.append(el('b', '', String(value)), text(' ' + label));
  };
  stat(counts.cases, plural(counts.cases, 'case', 'cases'));
  if (!bare) {
    stat(counts.automated, 'automated');
    if (counts.drifted) stat(counts.drifted, 'drifted');
    stat(counts.noSpec, 'with no spec');
    stat(
      counts.orphans,
      plural(counts.orphans, 'spec citing a case', 'specs citing a case') + ' that is not there',
    );
  }
  stat(counts.specs, plural(counts.specs, 'spec read', 'specs read'));

  $('cNothing').hidden = !bare;
  for (const id of ['cUncovered', 'cOrphans', 'cAutomated']) $(id).hidden = bare;
  if (bare) return;

  const uncovered = report.cases.filter((row) => row.status === 'no-spec');
  const automated = report.cases
    .filter((row) => row.status !== 'no-spec')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'drifted' ? -1 : 1));

  $('uCount').textContent = String(uncovered.length);
  $('oCount').textContent = String(report.orphans.length);
  $('aCount').textContent = String(automated.length);

  fill('uList', uncovered.map(caseRow), 'Every case has a spec.');
  fill('oList', report.orphans.map(orphanRow), 'Every spec cites a case that exists.');
  fill('aList', automated.map(caseRow), 'Nothing is automated yet.');
}


load().catch((error) => {
  $('cStatus').className = 'status error';
  $('cStatus').textContent = error.message;
});
`;

export function casesPageContent(): DashboardPageContent {
  return {
    title: 'Cases',
    eyebrow: 'Cases',
    heading: 'What is covered, and what only looks it',
    lede:
      'Which test cases have a spec, which do not, and which specs cite a case that is not ' +
      'there.',
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
