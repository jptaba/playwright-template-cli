/**
 * The onboarding dashboard's single page.
 *
 * Inlined as a string, with no build step and no external request, for the same
 * reason the lint rules are plain CommonJS: one less thing between a tool and
 * the feedback it produces. It is served from loopback only, and the session
 * token is minted per run and embedded here.
 *
 * The page is a form over `planScaffold`, not a wizard with opinions of its
 * own. Every field maps to a scaffold option or a probe result, and the preview
 * shows exactly the files that will be written before anything is.
 */
export function dashboardPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Onboard an application</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfa; --panel: #ffffff; --ink: #1a1a19; --muted: #6b6b66;
    --line: #e3e3df; --accent: #3b5bdb; --ok: #2b8a3e; --warn: #e67700; --bad: #c92a2a;
    --code: #f4f4f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17171a; --panel: #1f1f23; --ink: #e8e8e6; --muted: #9a9a95;
      --line: #33333a; --accent: #8ba3ff; --ok: #69db7c; --warn: #ffc078; --bad: #ff8787;
      --code: #26262b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 6rem; background: var(--bg); color: var(--ink);
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 62rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
  h2 { font-size: 1.05rem; margin: 0 0 .75rem; letter-spacing: -.01em; }
  p.lede { color: var(--muted); margin: 0 0 2rem; max-width: 46rem; }
  section {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 1.25rem 1.25rem 1.4rem; margin-bottom: 1rem;
  }
  section[aria-disabled="true"] { opacity: .45; pointer-events: none; }
  .step { color: var(--muted); font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; }
  label { display: block; font-weight: 600; margin: .9rem 0 .3rem; font-size: .9rem; }
  label small { font-weight: 400; color: var(--muted); }
  input[type=text], input[type=password], select {
    width: 100%; padding: .55rem .65rem; border: 1px solid var(--line); border-radius: 6px;
    background: var(--bg); color: var(--ink); font: inherit; font-size: .92rem;
  }
  input:focus-visible, select:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  .row { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
  .check { display: flex; align-items: flex-start; gap: .5rem; margin: .5rem 0; font-size: .92rem; }
  .check input { margin-top: .3rem; }
  .check span small { display: block; color: var(--muted); font-weight: 400; }
  button {
    margin-top: 1.1rem; padding: .55rem 1.1rem; border-radius: 6px; border: 1px solid transparent;
    background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--ink); border-color: var(--line); }
  button[disabled] { opacity: .5; cursor: not-allowed; }
  code, pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85rem;
  }
  pre {
    background: var(--code); border: 1px solid var(--line); border-radius: 6px;
    padding: .75rem; overflow-x: auto; margin: .5rem 0 0;
  }
  p.explain {
    color: var(--muted); font-size: .88rem; margin: 0 0 1rem; max-width: 48rem;
    border-left: 2px solid var(--line); padding-left: .8rem;
  }
  p.explain b { color: var(--ink); }
  .service { display: grid; grid-template-columns: 10rem 1fr auto; gap: .5rem; margin: .4rem 0; }
  .service button { margin: 0; padding: .4rem .7rem; }
  .note { border-left: 3px solid var(--warn); padding: .4rem 0 .4rem .7rem; margin: .5rem 0;
          color: var(--muted); font-size: .9rem; }
  .found { color: var(--ok); font-weight: 600; }
  .missing { color: var(--warn); font-weight: 600; }
  .error { border-left: 3px solid var(--bad); padding: .4rem 0 .4rem .7rem; color: var(--bad); }
  .diag { border-left: 3px solid var(--line); padding: .35rem 0 .35rem .7rem; margin: .4rem 0;
          font-size: .9rem; }
  .diag.error { border-color: var(--bad); }
  .diag.warning { border-color: var(--warn); color: var(--ink); }
  .diag b { font-family: ui-monospace, monospace; font-weight: 600; font-size: .85rem; }
  .fix { color: var(--muted); }
  ul.files { list-style: none; padding: 0; margin: .5rem 0 0; columns: 2; column-gap: 2rem; }
  ul.files li { font-family: ui-monospace, monospace; font-size: .82rem; break-inside: avoid; }
  .status { margin-top: .8rem; font-size: .9rem; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Onboard an application</h1>
  <p class="lede">
    Reads the running application, then writes the profile, the four-layer pack, the vendored
    contract document and the credential entries in one go. Nothing here is a shortcut past the
    conventions — it is <code>npm run target:new</code> with the application in front of it, so
    the answers it would otherwise ask you for are read rather than guessed.
  </p>

  <section id="s1">
    <div class="step">Step 1</div>
    <h2>The application</h2>
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
    <label for="apiBaseURL">Service API base URL <small>optional; often a different host</small></label>
    <input type="text" id="apiBaseURL" placeholder="https://api.staging.acme.example" autocomplete="off">
    <label>Other services <small>applications usually have more than one back end &mdash; name each one, and a spec calls it as <code>apis.billing</code></small></label>
    <div id="services"></div>
    <button class="secondary" type="button" id="addService">Add another service</button>
    <label class="check">
      <input type="checkbox" id="confirmTest">
      <span>This is a test environment.
        <small>Probing loads pages in a real browser. It signs nothing in and submits no forms.</small>
      </span>
    </label>
    <button id="probe">Read the application</button>
    <button class="secondary" id="skipProbe">Skip and fill in by hand</button>
    <div class="status" id="s1status"></div>
  </section>

  <section id="s2" aria-disabled="true">
    <div class="step">Step 2</div>
    <h2>What it says about itself</h2>
    <p class="explain">
      These are read from the running application, not guessed. Correct anything that looks
      wrong &mdash; what is here is what gets written into the pack.
    </p>
    <div id="findings"></div>
    <p class="explain">
      <b>Test-id attribute</b> is what <code>getByTestId</code> reads on this application.
      Applications disagree (<code>data-test</code>, <code>data-testid</code>,
      <code>data-qa</code>), and it is a property of the app rather than of the framework.
      <br>
      <b>The three names</b> are <i>accessible names</i> &mdash; what a screen reader announces
      and what <code>getByRole</code> matches. They are usually the field's label, and usually
      <i>not</i> its placeholder. A name copied from a placeholder produces a locator that
      times out on a field plainly on screen, which is the single commonest way a generated
      pack arrives broken.
    </p>
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

  <section id="s3" aria-disabled="true">
    <div class="step">Step 3</div>
    <h2>The shape of the pack</h2>
    <p class="explain">
      What gets generated. <b>Roles</b> are the identities the suite signs in as &mdash; each
      gets its own stored session, and the first is the default for <code>authedPage</code>.
      <b>Layers</b> are optional vocabularies: switch one on only if the application really has
      it, because a capability declared on but absent fails obscurely, while one declared off is
      reported as &ldquo;not applicable&rdquo; rather than as a silent zero.
    </p>
    <label for="roles">Roles <small>comma separated; the first is the default identity for <code>authedPage</code></small></label>
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
    <label class="check"><input type="checkbox" id="lApi"><span>API — typed HTTP clients<small>needs the service base URL above</small></span></label>
    <label class="check"><input type="checkbox" id="lContracts"><span>Contracts — schema conformance<small>switched on automatically when a published document was found</small></span></label>
    <label class="check"><input type="checkbox" id="lA11y"><span>Accessibility — axe against the declared standard</span></label>
    <label class="check"><input type="checkbox" id="lDb"><span>Database — read-only query vocabulary<small>only when a fact has no UI and no API</small></span></label>
    <button id="preview">Preview what will be written</button>
  </section>

  <section id="s4" aria-disabled="true">
    <div class="step">Step 4</div>
    <h2>Credentials</h2>
    <p class="explain">
      One login per role. Specs never see these &mdash; they resolve at run time through the
      <code>secrets</code> fixture, and the generated code carries the <i>reference</i>, never
      the value.
      <br>
      <b>Signing in once</b> is optional and does two things: it proves the locators above
      actually work, and it derives the one locator nothing can read from a page at rest &mdash;
      the control that only appears <i>after</i> you are signed in. It tries exactly once,
      because repeated failures lock accounts and the account it would spend is the one the
      whole suite depends on.
    </p>
    <div id="credentials"></div>
    <button class="secondary" id="verify">Sign in once, to prove the locators work</button>
    <div class="status" id="verifyStatus"></div>
  </section>

  <section id="s5" aria-disabled="true">
    <div class="step">Step 5</div>
    <h2>Write it</h2>
    <p class="explain">
      Nothing is written until you press the button, and nothing is ever overwritten &mdash; if
      any of these files exist the whole thing is refused. Afterwards the same checks
      <code>npm run target:doctor</code> runs are shown, so the target is known to be sound
      before you leave the page.
    </p>
    <div id="plan"></div>
    <button id="create">Create the target</button>
    <div class="status" id="result"></div>
  </section>
</main>
<script>
const TOKEN = ${JSON.stringify(token)};
const $ = (id) => document.getElementById(id);
let probed = null;
let marker = null;

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

const enable = (id) => $(id).setAttribute('aria-disabled', 'false');
const text = (value) => document.createTextNode(value);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
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
    apiBaseURL: $('apiBaseURL').value.trim() || undefined,
    apiServices: collectServices(),
    environment: $('env').value.trim(),
    roles: list($('roles').value),
    testIdAttribute: $('testId').value.trim(),
    secretSource: $('secrets').value,
    a11yStandard: $('a11y').value.trim(),
    include: {
      api: $('lApi').checked,
      db: $('lDb').checked,
      contracts: $('lContracts').checked,
      a11y: $('lA11y').checked,
    },
    signIn,
    contractDocument: probed && probed.contract
      ? { filename: probed.contract.filename, contents: probed.contract.contents }
      : undefined,
  };
}

/*
   Service rows are add/remove rather than a fixed count: an application has as
   many back ends as it has, and a row added by accident has to be removable or
   the form refuses to plan over a blank field somebody cannot get rid of.
*/
function addServiceRow(name, url) {
  const row = el('div', 'service');
  const nameInput = el('input');
  nameInput.type = 'text'; nameInput.placeholder = 'billing'; nameInput.autocomplete = 'off';
  nameInput.value = name || '';
  nameInput.setAttribute('aria-label', 'Service name');
  const urlInput = el('input');
  urlInput.type = 'text'; urlInput.placeholder = 'https://billing.staging.acme.example';
  urlInput.autocomplete = 'off'; urlInput.value = url || '';
  urlInput.setAttribute('aria-label', 'Service base URL');
  const remove = el('button', 'secondary', 'Remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove this service');
  remove.onclick = () => row.remove();
  row.append(nameInput, urlInput, remove);
  $('services').append(row);
}

function collectServices() {
  const services = {};
  for (const row of $('services').children) {
    const [nameInput, urlInput] = row.querySelectorAll('input');
    const name = nameInput.value.trim(), url = urlInput.value.trim();
    if (name || url) services[name] = url;
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
      apiBaseURL: $('apiBaseURL').value.trim(),
      confirmedTestEnvironment: $('confirmTest').checked,
    });
    renderFindings(probed);
    status.textContent = 'Read the application.';
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

renderCredentials();
</script>
</body>
</html>`;
}
