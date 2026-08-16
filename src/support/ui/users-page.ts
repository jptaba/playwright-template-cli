import type { DashboardPageContent } from './shell';

/**
 * The Test users page.
 *
 * Its own page rather than a sixth onboarding step: onboarding happens once,
 * and credentials are managed over time — a role added, a password rotated,
 * somebody joining who needs the private file on their own machine, an
 * application re-onboarded whose logins are still good. Step 4 of onboarding
 * still collects the first set, which is the right amount to ask for while
 * somebody is trying to get a target created.
 *
 * Nothing here ever displays a value. Every row says whether the account
 * resolves, which fields are present, and which file answered.
 */
const STYLES = `
  .slot {
    display: grid; grid-template-columns: 10rem 1fr auto; gap: .6rem;
    align-items: center; padding: .6rem 0; border-bottom: 1px solid var(--rule);
  }
  .slot:last-child { border-bottom: 0; }
  .slot .who { font-weight: 620; }
  .slot .where {
    font-family: ui-monospace, Consolas, monospace; font-size: .78rem; color: var(--muted);
    overflow-wrap: anywhere;
  }
  .slot .state { font-size: .8rem; white-space: nowrap; }
  .slot .state.ok { color: var(--pass); }
  .slot .state.gap { color: var(--fail); }

  .option {
    border: 1px solid var(--rule); border-radius: 8px; padding: .9rem 1.1rem;
    margin: .6rem 0; background: var(--surface-2);
  }
  .option h4 { margin: 0 0 .35rem; font-size: .95rem; }
  .option dl {
    margin: .5rem 0 0; display: grid; grid-template-columns: 6.5rem 1fr;
    gap: .25rem .8rem; font-size: .84rem;
  }
  .option dt { color: var(--muted); }
  .option dd { margin: 0; }
  .tag { font-size: .7rem; padding: .05rem .45rem; border-radius: 999px; margin-left: .5rem; }
  .tag.safe { background: var(--pass-soft); color: var(--pass); }
  .tag.risky { background: var(--fail-soft); color: var(--fail); }
`;

const BODY = `
  <section>
    <div class="head"><h2>Which application</h2></div>
    <p class="explain">
      Pick the application whose logins you want to look at.
    </p>
    <details class="more">
      <summary>Why no value is ever shown</summary>
      <div class="body">
        <p>Not on the page, not in a response, not in a screenshot of it. What you get instead is
        whether it resolves, which fields are present, and which file answered.</p>
        <p>That is what a credential problem actually needs — and making the safe answer the easy
        one is what stops somebody reaching for a tool that prints the secret.</p>
      </div>
    </details>
    <label for="pick">Application</label>
    <select id="pick"></select>
    <div class="status" id="pickStatus"></div>
  </section>

  <section>
    <div class="head"><h2>The accounts</h2><span class="badge auto" id="tally"></span></div>
    <p class="explain">
      One row per account the profile implies — every role, and every slot of a pool. A row marked
      <b>missing</b> is one <code>setup:auth</code> will fail on.
    </p>
    <div id="slots"></div>
  </section>

  <section>
    <div class="head"><h2>Set a credential</h2></div>
    <p class="explain">
      Choose where it goes <i>before</i> you type it. Safest first.
    </p>
    <div id="options"></div>
    <div class="row">
      <div><label for="slot">Account</label><select id="slot"></select></div>
      <div><label for="location">Keep it in</label><select id="location"></select></div>
    </div>
    <div class="row">
      <div><label for="u">Username</label><input type="text" id="u" autocomplete="off"></div>
      <div><label for="p">Password</label><input type="password" id="p" autocomplete="off"></div>
    </div>
    <button id="save">Save this credential</button>
    <button class="secondary" id="forget">Forget it</button>
    <div class="status" id="saveStatus"></div>
  </section>
`;

const SCRIPT = `
let view = null;

async function load(target) {
  const state = await post('/api/users/view', { target: target || '' });
  view = state.view;

  const pick = $('pick');
  if (!pick.options.length) {
    for (const name of state.targets) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      pick.append(option);
    }
    /*
       Defaulting the dropdown is not the same as loading what it now says.
       The first version set the selection and stopped, so the page opened
       naming an application and listing none of its accounts — which reads as
       "this application has no logins", the opposite of the truth.
    */
    if (!target && state.targets.length) {
      pick.value = state.targets[0];
      return load(state.targets[0]);
    }
  }

  renderSlots();
  renderOptions();
  renderStatus();
}

function renderStatus() {
  const box = $('pickStatus');
  box.replaceChildren();
  if (!view || !view.target) return;
  box.append(el('div', 'note',
    'Credentials for ' + view.target + ' come from "' + view.source + '", at ' +
    view.root + '/' + view.accountType + '/<role>/<n>.'));
  for (const warning of view.warnings) box.append(el('div', 'diag error', warning));
}

function renderSlots() {
  const box = $('slots');
  box.replaceChildren();
  const slotPicker = $('slot');
  slotPicker.replaceChildren();
  if (!view) return;

  for (const slot of view.slots) {
    const row = el('div', 'slot');
    row.append(el('div', 'who', slot.role + ' \\u00b7 ' + slot.index));
    row.append(el('div', 'where', slot.path + (slot.origin ? '  \\u2190 ' + slot.origin : '')));
    row.append(el('div', 'state ' + (slot.missing ? 'gap' : 'ok'),
      slot.missing
        ? (slot.present ? 'incomplete: ' + slot.fields.join(', ') : 'missing')
        : 'resolves'));
    box.append(row);

    const option = document.createElement('option');
    option.value = slot.path;
    option.textContent = slot.role + ' \\u00b7 account ' + slot.index;
    slotPicker.append(option);
  }

  const missing = view.slots.filter((slot) => slot.missing).length;
  const tally = $('tally');
  tally.textContent = missing
    ? missing + ' of ' + view.slots.length + ' not usable yet'
    : view.slots.length + ' account(s), all resolving';
  tally.className = 'badge ' + (missing ? 'manual' : 'auto');
}

function renderOptions() {
  const box = $('options');
  box.replaceChildren();
  const picker = $('location');
  picker.replaceChildren();
  if (!view) return;

  for (const option of view.locations) {
    const card = el('div', 'option');
    const title = el('h4', '', option.label);
    title.append(el('span', 'tag ' + (option.gitSafe ? 'safe' : 'risky'),
      option.gitSafe ? 'kept out of git' : 'committed to git'));
    card.append(title);
    card.append(el('div', 'where', option.where));

    const list = el('dl');
    const rows = [
      ['Best for', option.suitedTo],
      ['To set', option.howToSet],
      ['To read', option.howToRead],
      ['To update', option.howToUpdate],
    ];
    for (const row of rows) {
      list.append(el('dt', '', row[0]));
      list.append(el('dd', '', row[1]));
    }
    card.append(list);
    if (option.caution) card.append(el('div', 'diag error', option.caution));
    box.append(card);

    if (view.writable.indexOf(option.id) !== -1) {
      const choice = document.createElement('option');
      choice.value = option.id;
      choice.textContent = option.label;
      picker.append(choice);
    }
  }
}

$('pick').onchange = () => load($('pick').value);

$('save').onclick = async () => {
  const status = $('saveStatus');
  status.className = 'status';
  status.textContent = 'Saving\\u2026';
  try {
    const done = await post('/api/users/set', {
      target: $('pick').value,
      location: $('location').value,
      path: $('slot').value,
      username: $('u').value,
      password: $('p').value,
    });
    /*
       Cleared straight away. The fields have done their job, and a password
       left in a form is a password in the next screenshot of this page.
    */
    $('u').value = '';
    $('p').value = '';
    await load($('pick').value);
    status.replaceChildren(el('span', 'found', 'Saved to ' + done.file + '.'));
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
};

$('forget').onclick = async () => {
  const status = $('saveStatus');
  status.className = 'status';
  try {
    const done = await post('/api/users/forget', {
      target: $('pick').value,
      location: $('location').value,
      path: $('slot').value,
    });
    await load($('pick').value);
    status.replaceChildren(el('span', 'found', 'Removed from ' + done.file + '.'));
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  }
};

load('').catch((error) => {
  $('pickStatus').className = 'status error';
  $('pickStatus').textContent = error.message;
});
`;

export function usersPageContent(): DashboardPageContent {
  return {
    title: 'Test users',
    eyebrow: 'Test users',
    heading: 'Where the logins live',
    lede:
      'Every login this application signs in as, and where each one is kept. ' +
      '<b>No value is ever shown here.</b>',
    facts: [
      { label: 'Shows', value: 'Existence and provenance' },
      { label: 'Never shows', value: 'A value' },
      { label: 'Can write', value: 'The two local files' },
      { label: 'Cannot write', value: 'Vault, the environment' },
    ],
    styles: STYLES,
    body: BODY,
    script: SCRIPT,
  };
}
