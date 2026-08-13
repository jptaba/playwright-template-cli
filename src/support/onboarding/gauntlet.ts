/**
 * Everything between submitting a password and reaching the home page — §12, §13.
 *
 * A one-time code, "your password expires in five days", "remember this
 * device?", a security question, terms to accept. Onboarding walks through
 * them once with a person driving, and this turns what it saw into code.
 *
 * **The generated code is a loop of handlers, not a recorded sequence, and
 * that is the whole design.** The gauntlet is not the same twice: the expiry
 * warning appears only near expiry, the second factor only after some hours,
 * the security question periodically. A script that replays *this* sign-in
 * encodes one sample of a process that varies, and breaks the first time the
 * order changes or a step is absent. A loop that asks "what is on screen now?"
 * survives all three, because an interstitial that did not appear simply does
 * not match.
 *
 * It also means onboarding sees **one observation**, never the full set. So
 * the loop's job when it meets something unknown is to fail with the
 * accessibility snapshot of what is actually there — which is exactly the text
 * somebody pastes into a new handler. The system teaches you what it is
 * missing rather than hanging.
 */

/** What an interstitial is, which decides what may be done about it. */
export type InterstitialKind =
  | 'otp'
  | 'password-expiring'
  | 'password-change-forced'
  | 'remember-device'
  | 'security-question'
  | 'terms'
  | 'unknown';

/**
 * Whether the generated handler may resolve this on its own.
 *
 *  - `safe`        a dismissal that costs nothing — "not now", "continue".
 *  - `needs-value` needs something the code must not contain: a code, an answer.
 *  - `refuse`      must not be automated at all, and says why.
 */
export type Safety = 'safe' | 'needs-value' | 'refuse';

export interface GauntletObservation {
  /** The accessibility snapshot of the page the person was looking at. */
  snapshot: string;
  /** Where they were, for the comment on the handler. */
  url?: string;
}

export interface GauntletStep {
  kind: InterstitialKind;
  safety: Safety;
  /** `otpField`, `passwordExpiryNotice` — the locator this becomes. */
  locatorName: string;
  /** The control that identifies the page, as role and accessible name. */
  recogniser: { role: string; name: string };
  /** The control that resolves it, when one was found. */
  resolution: { role: string; name: string } | null;
  /** Everything on screen, so a wrong pick can be corrected by reading. */
  controls: { textboxes: string[]; buttons: string[]; headings: string[] };
  /** Why this handler is shaped the way it is. Becomes a comment. */
  note: string;
}

interface Recogniser {
  kind: InterstitialKind;
  safety: Safety;
  locatorName: string;
  /** Matched against the whole snapshot. */
  page: RegExp;
  /** Which control names resolve it, best first. */
  resolves?: RegExp;
  note: string;
}

/*
   Order matters: the first match wins, so the most specific claim comes first.
   A forced password change and a password *expiring* both mention expiry, and
   confusing them is the difference between clicking "remind me later" and
   changing the password every worker in the suite signs in with.
*/
const RECOGNISERS: Recogniser[] = [
  {
    kind: 'password-change-forced',
    safety: 'refuse',
    locatorName: 'forcedPasswordChange',
    page: /must (change|update|reset) (your )?password|password (has )?expired|choose a new password/i,
    note:
      'REFUSED deliberately. Automating this changes the password of the account every parallel ' +
      'worker and every future run signs in with — the suite would break itself, once, silently. ' +
      'Rotate it deliberately with `npm run rotate:passwords` (§13).',
  },
  {
    kind: 'otp',
    safety: 'needs-value',
    locatorName: 'oneTimeCodeField',
    page: /one[- ]time|verification code|security code|authenticator|\botp\b|two[- ]factor|\b2fa\b/i,
    resolves: /verify|submit|continue|confirm|sign in/i,
    note:
      'The code comes from the `otp` fixture, never from the code: TOTP through Vault, or a ' +
      'readable inbox. `arm()` is taken *before* the password is submitted, because polling for ' +
      'the newest message otherwise returns the previous run\'s code (§12).',
  },
  {
    kind: 'security-question',
    safety: 'needs-value',
    locatorName: 'securityQuestion',
    page: /security question|mother's maiden|first pet|memorable (word|answer)|place of birth/i,
    resolves: /submit|continue|verify|next/i,
    note:
      'The answer is a credential: it belongs in the secret store beside the password, not in a ' +
      'spec and not in this file (§11).',
  },
  {
    kind: 'password-expiring',
    safety: 'safe',
    locatorName: 'passwordExpiryNotice',
    page: /password (will )?expires? in|expires in \d+ day|change your password soon/i,
    resolves: /remind me later|later|not now|skip|continue|dismiss|close/i,
    note:
      'A warning, not a demand — dismissing it costs nothing. It appears only when the password ' +
      'is near expiry, which is why this is a handler rather than a step: most runs never see it.',
  },
  {
    kind: 'remember-device',
    safety: 'safe',
    locatorName: 'rememberDevicePrompt',
    page: /remember (this )?(device|browser|computer)|trust this (device|browser)|stay signed in/i,
    resolves: /not now|no|skip|later|don't|dont/i,
    note:
      'Answered "no" on purpose. Saying yes suppresses the second factor on later runs, which ' +
      'sounds convenient and means the suite stops exercising the path it is meant to prove — ' +
      'and it makes this machine special.',
  },
  {
    kind: 'terms',
    safety: 'refuse',
    locatorName: 'termsAcceptance',
    page: /terms (of|and)|privacy (policy|notice)|accept.*(terms|agreement)|end user licence/i,
    resolves: /accept|agree|continue/i,
    note:
      'REFUSED by default. Clicking this accepts something on behalf of whoever owns the account. ' +
      'Fine for a throwaway test identity, and a decision somebody should make rather than ' +
      'inherit — change `refuse` to a click here once they have.',
  },
];

/** Every named control in an accessibility snapshot, by role. */
export function controlsIn(snapshot: string): GauntletStep['controls'] {
  const textboxes: string[] = [];
  const buttons: string[] = [];
  const headings: string[] = [];

  for (const line of snapshot.split('\n')) {
    const match = /-\s+(textbox|button|link|heading|checkbox|combobox)\s+"([^"]*)"/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    if (match[1] === 'textbox' || match[1] === 'combobox') textboxes.push(match[2]);
    else if (match[1] === 'button' || match[1] === 'link') buttons.push(match[2]);
    else if (match[1] === 'heading') headings.push(match[2]);
  }
  return { textboxes, buttons, headings };
}

/**
 * What kind of page this is, from what it says rather than from where it sits
 * in a sequence. Position in the flow is exactly the thing that is not stable.
 */
export function classify(snapshot: string): Recogniser | null {
  return RECOGNISERS.find((candidate) => candidate.page.test(snapshot)) ?? null;
}

function pick(names: string[], pattern: RegExp | undefined): string | null {
  if (!pattern) return null;
  return names.find((name) => pattern.test(name)) ?? null;
}

/**
 * Turn what onboarding watched into one handler per interstitial.
 *
 * A page that matches nothing is still emitted, as `unknown` with the controls
 * that were on it — the operator saw it and got past it, so silently dropping
 * it would lose the only observation anybody has.
 */
export function planGauntlet(observations: readonly GauntletObservation[]): GauntletStep[] {
  const steps: GauntletStep[] = [];
  const seen = new Set<string>();

  for (const observation of observations) {
    const controls = controlsIn(observation.snapshot);
    const known = classify(observation.snapshot);
    const kind = known?.kind ?? 'unknown';

    // The same page can be observed twice — a poll either side of a click.
    const fingerprint = `${kind}:${controls.headings.join('|')}:${controls.buttons.join('|')}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const recogniserName =
      kind === 'otp' || kind === 'security-question'
        ? controls.textboxes[0]
        : controls.headings[0] ?? controls.buttons[0];

    steps.push({
      kind,
      safety: known?.safety ?? 'refuse',
      locatorName: known?.locatorName ?? `unknownStep${steps.length + 1}`,
      recogniser: {
        role:
          kind === 'otp' || kind === 'security-question'
            ? 'textbox'
            : controls.headings[0]
              ? 'heading'
              : 'button',
        name: recogniserName ?? '',
      },
      resolution: (() => {
        const name = pick(controls.buttons, known?.resolves);
        return name ? { role: 'button', name } : null;
      })(),
      controls,
      note:
        known?.note ??
        'Onboarding did not recognise this page. Its controls are listed above — name it, decide ' +
          'whether resolving it automatically is safe, and replace this handler.',
    });
  }

  return steps;
}

/** Inside the `for` inside the method: three levels. */
const INDENT = '        ';

/** Wrap a note into comment lines, so generated code reads like written code. */
function commentLines(note: string, indent: string): string[] {
  const words = note.replace(/\s+/g, ' ').split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 74) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.map((line) => `${indent}// ${line}`);
}

/** The locators file's entries for the gauntlet, ready to paste or write. */
export function renderGauntletLocators(steps: readonly GauntletStep[]): string {
  if (steps.length === 0) return '';
  const lines: string[] = [
    '',
    '/**',
    ' * The pages between the password and the home page, as onboarding met them.',
    ' *',
    ' * Recognisers, not steps: each answers "is this on screen now?", so the',
    ' * order they appear in and whether they appear at all stop mattering.',
    ' */',
    'export const gauntletLocators = {',
  ];

  for (const step of steps) {
    lines.push(`  /** ${step.kind} — ${step.safety} */`);
    lines.push(
      `  ${step.locatorName}: (page: Page): Locator =>\n` +
        `    page.getByRole('${step.recogniser.role}', { name: ${quote(step.recogniser.name)} }),`,
    );
    if (step.resolution) {
      lines.push(
        `  ${step.locatorName}Resolve: (page: Page): Locator =>\n` +
          `    page.getByRole('button', { name: ${quote(step.resolution.name)} }),`,
      );
    }
  }

  lines.push('};', '');
  return lines.join('\n');
}

/** The action that walks the gauntlet, as generated into `actions/sign-in.ts`. */
export function renderGauntletAction(steps: readonly GauntletStep[]): string {
  const branches: string[] = [];

  for (const step of steps) {
    const test = `await gauntletLocators.${step.locatorName}(page).isVisible()`;
    const body: string[] = [];

    if (step.safety === 'refuse') {
      body.push(`${INDENT}throw new Error(`);
      body.push(`${INDENT}  ${quote(`Sign-in stopped at ${step.kind}. ${step.note}`)},`);
      body.push(`${INDENT});`);
    } else if (step.kind === 'otp') {
      body.push(`${INDENT}await gauntletLocators.${step.locatorName}(page).fill(await otp.get(mark));`);
      if (step.resolution) {
        body.push(`${INDENT}await gauntletLocators.${step.locatorName}Resolve(page).click();`);
      }
    } else if (step.kind === 'security-question') {
      body.push(`${INDENT}// The answer is a credential: read it from the store, never from here.`);
      body.push(`${INDENT}await gauntletLocators.${step.locatorName}(page).fill(answers.securityAnswer);`);
      if (step.resolution) {
        body.push(`${INDENT}await gauntletLocators.${step.locatorName}Resolve(page).click();`);
      }
    } else if (step.resolution) {
      body.push(`${INDENT}await gauntletLocators.${step.locatorName}Resolve(page).click();`);
    } else {
      body.push(`${INDENT}throw new Error(`);
      body.push(
        `${INDENT}  ${quote(`Reached ${step.kind} and found no control to resolve it. ${step.note}`)},`,
      );
      body.push(`${INDENT});`);
    }

    const open = INDENT.slice(2);
    branches.push(
      [
        `${open}if (${test}) {`,
        ...commentLines(step.note, INDENT),
        ...body,
        `${INDENT}continue;`,
        `${open}}`,
      ].join('\n'),
    );
  }

  return [
    '',
    '  /**',
    '   * Everything between the password and the home page.',
    '   *',
    '   * A loop over recognisers rather than a sequence of steps, because the',
    '   * gauntlet is not the same twice: the expiry warning appears only near',
    '   * expiry, the second factor only after some hours. An interstitial that',
    '   * is not on screen simply does not match.',
    '   *',
    '   * Onboarding saw one sample of this. When it meets something new it',
    '   * fails with the snapshot of what is actually there — paste that into a',
    '   * new recogniser above and add a branch here.',
    '   */',
    '  async clearGauntlet(page: Page, { otp, mark, answers }: GauntletContext): Promise<void> {',
    '    // Bounded: a handler that fires without changing the page would',
    '    // otherwise spin until the test times out with nothing to show.',
    `    for (let attempt = 0; attempt < ${Math.max(6, steps.length + 3)}; attempt += 1) {`,
    '      if (await signInLocators.signedInMarker(page).isVisible()) return;',
    '',
    ...(branches.length ? branches : ['      // Onboarding met no interstitials on this account.']),
    '',
    '      // Not signed in, and nothing recognised. Say what is on screen: this',
    '      // snapshot is what a new recogniser is written from.',
    '      throw new Error(',
    "        'Sign-in stopped at a page this pack does not recognise:\\n' +",
    "          (await page.locator('body').ariaSnapshot()),",
    '      );',
    '    }',
    '',
    '    throw new Error(',
    "      'Worked through the sign-in gauntlet without reaching the signed-in page. A handler is " +
      "resolving something that is not going away.',",
    '    );',
    '  },',
  ].join('\n');
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** A one-line summary per step, for the dashboard to show before writing anything. */
export function describeGauntlet(steps: readonly GauntletStep[]): string[] {
  return steps.map((step) => {
    const how =
      step.safety === 'refuse'
        ? 'refused — it will stop and say why'
        : step.resolution
          ? `resolved by clicking "${step.resolution.name}"`
          : 'recognised, but nothing found to resolve it';
    return `${step.kind}: ${how}`;
  });
}
