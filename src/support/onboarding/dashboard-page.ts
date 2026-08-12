import { renderPage, type DashboardPageContent, type ShellOptions } from '../ui/shell';

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
`;

const BODY = `
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
    <div class="status" id="verifyStatus"></div>
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

const SCRIPT = `
let probed = null;
let marker = null;


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
  for (const row of serviceRows()) {
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
    probed = await post('/api/probe', {
      baseURL: $('baseURL').value.trim(),
      apiBaseURL: primaryServiceURL(),
      confirmedTestEnvironment: $('confirmTest').checked,
    });
    renderFindings(probed);
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
  probed = null;
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
    $('lContracts').checked = true;
    $('lApi').checked = true;
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
  };
}

$('secrets').onchange = renderCredentials;
$('roles').oninput = renderCredentials;

function renderCredentials() {
  const box = $('credentials');
  box.replaceChildren();
  const roles = $('roles').value.split(',').map((s) => s.trim()).filter(Boolean);
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

$('verify').onclick = async () => {
  const status = $('verifyStatus');
  const roles = $('roles').value.split(',').map((s) => s.trim()).filter(Boolean);
  const first = roles[0];
  const u = $('cu-' + first), p = $('cp-' + first);
  status.className = 'status';
  if (!u || !u.value || !p.value) {
    status.className = 'status error';
    status.textContent = 'Fill in the ' + first + ' credentials first.';
    return;
  }
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
    if (plan.conflicts.length) {
      box.append(el('div', 'error',
        'These already exist, so nothing will be written: ' + plan.conflicts.join(', ') +
        '. Onboarding is additive — choose another name.'));
      $('create').disabled = true;
    } else {
      $('create').disabled = false;
    }
    box.append(el('div', '', plan.files.length + ' file(s) will be written:'));
    const list = el('ul', 'files');
    for (const file of plan.files) list.append(el('li', '', file));
    box.append(list);
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
  } catch (error) {
    out.className = 'status error';
    out.textContent = error.message;
    $('offRemove').disabled = false;
  }
};

addServiceRow({ primary: true });
renderCredentials();
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
    script: SCRIPT,
  };
}

/** Kept for the tool and the tests, which serve this page on its own. */
export function dashboardPage(token: string, options?: Partial<ShellOptions>): string {
  return renderPage(onboardingPageContent(), {
    token,
    pages: options?.pages ?? [
      { href: '/runs', label: 'Runs' },
      { href: '/onboard', label: 'Onboard' },
    ],
    current: options?.current ?? '/onboard',
  });
}
