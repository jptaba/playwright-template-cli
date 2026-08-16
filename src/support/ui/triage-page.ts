import type { DashboardPageContent } from './shell';

/**
 * The triage page — §08 phase 5, §20.
 *
 * Cluster first, rules second, a person last — and the person's answer is
 * recorded beside the machine's rather than replacing it. That comparison is
 * the agreement measurement §20 asks for, and it has never been a number
 * anybody could look at.
 *
 * Two distinctions this page refuses to blur. A rule that classified something
 * wrongly is a defect in the rule and appears under disagreements. A rule that
 * declined a genuine judgement call did the right thing, and is counted
 * separately — scoring it as a miss would push whoever tunes the rules towards
 * guessing, which is the failure this whole design exists to avoid.
 */

const STYLES = `
  .counts-line { font-size: .92rem; color: var(--ink-2); margin: .9rem 0 0; }
  .counts-line b { color: var(--ink); font-weight: 640; }
  .counts-line .sep { color: var(--rule-strong); margin: 0 .5rem; }

  .rate { display: flex; align-items: baseline; gap: .8rem; flex-wrap: wrap; margin-top: .4rem; }
  .rate .big {
    font-size: 2.1rem; font-weight: 660; letter-spacing: -.02em;
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .rate .of { color: var(--muted); font-size: .9rem; }

  .cluster { border-top: 1px solid var(--rule); padding: .9rem 0 1rem; }
  .cluster:first-child { border-top: 0; }
  .cluster .line { display: flex; align-items: baseline; gap: .55rem; flex-wrap: wrap; }
  .cluster .size {
    font-family: ui-monospace, Consolas, monospace; font-size: .74rem; color: var(--muted);
  }
  .cluster .sum { font-weight: 620; overflow-wrap: anywhere; }
  .cluster .sig {
    font-family: ui-monospace, Consolas, monospace; font-size: .72rem; color: var(--muted);
    margin-top: .25rem; overflow-wrap: anywhere;
  }

  .verdict-box { border-left: 2px solid var(--rule-strong); padding: .4rem .8rem; margin: .5rem 0 0; }
  .verdict-box.rule { border-color: var(--pass); }
  .verdict-box.agent { border-color: var(--accent); }
  .verdict-box.none { border-color: var(--warn); background: var(--warn-soft); border-radius: 0 4px 4px 0; }
  .verdict-box .what { font-size: .9rem; }
  .verdict-box .evidence { list-style: none; padding: 0; margin: .35rem 0 0; }
  .verdict-box .evidence li {
    font-size: .82rem; color: var(--muted); overflow-wrap: anywhere;
  }
  .verdict-box .evidence li::before { content: "· "; }

  .tests { list-style: none; padding: 0; margin: .45rem 0 0; }
  .tests li { font-size: .84rem; color: var(--ink-2); padding: .12rem 0; overflow-wrap: anywhere; }
  .tests .cid { font-family: ui-monospace, Consolas, monospace; font-size: .74rem; color: var(--muted); }

  .rule-row { display: flex; gap: .6rem; align-items: flex-end; flex-wrap: wrap; margin-top: .6rem; }
  .rule-row label { margin: 0 0 .2rem; }
  .rule-row .field { flex: 1 1 12rem; min-width: 0; }
  .rule-row button { margin-top: 0; }
  .rule-row select, .rule-row input { font-size: .85rem; }

  .settled {
    border-left: 2px solid var(--pass); background: var(--pass-soft);
    padding: .4rem .8rem; margin: .55rem 0 0; font-size: .87rem; border-radius: 0 4px 4px 0;
  }
  .settled.disagreed { border-color: var(--fail); background: var(--fail-soft); }
  .settled .who { color: var(--muted); font-size: .8rem; display: block; }

  .badge.cat { color: var(--ink-2); background: var(--surface-2); border-color: var(--rule-strong); }
  .badge.declined { color: var(--warn); background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }

  .flake { display: grid; grid-template-columns: minmax(0,1fr) 5rem 5rem; gap: .5rem;
    font-size: .86rem; padding: .3rem 0; border-top: 1px solid var(--rule); }
  .flake:first-child { border-top: 0; }
  .flake .num { font-variant-numeric: tabular-nums; text-align: right; color: var(--ink-2); }
  .flake .head { color: var(--muted); font-size: .74rem; text-transform: uppercase; letter-spacing: .08em; }

  .empty { color: var(--muted); font-size: .9rem; padding: .4rem 0 .1rem; }
`;

const BODY = `
  <section>
    <div class="head">
      <h2>A run</h2>
      <span class="badge manual" id="tSource">—</span>
    </div>
    <p class="explain">
      Failures are grouped <b>before</b> anything is classified.
    </p>
    <details class="more">
      <summary>Why grouping comes first</summary>
      <div class="body">
        <p>Forty tests failing on one connection error is one incident, not forty defects. They
        are clustered by normalised error, failing step and time window.</p>
        <p>Breadth is itself the evidence for an infrastructure cause, and a per-test view cannot
        see it.</p>
      </div>
    </details>
    <label for="tRun">Run</label>
    <select id="tRun"></select>
    <p class="counts-line" id="tCounts"></p>
    <div class="status" id="tStatus"></div>
  </section>

  <section id="tAgreement">
    <div class="head"><h2>Agreement</h2></div>
    <p class="explain">
      How often the automated verdict matched the person who looked.
    </p>
    <details class="more">
      <summary>What counts as the rule being wrong</summary>
      <div class="body">
        <p>A rule that classified something wrongly is a defect in the rule, and is listed
        below.</p>
        <p>A rule that <b>declined</b> a genuine judgement call was right to. Those are counted
        separately, because scoring them as misses would push whoever tunes the rules towards
        guessing.</p>
      </div>
    </details>
    <div class="rate" id="tRate"></div>
    <div id="tDisagreements"></div>
  </section>

  <section id="tClusters">
    <div class="head">
      <h2>Clusters</h2>
      <span class="badge manual" id="cCount">0</span>
    </div>
    <div id="tList"></div>
  </section>

  <section id="tFlaky">
    <div class="head">
      <h2>Passed on retry</h2>
      <span class="badge manual" id="fCount">0</span>
    </div>
    <p class="explain">
      Decided by definition, not by inference — a test that passed on retry <b>is</b> flaky, and it
      never reaches a model.
    </p>
    <div id="fList"></div>
  </section>

  <section id="tQuarantine">
    <div class="head">
      <h2>Quarantine</h2>
      <span class="badge manual" id="qCount">0</span>
    </div>
    <p class="explain">
      Ranked by <b>rate, not count</b>. Nothing here quarantines anything.
    </p>
    <details class="more">
      <summary>Why rate, and why not a button</summary>
      <div class="body">
        <p>A test that fails one run in three matters far more than one that failed twice ever.</p>
        <p>Quarantining needs a reason, a named owner and a review date — a reviewed decision
        rather than a click.</p>
      </div>
    </details>
    <div id="qCandidates"></div>
    <h3 style="font-size:.9rem;margin:1.3rem 0 0">Already quarantined</h3>
    <div id="qList"></div>
  </section>
`;

const SCRIPT = `
let review = null;
let categories = [];
/** Survives a reload of the review, which otherwise clears the status line. */
let runNote = '';

const ACTION_LABEL = {
  'file-defect': 'file a defect',
  heal: 'heal the locator',
  'fix-test': 'fix the test',
  'fix-data': 'fix the data',
  escalate: 'escalate',
  none: 'no action',
};

async function loadRuns() {
  const data = await post('/api/triage/runs', {});
  categories = data.categories;

  const select = $('tRun');
  select.replaceChildren();
  for (const run of data.runs) {
    const option = document.createElement('option');
    option.value = run.id;
    option.dataset.source = run.source;
    option.textContent =
      run.id + ' · ' + run.target + ' · ' + run.failures + ' failed · ' + run.finishedAt.slice(0, 16).replace('T', ' ');
    select.append(option);
  }
  if (data.runs.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'no run models on disk';
    option.disabled = true;
    select.append(option);
    $('tStatus').textContent =
      'Nothing to triage. Start a run from the Runs page, or run the suite from the command line.';
    return false;
  }

  /*
     Newest first, but opening on the newest run that actually failed: you are
     here because something broke, and a green run's empty page is not it. Said
     out loud when it is not the newest, because a page quietly showing an
     older run than you expected is worse than one that explains itself.
  */
  const failing = data.runs.find((run) => run.failures > 0);
  select.value = (failing || data.runs[0]).id;
  runNote =
    failing && failing.id !== data.runs[0].id
      ? 'The most recent run has nothing to triage, so this is the most recent one that does.'
      : '';
  return true;
}

async function load() {
  const status = $('tStatus');
  status.className = 'status';
  status.textContent = 'Reading…';
  try {
    review = await post('/api/triage/review', { runId: $('tRun').value });
    status.textContent = runNote;
    render();
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
}

function verdictBox(cluster) {
  const verdict = cluster.verdict;
  if (!verdict) {
    const box = el('div', 'verdict-box none');
    box.append(el('div', 'what', 'No rule settled this one. It needs judgement — which is a valid answer, and the reason a person is here.'));
    return box;
  }

  const box = el('div', 'verdict-box ' + verdict.source);
  const what = el('div', 'what');
  what.append(el('span', 'badge cat', verdict.category));
  what.append(text(' ' + verdict.summary));
  box.append(what);

  const list = document.createElement('ul');
  list.className = 'evidence';
  for (const line of verdict.evidence) list.append(el('li', '', line));
  list.append(
    el(
      'li',
      '',
      verdict.confidence + ' confidence · ' + (ACTION_LABEL[verdict.recommendedAction] || verdict.recommendedAction) +
        (verdict.suggestedOwner ? ' · ' + verdict.suggestedOwner : '') +
        (verdict.rule ? ' · rule: ' + verdict.rule : ' · from the model'),
    ),
  );
  box.append(list);
  return box;
}

function clusterRow(cluster) {
  const item = el('div', 'cluster');

  const line = el('div', 'line');
  line.append(el('span', 'size', '×' + cluster.size));
  line.append(el('span', 'sum', cluster.summary));
  if (!cluster.verdict) line.append(el('span', 'badge declined', 'needs judgement'));
  item.append(line);
  item.append(el('div', 'sig', cluster.signature));
  item.append(verdictBox(cluster));

  const tests = document.createElement('ul');
  tests.className = 'tests';
  for (const entry of cluster.tests) {
    const row = document.createElement('li');
    if (entry.caseId) row.append(el('span', 'cid', '#' + entry.caseId + ' '));
    row.append(text(entry.title));
    tests.append(row);
  }
  item.append(tests);

  if (cluster.human) {
    const settled = el('div', 'settled' + (cluster.agreed === false ? ' disagreed' : ''));
    settled.append(
      text(
        cluster.agreed === null
          ? 'Ruled ' + cluster.human.category + ' — nothing automated to compare it with.'
          : cluster.agreed
            ? 'Confirmed ' + cluster.human.category + '.'
            : 'Overruled: ' + cluster.verdict.category + ' → ' + cluster.human.category + '.',
      ),
    );
    if (cluster.human.note) settled.append(text(' ' + cluster.human.note));
    settled.append(el('span', 'who', cluster.human.by + ' · ' + cluster.human.at.slice(0, 16).replace('T', ' ')));
    item.append(settled);
  }

  item.append(ruleRow(cluster));
  return item;
}

function ruleRow(cluster) {
  const row = el('div', 'rule-row');

  const pick = el('div', 'field');
  const label = document.createElement('label');
  label.textContent = cluster.human ? 'Change the verdict' : 'What was it really?';
  label.htmlFor = 'v-' + cluster.id;
  const select = document.createElement('select');
  select.id = 'v-' + cluster.id;
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.append(option);
  }
  // Defaults to what the machine said, so leaving it alone is a confirmation
  // and changing it is an overrule. Both are one click.
  select.value = (cluster.human && cluster.human.category) || (cluster.verdict && cluster.verdict.category) || 'unclassified';
  pick.append(label, select);

  const noteField = el('div', 'field');
  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'Why (optional)';
  noteLabel.htmlFor = 'n-' + cluster.id;
  const note = document.createElement('input');
  note.type = 'text';
  note.id = 'n-' + cluster.id;
  note.placeholder = 'what the evidence actually showed';
  noteField.append(noteLabel, note);

  const button = el('button', 'secondary', 'Record');
  button.onclick = async () => {
    button.disabled = true;
    try {
      review = await post('/api/triage/verdict', {
        runId: review.runId,
        clusterId: cluster.id,
        category: select.value,
        note: note.value,
      });
      render();
    } catch (error) {
      button.disabled = false;
      $('tStatus').className = 'status error';
      $('tStatus').textContent = error.message;
    }
  };

  row.append(pick, noteField, button);
  return row;
}

function renderAgreement() {
  const agreement = review.agreement;
  const rate = $('tRate');
  rate.replaceChildren();

  if (agreement.rate === null) {
    rate.append(
      el(
        'div',
        'empty',
        agreement.recorded === 0
          ? 'No verdicts recorded yet. Rule on a cluster below and the number appears here.'
          : agreement.recorded + ' verdict(s) recorded, none of them on a cluster automation classified — so there is nothing to compare yet.',
      ),
    );
  } else {
    rate.append(el('span', 'big', Math.round(agreement.rate * 100) + '%'));
    rate.append(
      el('span', 'of', agreement.agreed + ' of ' + agreement.compared + ' automated verdicts confirmed by a person'),
    );
  }
  if (agreement.declined > 0) {
    rate.append(
      el('span', 'of', '· ' + agreement.declined + ' ruled on where automation declined, which is not a miss'),
    );
  }

  const box = $('tDisagreements');
  box.replaceChildren();
  for (const entry of agreement.disagreements) {
    const item = el('div', 'settled disagreed');
    item.append(
      text(entry.automated + ' → ' + entry.human + (entry.rule ? '  (rule: ' + entry.rule + ')' : '')),
    );
    if (entry.note) item.append(text(' — ' + entry.note));
    item.append(el('span', 'who', 'run ' + entry.runId + ' · cluster ' + entry.clusterId));
    box.append(item);
  }
  if (agreement.disagreements.length > 0) {
    box.append(
      el('div', 'empty', 'A rule that gets one of these wrong should be tightened, not left to be overruled every run.'),
    );
  }
}

function renderQuarantine() {
  const quarantine = review.quarantine;
  $('qCount').textContent = String(quarantine.candidates.length);

  const candidates = $('qCandidates');
  candidates.replaceChildren();
  if (quarantine.runs < quarantine.minimumRuns) {
    // An empty list here would read as "nothing is flaky", which is a
    // different claim from "not enough runs to say".
    candidates.append(
      el(
        'div',
        'empty',
        'A rate needs ' + quarantine.minimumRuns + ' runs to mean anything, and there are ' +
          quarantine.runs + ' on disk. No candidates are computed — which is not the same as none.',
      ),
    );
  } else if (quarantine.candidates.length === 0) {
    candidates.append(el('div', 'empty', 'Nothing over the threshold across ' + quarantine.runs + ' runs.'));
  } else {
    const head = el('div', 'flake');
    head.append(el('span', 'head', 'case'), el('span', 'head num', 'rate'), el('span', 'head num', 'runs'));
    candidates.append(head);
    for (const candidate of quarantine.candidates) {
      const row = el('div', 'flake');
      row.append(
        el('span', '', candidate.caseId),
        el('span', 'num', Math.round(candidate.rate * 100) + '%'),
        el('span', 'num', candidate.flakyRuns + '/' + candidate.runs),
      );
      candidates.append(row);
    }
  }

  const list = $('qList');
  list.replaceChildren();
  if (quarantine.quarantined.length === 0) {
    list.append(el('div', 'empty', 'Nothing is quarantined.'));
  }
  for (const entry of quarantine.quarantined) {
    const row = el('div', 'settled' + (entry.overdue ? ' disagreed' : ''));
    row.append(text('#' + entry.caseId + ' — ' + entry.reason));
    row.append(
      el(
        'span',
        'who',
        entry.owner + ' · ' + entry.ageDays + ' days' + (entry.overdue ? ' · review date has passed' : ''),
      ),
    );
    list.append(row);
  }
}

function render() {
  const stats = review.stats;
  const option = $('tRun').selectedOptions[0];
  $('tSource').textContent = option && option.dataset.source === 'dashboard' ? 'dashboard run' : 'command-line run';

  const line = $('tCounts');
  line.replaceChildren();
  const stat = (value, label) => {
    if (line.childNodes.length) line.append(el('span', 'sep', '·'));
    line.append(el('b', '', String(value)), text(' ' + label));
  };
  stat(stats.failures, stats.failures === 1 ? 'failure' : 'failures');
  stat(stats.clusters, stats.clusters === 1 ? 'cluster' : 'clusters');
  stat(stats.settledByRule, 'settled by rule');
  if (stats.settledByAgent) stat(stats.settledByAgent, 'from the model');
  stat(stats.declined, 'needing judgement');
  stat(stats.ruled, 'ruled on');

  $('cCount').textContent = String(review.clusters.length);
  const list = $('tList');
  list.replaceChildren();
  if (review.clusters.length === 0) {
    list.append(el('div', 'empty', 'Nothing failed in this run.'));
  }
  for (const cluster of review.clusters) list.append(clusterRow(cluster));

  const flaky = $('fList');
  flaky.replaceChildren();
  const evidence = review.flaky.flatMap((verdict) => verdict.evidence);
  $('fCount').textContent = String(evidence.length);
  if (evidence.length === 0) flaky.append(el('div', 'empty', 'Nothing passed on retry.'));
  for (const line of evidence) flaky.append(el('div', 'sig', line));

  renderAgreement();
  renderQuarantine();
}

// The note explains the default; choosing a run yourself makes it noise.
$('tRun').onchange = () => {
  runNote = '';
  load();
};

loadRuns()
  .then((any) => (any ? load() : undefined))
  .catch((error) => {
    $('tStatus').className = 'status error';
    $('tStatus').textContent = error.message;
  });
`;

export function triagePageContent(): DashboardPageContent {
  return {
    title: 'Triage',
    eyebrow: 'Triage',
    heading: 'What broke, and whether the rules were right',
    lede:
      'Why the failures failed. Grouped first, classified second, and a person’s answer is kept ' +
      'beside the machine’s rather than replacing it.',
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
