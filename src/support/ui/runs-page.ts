import type { DashboardPageContent } from './shell';

/**
 * The runs page — §08, phase 2.
 *
 * Two runs at a time, both on screen. One cap rather than two: a run you cannot
 * see is a run you have to go and look for, and the point of this page is that
 * everything happening is in front of you.
 *
 * The page holds no state of its own. It asks the server what is going, folds
 * nothing, decides nothing — every number it shows came from the event stream
 * the run itself wrote. That is what stops this page and the run report ever
 * disagreeing about what happened.
 */

const STYLES = `
  .runs { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr)); }
  .runs.solo { grid-template-columns: minmax(0, 1fr); }

  .run { display: flex; flex-direction: column; gap: .8rem; }
  .run header { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .run header h2 { font-size: 1rem; }
  .run .id {
    font-family: ui-monospace, Consolas, monospace; font-size: .72rem; color: var(--muted);
  }

  /* A bar, because "how far through" is a proportion and a number is not. */
  .bar {
    height: 6px; border-radius: 3px; background: var(--surface-2);
    overflow: hidden; display: flex;
  }
  .bar span { display: block; height: 100%; }
  .bar .ok { background: var(--pass); }
  .bar .bad { background: var(--fail); }
  .bar .skip { background: var(--rule-strong); }

  .counts {
    display: flex; gap: 1.25rem; font-size: .85rem;
    font-variant-numeric: tabular-nums; color: var(--muted);
  }
  .counts b { color: var(--ink); font-weight: 640; }

  /* One row per worker. The lane is the unit of "what is happening now". */
  .lanes { display: grid; gap: .3rem; }
  .lane {
    display: grid; grid-template-columns: 3.5rem minmax(0, 1fr); gap: .6rem;
    align-items: baseline; font-size: .84rem;
    padding: .3rem .55rem; border-radius: 4px; background: var(--surface-2);
  }
  .lane .w {
    font-family: ui-monospace, Consolas, monospace; font-size: .7rem;
    color: var(--muted); letter-spacing: .06em;
  }
  .lane .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lane.idle .t { color: var(--muted); font-style: italic; }

  .failures { display: grid; gap: .3rem; max-height: 16rem; overflow-y: auto; }
  .failure {
    border-left: 2px solid var(--fail); background: var(--fail-soft);
    padding: .35rem .7rem; border-radius: 0 4px 4px 0; font-size: .84rem;
  }
  .failure .msg {
    color: var(--ink-2); font-family: ui-monospace, Consolas, monospace; font-size: .76rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* The live view. Default is an embedded tile; expanded fills the window. */
  .view {
    position: relative; background: var(--surface-2); border: 1px solid var(--rule);
    border-radius: 6px; overflow: hidden; aspect-ratio: 16 / 10;
    display: flex; align-items: center; justify-content: center;
  }
  .view img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .view .placeholder { color: var(--muted); font-size: .84rem; padding: 1rem; text-align: center; }
  .view button.expand {
    position: absolute; top: .5rem; right: .5rem; margin: 0;
    padding: .25rem .6rem; font-size: .75rem;
    background: color-mix(in srgb, var(--surface) 85%, transparent); color: var(--ink);
    border-color: var(--rule-strong);
  }
  .view.expanded {
    position: fixed; inset: 1.5rem; z-index: 100; aspect-ratio: auto;
    box-shadow: 0 24px 80px -20px rgba(0, 0, 0, .6);
  }

  .verdict { font-weight: 640; }
  .verdict.passed { color: var(--pass); }
  .verdict.failed, .verdict.interrupted { color: var(--fail); }
  .verdict.running { color: var(--accent-ink); }

  .starter { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
  .empty { color: var(--muted); font-size: .9rem; padding: 1.5rem 0; }
`;

const BODY = `
  <section id="start">
    <div class="head">
      <h2>Start a run</h2>
      <span class="badge manual" id="slots">2 slots free</span>
    </div>
    <p class="explain">
      Two at a time. A third is <b>refused</b> rather than queued.
    </p>
    <details class="more">
      <summary>Why a third is refused instead of queued</summary>
      <div class="body">
        <p>A queued run starts unattended some minutes later, against an application whose state
        has moved — and nobody is watching when it does.</p>
      </div>
    </details>
    <div class="starter">
      <div>
        <label for="rTarget">Application</label>
        <select id="rTarget"></select>
      </div>
      <div>
        <label for="rProjects">Projects <small>comma separated; blank runs them all</small></label>
        <input type="text" id="rProjects" placeholder="e2e, api" autocomplete="off">
      </div>
      <div>
        <label for="rGrep">Only tests tagged <small>optional</small></label>
        <input type="text" id="rGrep" placeholder="@smoke" autocomplete="off">
      </div>
    </div>
    <label class="check">
      <input type="checkbox" id="rLive" checked>
      <span>Show the browser in the page
        <small>A live view of one worker, embedded. Chromium only.</small>
      </span>
    </label>
    <label class="check">
      <input type="checkbox" id="rHeaded">
      <span>Open real browser windows instead
        <small>Watch it on your own screen. Headed timing differs from headless, which is what CI
        runs — so this is for watching, never for deciding whether something passed.</small>
      </span>
    </label>
    <button id="rStart">Run it</button>
    <div class="status" id="rStatus"></div>
  </section>

  <div class="runs solo" id="runs">
    <section class="empty" id="noRuns">Nothing is running. Start something above.</div>
  </div>
`;

const SCRIPT = `
let expanded = null;

async function loadTargets() {
  try {
    const { targets } = await post('/api/targets', {});
    const select = $('rTarget');
    select.replaceChildren();
    for (const target of targets) {
      const option = document.createElement('option');
      option.value = target;
      option.textContent = target;
      select.append(option);
    }
    if (targets.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'no applications onboarded';
      option.disabled = true;
      select.append(option);
      $('rStart').disabled = true;
    }
  } catch (error) {
    $('rStatus').className = 'status error';
    $('rStatus').textContent = error.message;
  }
}

$('rStart').onclick = async () => {
  const status = $('rStatus');
  status.className = 'status';
  status.textContent = 'Starting…';
  $('rStart').disabled = true;
  try {
    const started = await post('/api/runs/start', {
      target: $('rTarget').value,
      projects: $('rProjects').value.split(',').map((s) => s.trim()).filter(Boolean),
      grep: $('rGrep').value.trim(),
      headed: $('rHeaded').checked,
      liveView: $('rLive').checked,
    });
    status.replaceChildren(el('span', 'found', 'Started ' + started.id + '.'));
    if (started.warning) status.append(el('div', 'note', started.warning));
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('rStart').disabled = false;
  }
};

function verdictLabel(progress) {
  if (progress.status === 'running' || progress.status === 'starting') {
    return progress.finished + ' of ' + progress.planned;
  }
  return progress.status;
}

function renderRun(run) {
  const p = run.progress;
  const card = el('section', 'run');
  card.dataset.runId = run.id;

  const header = document.createElement('header');
  header.append(el('h2', '', run.request.target));
  header.append(el('span', 'verdict ' + p.status, verdictLabel(p)));
  header.append(el('span', 'id', run.id));
  if (run.state === 'running' || run.state === 'starting') {
    const stop = el('button', 'secondary', 'Stop');
    stop.style.marginTop = '0';
    stop.style.marginLeft = 'auto';
    stop.onclick = async () => {
      stop.disabled = true;
      try { await post('/api/runs/cancel', { id: run.id }); } catch (e) { stop.disabled = false; }
    };
    header.append(stop);
  }
  card.append(header);

  const total = Math.max(p.planned, p.finished, 1);
  const bar = el('div', 'bar');
  const seg = (cls, n) => {
    if (n <= 0) return;
    const s = el('span', cls);
    s.style.width = ((n / total) * 100) + '%';
    bar.append(s);
  };
  seg('ok', p.passed); seg('bad', p.failed); seg('skip', p.skipped);
  card.append(bar);

  const counts = el('div', 'counts');
  const count = (label, value) => {
    const wrap = el('span');
    wrap.append(el('b', '', String(value)), text(' ' + label));
    counts.append(wrap);
  };
  count('passed', p.passed);
  count('failed', p.failed);
  count('skipped', p.skipped);
  count('of ' + p.planned, p.finished);
  card.append(counts);

  if (run.liveView) card.append(renderView(run));

  const workers = Object.keys(p.lanes);
  if (workers.length) {
    const lanes = el('div', 'lanes');
    for (const worker of workers.sort((a, b) => Number(a) - Number(b))) {
      const lane = el('div', 'lane');
      lane.append(el('span', 'w', 'w' + worker));
      lane.append(el('span', 't', p.lanes[worker].title));
      lanes.append(lane);
    }
    card.append(lanes);
  }

  if (p.failures.length) {
    const list = el('div', 'failures');
    for (const failure of p.failures.slice(-25).reverse()) {
      const item = el('div', 'failure');
      item.append(el('div', '', failure.title));
      if (failure.error) item.append(el('div', 'msg', failure.error));
      list.append(item);
    }
    card.append(list);
  }

  return card;
}

function renderView(run) {
  const view = el('div', 'view');
  view.dataset.viewFor = run.id;
  if (expanded === run.id) view.classList.add('expanded');

  if (run.frame) {
    const img = document.createElement('img');
    img.src = 'data:image/jpeg;base64,' + run.frame;
    img.alt = 'Live view of ' + run.request.target;
    view.append(img);
  } else {
    view.append(el('div', 'placeholder', run.viewNote || 'Waiting for the first frame…'));
  }

  const toggle = el('button', 'expand', expanded === run.id ? 'Shrink' : 'Expand');
  toggle.onclick = () => {
    expanded = expanded === run.id ? null : run.id;
    // Asking for a bigger frame when it is bigger on screen: sending 1280px
    // into a 400px tile is waste, and 640px into a full window is a blur.
    post('/api/runs/view', { id: run.id, expanded: expanded === run.id }).catch(() => undefined);
    refresh();
  };
  view.append(toggle);
  return view;
}

/* Esc restores an expanded view, because a thing that fills the window must. */
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && expanded) {
    expanded = null;
    refresh();
  }
});

let latest = { runs: [], slotsFree: 2 };

function refresh() {
  const box = $('runs');
  const runs = latest.runs;
  $('slots').textContent = latest.slotsFree + (latest.slotsFree === 1 ? ' slot free' : ' slots free');
  $('rStart').disabled = latest.slotsFree === 0;

  box.replaceChildren();
  box.classList.toggle('solo', runs.length < 2);
  if (runs.length === 0) {
    box.append(el('section', 'empty', 'Nothing is running. Start something above.'));
    return;
  }
  for (const run of runs) box.append(renderRun(run));
}

/*
   One connection, pushed from the server. Reconnects on its own if the server
   restarts, and the state it pushes is a fold of the run's own event file — so
   a page opened half way through a run shows exactly what a page that watched
   from the start would.
*/
function listen() {
  const source = new EventSource('/api/runs/stream?token=' + encodeURIComponent(TOKEN));
  source.onmessage = (message) => {
    latest = JSON.parse(message.data);
    refresh();
  };
  source.onerror = () => {
    source.close();
    setTimeout(listen, 1500);
  };
}

loadTargets();
refresh();
listen();
`;

export function runsPageContent(): DashboardPageContent {
  return {
    title: 'Runs',
    eyebrow: 'Runs',
    heading: 'Start one, and watch it',
    lede:
      'Start a run and watch it. Every number here comes from the run’s own event stream, so this ' +
      'page and the report cannot disagree.',
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
