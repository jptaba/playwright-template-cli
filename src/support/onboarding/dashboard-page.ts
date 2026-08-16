import {
  DASHBOARD_PAGES,
  renderPage,
  type DashboardPageContent,
  type ShellOptions,
} from '../ui/shell';

/**
 * The onboarding page.
 *
 * A page now, not a document: the shell owns the stylesheet, the masthead, the
 * navigation, the session token and the four helpers every page uses. What is
 * left here is the part that is actually about onboarding — which is the point
 * of the split, since every screen after this one would otherwise have carried
 * its own copy of the theme handling.
 */

/** Styles only this page needs. Everything shared is already in the shell. */
const STYLES = `
  .lockhint { color: var(--muted); font-size: .85rem; margin: .55rem 0 0; font-style: italic; }
  .findings > div { font-size: .9rem; margin: .2rem 0; }

  .service {
    display: grid; grid-template-columns: 11rem 1fr auto;
    gap: .5rem; margin: .45rem 0; align-items: center;
  }
  .service button { margin: 0; padding: .4rem .7rem; }
  .service .primary-tag {
    font-family: ui-monospace, Consolas, monospace; font-size: .7rem;
    color: var(--muted); padding: .4rem .3rem; white-space: nowrap;
  }

  /*
     The offboarding panel is deliberately awkward to reach.

     It is collapsed behind a details element, it is at the bottom, its border
     is the failure colour, and the button stays disabled until the target's own
     name has been typed back. This is the one operation in the framework that
     destroys work, and the cost of an accidental click is somebody's week.
  */
  details.danger {
    background: var(--surface); border: 1px solid color-mix(in srgb, var(--fail) 40%, var(--rule));
    border-radius: 8px; padding: 1.4rem 1.5rem 1.5rem; box-shadow: var(--shadow);
  }
  details.danger > summary {
    cursor: pointer; font-weight: 640; font-size: 1.05rem; color: var(--fail);
    list-style: none; display: flex; align-items: center; gap: .6rem;
  }
  details.danger > summary::-webkit-details-marker { display: none; }
  details.danger > summary::before { content: "▸"; font-size: .8em; }
  details.danger[open] > summary::before { content: "▾"; }
  details.danger .warn-strip {
    border-left: 2px solid var(--fail); background: var(--fail-soft);
    padding: .6rem .85rem; margin: 1rem 0; font-size: .89rem; border-radius: 0 4px 4px 0;
  }

  /* ---------- the step rail ---------- */
  .rail-title {
    margin: 0 0 .6rem; font-size: .68rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); font-weight: 700;
  }
  ol.steps { list-style: none; margin: 0 0 1rem; padding: 0; counter-reset: step; }
  ol.steps li {
    counter-increment: step; position: relative;
    padding: .3rem 0 .3rem 1.75rem; line-height: 1.35;
  }
  ol.steps li::before {
    content: counter(step);
    position: absolute; left: 0; top: .35rem;
    width: 1.2rem; height: 1.2rem; border-radius: 50%;
    border: 1px solid var(--rule-strong); background: var(--surface);
    font-family: ui-monospace, Consolas, monospace; font-size: .68rem;
    display: flex; align-items: center; justify-content: center; color: var(--muted);
  }
  ol.steps a { color: var(--muted); text-decoration: none; font-size: .84rem; }
  ol.steps li[data-state="open"] a { color: var(--ink); font-weight: 620; }
  ol.steps li[data-state="open"]::before {
    border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft);
  }
  /* Done is a tick rather than a number: the number is which step, and a
     finished step no longer needs to say which one it was. */
  ol.steps li[data-state="done"]::before {
    content: "✓"; border-color: var(--pass); background: var(--pass-soft); color: var(--pass);
  }
  ol.steps li[data-state="done"] a { color: var(--ink-2); }
  .rail-note { color: var(--muted); font-size: .78rem; line-height: 1.5; margin: 0; }
`;

const BODY = `
  <section id="s0">
    <div class="head">
      <h2>Which application</h2>
      <span class="badge manual" id="draftState">nothing in progress</span>
    </div>
    <p class="explain">
      Onboarding one already? Pick it here to see what its profile says. Otherwise this is a new
      one, and <b>what you type is kept as you go</b> — moving to another tab and back no longer
      empties the form. Credentials are the exception: those are never written down, so step 4 is
      the one thing you re-enter.
    </p>
    <label for="pick">Application</label>
    <select id="pick"></select>
    <button class="secondary" id="editApp" hidden>Change its settings</button>
    <button id="saveApp" hidden>Save the changes</button>
    <button class="secondary" id="cancelEdit" hidden>Cancel</button>
    <div class="status" id="pickStatus"></div>
    <div id="editOut"></div>
  </section>

  <section id="s1">
    <div class="head">
      <span class="step">Step 1</span>
      <h2>The application</h2>
      <span class="badge manual">Needs your input</span>
    </div>
    <p class="explain">
      The only things nothing can work out on its own: what to call this target, and where the
      application lives. Everything in steps 2 and 5 is derived from what you put here.
    </p>
    <div class="row">
      <div>
        <label for="name">Target name <small>lower-case, hyphenated — becomes a directory and a <code>TARGET</code> value</small></label>
        <input type="text" id="name" placeholder="acme-shop" autocomplete="off">
      </div>
      <div>
        <label for="env">Environment <small>which deployment this profile points at</small></label>
        <input type="text" id="env" value="staging" autocomplete="off">
      </div>
    </div>
    <label for="baseURL">Base URL <small>the test environment, never production</small></label>
    <input type="text" id="baseURL" placeholder="https://staging.acme.example" autocomplete="off">

    <label>Service APIs <small>optional, and often on different hosts — a spec calls each one by name, as <code>apis.billing</code></small></label>
    <div id="services"></div>
    <button class="secondary" type="button" id="addService">Add another service</button>

    <label class="check">
      <input type="checkbox" id="confirmTest">
      <span>This is a test environment.
        <small>Reading it loads pages in a real browser. It signs nothing in and submits no forms.</small>
      </span>
    </label>
    <button id="probe">Read the application</button>
    <button class="secondary" id="skipProbe">Skip and fill in by hand</button>
    <div class="status" id="s1status"></div>
  </section>

  <section id="s2" inert>
    <div class="head">
      <span class="step">Step 2</span>
      <h2>What it says about itself</h2>
      <span class="badge locked" data-ready="Filled in for you" data-kind="auto">Locked</span>
    </div>
    <p class="lockhint">Unlocks once step 1 has read the application.</p>
    <p class="explain">
      <b>Nothing to do here unless something looks wrong.</b> These were read from the running
      application and are already in the fields below.
      <br><br>
      <b>Test-id attribute</b> is what <code>getByTestId</code> reads on this application.
      Applications disagree — <code>data-test</code>, <code>data-testid</code>,
      <code>data-qa</code> — and it is a property of the app, not of the framework.
      <br>
      <b>The three names</b> are <i>accessible names</i>: what a screen reader announces and what
      <code>getByRole</code> matches. They are usually the field's label and usually <i>not</i> its
      placeholder — a name copied from a placeholder produces a locator that times out on a field
      plainly on screen, which is the commonest way a generated pack arrives broken.
    </p>
    <div class="findings" id="findings"></div>
    <div class="row">
      <div>
        <label for="testId">Test-id attribute</label>
        <input type="text" id="testId" value="data-testid" autocomplete="off">
      </div>
      <div>
        <label for="signInPath">Sign-in path</label>
        <input type="text" id="signInPath" value="/" autocomplete="off">
      </div>
    </div>
    <div class="row">
      <div>
        <label for="uName">Username field <small>accessible name</small></label>
        <input type="text" id="uName" autocomplete="off">
      </div>
      <div>
        <label for="pName">Password field <small>accessible name</small></label>
        <input type="text" id="pName" autocomplete="off">
      </div>
      <div>
        <label for="sName">Submit control <small>accessible name</small></label>
        <input type="text" id="sName" autocomplete="off">
      </div>
    </div>
  </section>

  <section id="s3" inert>
    <div class="head">
      <span class="step">Step 3</span>
      <h2>The shape of the pack</h2>
      <span class="badge locked" data-ready="Needs your input" data-kind="manual">Locked</span>
    </div>
    <p class="lockhint">Unlocks once step 1 has read the application.</p>
    <p class="explain">
      Sensible defaults are already set; change them only where they are wrong for this
      application. <b>Roles</b> are the identities the suite signs in as — each gets its own
      stored session, and the first is the default for <code>authedPage</code>. <b>Layers</b> are
      optional vocabularies: switch one on only if the application really has it, because a
      capability declared on but absent fails obscurely, while one declared off is reported as
      “not applicable” rather than as a silent zero.
    </p>
    <label for="roles">Roles <small>comma separated</small></label>
    <input type="text" id="roles" value="standard" autocomplete="off">
    <div class="row">
      <div>
        <label for="secrets">Credentials resolve from</label>
        <select id="secrets">
          <option value="vault">Vault — anything real</option>
          <option value="local">Local file — only where the credentials are genuinely public</option>
        </select>
      </div>
      <div>
        <label for="a11y">Accessibility standard</label>
        <input type="text" id="a11y" value="wcag22aa" autocomplete="off">
      </div>
    </div>
    <label>Optional layers</label>
    <label class="check"><input type="checkbox" id="lApi"><span>API — typed HTTP clients<small>needs at least one service above</small></span></label>
    <label class="check"><input type="checkbox" id="lContracts"><span>Contracts — schema conformance<small>switched on automatically when a published document was found</small></span></label>
    <label class="check"><input type="checkbox" id="lA11y"><span>Accessibility — axe against the declared standard</span></label>
    <label class="check"><input type="checkbox" id="lDb"><span>Database — read-only query vocabulary<small>only when a fact has no UI and no API</small></span></label>
    <button id="preview">Preview what will be written</button>
  </section>

  <section id="s4" inert>
    <div class="head">
      <span class="step">Step 4</span>
      <h2>Credentials</h2>
      <span class="badge locked" data-ready="Needs your input" data-kind="manual">Locked</span>
    </div>
    <p class="lockhint">Unlocks once step 3 has previewed what will be written.</p>
    <p class="explain">
      One login per role. Specs never see these — they resolve at run time through the
      <code>secrets</code> fixture, and the generated code carries the <i>reference</i>, never the
      value. Nothing you type here appears in any response from this page.
      <br><br>
      <b>Signing in once</b> is optional and does two things: it proves the locators in step 2
      actually work, and it derives the one locator nothing can read from a page at rest — the
      control that only appears <i>after</i> you are signed in. It tries exactly once, because
      repeated failures lock accounts and the account it would spend is the one the whole suite
      depends on.
    </p>
    <div id="credentials"></div>
    <button class="secondary" id="verify">Sign in once, to prove the locators work</button>
    <button class="secondary" id="assist">Sign in with a browser you can see</button>
    <button class="secondary" id="assistDone" hidden>I am on the home page</button>
    <button class="secondary" id="assistCancel" hidden>Cancel</button>
    <p class="explain" id="assistExplain" hidden>
      Use this when anything stands between the password and the home page — a one-time code, a
      password-expiry notice, a security question, "remember this device?". A browser opens with
      the form already filled; <b>do whatever the application asks</b>, then press the button. It
      takes the session, works out the signed-in marker from the page you finished on, and turns
      each thing it met into a handler.
    </p>
    <div class="status" id="verifyStatus"></div>
    <div id="assistOut"></div>
  </section>

  <section id="s5" inert>
    <div class="head">
      <span class="step">Step 5</span>
      <h2>Write it</h2>
      <span class="badge locked" data-ready="Done for you" data-kind="auto">Locked</span>
    </div>
    <p class="lockhint">Unlocks once step 3 has previewed what will be written.</p>
    <p class="explain">
      <b>Nothing to fill in.</b> Press the button and the whole target is written from what is
      above. Nothing is ever overwritten — if any of these files already exist the whole thing is
      refused, because onboarding is additive. Afterwards the same checks
      <code>npm run target:doctor</code> runs are shown, so the target is known to be sound before
      you leave the page.
    </p>
    <div id="plan"></div>
    <button id="create">Create the target</button>
    <div class="status" id="result"></div>
  </section>

  <details class="danger">
    <summary>Remove an application</summary>
    <p class="explain">
      Takes a target back out and leaves the agnostic framework behind: the profile, the
      four-layer pack, the credential entries and the stored sessions. This is what makes it
      reasonable to point this repository at a live application on <code>main</code> — try one,
      drive it, and put the repository back the way it was, without a branch to move between.
    </p>
    <div class="warn-strip">
      <b>This deletes files.</b> Anything committed comes back with <code>git checkout</code>;
      anything never committed does not. Nothing happens until you have seen the plan and typed
      the target's own name back.
    </div>
    <label for="offTarget">Target to remove</label>
    <input type="text" id="offTarget" placeholder="acme-shop" autocomplete="off">
    <button class="secondary" id="offPlan">Show me what would go</button>
    <div class="status" id="offPlanOut"></div>
    <div id="offConfirmBox" hidden>
      <label for="offConfirm">Type <b id="offName" class="mono"></b> to confirm</label>
      <input type="text" id="offConfirm" autocomplete="off">
      <button class="destructive" id="offRemove" disabled>Remove it</button>
    </div>
    <div class="status" id="offResult"></div>
  </details>
`;

/**
 * The right rail: where you are in the five steps.
 *
 * This page is two screens tall and gates each step on the one before it, and
 * the only way to answer "which step am I on" was to scroll until a section
 * stopped saying Locked. The rail says it without moving, and each entry is a
 * link to its section, so it is a way *back* as well as a status.
 */
const ASIDE = `
  <p class="rail-title">Where you are</p>
  <ol class="steps" id="stepRail">
    <li data-for="s1"><a href="#s1">The application</a></li>
    <li data-for="s2"><a href="#s2">What it says</a></li>
    <li data-for="s3"><a href="#s3">Shape of the pack</a></li>
    <li data-for="s4"><a href="#s4">Credentials</a></li>
    <li data-for="s5"><a href="#s5">Write it</a></li>
  </ol>
  <p class="rail-note" id="railNote">Steps unlock as the one before them is done. Nothing is
  written until step 5, and nothing is ever overwritten.</p>
`;

const SCRIPT = `
let probed = null;
let marker = null;
let applications = [];
/** The new-application form, remembered between page loads. */
let draft = { fields: {}, flags: {}, services: [], savedAt: '' };
let restoring = false;

/*
   Every dashboard page is its own document, so clicking another tab is a full
   navigation and anything held in an input is gone. The draft is what stops
   that emptying the form — saved as you type, debounced, and deliberately
   holding no credential: step 4's values are never written anywhere.
*/
const DRAFT_FIELDS = ['name','env','baseURL','testId','signInPath','uName','pName','sName','roles','secrets','a11y'];
const DRAFT_FLAGS = ['confirmTest','lApi','lDb','lContracts','lA11y'];

function collectDraft() {
  const fields = {};
  for (const id of DRAFT_FIELDS) {
    const node = $(id);
    if (node && node.value) fields[id] = node.value;
  }
  const flags = {};
  for (const id of DRAFT_FLAGS) {
    const node = $(id);
    if (node) flags[id] = node.checked;
  }
  return { fields, flags, services: serviceRows(), savedAt: new Date().toISOString() };
}

let saveTimer = null;
function saveDraft() {
  // Only a new application has a draft. Selecting an onboarded one shows what
  // its profile says, and that is not something to remember a copy of.
  if (restoring || $('pick').value !== '') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    draft = collectDraft();
    post('/api/onboard/draft', { draft }).then(
      () => setDraftState('kept'),
      () => setDraftState('not kept'),
    );
  }, 400);
}

function setDraftState(what) {
  const badge = $('draftState');
  badge.textContent = what === 'kept' ? 'kept as you type' : what;
  badge.className = 'badge ' + (what === 'kept' ? 'auto' : 'manual');
}

/**
 * The form as it ships, captured before anything touches it.
 *
 * Restoring a draft has to *reset* as well as fill, or the values left behind
 * by an onboarded application stay on screen and read as though they were
 * typed — which is the same confusion this whole feature exists to remove.
 */
const DEFAULTS = { fields: {}, flags: {} };
function captureDefaults() {
  for (const id of DRAFT_FIELDS) {
    const node = $(id);
    if (node) DEFAULTS.fields[id] = node.value;
  }
  for (const id of DRAFT_FLAGS) {
    const node = $(id);
    if (node) DEFAULTS.flags[id] = node.checked;
  }
}

/**
 * An onboarded application is shown, not edited.
 *
 * Without this the fields look editable, typing in them does nothing — the
 * draft only belongs to a new application — and the page silently discards
 * what somebody just wrote. Disabled says "this is a view" in the one language
 * a form has.
 */
function setFormEnabled(enabled) {
  for (const id of DRAFT_FIELDS.concat(DRAFT_FLAGS)) {
    const node = $(id);
    if (node) node.disabled = !enabled;
  }
  for (const node of $('services').querySelectorAll('input')) node.disabled = !enabled;
  $('addService').disabled = !enabled;
  $('probe').disabled = !enabled;
  $('skipProbe').disabled = !enabled;
}

function applyDraft(saved) {
  restoring = true;
  for (const id of DRAFT_FIELDS) {
    const node = $(id);
    if (!node) continue;
    node.value = saved.fields[id] !== undefined ? saved.fields[id] : DEFAULTS.fields[id];
  }
  for (const id of DRAFT_FLAGS) {
    const node = $(id);
    if (!node) continue;
    node.checked = saved.flags[id] !== undefined ? saved.flags[id] : DEFAULTS.flags[id];
  }
  $('services').replaceChildren();
  const rows = (saved.services || []).length ? saved.services : [{ primary: true }];
  for (const row of rows) addServiceRow(row);
  renderCredentials();
  setFormEnabled(true);
  restoring = false;
}

/**
 * Everything step 1 read off the application, put back the way it shipped.
 *
 * Called wherever the reading stops being true: a second read that found no
 * form, a skip after a read, an onboarded application selected. Without it the
 * three accessible names stay on screen and read as though they belonged to
 * whatever is on screen now — and they are exactly what the pack's sign-in
 * locators get built from, so the failure arrives much later as a timeout on a
 * field that is plainly there on some other application.
 */
function clearWhatWasRead() {
  probed = null;
  marker = null;
  for (const id of ['uName', 'pName', 'sName']) $(id).value = '';
  $('signInPath').value = DEFAULTS.fields.signInPath !== undefined ? DEFAULTS.fields.signInPath : '/';
  $('testId').value = DEFAULTS.fields.testId !== undefined ? DEFAULTS.fields.testId : 'data-testid';
  /*
     Only what the reading switched on comes back off. A layer somebody ticked
     themselves is their decision, and undoing it because a probe was re-run
     would be the same class of surprise in the other direction.
  */
  for (const id of switchedOnByReading) $(id).checked = false;
  switchedOnByReading.clear();
}

/** Which layer checkboxes the last read switched on, so only those come off. */
const switchedOnByReading = new Set();

/** Fill the form from a profile already on disk, and lock what cannot change. */
function showApplication(app) {
  restoring = true;
  clearWhatWasRead();
  $('findings').replaceChildren();
  $('name').value = app.name;
  $('env').value = app.environment;
  $('baseURL').value = app.baseURL;
  $('testId').value = app.testIdAttribute;
  $('roles').value = app.roles.join(', ');
  $('secrets').value = app.secretSource;
  $('a11y').value = app.a11yStandard || '';
  $('lApi').checked = app.include.api;
  $('lDb').checked = app.include.db;
  $('lContracts').checked = app.include.contracts;
  $('lA11y').checked = app.include.a11y;
  $('services').replaceChildren();
  addServiceRow({ primary: true, name: 'api', url: app.apiBaseURL || '' });
  renderCredentials();
  setFormEnabled(false);
  restoring = false;

  const when = app.onboardedAt.slice(0, 16).replace('T', ' ');
  $('pickStatus').className = 'status';
  $('pickStatus').replaceChildren(
    el('div', 'note',
      app.name + ' was onboarded ' + when + ' and has ' + app.packFiles + ' file(s) in its pack. ' +
      'These are the values its profile holds — onboarding is additive and never overwrites, so ' +
      'change them in config/targets/' + app.name + '.ts, or remove the target and start again.'),
  );
  $('create').disabled = true;
  setDraftState('showing an onboarded application');
}

/*
   Showing an onboarded application read-only was half an answer: the value
   most often needing correction is the one hardest to get right first time,
   and sending somebody to a TypeScript file to change one string is a poor
   reply from a page that has just displayed it.

   Editing is explicit — a button, then Save — so nothing is changed by
   wandering through the form, and only values move: the profile's comments
   are the reasoning behind each setting and are not this page's to rewrite.
*/
$('editApp').onclick = () => {
  setFormEnabled(true);
  /*
     Everything but the name. updateProfile is keyed on the target that was
     picked, so a new name here would be typed, saved, reported as saved, and
     written nowhere — a change somebody believes they made. Renaming a target
     means moving a directory, a TARGET value and a storage-state filename, and
     that is target:remove followed by onboarding again.
  */
  $('name').disabled = true;
  $('editApp').hidden = true;
  $('saveApp').hidden = false;
  $('cancelEdit').hidden = false;
  $('pickStatus').replaceChildren(
    el('div', 'note',
      'Editing ' + $('pick').value + '. Only the values below are written — every comment in ' +
      'the profile stays as it is. Anything this cannot find, it says so rather than guessing.'),
  );
};

$('cancelEdit').onclick = () => pickChanged();

$('saveApp').onclick = async () => {
  const target = $('pick').value;
  const status = $('pickStatus');
  status.className = 'status';
  status.replaceChildren(el('div', '', 'Saving…'));
  $('saveApp').disabled = true;
  try {
    const result = await post('/api/onboard/update', {
      target,
      edits: {
        baseURL: $('baseURL').value.trim(),
        environment: $('env').value.trim(),
        testIdAttribute: $('testId').value.trim(),
        apiBaseURL: primaryServiceURL(),
        a11yStandard: $('a11y').value.trim(),
        secretSource: $('secrets').value,
        roles: $('roles').value.split(',').map((s) => s.trim()).filter(Boolean),
        include: {
          api: $('lApi').checked, db: $('lDb').checked,
          contracts: $('lContracts').checked, a11y: $('lA11y').checked,
        },
      },
    });

    /*
       Reloaded first, then reported. loadState runs pickChanged, which
       rewrites pickStatus — so filling it before reloading showed what
       changed for about a second and then replaced it with the description of
       the application. The reload matters: the values on screen have to come
       back from the file that was just written, not from the form.
    */
    status.replaceChildren();
    await loadState(true);

    const out = $('editOut');
    out.replaceChildren();
    if (result.applied.length === 0) {
      out.append(el('div', 'note', 'Nothing changed — every value was already what you asked for.'));
    }
    for (const change of result.applied) {
      out.append(el('div', 'diag', change.field + ': ' + (change.from || '(empty)') + ' → ' + change.to));
    }
    for (const warning of result.warnings) out.append(el('div', 'note', warning));
    for (const refusal of result.refused) {
      out.append(el('div', 'diag error', refusal.field + ' — ' + refusal.reason));
    }
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('saveApp').disabled = false;
  }
};

function pickChanged() {
  const chosen = $('pick').value;
  $('editOut').replaceChildren();
  $('editApp').hidden = chosen === '';
  $('saveApp').hidden = true;
  $('cancelEdit').hidden = true;
  if (chosen === '') {
    $('pickStatus').replaceChildren();
    $('create').disabled = false;
    applyDraft(draft);
    setDraftState(draft.savedAt ? 'kept as you type' : 'nothing in progress');
    return;
  }
  const app = applications.find((candidate) => candidate.name === chosen);
  if (app) showApplication(app);
}

/**
 * What the form holds right now, as one comparable string.
 *
 * Every reload of the state ends by re-rendering the form from what came back.
 * That is right when nothing else is happening and wrong the moment it is: a
 * save still in flight while its operator moves on to a new application lands
 * *afterwards* and replaces what they have started typing with the draft it
 * was holding when it was asked. Found by walking the journey end to end
 * rather than a step at a time — the file that got written carried the
 * previous application's name, and nothing on screen looked wrong at any point.
 *
 * Compared rather than counted. The first guard counted interactions and asked
 * "has anything happened since?", which depends on the input *event* having
 * been dispatched before the reply arrives — true when a person is typing,
 * and not reliably true under load. This asks "does the form still hold what
 * it held when I asked?", which is a fact about the DOM and cannot race.
 */
function formSignature() {
  const snapshot = collectDraft();
  return JSON.stringify([snapshot.fields, snapshot.flags, snapshot.services]);
}

async function loadState(keepSelection) {
  const asked = formSignature();
  const state = await post('/api/onboard/state', {});
  applications = state.applications || [];
  draft = state.draft || draft;

  const select = $('pick');
  const wanted = keepSelection ? select.value : null;
  select.replaceChildren();
  const fresh = document.createElement('option');
  fresh.value = '';
  fresh.textContent = '— New application —';
  select.append(fresh);
  for (const app of applications) {
    const option = document.createElement('option');
    option.value = app.name;
    /*
       Name and environment, and no date. Which day a profile was last written
       is not something anybody picks an application by, and on a list of two
       it was the longest part of the label.
    */
    option.textContent = app.name + ' · ' + app.environment;
    select.append(option);
  }

  /*
     Half-typed work wins over the most recent application. Losing it is the
     whole reason this exists, and an application already on disk can be looked
     at any time.
  */
  /*
     A caller that asked to keep the selection gets it, when it still exists.
     Saving an edit reloads — and landing on a *different* application after
     pressing Save reads as "it did not work", which is how somebody presses it
     twice. A removal reloads too, and there the target is gone, so the fall
     through to the default is the right answer rather than a special case.
  */
  const stillThere = wanted && applications.some((app) => app.name === wanted);
  const hasDraft = Object.keys(draft.fields || {}).length > 0;
  select.value = stillThere
    ? wanted
    : hasDraft || applications.length === 0
      ? ''
      : applications[0].name;

  /*
     The list is always refreshed; the form is only re-rendered when nobody has
     touched it since this was asked for. Anything else replaces somebody's
     typing with an answer to a question they have stopped asking.
  */
  if (formSignature() !== asked) return;
  pickChanged();
}

$('pick').onchange = pickChanged;
document.addEventListener('input', saveDraft);
document.addEventListener('change', saveDraft);


/*
   Unlocking a step does three things, and all three matter.

   The inert attribute comes off, so the section is reachable by mouse *and*
   keyboard — the first version used a pointer-events rule, which stops one and
   not the other. The badge stops saying "Locked" and starts saying what the
   step wants. And the line explaining what would unlock it is removed, because
   by then it answers a question nobody is asking.

   A locked section that already claims to need your input is a contradiction,
   and it was the first thing a reader noticed about this page.
*/
/**
 * The step rail, from the sections themselves.
 *
 * Derived rather than tracked. A second variable saying which step you are on
 * is a second thing that can disagree with the page, and the page already
 * knows: a section with the inert attribute is locked, and one left behind
 * by a later unlocked section is done.
 */
function refreshStepRail() {
  const ids = ['s1', 's2', 's3', 's4', 's5'];
  const open = ids.map((id) => !$(id).hasAttribute('inert'));
  const lastOpen = open.lastIndexOf(true);

  for (let i = 0; i < ids.length; i += 1) {
    const entry = document.querySelector('#stepRail li[data-for="' + ids[i] + '"]');
    if (!entry) continue;
    entry.dataset.state = !open[i] ? 'locked' : i < lastOpen ? 'done' : 'open';
  }
}

function enable(id) {
  const section = $(id);
  if (!section.hasAttribute('inert')) return;
  section.removeAttribute('inert');
  const badge = section.querySelector('.badge');
  if (badge && badge.dataset.ready) {
    badge.textContent = badge.dataset.ready;
    badge.className = 'badge ' + (badge.dataset.kind || 'manual');
  }
  const hint = section.querySelector('.lockhint');
  if (hint) hint.remove();
  refreshStepRail();
}

/*
   Every service is a named row, including the first.

   The primary one used to be a bare URL field with no name, which made it look
   like a different kind of thing from the rows below it and left the reader
   guessing what "another service" was another of. It is the same kind of
   thing: it is simply the one the \`api\` fixture is bound to. Naming it
   \`api\` — the default — keeps that plain; naming it anything else also
   publishes it as \`apis.<name>\`, so a spec can say which back end it means.
*/
function addServiceRow(options) {
  const settings = options || {};
  const row = el('div', 'service');
  row.dataset.primary = settings.primary ? 'true' : 'false';

  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.placeholder = settings.primary ? 'api' : 'billing';
  nameInput.value = settings.name || (settings.primary ? 'api' : '');
  nameInput.autocomplete = 'off';
  nameInput.setAttribute('aria-label', 'Service name');

  const urlInput = el('input');
  urlInput.type = 'text';
  urlInput.placeholder = settings.primary
    ? 'https://api.staging.acme.example'
    : 'https://billing.staging.acme.example';
  urlInput.value = settings.url || '';
  urlInput.autocomplete = 'off';
  urlInput.setAttribute('aria-label', 'Service base URL');

  row.append(nameInput, urlInput);
  if (settings.primary) {
    row.append(el('span', 'primary-tag', 'primary'));
  } else {
    const remove = el('button', 'secondary', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove this service');
    remove.onclick = () => row.remove();
    row.append(remove);
  }
  $('services').append(row);
}

function serviceRows() {
  return [...$('services').children].map((row) => {
    const [nameInput, urlInput] = row.querySelectorAll('input');
    return {
      primary: row.dataset.primary === 'true',
      name: nameInput.value.trim(),
      url: urlInput.value.trim(),
    };
  });
}

const primaryServiceURL = () => (serviceRows().find((row) => row.primary) || {}).url || '';

/*
   The primary is the \`api\` fixture's base URL. It is *also* published under
   its own name when that name is not simply "api", so \`apis.core\` works
   alongside \`api\` — and left as "api" it is not duplicated, which is what the
   doctor's shadowing warning is about.
*/
function collectServices() {
  const services = {};
  /*
     The primary is published as api whether or not it is named, so it
     occupies that name and a second row claiming it is a collision.

     Two rows with one name is not a cosmetic problem: an object key holds one
     value, so the row lower down silently wins and the one above it vanishes.
     The reader typed two back ends, got one, and apis.billing reaches
     whichever host happened to be second in the form.
  */
  const seen = new Set();
  for (const row of serviceRows()) {
    const name = row.primary && !row.name ? 'api' : row.name;
    if (name) {
      if (seen.has(name)) {
        throw new Error(
          "Two services are called '" + name + "'. A name is how a spec asks for a back end — " +
          'apis.' + name + ' — so it can only mean one of them. Rename one, or remove it.' +
          (name === 'api' ? ' The primary row is already published as api.' : ''),
        );
      }
      seen.add(name);
    }
    if (row.primary && (!row.name || row.name === 'api')) continue;
    if (!row.name && !row.url) continue;
    services[row.name] = row.url;
  }
  return services;
}

$('addService').onclick = () => addServiceRow();

$('probe').onclick = async () => {
  const status = $('s1status');
  status.className = 'status';
  status.textContent = 'Loading the application…';
  $('probe').disabled = true;
  try {
    const result = await post('/api/probe', {
      baseURL: $('baseURL').value.trim(),
      apiBaseURL: primaryServiceURL(),
      confirmedTestEnvironment: $('confirmTest').checked,
    });
    // Cleared before the new reading is applied, so a second read that finds
    // less than the first cannot leave the first one's answers behind.
    clearWhatWasRead();
    probed = result;
    renderFindings(probed);
    // Nothing above fires an input event — the values were assigned, not
    // typed — so without this the whole of step 2 is lost by clicking a tab,
    // which is the one thing the draft exists to prevent.
    saveDraft();
    status.textContent = 'Read the application. Step 2 is filled in below.';
    enable('s2'); enable('s3');
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('probe').disabled = false;
  }
};

$('skipProbe').onclick = () => {
  /*
     Skipping after a read has to undo the read, not merely stop using it.
     Dropping the probe result on its own left the contracts capability switched on
     with the document gone — a contract suite that reports coverage and
     validates against nothing — and left the sign-in names from a host that is
     no longer the one being onboarded.
  */
  clearWhatWasRead();
  saveDraft();
  $('findings').replaceChildren(el('div', 'note',
    'Skipped. Every locator in the pack will be a placeholder, and the sign-in vocabulary has to ' +
    'be rewritten from an accessibility snapshot before anything runs.'));
  enable('s2'); enable('s3');
};

function renderFindings(result) {
  const box = $('findings');
  box.replaceChildren();

  const testIds = Object.entries(result.testIdCounts).filter(([, n]) => n > 0);
  const line = el('div');
  line.append(text('Test-id attribute: '));
  if (testIds.length) {
    line.append(el('span', 'found', result.testIdAttribute));
    line.append(text(' (' + testIds.map(([k, n]) => k + ' ×' + n).join(', ') + ')'));
  } else {
    line.append(el('span', 'missing', 'none found'));
    line.append(text(' — left at the Playwright default'));
  }
  box.append(line);

  const signIn = el('div');
  signIn.append(text('Sign-in form: '));
  if (result.signIn) {
    signIn.append(el('span', 'found', 'found at ' + result.signIn.path));
    $('uName').value = result.signIn.username;
    $('pName').value = result.signIn.password;
    $('sName').value = result.signIn.submit;
    $('signInPath').value = result.signIn.path;
  } else {
    signIn.append(el('span', 'missing', 'not found'));
  }
  box.append(signIn);

  const contract = el('div');
  contract.append(text('Published API document: '));
  if (result.contract) {
    contract.append(el('span', 'found', result.contract.url));
    contract.append(text(' — it will be vendored and the contracts capability switched on'));
    if (!$('lContracts').checked) switchedOnByReading.add('lContracts');
    if (!$('lApi').checked) switchedOnByReading.add('lApi');
    $('lContracts').checked = true;
    $('lApi').checked = true;

    /*
       Switching the API layer on without a base URL for it is a dead end: the
       very next button refuses with "the api layer needs a service base URL",
       and the reader has been given no way to know what to put there. The
       document is published *by* the service, so its origin is the service —
       proposed here, in a field somebody can correct, rather than left blank
       for them to work out.
    */
    const primary = [...$('services').children].find((row) => row.dataset.primary === 'true');
    const url = primary && primary.querySelectorAll('input')[1];
    if (url && !url.value.trim()) {
      url.value = new URL(result.contract.url).origin;
      box.append(el('div', 'note',
        'The API base URL was set to ' + url.value + ', the host publishing that document. ' +
        'Correct it if the service is mounted somewhere else.'));
    }
  } else {
    contract.append(el('span', 'missing', 'none found'));
  }
  box.append(contract);

  $('testId').value = result.testIdAttribute;
  for (const note of result.notes) box.append(el('div', 'note', note));
}

function options() {
  const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
  const signIn = $('uName').value && $('pName').value
    ? {
        username: $('uName').value, password: $('pName').value,
        submit: $('sName').value, path: $('signInPath').value,
        signedInMarker: marker || undefined,
      }
    : undefined;
  return {
    name: $('name').value.trim(),
    baseURL: $('baseURL').value.trim(),
    apiBaseURL: primaryServiceURL() || undefined,
    apiServices: collectServices(),
    environment: $('env').value.trim(),
    roles: list($('roles').value),
    testIdAttribute: $('testId').value.trim(),
    secretSource: $('secrets').value,
    a11yStandard: $('a11y').value.trim(),
    include: {
      api: $('lApi').checked, db: $('lDb').checked,
      contracts: $('lContracts').checked, a11y: $('lA11y').checked,
    },
    signIn,
    contractDocument: probed && probed.contract
      ? { filename: probed.contract.filename, contents: probed.contract.contents }
      : undefined,
    /*
       What stood between the password and the home page, as handlers. Showing
       the operator a handler and then writing a pack without it leaves them
       with a sign-in that worked once, by hand, and a setup:auth that hangs
       on the same page in CI.
    */
    gauntlet: gauntlet.length ? gauntlet : undefined,
  };
}

$('secrets').onchange = renderCredentials;
$('roles').oninput = renderCredentials;

/**
 * The roles, as a set.
 *
 * Typed twice, they are still one role: each one becomes a credential path and
 * a storage-state file, and both of those are keyed by name. Left duplicated,
 * the page renders two inputs sharing an id — and a lookup by that id returns
 * the first, so the second is a box somebody types a password into that
 * nothing ever reads.
 */
function rolesTyped() {
  const seen = [];
  for (const role of $('roles').value.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!seen.includes(role)) seen.push(role);
  }
  return seen;
}

function renderCredentials() {
  const box = $('credentials');
  box.replaceChildren();
  const roles = rolesTyped();
  if ($('secrets').value === 'vault') {
    box.append(el('div', 'note',
      'Vault holds these. Nothing is written here — the agent writes the reference, a person ' +
      'writes the value. The exact paths appear after the target is created.'));
    return;
  }
  box.append(el('div', 'note',
    'Written straight to config/secrets.local.json. Legitimate only where the credentials are ' +
    'genuinely public, such as a demo site that prints them on its own login page. They still ' +
    'resolve through the secrets fixture: the moment one target bypasses it, the lint rule ' +
    'stops being enforceable.'));
  for (const role of roles) {
    const wrap = el('div', 'row');
    const u = el('div');
    u.append(Object.assign(el('label'), { textContent: role + ' — username', htmlFor: 'cu-' + role }));
    const ui = el('input'); ui.type = 'text'; ui.id = 'cu-' + role; ui.autocomplete = 'off';
    u.append(ui);
    const p = el('div');
    p.append(Object.assign(el('label'), { textContent: role + ' — password', htmlFor: 'cp-' + role }));
    const pi = el('input'); pi.type = 'password'; pi.id = 'cp-' + role; pi.autocomplete = 'off';
    p.append(pi);
    wrap.append(u, p);
    box.append(wrap);
  }
}

/**
 * Why signing in from here is not possible yet, or null when it is.
 *
 * Three different situations produced one message, and two of them pointed at
 * fields that were not on the page: with no roles typed it read "fill in the
 * undefined credentials first", and with Vault selected it named a role whose
 * inputs deliberately do not exist.
 */
function whyCannotSignIn() {
  const roles = rolesTyped();
  if (roles.length === 0) {
    return 'Name at least one role in step 3 first — the sign-in is tried as one of them.';
  }
  if ($('secrets').value === 'vault') {
    return (
      'Credentials for this target live in Vault, so there is nothing to type here and nothing ' +
      'for this button to send. Switch step 3 to a local file to sign in from this page, or ' +
      'prove the sign-in afterwards with: TARGET=<name> npx playwright test --project=setup:auth'
    );
  }
  const user = $('cu-' + roles[0]), pass = $('cp-' + roles[0]);
  if (!user || !pass || !user.value || !pass.value) {
    return 'Fill in the ' + roles[0] + ' credentials first.';
  }
  return null;
}

$('verify').onclick = async () => {
  const status = $('verifyStatus');
  const roles = rolesTyped();
  const first = roles[0];
  status.className = 'status';
  const blocked = whyCannotSignIn();
  if (blocked) {
    status.className = 'status error';
    status.textContent = blocked;
    return;
  }
  const u = $('cu-' + first), p = $('cp-' + first);
  status.textContent = 'Signing in once…';
  $('verify').disabled = true;
  try {
    const result = await post('/api/verify', {
      baseURL: $('baseURL').value.trim(),
      signIn: { username: $('uName').value, password: $('pName').value, submit: $('sName').value, path: $('signInPath').value },
      credentials: { username: u.value, password: p.value },
    });
    marker = result.marker;
    status.className = 'status';
    status.replaceChildren(el('span', result.ok ? 'found' : 'missing', result.ok ? 'Signed in. ' : 'Did not sign in. '));
    status.append(text(result.detail));
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('verify').disabled = false;
  }
};

$('preview').onclick = async () => {
  const box = $('plan');
  box.replaceChildren(el('div', 'status', 'Planning…'));
  try {
    const plan = await post('/api/plan', options());
    box.replaceChildren();
    /*
       Shown at the preview, which is the last moment before anything is
       written and the one where somebody is already reading. A document URL
       pasted where a base URL belongs is the mistake this catches, and the
       failures it otherwise causes are 404s from a path nobody can find.
    */
    for (const warning of plan.warnings || []) box.append(el('div', 'note', warning));
    /*
       Conflicts end the preview. Listing what "will be written" underneath a
       message saying nothing will be is how this read before, and the two
       halves named the same thirteen files — the operator could reasonably
       take either one as the truth.
    */
    if (plan.conflicts.length) {
      box.append(el('div', 'error',
        plan.name + ' is already onboarded, so nothing will be written. ' +
        plan.conflicts.length + ' file(s) exist already, starting with ' + plan.conflicts[0] + '.'));
      box.append(el('div', 'note',
        'Onboarding only ever adds. To change this application, pick it in ' +
        '"Already onboarded" at the top and edit it there. To replace it, remove it first: ' +
        'npm run target:remove -- --name=' + plan.name + ' --confirm=' + plan.name + '. ' +
        'To keep both, choose another name.'));
      $('create').disabled = true;
    } else {
      $('create').disabled = false;
      box.append(el('div', '', plan.files.length + ' file(s) will be written:'));
      const list = el('ul', 'files');
      for (const file of plan.files) list.append(el('li', '', file));
      box.append(list);
    }
    renderCredentials();
    enable('s4'); enable('s5');
  } catch (error) {
    box.replaceChildren(el('div', 'error', error.message));
  }
};

$('create').onclick = async () => {
  const result = $('result');
  result.className = 'status';
  result.textContent = 'Writing…';
  $('create').disabled = true;
  try {
    const credentials = {};
    for (const role of $('roles').value.split(',').map((s) => s.trim()).filter(Boolean)) {
      const u = $('cu-' + role), p = $('cp-' + role);
      if (u && p && u.value && p.value) credentials[role] = { username: u.value, password: p.value };
    }
    const created = await post('/api/create', Object.assign(options(), { credentials }));
    result.replaceChildren();
    result.append(el('div', 'found', 'Wrote ' + created.written.length + ' file(s).'));

    if (created.diagnostics.length === 0) {
      result.append(el('div', 'diag', 'target:doctor — profile, pack and credentials agree.'));
    } else {
      for (const d of created.diagnostics) {
        const node = el('div', 'diag ' + d.level);
        node.append(el('b', '', d.code), text(' — ' + d.message));
        node.append(el('div', 'fix', d.fix));
        result.append(node);
      }
    }
    const next = el('pre');
    next.textContent = created.nextSteps.map((s, i) => (i + 1) + '. ' + s).join('\\n');
    result.append(el('div', '', 'Next:'), next);
  } catch (error) {
    result.className = 'status error';
    result.textContent = error.message;
    $('create').disabled = false;
  }
};

/*
   Offboarding. Two calls, never one: planning is safe and shows everything that
   would go, and removing is unreachable until the name has been typed back.
*/
let offPlanned = null;

$('offPlan').onclick = async () => {
  const out = $('offPlanOut');
  out.className = 'status';
  out.textContent = 'Working out what belongs to it…';
  $('offConfirmBox').hidden = true;
  try {
    const plan = await post('/api/offboard/plan', { target: $('offTarget').value.trim() });
    offPlanned = plan;
    out.replaceChildren();

    if (plan.alreadyGone) {
      out.append(el('div', '', 'Nothing named "' + plan.target + '" is onboarded.'));
      return;
    }

    const counts = [plan.removeFiles.length + ' file(s)'];
    if (plan.removeSecretKeys.length) counts.push(plan.removeSecretKeys.length + ' credential entr(ies)');
    if (plan.removeStorageStates.length) counts.push(plan.removeStorageStates.length + ' stored session(s)');
    out.append(el('div', '', 'Would remove ' + counts.join(', ') + ':'));

    const list = el('ul', 'files');
    for (const file of plan.removeFiles) list.append(el('li', '', file));
    out.append(list);
    for (const warning of plan.warnings) out.append(el('div', 'note', warning));
    for (const refusal of plan.refusals) out.append(el('div', 'error', refusal));

    if (plan.refusals.length === 0) {
      $('offName').textContent = plan.target;
      $('offConfirm').value = '';
      $('offRemove').disabled = true;
      $('offConfirmBox').hidden = false;
    }
  } catch (error) {
    out.className = 'status error';
    out.textContent = error.message;
  }
};

// The button is inert until the name matches exactly. A confirmation a stray
// click can satisfy is not a confirmation.
$('offConfirm').oninput = () => {
  $('offRemove').disabled = !offPlanned || $('offConfirm').value.trim() !== offPlanned.target;
};

$('offRemove').onclick = async () => {
  const out = $('offResult');
  out.className = 'status';
  out.textContent = 'Removing…';
  $('offRemove').disabled = true;
  try {
    const done = await post('/api/offboard/remove', {
      target: offPlanned.target,
      confirm: $('offConfirm').value.trim(),
    });
    out.replaceChildren(el('div', 'found', 'Removed ' + done.removed.length + ' item(s).'));
    const next = el('pre');
    next.textContent = [
      'npm run catalog:build   # drop it from the capability catalog',
      'git status              # then commit',
    ].join('\\n');
    out.append(next);
    $('offConfirmBox').hidden = true;
    $('offPlanOut').replaceChildren();
    /*
       The picker still listed it otherwise, and clicking it showed a profile
       that is not there any more — every field on screen describing something
       that had just been deleted.
    */
    offPlanned = null;
    await loadState(true).catch(() => undefined);
  } catch (error) {
    out.className = 'status error';
    out.textContent = error.message;
    $('offRemove').disabled = false;
  }
};

/*
   Assisted sign-in. The dashboard fills the form and then gets out of the way:
   the code on somebody's phone and the "password expires in five days" notice
   are not things to guess at, and a headless browser cannot ask.
*/
let assistTimer = null;
/** Handlers for what stood between the password and the home page. */
let gauntlet = [];

function firstRole() {
  return ($('roles').value.split(',')[0] || 'standard').trim();
}

/** The credentials typed for one role. Read here, never stored anywhere. */
function credentialsFor(role) {
  const user = $('cu-' + role);
  const pass = $('cp-' + role);
  return { username: user ? user.value : '', password: pass ? pass.value : '' };
}

$('assist').onclick = async () => {
  const status = $('verifyStatus');
  status.className = 'status';
  status.textContent = 'Opening a browser…';
  $('assistOut').replaceChildren();
  try {
    const started = await post('/api/assist/start', {
      baseURL: $('baseURL').value.trim(),
      signIn: { username: $('uName').value, password: $('pName').value, submit: $('sName').value, path: $('signInPath').value },
      credentials: credentialsFor(firstRole()),
    });
    status.textContent = started.detail;
    $('assist').hidden = true;
    $('assistDone').hidden = false;
    $('assistCancel').hidden = false;
    $('assistExplain').hidden = false;

    assistTimer = setInterval(async () => {
      try {
        const state = await post('/api/assist/poll', {});
        if (!state.open) return stopAssist();
        const box = $('assistOut');
        box.replaceChildren(
          el('div', 'note', state.observed + ' page(s) met so far between the password and now.'),
        );
        for (const line of state.summary) box.append(el('div', 'diag', line));
      } catch {
        stopAssist();
      }
    }, 1500);
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
};

function stopAssist() {
  clearInterval(assistTimer);
  assistTimer = null;
  $('assist').hidden = false;
  $('assistDone').hidden = true;
  $('assistCancel').hidden = true;
  $('assistExplain').hidden = true;
}

$('assistCancel').onclick = async () => {
  await post('/api/assist/cancel', {}).catch(() => undefined);
  stopAssist();
};

$('assistDone').onclick = async () => {
  const status = $('verifyStatus');
  status.className = 'status';
  status.textContent = 'Taking the session…';
  clearInterval(assistTimer);
  assistTimer = null;
  try {
    const result = await post('/api/assist/finish', { target: $('name').value.trim(), role: firstRole() });
    stopAssist();
    status.textContent = result.detail;
    if (result.marker) marker = result.marker;
    gauntlet = result.gauntlet || [];

    const box = $('assistOut');
    box.replaceChildren();
    if (result.storageState) {
      box.append(el('div', 'note', 'Session written to ' + result.storageState + '. It expires — this proves the pack works, it does not make the suite unattended.'));
    }
    if (result.marker) {
      box.append(el('div', 'diag', 'Signed-in marker: ' + result.marker.role + ' "' + result.marker.name + '" — taken from the page you finished on, not from a challenge.'));
      /*
         The flag was derived and then not shown, which is the same as not
         deriving it. A marker carrying one person's name works perfectly for
         the role it came from and reports every other role as signed out —
         and that failure arrives on whichever spec happens to use the second
         role, long after anybody is looking at this page.
      */
      if (result.marker.identitySpecific) {
        box.append(el('div', 'diag error',
          'That is this account\\'s own name, so it is specific to one role: it will establish ' +
          'this session and report every other role as signed out. Generalise it before this ' +
          'target has a second role — an account menu usually has a stable test id or an ' +
          'aria-label. The generated locator file says so too.'));
      }
    }
    for (const line of result.describes) box.append(el('div', 'diag', line));

    /*
       The sentence that keeps this honest. A person completing a challenge
       proves the locators work; it does not make CI able to do the same.
    */
    box.append(
      el('div', result.unattended.possible ? 'note' : 'diag error',
        (result.unattended.possible ? 'Unattended runs: ' : 'Unattended runs will NOT work yet: ') +
        result.unattended.reason),
    );
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
};

addServiceRow({ primary: true });
renderCredentials();
captureDefaults();
refreshStepRail();

/*
   Last, and after the first service row exists: restoring a draft replaces the
   rows, and there has to be something to replace.
*/
loadState().catch((error) => {
  $('pickStatus').className = 'status error';
  $('pickStatus').textContent = error.message;
});
`;

export function onboardingPageContent(): DashboardPageContent {
  return {
    title: 'Onboard an application',
    eyebrow: 'Onboarding',
    heading: 'Add an application under test',
    lede:
      'Reads the running application, then writes the profile, the four-layer pack, the vendored ' +
      'contract document and the credential entries in one go. This is <code>npm run ' +
      'target:new</code> with the application in front of it, so the answers it would otherwise ' +
      'ask you for are read rather than guessed.',
    facts: [
      { label: 'You fill in', value: 'Steps 1, 3 and 4' },
      { label: 'Filled in for you', value: 'Steps 2 and 5' },
      { label: 'Overwrites', value: 'Never' },
      { label: 'Aim', value: '<code>setup:auth</code> passes unedited' },
    ],
    styles: STYLES,
    body: BODY,
    aside: ASIDE,
    script: SCRIPT,
  };
}

/** Kept for the tool and the tests, which serve this page on its own. */
export function dashboardPage(token: string, options?: Partial<ShellOptions>): string {
  /*
     Spread, not rebuilt. Naming each field meant every option added to the
     shell afterwards was silently dropped on this one page — which is how the
     context bar and the rail's badges rendered empty here and correctly
     everywhere else.
  */
  return renderPage(onboardingPageContent(), {
    ...options,
    token,
    pages: options?.pages ?? DASHBOARD_PAGES,
    current: options?.current ?? '/onboard',
  });
}
