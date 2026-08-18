import type { DashboardPageContent } from './shell';

/**
 * The publish page — §08 phase 6, §14, §15.
 *
 * Everything else here writes into the repository, where a mistake is undone
 * with `git checkout`. This sends to systems other teams read, and nothing
 * undoes that. So it is built like offboarding rather than like the rest: what
 * will be sent is shown in full first, and the run's own id has to be typed
 * back before either button does anything.
 *
 * The page shows the payload, not a summary of the payload. A preview that
 * paraphrases what is about to be sent is a preview of something else.
 */

const STYLES = `
  .dest { display: flex; gap: .5rem; flex-wrap: wrap; align-items: baseline; }
  .dest .where {
    font-family: ui-monospace, Consolas, monospace; font-size: .76rem; color: var(--muted);
  }

  .results { display: grid; gap: 0; max-height: 24rem; overflow-y: auto; margin-top: .8rem; }
  /* One per line, because it is a list. It used to be a joined sentence. */
  .skipped-spec {
    font-size: .82rem; color: var(--ink-2);
    padding: .18rem 0; border-top: 1px solid var(--rule);
  }
  .skipped-spec:first-child { border-top: 0; }
  .result {
    display: grid; grid-template-columns: 5rem 5.5rem 4rem minmax(0, 1fr); gap: .6rem;
    font-size: .84rem; padding: .28rem 0; border-top: 1px solid var(--rule); align-items: baseline;
  }
  .result:first-child { border-top: 0; }
  .result .cid { font-family: ui-monospace, Consolas, monospace; font-size: .76rem; }
  .result .out {
    color: var(--muted); font-size: .78rem; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .result .num { font-variant-numeric: tabular-nums; color: var(--muted); text-align: right; }
  .st-PASSED { color: var(--pass); font-weight: 620; }
  .st-FAILED { color: var(--fail); font-weight: 620; }
  .st-NO { color: var(--muted); }

  .defect { border-top: 1px solid var(--rule); padding: .75rem 0; }
  .defect:first-child { border-top: 0; }
  .defect .line { display: flex; align-items: baseline; gap: .55rem; flex-wrap: wrap; }
  .defect .sum { font-weight: 620; overflow-wrap: anywhere; }
  .defect .fp { font-family: ui-monospace, Consolas, monospace; font-size: .72rem; color: var(--muted); }
  .defect.blocked { opacity: .72; }
  .defect .why {
    border-left: 2px solid var(--warn); background: var(--warn-soft);
    padding: .35rem .7rem; margin: .4rem 0 0; font-size: .85rem; border-radius: 0 4px 4px 0;
    max-width: 68ch;
  }
  .defect details summary { font-size: .82rem; color: var(--muted); cursor: pointer; margin-top: .4rem; }
  .defect pre { max-height: 20rem; overflow: auto; white-space: pre-wrap; }

  .badge.create { color: var(--pass); background: var(--pass-soft); border-color: color-mix(in srgb, var(--pass) 25%, transparent); }
  .badge.comment { color: var(--accent-ink); background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .badge.reopen { color: var(--fail); background: var(--fail-soft); border-color: color-mix(in srgb, var(--fail) 25%, transparent); }

  .confirm {
    border: 1px solid var(--rule-strong); border-radius: 6px; padding: .9rem 1rem;
    margin-top: 1.1rem; background: var(--surface-2);
  }
  .confirm label { margin-top: 0; }
  .confirm .row { display: flex; gap: .6rem; align-items: flex-end; flex-wrap: wrap; }
  .confirm .row > div { flex: 1 1 16rem; min-width: 0; }
  .confirm button { margin-top: 0; }

  .sent {
    border-left: 2px solid var(--pass); background: var(--pass-soft);
    padding: .45rem .8rem; margin: .5rem 0 0; font-size: .87rem; border-radius: 0 4px 4px 0;
  }
  .sent.bad { border-color: var(--fail); background: var(--fail-soft); }
  .sent .k { font-family: ui-monospace, Consolas, monospace; font-weight: 640; }

  .counts-line { font-size: .92rem; color: var(--ink-2); margin: .9rem 0 0; }
  .counts-line b { color: var(--ink); font-weight: 640; }
  .counts-line .sep { color: var(--muted); margin: 0 .5rem; }
  .empty { color: var(--muted); font-size: .9rem; padding: .4rem 0 .1rem; }
`;

const BODY = `
  <section>
    <div class="head">
      <h2>A run</h2>
      <span class="badge manual" id="pRunBadge">—</span>
    </div>
    <p class="explain">
      Pick the run to publish.
    </p>
    <details class="more">
      <summary>Why this page asks twice</summary>
      <div class="body">
        <p>Everything else here writes into the repository, where a mistake is undone with
        <code>git checkout</code>.</p>
        <p>Results posted against somebody's test cases, and tickets opened in their project, are
        read by other teams and stay read. So both actions show the exact payload first, and both
        need the run's own id typed back.</p>
      </div>
    </details>
    <label for="pRun">Run</label>
    <select id="pRun"></select>
    <div class="dest" id="pDest"></div>
    <div class="status" id="pStatus"></div>
  </section>

  <section id="pResults">
    <div class="head">
      <h2>Results → PractiTest</h2>
      <span class="badge manual" id="rCount">0</span>
    </div>
    <p class="explain">
      One post for the whole run, exactly as the merge job sends it.
    </p>
    <details class="more">
      <summary>What happens to an id PractiTest cannot resolve</summary>
      <div class="body">
        <p>It is reported loudly and skipped. It never fails anything — a publish step that fails
        the build over a stale id teaches people to stop publishing.</p>
        <p>The payload below is built by the same code the merge job uses, so it is the payload
        rather than a description of one.</p>
      </div>
    </details>
    <div class="results" id="rList"></div>
    <div id="rSkipped"></div>
    <div class="confirm">
      <div class="row">
        <div>
          <label for="rConfirm">Type the run id to confirm <small>this cannot be undone</small></label>
          <input type="text" id="rConfirm" autocomplete="off" placeholder="run id">
        </div>
        <button id="rSend" class="destructive">Post results</button>
      </div>
      <div class="status" id="rStatus"></div>
      <div id="rSent"></div>
    </div>
  </section>

  <section id="pDefects">
    <div class="head">
      <h2>Defects → Jira</h2>
      <span class="badge manual" id="dCount">0</span>
    </div>
    <p class="explain">
      One ticket per <b>cluster</b>, never per test. A cluster nobody has triaged cannot be filed.
    </p>
    <details class="more">
      <summary>Why a human verdict is required first</summary>
      <div class="body">
        <p>An automated filer pointed at a broken environment can open hundreds of tickets in a
        night. Requiring a verdict is what stops it.</p>
        <p>Tickets are deduplicated on the fingerprint, so a second run comments on the existing
        ticket rather than opening another.</p>
      </div>
    </details>
    <div id="dList"></div>
    <div class="confirm">
      <div class="row">
        <div>
          <label for="dConfirm">Type the run id to confirm <small>tickets are visible to other teams</small></label>
          <input type="text" id="dConfirm" autocomplete="off" placeholder="run id">
        </div>
        <button id="dSend" class="destructive">File the selected defects</button>
      </div>
      <div class="status" id="dStatus"></div>
      <div id="dSent"></div>
    </div>
  </section>
`;

const SCRIPT = `
let preview = null;

/*
   How many defect cards a bad night puts on the page before asking. The count
   beside the heading is still the total, and every card is in the DOM whether
   or not it is on screen — see the note where this is used.
*/
const FIRST_DEFECTS = 10;

async function loadRuns() {
  const { runs } = await post('/api/publish/runs', {});
  const select = $('pRun');
  select.replaceChildren();
  for (const run of runs) {
    const option = document.createElement('option');
    option.value = run.id;
    option.textContent =
      run.id + ' · ' + run.target + ' · ' + run.failures + ' failed · ' + run.finishedAt.slice(0, 16).replace('T', ' ');
    select.append(option);
  }
  if (runs.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'no run models on disk';
    option.disabled = true;
    select.append(option);
    $('pStatus').textContent = 'Nothing to publish. Start a run first.';
    return false;
  }
  return true;
}

function destination(status, name) {
  const badge = el('span', 'badge ' + (status.configured ? 'auto' : 'locked'), name);
  const wrap = el('span', 'dest');
  wrap.append(badge);
  if (status.destination) wrap.append(el('span', 'where', status.destination));
  else if (status.reason) wrap.append(el('span', 'where', status.reason));
  return wrap;
}

async function load() {
  const status = $('pStatus');
  status.className = 'status';
  status.textContent = 'Reading…';
  try {
    preview = await post('/api/publish/preview', { runId: $('pRun').value });
    status.textContent = '';
    render();
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
}

function renderResults() {
  const results = preview.results.results;
  $('rCount').textContent = String(results.length);

  const list = $('rList');
  list.replaceChildren();
  if (results.length === 0) {
    list.append(el('div', 'empty', 'No test in this run carries a case id, so there is nothing to post.'));
  }
  for (const result of results) {
    const row = el('div', 'result');
    row.append(el('span', 'cid', result.caseDisplayId));
    row.append(el('span', 'st-' + result.status.split(' ')[0], result.status));
    row.append(el('span', 'num', result.durationSeconds + 's'));
    row.append(el('span', 'out', (result.actualResult || '').split('\\n')[0]));
    list.append(row);
  }

  const skipped = $('rSkipped');
  skipped.replaceChildren();
  const missing = preview.results.unreportable.filter((entry) =>
    entry.reason.indexOf('no practitest annotation') >= 0,
  );
  if (missing.length) {
    /*
       The count is the fact; the titles are the evidence for it.

       Both used to be one text node — every title joined with "; " into a
       single sentence. On a real run that was 192 of them and 3660px tall,
       most of this page's height, and unreadable as a sentence because it is
       not one: it is a list. The number somebody acts on was the first eight
       words of it.
    */
    const box = el('div', 'note');
    box.append(
      text(
        missing.length + ' spec(s) carry no case id, so nothing is posted for them — and they ' +
          'are invisible in the coverage view too.',
      ),
    );

    const disclosure = document.createElement('details');
    disclosure.className = 'more';
    const summary = document.createElement('summary');
    summary.textContent = 'Which ' + missing.length + ' spec(s)';
    disclosure.append(summary);
    const list = el('div', 'body longlist');
    for (const entry of missing) list.append(el('div', 'skipped-spec', entry.title));
    disclosure.append(list);
    box.append(disclosure);

    skipped.append(box);
  }
  $('rSend').disabled = results.length === 0 || !preview.practitest.configured;
}

function defectRow(entry) {
  const item = el('div', 'defect' + (entry.blocked ? ' blocked' : ''));

  const line = el('div', 'line');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.id = 'd-' + entry.clusterId;
  check.checked = !entry.blocked && entry.recommended;
  check.disabled = Boolean(entry.blocked);
  line.append(check);
  line.append(el('span', 'sum', entry.summary));
  line.append(el('span', 'badge ' + entry.action, entry.action));
  if (entry.existing) line.append(el('span', 'fp', entry.existing.key + ' · ' + entry.existing.status));
  line.append(el('span', 'fp', 'fingerprint ' + entry.fingerprint));
  item.append(line);

  if (entry.blocked) item.append(el('div', 'why', entry.blocked));

  const box = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'The exact payload — ' + entry.tests.length + ' test(s), labels: ' + entry.labels.join(', ');
  const pre = document.createElement('pre');
  pre.textContent = entry.description;
  box.append(summary, pre);
  item.append(box);

  return item;
}

function renderDefects() {
  const defects = preview.defects;
  $('dCount').textContent = String(defects.length);

  const list = $('dList');
  list.replaceChildren();
  if (!preview.jira.configured) {
    list.append(el('div', 'empty', preview.jira.reason || 'Jira is not configured.'));
  } else if (defects.length === 0) {
    list.append(el('div', 'empty', 'Nothing failed in this run, so there is nothing to file.'));
  }
  for (const entry of defects) list.append(defectRow(entry));
  /*
     Every row is rendered and the overflow is hidden, never left unrendered:
     the send below reads the checkbox of every defect in the preview, so a row
     that does not exist would throw, and one that exists but was never
     scrolled to still carries the recommendation the preview computed.
  */
  showFirst(list, '.defect', FIRST_DEFECTS, 'defect(s)');

  $('dSend').disabled = !preview.jira.configured || defects.every((entry) => entry.blocked);
}

function render() {
  const dest = $('pDest');
  dest.replaceChildren();
  dest.append(destination(preview.practitest, 'PractiTest'), destination(preview.jira, 'Jira'));
  $('pRunBadge').textContent = preview.target + ' · ' + preview.environment;
  $('rConfirm').placeholder = preview.runId;
  $('dConfirm').placeholder = preview.runId;
  $('rStatus').textContent = '';
  $('dStatus').textContent = '';
  // What was sent is not cleared here: filing defects re-previews, and wiping
  // "posted 6 results" a second later reads as though it had not happened. A
  // report belongs to the run it was made against, so changing run clears it.
  renderResults();
  renderDefects();
}

$('rSend').onclick = async () => {
  const status = $('rStatus');
  status.className = 'status';
  status.textContent = 'Posting…';
  $('rSend').disabled = true;
  try {
    const outcome = await post('/api/publish/results', {
      runId: preview.runId,
      confirm: $('rConfirm').value,
    });
    status.textContent = '';
    const box = el('div', 'sent' + (outcome.failed.length ? ' bad' : ''));
    box.append(text('Posted ' + outcome.posted + ' result(s) to ' + (outcome.destination || 'PractiTest') + '.'));
    if (outcome.unresolved.length) {
      box.append(text(' ' + outcome.unresolved.length + ' case id(s) could not be resolved: ' + outcome.unresolved.join(', ') + '.'));
    }
    if (outcome.failed.length) box.append(text(' ' + outcome.failed.length + ' failed to post.'));
    $('rSent').replaceChildren(box);
    $('rConfirm').value = '';
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('rSend').disabled = false;
  }
};

$('dSend').onclick = async () => {
  const status = $('dStatus');
  status.className = 'status';
  status.textContent = 'Filing…';
  $('dSend').disabled = true;
  try {
    const chosen = preview.defects
      .filter((entry) => !entry.blocked && $('d-' + entry.clusterId).checked)
      .map((entry) => entry.clusterId);
    const outcome = await post('/api/publish/defects', {
      runId: preview.runId,
      clusterIds: chosen,
      confirm: $('dConfirm').value,
    });
    status.textContent = '';
    $('dConfirm').value = '';
    /*
       Re-preview first, then report. render() clears this box, so filling it
       before reloading showed the outcome for about a second and then wiped
       it — the tickets were filed and the page looked like nothing happened.
       Reloading matters: it is what makes a second press comment on the
       ticket rather than open a twin.
    */
    await load();
    const box = $('dSent');
    box.replaceChildren();
    for (const entry of outcome.filed) {
      const row = el('div', 'sent' + (entry.error ? ' bad' : ''));
      row.append(text(entry.action + ' '));
      if (entry.key) row.append(el('span', 'k', entry.key));
      if (entry.error) row.append(text(' — ' + entry.error));
      box.append(row);
    }
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('dSend').disabled = false;
  }
};

$('pRun').onchange = () => {
  $('rSent').replaceChildren();
  $('dSent').replaceChildren();
  load();
};

loadRuns()
  .then((any) => (any ? load() : undefined))
  .catch((error) => {
    $('pStatus').className = 'status error';
    $('pStatus').textContent = error.message;
  });
`;

export function publishPageContent(): DashboardPageContent {
  return {
    title: 'Publish',
    eyebrow: 'Publish',
    heading: 'The part that leaves the building',
    lede:
      'Send results to PractiTest and defects to Jira. <b>The one page here that leaves the ' +
      'building</b> — both show the payload first and need the run’s id typed back.',
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
