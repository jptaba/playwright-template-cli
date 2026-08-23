import {
  DASHBOARD_PAGES,
  checkField,
  field,
  overview,
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
  .findings > div { font-size: .9rem; margin: .2rem 0; }

  /*
     A step that cannot be reached yet is not on the page.

     Every section used to render on first paint and merely carry \`inert\`. The
     gating was honest — each one said what would unlock it — and the page was
     still 3888px at 1280x720 before anybody had typed a character, 61% of it
     sections nothing could touch. Hiding is what the overview above pays for:
     somebody who can see the shape of the journey will accept being shown one
     step of it.
  */
  section.pending { display: none; }
  section.revealed { animation: reveal .3s ease-out; }
  @keyframes reveal {
    from { opacity: 0; transform: translateY(-.4rem); }
    to { opacity: 1; transform: none; }
  }

  /*
     A step the page already has the answer to folds to one line.

     Revealing one step at a time fixed the *opening* of this page — 3888px
     down to 1714px — and left the far end alone: measured on the running
     wizard with all five steps reached, 4090px at 1280x720, of which 2675px
     was steps already answered. The step somebody was actually on was 234px
     of it, below three and a half screens of settled questions.

     Folded rather than hidden, and the difference is the whole design. What
     was answered stays legible on the line, the value stays in the field, and
     "Change this" puts it back — so this stays a way of checking what you
     typed two steps ago, which is the thing a completed step is for.
  */
  section[data-folded="true"] > *:not(.head):not(.fold) { display: none; }
  section:not([data-folded="true"]) > .fold { display: none; }
  .fold {
    display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap;
    margin-top: .4rem;
  }
  .fold-what {
    color: var(--muted); font-size: .85rem;
    overflow-wrap: anywhere;
  }
  .fold button { margin: 0; padding: .3rem .6rem; font-size: .8rem; }

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
  /* A step that is not on the page yet has nothing to link to. */
  ol.steps a[aria-disabled="true"] { pointer-events: none; }
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
  <section id="pre">
    <div class="head">
      <h2>Before you start</h2>
    </div>
    <p class="explain">
      Five steps. Each appears as the one before it is done.
    </p>
${overview([
  {
    title: 'You bring',
    items: [
      'A URL — a test deployment, never production',
      'The roles the suite signs in as',
      'Where credentials live, and the login if it is local',
    ],
  },
  {
    title: 'It reads for you',
    items: [
      'Which attribute <code>getByTestId</code> reads',
      'The sign-in field names a screen reader announces',
      'Whether it publishes an OpenAPI document',
    ],
  },
])}
  </section>

  <section id="s0">
    <div class="head">
      <h2>Which application</h2>
      <span class="badge manual" id="draftState">nothing in progress</span>
    </div>
    <p class="explain">
      Pick one to see its settings. Leave it on <b>New application</b> to add one.
    </p>
    <details class="more">
      <summary>What is kept when you leave this page</summary>
      <div class="body">
        <p>What you type is saved as you go, so switching to another tab and back no longer empties
        the form.</p>
        <p><b>Credentials are the exception.</b> They are never written to the draft, because a
        draft that remembered one would be a password on disk. Step 4 is the only thing you
        re-enter.</p>
      </div>
    </details>
    <label for="pick">Application</label>
    <select id="pick"></select>
    <button id="addApp">Add an application</button>
    <button class="secondary" id="editApp" hidden>Change its settings</button>
    <button id="saveApp" hidden>Save the changes</button>
    <button class="secondary" id="cancelEdit" hidden>Cancel</button>
    <div class="status" id="pickStatus"></div>
    <div id="editOut"></div>
  </section>

  <!--
    Step 1 starts closed like the four after it.

    Adding an application happens once and is then never done again, and this
    used to be the page the dashboard opened on with its wizard already
    running — so the daily reader met a half-filled form for a job they were
    not doing. It opens when somebody says they are adding one, or when a
    half-finished draft is waiting, and otherwise this page is what it is the
    rest of the time: the list of applications and their settings.
  -->
  <section id="s1" class="pending" inert>
    <div class="head">
      <span class="step">Step 1</span>
      <h2>The application</h2>
      <span class="badge manual">Needs your input</span>
    </div>
    <p class="explain">
      Name it, and say where it runs. Everything below follows from these two.
    </p>
    <div class="row">
      ${field({
        id: 'name',
        label: 'Target name',
        hint: 'lower-case, hyphenated — becomes a directory and a <code>TARGET</code> value',
        control: '<input type="text" id="name" placeholder="acme-shop" autocomplete="off">',
      })}
      ${field({
        id: 'env',
        label: 'Environment',
        hint: 'which deployment this profile points at',
        control: '<input type="text" id="env" value="staging" autocomplete="off">',
      })}
    </div>
    ${field({
      id: 'baseURL',
      label: 'Base URL',
      hint: 'the test environment, never production',
      control:
        '<input type="text" id="baseURL" placeholder="https://staging.acme.example" autocomplete="off">',
    })}

    <!-- A group of rows rather than one control, so it names itself with
         aria-labelledby: a label pointing at a div names nothing. -->
    <div class="field" role="group" aria-labelledby="servicesName" aria-describedby="services-hint">
      <span class="fieldname" id="servicesName">Service APIs</span>
      <small class="hint" id="services-hint">optional, often on other hosts — a spec calls each by name, as <code>apis.billing</code></small>
      <div id="services" class="field-body"></div>
      <button class="secondary" type="button" id="addService">Add another service</button>
    </div>

    ${checkField({
      id: 'confirmTest',
      label: 'This is a test environment.',
      hint: 'Reading it loads pages in a real browser. It signs nothing in and submits no forms.',
      control: '<input type="checkbox" id="confirmTest">',
    })}
    <button id="probe">Read the application</button>
    <button class="secondary" id="skipProbe">Skip and fill in by hand</button>
    <div class="status" id="s1status"></div>
  </section>

  <section id="s2" class="pending" inert>
    <div class="head">
      <span class="step">Step 2</span>
      <h2>What was read from it</h2>
      <span class="badge locked" data-ready="Filled in for you" data-kind="auto">Locked</span>
    </div>
    <p class="explain">
      Read from the running application. <b>Nothing to do unless something looks wrong.</b>
    </p>
    <details class="more">
      <summary>What these two things are</summary>
      <div class="body">
        <p><b>Test-id attribute</b> — what <code>getByTestId</code> reads on this application.
        Applications disagree (<code>data-test</code>, <code>data-testid</code>,
        <code>data-qa</code>), and it is a property of the app rather than of the framework.</p>
        <p><b>The three names</b> are <i>accessible names</i>: what a screen reader announces and
        what <code>getByRole</code> matches. Usually the field's label, and usually <i>not</i> its
        placeholder — a name copied from a placeholder produces a locator that times out on a field
        plainly on screen, which is the commonest way a generated pack arrives broken.</p>
      </div>
    </details>
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
      ${field({
        id: 'uName',
        label: 'Username field',
        hint: 'accessible name',
        control: '<input type="text" id="uName" autocomplete="off">',
      })}
      ${field({
        id: 'pName',
        label: 'Password field',
        hint: 'accessible name',
        control: '<input type="text" id="pName" autocomplete="off">',
      })}
      ${field({
        id: 'sName',
        label: 'Submit control',
        hint: 'accessible name',
        control: '<input type="text" id="sName" autocomplete="off">',
      })}
    </div>
  </section>

  <section id="s3" class="pending" inert>
    <div class="head">
      <span class="step">Step 3</span>
      <h2>Roles and layers</h2>
      <span class="badge locked" id="s3Badge" data-ready="Needs your input" data-kind="manual">Locked</span>
    </div>
    <p class="explain">
      Defaults are set. Change only what is wrong for this application.
    </p>
    <details class="more">
      <summary>Roles and layers, and why a wrong one hurts</summary>
      <div class="body">
        <p><b>Roles</b> are the identities the suite signs in as. Each gets its own stored session,
        and the first is the default for <code>authedPage</code>.</p>
        <p><b>Layers</b> are optional vocabularies. Switch one on only if the application really
        has it: a capability declared on but absent fails obscurely, while one declared off is
        reported as “not applicable” rather than as a silent zero.</p>
      </div>
    </details>
    ${field({
      id: 'roles',
      label: 'Roles',
      hint: 'comma separated',
      control: '<input type="text" id="roles" value="standard" autocomplete="off">',
    })}
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
    <div class="field">
      <span class="fieldname">Where credentials come from</span>
      <small class="hint">and how they are laid out there</small>
    </div>
    <div id="vaultBox" hidden>
      <p class="explain">
        No credential goes here. Vault authentication comes from the environment.
      </p>
      <details class="more">
        <summary>Why there is no token field</summary>
        <div class="body">
          <p>An address, a namespace and a mount are configuration. A token is a credential, and
          this page is built on the rule that the agent writes the <i>reference</i> while a person
          writes the value.</p>
          <p>So authentication stays where it already is: <code>vault login</code> with your
          identity provider and an exported <code>VAULT_TOKEN</code> locally, or the JWT CI
          supplies. The check below uses whichever of those this machine already has.</p>
        </div>
      </details>
      <div class="row">
        <div>
          <label for="vaultAddr">Vault address</label>
          <input type="text" id="vaultAddr" placeholder="https://vault.example" autocomplete="off">
        </div>
        ${field({
          id: 'vaultNamespace',
          label: 'Namespace',
          hint: 'Enterprise only',
          control: '<input type="text" id="vaultNamespace" autocomplete="off">',
        })}
      </div>
      <label for="vaultMount">KV mount</label>
      <input type="text" id="vaultMount" value="kv" autocomplete="off">
    </div>
    <div class="row">
      ${field({
        id: 'accountType',
        label: 'Account type',
        hint: 'the path segment under the root',
        control: '<input type="text" id="accountType" value="workforce" autocomplete="off">',
      })}
      ${field({
        id: 'credentialRoot',
        label: 'Credential root',
        hint: 'defaults from the target name',
        control: '<input type="text" id="credentialRoot" autocomplete="off">',
      })}
    </div>
    <p class="explain">
      It reads one path and reports the field names it holds, never a value.
    </p>
    <button class="secondary" id="vaultCheck">Check where credentials come from</button>
    <div class="status" id="vaultStatus"></div>

    <span class="fieldname">Optional layers</span>
    ${checkField({
      id: 'lApi',
      label: 'API — typed HTTP clients',
      hint: 'needs at least one service above',
      control: '<input type="checkbox" id="lApi">',
    })}
    ${checkField({
      id: 'lContracts',
      label: 'Contracts — schema conformance',
      hint: 'switched on automatically when a published document was found',
      control: '<input type="checkbox" id="lContracts">',
    })}
    ${checkField({
      id: 'lA11y',
      label: 'Accessibility — axe against the standard',
      control: '<input type="checkbox" id="lA11y">',
    })}
    ${checkField({
      id: 'lDb',
      label: 'Database — read-only query vocabulary',
      hint: 'only when a fact has no UI and no API',
      control: '<input type="checkbox" id="lDb">',
    })}
    <button id="preview">Preview what will be written</button>
    <div class="status" id="previewStatus"></div>
  </section>

  <section id="s4" class="pending" inert>
    <div class="head">
      <span class="step">Step 4</span>
      <h2>Credentials</h2>
      <span class="badge locked" data-ready="Needs your input" data-kind="manual">Locked</span>
    </div>
    <p class="explain">
      One login per role. <b>Nothing typed here appears in any response from this page.</b>
      <b>Sign in once before step 5 writes</b> — it derives the signed-in marker, and
      afterwards is too late.
    </p>
    <details class="more">
      <summary>Where these go, and what signing in proves</summary>
      <div class="body">
        <p>Specs never see a credential. They resolve at run time through the <code>secrets</code>
        fixture, and the generated code carries the <i>reference</i> rather than the value.</p>
        <p><b>Signing in once</b> does two things: it proves the locators read in step 2 actually
        work, and it derives the one locator nothing can read from a page at rest — the control
        that only appears <i>after</i> you are signed in.</p>
        <p>It tries <b>exactly once</b>. Repeated failures lock accounts, and the account it would
        spend is the one the whole suite depends on.</p>
      </div>
    </details>
    <div id="credentials"></div>
    <div id="storeBox" hidden>
      <label for="credentialLocation">Store what you type in</label>
      <select id="credentialLocation">
        <option value="private-file">A private file on this machine — gitignored</option>
        <option value="shared-file">The shared file — committed to git</option>
      </select>
      <p class="explain" id="storeNote"></p>
    </div>
    <button class="secondary" id="verify">Sign in once, to prove the locators work</button>
    <button class="secondary" id="assist">Sign in with a browser you can see</button>
    <button class="secondary" id="assistDone" hidden>I am on the home page</button>
    <button class="secondary" id="assistCancel" hidden>Cancel</button>
    <p class="explain" id="assistExplain" hidden>
      A browser opens with the form filled. <b>Do whatever the application asks</b> — a code, a
      prompt, a security question — then press the button.
    </p>
    <div class="status" id="verifyStatus"></div>
    <div id="assistOut"></div>
  </section>

  <section id="s5" class="pending" inert>
    <div class="head">
      <span class="step">Step 5</span>
      <h2>Write the files</h2>
      <span class="badge locked" data-ready="Done for you" data-kind="auto">Locked</span>
    </div>
    <p class="explain">
      <b>Nothing to fill in.</b> Press the button and everything above is written in one go.
    </p>
    <details class="more">
      <summary>What it will and will not do</summary>
      <div class="body">
        <p><b>Nothing is ever overwritten.</b> If any of these files already exist the whole thing
        is refused, because onboarding only ever adds.</p>
        <p>Afterwards the same checks <code>npm run target:doctor</code> runs are shown, so the
        target is known to be sound before you leave the page.</p>
      </div>
    </details>
    <div id="plan"></div>
    <button id="create">Create the target</button>
    <div class="status" id="result"></div>
  </section>

  <details class="danger">
    <summary>Remove an application</summary>
    <p class="explain">
      Removes the profile, the pack, the credential entries, the stored sessions and the cases.
      Nothing else.
    </p>
    <details class="more">
      <summary>Why removing one is a normal thing to do</summary>
      <div class="body">
        <p>It leaves the application-agnostic framework behind, which is what makes it reasonable
        to point this repository at a live application on <code>main</code>: try one, drive it, and
        put the repository back the way it was — with no branch to move between.</p>
      </div>
    </details>
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
 * It began as an answer to "which step am I on" on a page tall enough that the
 * only way to find out was to scroll until a section stopped saying Locked.
 * Now that a step which cannot be reached is not rendered at all, the rail is
 * carrying more: it is the only thing on screen that says how many steps there
 * are and what the later ones will ask for. A wizard whose end nobody can see
 * is worse than a long page, and this plus the preflight panel is what stops
 * that.
 *
 * Entries link to their section, so it is a way *back* as well as a status —
 * but only for a step that is on the page. `refreshStepRail` disables the rest.
 */
const ASIDE = `
  <p class="rail-title">Where you are</p>
  <ol class="steps" id="stepRail">
    <li data-for="s1"><a href="#s1">The application</a></li>
    <li data-for="s2"><a href="#s2">What was read</a></li>
    <li data-for="s3"><a href="#s3">Roles and layers</a></li>
    <li data-for="s4"><a href="#s4">Credentials</a></li>
    <li data-for="s5"><a href="#s5">Write the files</a></li>
  </ol>
  <p class="rail-note" id="railNote">Nothing is written until step 5, and nothing is ever
  overwritten.</p>
`;

const SCRIPT = `
let probed = null;
let marker = null;
/*
   Whether step 5 has already written the pack.

   Signing in is offered before *and* after the write, and the two mean very
   different things. Before, the derived marker is written into the locators
   file. After, nothing is written — the scaffold never overwrites — so the
   marker is derived, displayed, and dropped, leaving the guess in the file and
   a comment claiming verification "was skipped or did not succeed", which by
   then is untrue. That silence cost a whole onboarding: the sign-in was proven
   to work and \`setup:auth\` still failed on a locator nobody was told about.
*/
let written = false;
let applications = [];
/** The new-application form, remembered between page loads. */
let draft = { fields: {}, flags: {}, services: [], savedAt: '' };
let restoring = false;
/*
   The Vault shape a connection check passed for, or null.

   A Vault target types no credential, so signing in from this page was not
   offered for one at all — and every Vault target therefore shipped a guessed
   signedInMarker and a hand-edit. It is offered once the check has proven the
   credential is there, because at that point the server can read it for that
   one verification and nothing has to reach the browser.

   Held as the shape it was proven for rather than as a boolean, for the reason
   plannedShape already learned: moving the mount after a passing check leaves
   a button that would sign in with something nobody proved.
*/
let vaultProven = null;

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

  /*
     Reopen what the saved answers have already earned.

     The draft keeps step 2's readings as well as step 1's typing, so after a
     reload every field these sections contain is filled — and they were locked
     anyway, behind "unlocks once step 1 has read the application". It had been
     read. The only way back in was to run the 12-to-18 second probe again to
     reopen sections that were already complete.

     Steps 4 and 5 stay shut on purpose: they unlock on the *preview*, which is
     a real answer computed from the form rather than a state to restore, and
     it costs one click and a fraction of a second.
  */
  if (probeAnswersIn(saved)) {
    enable('s2');
    enable('s3');
  } else {
    /*
       And put them away again when they have not.

       This is the only path back: selecting an onboarded application opens
       these two to show its settings, and choosing "— New application —"
       afterwards has to leave the page as somebody who had just arrived would
       find it. Without it, step 2 sat on screen holding a default test-id
       attribute for an application nothing had read.
    */
    relock('s2');
    relock('s3');
  }
  restoring = false;
}

/**
 * Whether a draft carries what step 1's read produced.
 *
 * The test-id attribute and the three accessible names are the readings the
 * generated locators are built from; without them step 2 is empty and there is
 * nothing to unlock.
 */
function probeAnswersIn(saved) {
  const fields = saved.fields || {};
  return Boolean(fields.testId && fields.uName && fields.pName && fields.sName);
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
  /*
     An onboarded application's settings live in steps 1, 2 and 3, so those
     three are what a selection has earned — read-only, because the inputs are
     disabled, and on the page, because otherwise "read-only" describes fields
     nobody can see. Steps 4 and 5 stay away: this application has already been
     written, and there is nothing in either of them to do to it.

     Step 1 is in that list now that it no longer starts open. It holds the
     name, the environment and the base URL, which are the three settings
     somebody picking an application is most likely to have come to check.
  */
  enable('s1');
  enable('s2');
  enable('s3');
  restoring = false;

  const when = app.onboardedAt.slice(0, 16).replace('T', ' ');
  $('pickStatus').className = 'status';
  $('pickStatus').replaceChildren(
    el('div', 'note',
      'Onboarded ' + when + ' · ' + app.packFiles + ' file(s) · read-only. ' +
      'Use "Change its settings" to edit.'),
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

$('addApp').onclick = () => startAdding();

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
    /*
       Two reasons the wizard opens without being asked.

       A **draft** is somebody who was already adding an application and came
       back; making them press "Add an application" again to see their own
       half-typed form would read as having lost it.

       **No applications at all** is the same judgement landingPath() makes one
       layer up: with nothing configured, adding one is not a job among others,
       it is the only job. A button in front of the only useful control on an
       otherwise empty page is ceremony.
    */
    if (draft.savedAt || applications.length === 0) startAdding();
    $('addApp').hidden = !isPending('s1');
    return;
  }
  /* Picking an existing application is not adding one. */
  $('addApp').hidden = true;
  const app = applications.find((candidate) => candidate.name === chosen);
  if (app) showApplication(app);
}

function isPending(id) {
  return $(id).hasAttribute('inert');
}

/**
 * Open the wizard.
 *
 * Step 1 only. The four after it are earned the way they always were — this
 * changes when the wizard starts, not how it advances.
 */
function startAdding() {
  $('addApp').hidden = true;
  if (isPending('s1')) enable('s1');
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

  /*
     Which Vault this machine is connected to, back in the fields it was typed
     into. It is not part of the draft, and the difference matters: a draft is
     the half-typed form and is cleared once an application is written, while
     the connection is a property of the machine and outlives every application
     onboarded through it. Only ever filled in, never blanked — a reload must
     not wipe an address somebody is halfway through typing.
  */
  if (state.vault && state.vault.address && !$('vaultAddr').value) {
    $('vaultAddr').value = state.vault.address;
    $('vaultNamespace').value = state.vault.namespace || '';
    $('vaultMount').value = state.vault.kvMount || '';
  }

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
     A caller that asked to keep the selection gets it, when it still exists.
     Saving an edit reloads — and landing on a *different* application after
     pressing Save reads as "it did not work", which is how somebody presses it
     twice. A removal reloads too, and there the target is gone, so the fall
     through to the default is the right answer rather than a special case.

     Otherwise: always "— New application —".

     This used to fall back to the most recently onboarded application, which
     meant the command named \`npm run onboard\` greeted a returning user with
     a *different* application, read-only, every step locked, and the note "use
     Change its settings to edit". The page opened on the one thing it was not
     there to do. Onboarding something is why anybody runs this; the
     applications already on disk are one selection away and are not going
     anywhere.
  */
  const stillThere = wanted && applications.some((app) => app.name === wanted);
  select.value = stillThere ? wanted : '';

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

   The section arrives on the page, with a short fade so it reads as something
   appearing rather than as the page jumping. The inert attribute comes off, so
   it is reachable by mouse *and* keyboard — the first version used a
   pointer-events rule, which stops one and not the other. And the badge stops
   saying "Locked" and starts saying what the step wants.

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
    const state = !open[i] ? 'locked' : i < lastOpen ? 'done' : 'open';
    /*
       The section carries the same state as its rail entry.

       Four cards of identical weight, one of which is the one to act on, is a
       page that has to be read to be navigated. The rail already worked this
       out; the only thing missing was telling the section, so the eye can find
       the current step without reading any of them.
    */
    $(ids[i]).dataset.state = state;
    const entry = document.querySelector('#stepRail li[data-for="' + ids[i] + '"]');
    if (!entry) continue;
    entry.dataset.state = state;
    /*
       A rail entry for a step that is not on the page is a link to nothing —
       it used to at least scroll to a visible locked section. Disabled both
       ways: pointer-events for the mouse, tabindex for the keyboard, because
       leaving one of the two is how a control becomes reachable only by the
       people least able to tell it is broken.
    */
    const link = entry.querySelector('a');
    if (!link) continue;
    if (open[i]) {
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      /*
         The rail is the way back, so it has to arrive at something readable.
         Scrolling to a folded step lands on its one-line summary, which is a
         link that appears to do nothing to the person who asked to go back.
      */
      link.onclick = () => unfold(ids[i]);
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    }
  }
}

function enable(id) {
  const section = $(id);
  if (!section.hasAttribute('inert')) return;
  section.classList.remove('pending');
  section.classList.add('revealed');
  section.removeAttribute('inert');
  const badge = section.querySelector('.badge');
  if (badge && badge.dataset.ready) {
    badge.textContent = badge.dataset.ready;
    badge.className = 'badge ' + (badge.dataset.kind || 'manual');
  }
  refreshStepRail();
}

/** The exact reverse, for the one transition that goes backwards. */
function relock(id) {
  const section = $(id);
  if (section.hasAttribute('inert')) return;
  section.classList.add('pending');
  section.classList.remove('revealed');
  section.setAttribute('inert', '');
  unfold(id);
  const badge = section.querySelector('.badge');
  if (badge && badge.dataset.ready) {
    badge.textContent = 'Locked';
    badge.className = 'badge locked';
  }
  refreshStepRail();
}

/*
   What a folded step says it holds.

   Read off the fields themselves rather than remembered, for the reason
   \`refreshStepRail\` already gives about deriving state: a second copy of the
   answer is a second thing that can disagree with the form. A summary that
   drifted from the field under it would be worse than no summary, because the
   whole point of folding is that somebody can trust the line instead of
   opening the step.
*/
const FOLD_SUMMARY = {
  s1: () => [$('name').value, $('baseURL').value].filter(Boolean).join(' · '),
  s2: () => {
    const names = [$('uName').value, $('pName').value, $('sName').value].filter(Boolean);
    const read = [$('testId').value, $('signInPath').value].filter(Boolean).join(' · ');
    return names.length ? read + ' · ' + names.join(', ') : read;
  },
  s3: () => {
    const layers = [
      ['lApi', 'api'], ['lContracts', 'contracts'], ['lA11y', 'a11y'], ['lDb', 'db'],
    ].filter(([id]) => $(id).checked).map(([, name]) => name);
    const roles = $('roles').value || 'no roles';
    return roles + ' · ' + $('secrets').value + ' · ' + (layers.length ? layers.join(', ') : 'no optional layers');
  },
};

/**
 * Fold a step the page now holds the answer to.
 *
 * **Not the rail's "done" state**, and that distinction is the item. "done"
 * means "behind the current step", which after a preview is true of step 4 —
 * the credentials somebody still has to type. Folding on position would fold
 * the field they were about to fill. The trigger here is the answer itself:
 * the read for steps 1 and 2, the preview for step 3.
 */
function fold(id) {
  const section = $(id);
  if (section.hasAttribute('inert')) return;
  const summarise = FOLD_SUMMARY[id];
  let line = section.querySelector('.fold');
  if (!line) {
    line = el('div', 'fold');
    section.append(line);
  }
  const change = el('button', 'secondary', 'Change this');
  change.type = 'button';
  change.onclick = () => unfold(id);
  line.replaceChildren(el('span', 'fold-what', summarise ? summarise() : ''), change);
  section.dataset.folded = 'true';
}

/** Put a folded step back, with everything it held still in it. */
function unfold(id) {
  delete $(id).dataset.folded;
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
      // The operator's own answer, tried before the guesses. A hint the tool
      // discards is worse than not offering the field.
      signInPathHint: $('signInPath').value.trim(),
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

/*
   The credential root, defaulted from the target name rather than stored.

   Left empty the field shows what the scaffolder has always written, so
   somebody who does not care sees the same pack as before; typed into, it is
   theirs. Reading it as a default rather than filling the box on every
   keystroke means the name can still change afterwards without stranding a
   root nobody chose.
*/
function credentialRoot() {
  const typed = $('credentialRoot').value.trim();
  if (typed) return typed;
  const name = $('name').value.trim();
  return name ? 'qa/' + name + '/pools' : '';
}

/** Which Vault, as the check and the sign-in both send it. */
function vaultConnection() {
  return {
    address: $('vaultAddr').value.trim(),
    namespace: $('vaultNamespace').value.trim(),
    kvMount: $('vaultMount').value.trim(),
  };
}

/*
   Where a role's credential lives, built from the two fields the profile will
   be written with — so what a check proves and what a sign-in reads cannot be
   two different paths.
*/
function credentialPath(role) {
  return credentialRoot() + '/' + $('accountType').value.trim() + '/' + role + '/1';
}

/** Everything a passing Vault check proved, as one comparable string. */
function vaultShape() {
  const role = rolesTyped()[0] || '';
  return JSON.stringify([vaultConnection(), credentialPath(role)]);
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
    credentialRoot: credentialRoot(),
    accountType: $('accountType').value.trim(),
    credentialLocation: $('credentialLocation').value,
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

/*
   Everything the plan depends on, as one comparable string.

   Deliberately not the whole of options(): signing in changes the marker and
   the gauntlet, and neither of those changes which files get written. A
   fingerprint that moved when they did would nag about a preview that is still
   perfectly accurate.
*/
function planShape() {
  const settings = options();
  return JSON.stringify([
    settings.name,
    settings.roles,
    settings.secretSource,
    settings.include,
    settings.apiServices,
    settings.apiBaseURL || '',
    Boolean(settings.contractDocument),
    // These two are the credential *paths* in the plan, so a preview taken
    // before they moved is describing something else.
    settings.credentialRoot,
    settings.accountType,
  ]);
}

/** The shape the visible plan was computed from, or null when there is none. */
let plannedShape = null;

/*
   Step 3's own sign that its button did something.

   The plan it produces renders two sections down, in step 5, and step 3's
   badge stayed "Needs your input" whether or not the preview had run — a
   section that gives no sign its own button worked. This is that sign: the
   badge turns positive and a line next to the button says how many files and
   where to look, without moving the full list out of step 5.
*/
function setPreviewBadge(label, kind) {
  const badge = $('s3Badge');
  badge.textContent = label;
  badge.className = 'badge ' + kind;
}

/*
   A preview that no longer describes the form.

   The plan renders once and then sat there while step 3 kept changing, still
   badged "Done for you". Create re-reads the live form — which is the correct
   behaviour — so previewing six files, ticking the accessibility layer and
   pressing Create wrote seven, and the extra one was never shown. The page
   promised one thing and did another.

   Recomputing on every keystroke would mean a server call per character, so
   the plan is invalidated instead: the file list goes, Create is refused, and
   the button that fixes it is named.
*/
function markPlanStale() {
  if (plannedShape === null) return;
  plannedShape = null;
  /*
     And unfold what has to be answered again. A step folded on the strength of
     a preview that no longer describes the form is the summary lying about
     being settled — the same defect as the stale plan itself, one section up.
  */
  unfold('s1'); unfold('s2'); unfold('s3');
  $('create').disabled = true;
  const box = $('plan');
  box.replaceChildren(el('div', 'note',
    'The shape changed after this was previewed, so what would be written is no longer what ' +
    'was listed. Press "Preview what will be written" in step 3 again.'));
  setPreviewBadge('Needs your input', 'manual');
  $('previewStatus').replaceChildren();
}

/*
   One listener rather than a handler per control: step 3 grows rows, and a
   service added after the preview changes the plan exactly as much as a
   checkbox does.
*/
for (const event of ['input', 'change']) {
  document.addEventListener(event, () => {
    /*
       The root defaults from the target name, so it has to follow it. Shown as
       a placeholder rather than filled in: the field is empty until somebody
       chooses otherwise, and an empty field that displays what will happen is
       the honest version of a default.
    */
    $('credentialRoot').placeholder = credentialRoot();
    /*
       A connection proven for one mount says nothing about another. Withdrawn
       the moment the shape moves, so the sign-in button never outlives the
       check that earned it.
    */
    if (!restoring && vaultProven !== null && vaultShape() !== vaultProven) {
      vaultProven = null;
      $('vaultStatus').className = 'status';
      $('vaultStatus').replaceChildren(text(
        'That changed what would be read, so the connection is no longer proven. ' +
        'Check it again.'));
      renderCredentials();
    }
    // Not while the draft is being replayed into the form, and not once the
    // files exist — at that point Create is spent and there is nothing to warn.
    if (restoring || written || plannedShape === null) return;
    if (planShape() !== plannedShape) markPlanStale();
  }, true);
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

/*
   What the chosen file does with the value, said where the choice is made.

   The committed one is a legitimate choice — a vendor demo that prints its own
   logins — and a dangerous default, so it says what it costs rather than
   relying on somebody knowing which of two similarly-named files git tracks.
*/
function renderStoreNote() {
  const shared = $('credentialLocation').value === 'shared-file';
  $('storeNote').textContent = shared
    ? 'config/secrets.local.json is in git. Choose this only for logins the vendor already ' +
      'publishes — a password committed here is in the history of every clone.'
    : 'config/secrets.private.json, which is gitignored and takes precedence. Plain text on ' +
      'this machine, and not backed up.';
}

$('credentialLocation').onchange = renderStoreNote;

function renderCredentials() {
  const box = $('credentials');
  /*
     What was typed, kept across the rebuild.

     This function replaces the whole block, and every preview calls it — so
     typing a real credential, pressing "Sign in once", watching it report
     "Signed in", then pressing Preview and Create wrote the scaffolder's
     "replace-me" placeholder to the secret store. The page had just proved
     the credential worked and then wrote a different one, with a success
     panel and no warning anywhere.

     Measured onboarding a real application: setup:auth answered "Invalid
     credentials" against a store holding replace-me / replace-me, minutes
     after the same page signed in successfully with the real values.

     Keyed by role, so a credential follows its role across a re-render and a
     role that has been removed takes its value with it.
  */
  const typed = {};
  for (const input of box.querySelectorAll('input')) {
    if (input.value) typed[input.id] = input.value;
  }
  box.replaceChildren();
  const roles = rolesTyped();
  /*
     A status left over from the other source describes a page that no longer
     exists. Switching to a local file after the Vault refusal used to leave
     "there is nothing for this button to send" sitting above the two inputs it
     had just been wrong about.
  */
  $('verifyStatus').replaceChildren();
  $('verifyStatus').className = 'status';

  const vault = $('secrets').value === 'vault';
  /*
     Shown only for the source it describes. A local target reads a file in
     this repository and has no address, no mount and no namespace, so the
     whole block is noise there — and the page's problem was never too few
     fields, it was fields that do not apply.
  */
  $('vaultBox').hidden = !vault;
  $('credentialRoot').placeholder = credentialRoot();
  /*
     Where a typed password lands, asked rather than assumed.

     It was assumed, and what it assumed was config/secrets.local.json — which
     git tracks. So onboarding a real application put a real password in the
     repository, while .gitignore and the Test users page both said anything
     real belongs in the private file. Only for a local source: a Vault target
     types nothing here.
  */
  $('storeBox').hidden = vault;
  renderStoreNote();
  /*
     Offering a button that cannot work, and only explaining after it is
     pressed, is the dead end this section had. The explanation is the same one
     the server gives; it is simply given before the click rather than after.

     Never while an assisted sign-in is open, though: that flow shows Cancel in
     the same row, and hiding it would leave a headed browser on screen with
     nothing on the page able to close it.
  */
  const vaultCanSignIn = vault && vaultProven !== null;
  if (assistTimer === null) {
    $('verify').hidden = vault && !vaultCanSignIn;
    /*
       The assisted sign-in fills the form and hands the browser over, so a
       person watches the credential go in. That is the one thing a Vault
       target must not do with a value it never typed, so it stays hidden.
    */
    $('assist').hidden = vault;
  }

  if (vault) {
    box.append(el('div', 'note',
      'Vault holds these. Nothing is written here — the agent writes the reference, a person ' +
      'writes the value. The exact paths appear after the target is created.'));
    box.append(el('div', 'note', vaultCanSignIn
      ? 'The connection checked out, so signing in once is offered: the credential at ' +
        credentialPath(roles[0] || '') + ' is read where the browser runs, never here. It ' +
        'derives signedInMarker and writes it in step 5.'
      : 'Signing in needs a credential, and this page holds none. Check the connection in ' +
        'step 3 first — once the credential is found there, the sign-in can be driven from ' +
        'it. Without one, signedInMarker is written as a guess and setup:auth fails until ' +
        'locators/sign-in.ts is corrected by hand.'));
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
    if (typed[ui.id]) ui.value = typed[ui.id];
    u.append(ui);
    const p = el('div');
    p.append(Object.assign(el('label'), { textContent: role + ' — password', htmlFor: 'cp-' + role }));
    const pi = el('input'); pi.type = 'password'; pi.id = 'cp-' + role; pi.autocomplete = 'off';
    if (typed[pi.id]) pi.value = typed[pi.id];
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
    if (vaultProven !== null) return null;
    return (
      'Credentials for this target live in Vault, and this page holds none to send. Check the ' +
      'connection in step 3 first: once one path resolves, the sign-in is read from Vault ' +
      'where the browser runs. Or prove it afterwards with: TARGET=<name> npx playwright test ' +
      '--project=setup:auth'
    );
  }
  const user = $('cu-' + roles[0]), pass = $('cp-' + roles[0]);
  if (!user || !pass || !user.value || !pass.value) {
    return 'Fill in the ' + roles[0] + ' credentials first.';
  }
  return null;
}

/*
   Step 5's warning that signedInMarker is about to be a guess.

   The preview rendered it once and nothing refreshed it, so signing in
   afterwards — which derives a real marker and does write it — left the last
   screen before the write still saying setup:auth would fail and that it was
   too late to fix. The file written was correct; the page was wrong about it.
   That is the same defect as a plan that no longer matches the form, on the
   same screen, so it is repaired the same way: one place decides, and every
   path that moves the marker calls it.

   Not refreshed once the pack is written. The guess *was* written by then, and
   markerArrivedTooLate is what speaks to that.
*/
function renderMarkerWarning() {
  const box = $('markerWarning');
  if (!box) return;
  box.replaceChildren();
  if (marker) return;
  box.append(el('div', 'note',
    'No sign-in has been verified yet, so signedInMarker will be written as a guess — ' +
    'it is the one locator that cannot be read from a page at rest. setup:auth will fail ' +
    'until it is corrected by hand. ' +
    ($('secrets').value === 'vault' && vaultProven === null
      // Telling a Vault operator to press a button this page does not show
      // them is worse than saying nothing.
      ? 'This page cannot sign in for a Vault target until its connection has been checked in ' +
        'step 3. Check it, or derive the marker from a snapshot of the signed-in page — ' +
        'npm run explore — and correct locators/sign-in.ts afterwards.'
      : 'Signing in once in step 4 first derives it and writes it for you; doing it ' +
        'afterwards is too late, because these files are never overwritten.')));
}

/*
   What to say about a marker derived *after* the pack was written.

   The scaffold never overwrites, so there is nothing to press: the honest
   answer is the exact edit, in the one file it belongs in. Returns null before
   the write, when the marker is about to be used properly, and when nothing
   was derived to talk about.
*/
function markerArrivedTooLate(derived) {
  if (!written || !derived) return null;

  const name = $('name').value.trim() || '<name>';
  const file = 'src/targets/' + name + '/locators/sign-in.ts';
  const call = "page.getByRole('" + derived.role + "', { name: '" + derived.name.replace(/'/g, "\\\\'") + "' })";

  const box = el('div', 'diag error');
  box.append(el('b', '', 'This was not written to the pack.'), text(
    ' The files already exist and onboarding never overwrites them, so the marker above ' +
    'was derived and then dropped. ' + file + ' still holds the guess, and its comment still ' +
    'says the sign-in was skipped. Change signedInMarker to:'));
  const edit = el('pre');
  edit.textContent = 'signedInMarker: (page: Page): Locator =>\\n  ' + call + ',';
  box.append(edit);
  box.append(el('div', 'fix',
    'Then TARGET=' + name + ' npx playwright test --project=setup:auth to prove it. ' +
    'Signing in before pressing "Create the target" writes this for you.'));
  return box;
}

/*
   Prove the Vault connection before the pack is written against it.

   A Vault target could not previously find out that its mount was wrong, or
   that its fields are called something other than username and password, until
   setup:auth timed out minutes later on a locator that was never the problem.
   This is the same "read it, do not guess it" move step 1 makes for the
   application, pointed at the secret store.

   The path is built from the same two fields the profile will be written with,
   so what gets proven and what gets written cannot drift apart.
*/
$('vaultCheck').onclick = async () => {
  const status = $('vaultStatus');
  const role = rolesTyped()[0];
  if (!role) {
    status.className = 'status error';
    status.textContent = 'Name at least one role first — the path to check ends with it.';
    return;
  }
  const root = credentialRoot();
  if (!root) {
    status.className = 'status error';
    status.textContent = 'Name the application in step 1 first, or type a credential root.';
    return;
  }

  status.className = 'status';
  status.textContent = 'Reading one path…';
  $('vaultCheck').disabled = true;
  try {
    const result = await post('/api/vault/check', {
      source: $('secrets').value,
      connection: vaultConnection(),
      path: credentialPath(role),
      root,
    });

    /*
       What the check earns: a Vault target that can sign in once. Only on a
       full pass — a credential that exists but has no username is exactly the
       sign-in that would fail obscurely minutes later.
    */
    const proven = result.ok && $('secrets').value === 'vault' ? vaultShape() : null;
    // Re-rendered only when that changed: this button is offered for a local
    // source too, and step 4's inputs are rebuilt empty by a render.
    if (proven !== vaultProven) {
      vaultProven = proven;
      renderCredentials();
    }

    status.className = 'status';
    status.replaceChildren(
      el('span', result.ok ? 'found' : 'missing', result.ok ? 'Found it. ' : 'Not usable yet. '),
      text(result.detail),
    );
    if (result.exists) {
      // Which file answered, where there are two of them with precedence. "It
      // exists" is not the question somebody debugging this actually has.
      status.append(el('div', 'diag', result.path + ' — fields: ' + result.fields.join(', ') +
        (result.origin ? ' — from ' + result.origin : '')));
    }
    /*
       Kept, and then what is still worth saying.

       The suite used to read nothing from this page: it resolved Vault from
       the environment, so a connection proven here was worth nothing to
       setup:auth unless the same values were exported by hand. A proven
       connection is now written down and the suite reads it, so what is left
       to say is the case the file cannot cover — CI, and anybody else's
       machine, where the environment is still the answer and still wins.
    */
    if (result.saved) status.append(el('div', 'found', result.saved));
    if (result.environment.length) {
      status.append(el('div', 'fix', result.saved
        ? 'Somewhere with no such file — CI, or a colleague — the same connection is:'
        : 'The suite reads these from the environment:'));
      const exports = el('pre');
      exports.textContent = result.environment.join('\\n');
      status.append(exports);
    }
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    $('vaultCheck').disabled = false;
  }
};

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
  const fromVault = $('secrets').value === 'vault';
  status.textContent = 'Signing in once…';
  $('verify').disabled = true;
  try {
    /*
       A Vault sign-in sends the path it proved, not a value. The credential is
       read where the browser is driven, so the one thing this page must never
       hold stays out of the request and out of the response.
    */
    const credentials = fromVault
      ? { source: 'vault', connection: vaultConnection(), path: credentialPath(first) }
      : { credentials: { username: $('cu-' + first).value, password: $('cp-' + first).value } };
    const result = await post('/api/verify', {
      baseURL: $('baseURL').value.trim(),
      signIn: { username: $('uName').value, password: $('pName').value, submit: $('sName').value, path: $('signInPath').value },
      ...credentials,
    });
    marker = result.marker;
    if (!written) renderMarkerWarning();
    status.className = 'status';
    status.replaceChildren(el('span', result.ok ? 'found' : 'missing', result.ok ? 'Signed in. ' : 'Did not sign in. '));
    status.append(text(result.detail));
    const tooLate = markerArrivedTooLate(result.marker);
    if (tooLate) status.append(tooLate);
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
  $('previewStatus').className = 'status';
  $('previewStatus').textContent = 'Planning…';
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
        plan.name + ' is already onboarded, so nothing will be written — ' +
        plan.conflicts.length + ' of its file(s) exist.'));
      box.append(el('div', 'note',
        'Edit it at the top of this page, choose another name, or remove it first: ' +
        'npm run target:remove -- --name=' + plan.name + ' --confirm=' + plan.name));
      $('create').disabled = true;
      plannedShape = null;
      setPreviewBadge('Needs your input', 'manual');
      $('previewStatus').className = 'status error';
      $('previewStatus').replaceChildren(el('span', 'missing', 'Already onboarded. '), text('See the details below.'));
    } else {
      $('create').disabled = false;
      // What this plan describes. Anything that moves it from here invalidates
      // the list above rather than quietly disagreeing with it.
      plannedShape = planShape();
      setPreviewBadge('Previewed', 'auto');
      $('previewStatus').className = 'status';
      $('previewStatus').replaceChildren(
        el('span', 'found', plan.files.length + ' file(s) planned. '),
        text('See “Write it” below.'),
      );
      box.append(el('div', '', plan.files.length + ' file(s) will be written:'));
      const list = el('ul', 'files');
      for (const file of plan.files) list.append(el('li', '', file));
      box.append(list);
      /*
         Step 4 calls signing in "optional, and worth it", and the banner says
         the aim is that setup:auth passes unedited. Both cannot be true: with
         no sign-in the signedInMarker is a guess, and a guessed marker fails as
         a bare timeout minutes later, nowhere near the decision that caused it.

         Said here rather than behind a confirmation, because the cure for a
         wizard nobody reads is not another click. This is the last screen
         before the write and the one somebody is already looking at.
      */
      /*
         The published document is fetched by step 1's read and is far too big
         to keep in a draft, so a reload restores the Contracts tick without it.
         Writing the capability with no vendored document leaves a contract
         project that has nothing to check — caught by target:doctor afterwards,
         which is a worse place to find out than here.
      */
      if ($('lContracts').checked && !(probed && probed.contract)) {
        box.append(el('div', 'note',
          'Contracts is switched on, but no published API document is held — it is fetched by ' +
          'the read in step 1 and is not kept when this page reloads. Read the application again ' +
          'to fetch it, or switch Contracts off: written as it stands, the capability has nothing ' +
          'to check.'));
      }
      const markerBox = el('div', '');
      markerBox.id = 'markerWarning';
      box.append(markerBox);
      renderMarkerWarning();
    }
    renderCredentials();
    enable('s4'); enable('s5');
    /*
       One trigger, and the preview is it. It is the single moment the page
       holds an answer for all three of the steps above — it is computed from
       every one of them — so folding on anything earlier would fold a step
       whose own button is still the next thing to press.

       Steps 4 and 5 are deliberately never folded: they arrive together and
       step 4 is still an input, which is exactly the case the rail's own
       "done" state gets wrong.
    */
    fold('s1'); fold('s2'); fold('s3');
  } catch (error) {
    box.replaceChildren(el('div', 'error', error.message));
    setPreviewBadge('Needs your input', 'manual');
    $('previewStatus').className = 'status error';
    $('previewStatus').textContent = error.message;
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
    const created = await post('/api/create', Object.assign(options(), {
      credentials,
      credentialLocation: $('credentialLocation').value,
    }));
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
    written = true;
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
      /*
         Which poll this is, so one still in flight cannot write over what came
         after it.

         clearInterval stops the *next* firing; it does nothing about a
         callback already awaiting its reply. "I am on the home page" clears the
         timer and then renders the derived marker into #assistOut — and a poll
         that had already asked would come back afterwards and replace it with
         "N page(s) met so far". The marker was derived, shown, and then wiped,
         with nothing on screen looking wrong.

         Compared rather than counted, for the reason written above
         formSignature(): assistTimer is set to null synchronously by both
         assistDone and stopAssist, so "is this still the current timer" is a
         fact about state at the moment the reply lands, and cannot race.
      */
      const mine = assistTimer;
      try {
        const state = await post('/api/assist/poll', {});
        if (assistTimer !== mine) return;
        if (!state.open) return stopAssist();
        const box = $('assistOut');
        box.replaceChildren(
          el('div', 'note', state.observed + ' page(s) met so far between the password and now.'),
        );
        for (const line of state.summary) box.append(el('div', 'diag', line));
      } catch {
        if (assistTimer !== mine) return;
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
    if (!written) renderMarkerWarning();
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
      /*
         Reported before the identity warning, because it is the more serious
         of the two: an identity-specific marker works for one role, and an
         ambiguous one works for none.
      */
      if (result.marker.ambiguous) {
        box.append(el('div', 'diag error',
          'That name matches more than one control on the signed-in page, and so did every ' +
          'other candidate. getByRole refuses an ambiguous name rather than picking one, so ' +
          'setup:auth will fail here until it is scoped to the container you mean, or replaced ' +
          'with something the signed-in page shows exactly once. The generated locator file ' +
          'says so too.'));
      }
      if (result.marker.identitySpecific) {
        box.append(el('div', 'diag error',
          'That is this account\\'s own name, so it is specific to one role: it will establish ' +
          'this session and report every other role as signed out. Generalise it before this ' +
          'target has a second role — an account menu usually has a stable test id or an ' +
          'aria-label. The generated locator file says so too.'));
      }
      const tooLate = markerArrivedTooLate(result.marker);
      if (tooLate) box.append(tooLate);
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
    /*
       "its whole four-layer pack" was the old wording. "Pack" is this
       repository's word for `src/targets/<app>/`, and the first screen is the
       one place a reader has not met it yet — a lede that needs a glossary is
       not a lede.
    */
    lede:
      'Reads the running application, then writes its profile and all four layers of its test code in one go.',
    /*
       "You fill in: steps 1, 3 and 4" and "filled in for you: steps 2 and 5"
       used to be facts here. The preflight panel says both, in terms of the
       information rather than of the step numbers — which is the half somebody
       who has not been here can act on.
    */
    /*
       The aim used to read "`setup:auth` passes unedited". That is the exact
       truth and it is stated in the name of a Playwright project the reader has
       not run yet — the one piece of vocabulary on this screen that belongs to
       this repository rather than to testing. What it *means* is the promise
       worth making on the first screen, so it says that instead.
    */
    facts: [
      { label: 'Overwrites', value: 'Never' },
      { label: 'Aim', value: 'Sign-in works with no file edited by hand' },
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
