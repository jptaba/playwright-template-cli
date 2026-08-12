import type { DashboardPageContent } from './shell';

/**
 * The stories page — §08, phase 4.
 *
 * A Jira key goes in, drafted cases land in `cases/`, and that is where it
 * stops. The review is the git diff, which is why this page's job is to show
 * exactly what was written and what was refused rather than to offer an
 * approve button — a button that went from story to merged spec would be the
 * loop §09's conventions exist to prevent.
 *
 * Three things are shown that a terminal makes easy to scroll past: the
 * criteria with no case behind them, the cases quarantined for citing nothing,
 * and the cases the quality gate refused. The last of those is written
 * nowhere, so if this page does not show it in full, it is gone.
 */

const STYLES = `
  .stories { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .8rem; }
  .stories button {
    margin: 0; padding: .3rem .7rem; font-size: .82rem;
    background: var(--surface-2); color: var(--ink-2); border-color: var(--rule-strong);
  }
  .stories button[aria-pressed="true"] {
    background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent);
  }
  .stories .key {
    font-family: ui-monospace, Consolas, monospace; font-weight: 640; margin-right: .4rem;
  }

  .criteria { list-style: none; padding: 0; margin: .6rem 0 0; }
  .criteria li {
    display: grid; grid-template-columns: 3.5rem minmax(0, 1fr); gap: .6rem;
    padding: .3rem 0; border-top: 1px solid var(--rule); font-size: .9rem;
  }
  .criteria li:first-child { border-top: 0; }
  .criteria .ac {
    font-family: ui-monospace, Consolas, monospace; font-size: .74rem;
    color: var(--accent-ink); letter-spacing: .04em; padding-top: .15rem;
  }
  .criteria li.gap .ac { color: var(--fail); }
  .criteria .covered { display: block; color: var(--muted); font-size: .82rem; }

  .story-body {
    white-space: pre-wrap; font-size: .9rem; color: var(--ink-2);
    max-height: 14rem; overflow-y: auto; margin: .6rem 0 0;
    border-left: 2px solid var(--rule); padding-left: .9rem;
  }

  .draft { border-top: 1px solid var(--rule); padding: .85rem 0; }
  .draft:first-child { border-top: 0; }
  .draft .line { display: flex; align-items: baseline; gap: .55rem; flex-wrap: wrap; }
  .draft .dt { font-weight: 620; }
  .draft .cites {
    font-family: ui-monospace, Consolas, monospace; font-size: .72rem; color: var(--muted);
  }
  .draft .quote {
    font-size: .85rem; color: var(--ink-2); border-left: 2px solid var(--accent);
    padding-left: .8rem; margin: .4rem 0 0;
  }
  .draft .why {
    border-left: 2px solid var(--warn); background: var(--warn-soft);
    padding: .35rem .7rem; margin: .45rem 0 0; font-size: .85rem; border-radius: 0 4px 4px 0;
  }
  .draft .finding {
    border-left: 2px solid var(--fail); padding: .3rem .7rem; margin: .4rem 0 0; font-size: .85rem;
  }
  .draft .finding b {
    font-family: ui-monospace, Consolas, monospace; font-size: .78rem; font-weight: 640;
  }
  .draft .finding .fix { display: block; color: var(--muted); }

  .badge.written { color: var(--pass); background: var(--pass-soft); border-color: color-mix(in srgb, var(--pass) 25%, transparent); }
  .badge.quarantined { color: var(--accent-ink); background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .badge.rejected { color: var(--fail); background: var(--fail-soft); border-color: color-mix(in srgb, var(--fail) 25%, transparent); }

  details.yaml summary { font-size: .82rem; color: var(--muted); cursor: pointer; margin-top: .45rem; }
  details.yaml pre { max-height: 22rem; overflow: auto; }
  /* Added lines, because every line of a new case file is one. */
  details.yaml pre .add { color: var(--pass); }

  .counts-line { font-size: .92rem; color: var(--ink-2); margin: .9rem 0 0; }
  .counts-line b { color: var(--ink); font-weight: 640; }
  .counts-line .sep { color: var(--rule-strong); margin: 0 .5rem; }
  .empty { color: var(--muted); font-size: .9rem; padding: .4rem 0 .1rem; }
`;

const BODY = `
  <section>
    <div class="head">
      <h2>A story</h2>
      <span class="badge manual" id="sJira">checking Jira…</span>
    </div>
    <p class="explain">
      Stories are pulled once and kept in <code>stories/</code>, which is what makes a drafting run
      reproducible and gives the content hash somewhere to live. A story whose acceptance criteria
      cannot be identified is <b>refused here</b> rather than drafted from — a title and a paragraph
      of context is exactly what a model invents against.
    </p>
    <label for="sKey">Read a story from Jira <small>an issue key, like FIN-2210</small></label>
    <input type="text" id="sKey" placeholder="FIN-2210" autocomplete="off">
    <button id="sPull">Read it</button>
    <div class="status" id="sPullStatus"></div>
    <div class="stories" id="sList"></div>
  </section>

  <section id="sStory" hidden>
    <div class="head">
      <h2 id="sSummary">The story</h2>
      <span class="badge manual" id="sHash"></span>
    </div>
    <div class="story-body" id="sDescription"></div>
    <h3 style="font-size:.9rem;margin:1.2rem 0 0">Acceptance criteria</h3>
    <ul class="criteria" id="sCriteria"></ul>
    <div class="status" id="sDrafted"></div>
  </section>

  <section id="sDraft" hidden>
    <div class="head"><h2>Draft cases from it</h2></div>
    <p class="explain">
      The case author sees requirement text and nothing else — no browser, no tools, no filesystem.
      A model shown the running application writes cases describing what the application currently
      does, and those pass on a broken build. Every draft is checked afterwards for a criterion
      cited and quoted <b>verbatim</b>, because a model cannot be trusted to enforce its own
      citation rules.
    </p>
    <label for="sTarget">Application</label>
    <select id="sTarget"></select>
    <button id="sDraftGo">Draft cases and write them to cases/</button>
    <div class="status" id="sDraftStatus"></div>
    <p class="counts-line" id="sCounts"></p>
  </section>

  <section id="sReview" hidden>
    <div class="head">
      <h2>What was written</h2>
      <span class="badge auto" id="rCount">0</span>
    </div>
    <p class="explain">
      Nothing has been published and nothing has been committed. Review these as a diff —
      <code>git diff</code> — then merge, then <code>npm run cases:push -- --dry-run</code> before
      anything reaches PractiTest.
    </p>
    <div id="rList"></div>
  </section>

  <section id="sRefused" hidden>
    <div class="head">
      <h2>Quarantined and refused</h2>
      <span class="badge manual" id="xCount">0</span>
    </div>
    <p class="explain">
      Quarantined cases cited no criterion, or quoted one that is not in the story — a paraphrase is
      how a requirement quietly changes meaning. They are written to <code>speculative-</code>
      files and never published unexamined. Cases the quality gate refused are <b>not written at
      all</b>, so they are shown here in full.
    </p>
    <div id="xList"></div>
  </section>
`;

const SCRIPT = `
let stories = [];
let current = null;

async function refreshStories(keepSelection) {
  const data = await post('/api/stories', {});
  stories = data.stories;

  const jira = $('sJira');
  jira.textContent = data.jira.configured ? 'Jira configured' : 'Jira not configured';
  jira.className = 'badge ' + (data.jira.configured ? 'auto' : 'locked');
  $('sPull').disabled = !data.jira.configured;
  if (!data.jira.configured && data.jira.reason) {
    $('sPullStatus').className = 'status';
    $('sPullStatus').textContent = data.jira.reason;
  }

  const select = $('sTarget');
  select.replaceChildren();
  for (const target of data.targets) {
    const option = document.createElement('option');
    option.value = target;
    option.textContent = target;
    select.append(option);
  }
  $('sDraftGo').disabled = data.targets.length === 0;

  const list = $('sList');
  list.replaceChildren();
  if (stories.length === 0) {
    list.append(el('div', 'empty', 'No stories pulled yet.'));
  }
  for (const story of stories) {
    const button = el('button');
    button.append(el('span', 'key', story.key), text(story.summary));
    button.setAttribute('aria-pressed', String(current === story.key));
    button.onclick = () => show(story.key);
    list.append(button);
  }

  if (keepSelection && current) show(current);
}

function show(key) {
  const story = stories.find((candidate) => candidate.key === key);
  if (!story) return;
  current = key;

  $('sStory').hidden = false;
  $('sDraft').hidden = false;
  // A review belongs to the story it was drafted from. Leaving it on screen
  // under a different story's heading is how somebody reads the wrong answer.
  $('sReview').hidden = true;
  $('sRefused').hidden = true;
  $('sCounts').replaceChildren();
  $('sSummary').textContent = story.key + ' · ' + story.summary;
  $('sHash').textContent = story.contentHash;
  $('sDescription').textContent = story.description || '(no description)';

  const criteria = $('sCriteria');
  criteria.replaceChildren();
  for (const criterion of story.criteria) {
    const item = document.createElement('li');
    item.append(el('span', 'ac', criterion.id), el('span', '', criterion.text));
    criteria.append(item);
  }

  const drafted = $('sDrafted');
  drafted.replaceChildren();
  if (story.drafted.length) {
    drafted.append(
      text(story.drafted.length + ' case(s) already in cases/ from this story. '),
      text('Drafting again rewrites the ones whose titles match.'),
    );
  }

  for (const button of $('sList').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.textContent.startsWith(key)));
  }
}

$('sPull').onclick = async () => {
  const status = $('sPullStatus');
  status.className = 'status';
  status.textContent = 'Reading…';
  $('sPull').disabled = true;
  try {
    const result = await post('/api/stories/pull', { key: $('sKey').value.trim() });
    current = result.story.key;
    status.replaceChildren(el('span', 'found', 'Wrote ' + result.file + '.'));
    await refreshStories(true);
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('sPull').disabled = false;
  }
};

function draftRow(entry) {
  const item = el('div', 'draft');

  const line = el('div', 'line');
  line.append(el('span', 'dt', entry.title));
  line.append(el('span', 'badge ' + entry.status, entry.status));
  if (entry.replaced) line.append(el('span', 'badge locked', 'replaced'));
  if (entry.coversAC.length) line.append(el('span', 'cites', entry.coversAC.join(', ')));
  item.append(line);

  if (entry.acQuoted) item.append(el('div', 'quote', '“' + entry.acQuoted + '”'));
  if (entry.reason) item.append(el('div', 'why', entry.reason));

  if (entry.gate && entry.gate.findings.length) {
    for (const finding of entry.gate.findings) {
      const box = el('div', 'finding');
      box.append(el('b', '', finding.check), text(' ' + finding.detail));
      box.append(el('span', 'fix', '→ ' + finding.remedy));
      item.append(box);
    }
  }

  if (entry.file) item.append(yamlDetails(entry));
  return item;
}

function yamlDetails(entry) {
  const box = document.createElement('details');
  box.className = 'yaml';
  const summary = document.createElement('summary');
  summary.textContent = (entry.replaced ? 'Replaced ' : 'Added ') + entry.file;
  box.append(summary);

  const pre = document.createElement('pre');
  for (const raw of entry.yaml.split('\\n')) {
    const row = el('span', 'add', '+ ' + raw);
    pre.append(row, text('\\n'));
  }
  box.append(pre);
  return box;
}

$('sDraftGo').onclick = async () => {
  const status = $('sDraftStatus');
  status.className = 'status';
  status.textContent = 'Drafting… this calls the model and takes a few seconds.';
  $('sDraftGo').disabled = true;
  try {
    const review = await post('/api/stories/draft', { key: current, target: $('sTarget').value });
    status.textContent = '';
    /*
       Refresh first, then render. show() rebuilds the criteria list from the
       story, so refreshing afterwards silently wiped every coverage mark the
       review had just put on it — the list looked right and said nothing.
    */
    await refreshStories(true);
    renderReview(review);
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('sDraftGo').disabled = false;
  }
};

function renderReview(review) {
  const counts = review.counts;
  const line = $('sCounts');
  line.replaceChildren();
  const stat = (value, label) => {
    if (line.childNodes.length) line.append(el('span', 'sep', '·'));
    line.append(el('b', '', String(value)), text(' ' + label));
  };
  stat(counts.drafted, 'drafted by ' + review.model);
  stat(counts.written, 'written');
  if (counts.replaced) stat(counts.replaced, 'replaced');
  stat(counts.quarantined, 'quarantined');
  stat(counts.rejected, 'refused by the gate');
  if (review.usage) {
    const cost = review.usage.estimatedCost;
    line.append(el('span', 'sep', '·'));
    line.append(
      text(review.usage.inputTokens + ' in, ' + review.usage.outputTokens + ' out'),
      text(cost === null ? '' : ' — about $' + cost.toFixed(4)),
    );
  }

  /*
     The criteria nobody drafted a case for — the number a reviewer cannot get
     by reading a list of cases that all look reasonable.

     Coverage is computed over the cases that cited a criterion, which is one
     step before the quality gate. So a criterion can be "covered" by a case
     that was then refused and written nowhere, and reporting that as covered
     would overstate the result at exactly the point somebody stops reading.
     Both are marked as gaps here; only the wording differs.
  */
  const writtenTitles = new Set(
    review.cases.filter((entry) => entry.status === 'written').map((entry) => entry.title),
  );
  const criteria = $('sCriteria');
  criteria.replaceChildren();
  for (const criterion of review.coverage.criteria) {
    const item = document.createElement('li');
    const covered = criterion.caseTitles.filter((title) => writtenTitles.has(title));
    if (covered.length === 0) item.className = 'gap';

    const body = el('span');
    body.append(text(criterion.text));
    for (const title of criterion.caseTitles) {
      const mark = writtenTitles.has(title) ? '· ' : '· refused: ';
      body.append(el('span', 'covered', mark + title));
    }
    if (criterion.caseTitles.length === 0) {
      body.append(el('span', 'covered', 'no case covers this criterion'));
    } else if (covered.length === 0) {
      body.append(el('span', 'covered', 'every case covering this one was refused, so nothing was written for it'));
    }
    item.append(el('span', 'ac', criterion.id), body);
    criteria.append(item);
  }

  const written = review.cases.filter((entry) => entry.status === 'written');
  const refused = review.cases.filter((entry) => entry.status !== 'written');

  $('sReview').hidden = false;
  $('sRefused').hidden = refused.length === 0;
  $('rCount').textContent = String(written.length);
  $('xCount').textContent = String(refused.length);

  const fill = (id, rows, message) => {
    const box = $(id);
    box.replaceChildren();
    if (rows.length === 0) box.append(el('div', 'empty', message));
    for (const row of rows) box.append(draftRow(row));
  };
  fill('rList', written, 'Nothing was written.');
  fill('xList', refused, 'Nothing was quarantined or refused.');
}

refreshStories(false).catch((error) => {
  $('sPullStatus').className = 'status error';
  $('sPullStatus').textContent = error.message;
});
`;

export function storiesPageContent(): DashboardPageContent {
  return {
    title: 'Stories',
    eyebrow: 'Stories',
    heading: 'A story, and the cases it will admit to',
    lede:
      'Track A, with the two mechanical guards visible rather than promised: every case cites a ' +
      'criterion and quotes it verbatim, and every criterion is checked for a case behind it. ' +
      'It writes files and stops — a person and git stay in the loop.',
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
