/**
 * Changing an application's profile after it has been onboarded — §04.
 *
 * Onboarding is additive and never overwrites, which is right: a scaffolder
 * that rewrites a pack is a scaffolder nobody dares run twice. But it left the
 * dashboard able to *show* an onboarded application and unable to correct a
 * single value in it, and the value most often needing correction is the one
 * that is easiest to get wrong — an API base URL that is really a document
 * URL, a test-id attribute the probe could not read.
 *
 * **This edits values, never structure.** Each field is found by its own
 * anchor and only the literal is replaced, so every comment in the profile —
 * and there are a lot, most of them explaining why a value is what it is —
 * survives untouched.
 *
 * And when an anchor is not found, it **refuses that field and says so**
 * rather than falling back to something cleverer. A profile somebody has
 * hand-edited into a different shape is a file this must not guess at: the
 * cost of a wrong guess is a broken profile, and the cost of a refusal is one
 * sentence telling somebody which file to open.
 */

export interface ProfileEdits {
  baseURL?: string;
  environment?: string;
  testIdAttribute?: string;
  apiBaseURL?: string;
  a11yStandard?: string;
  secretSource?: string;
  roles?: string[];
  include?: Partial<Record<'api' | 'db' | 'contracts' | 'a11y', boolean>>;
}

export interface EditOutcome {
  /** The rewritten file. Identical to the input when nothing applied. */
  source: string;
  /** Fields whose value changed. */
  applied: Array<{ field: string; from: string; to: string }>;
  /** Asked for, and already that value. */
  unchanged: string[];
  /** Asked for, and not found — with the file to open instead. */
  refused: Array<{ field: string; reason: string }>;
  /** True but worth saying out loud. */
  warnings: string[];
}

interface FieldRule {
  field: string;
  /** Two groups: everything before the literal, and the literal itself. */
  pattern: RegExp;
  /** How the new value is written back. */
  render(value: string): string;
}

/*
   Anchored on the environment variable rather than on the field name, because
   the field names repeat: `baseURL` is both the application's and the API's,
   and a rule that matched the first one would quietly rewrite the wrong line.
   `BASE_URL` and `API_BASE_URL` do not collide.
*/
const RULES: FieldRule[] = [
  {
    field: 'baseURL',
    pattern: /(\bbaseURL:\s*process\.env\.BASE_URL\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'environment',
    pattern: /(\benvironment:\s*process\.env\.TARGET_ENV\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'testIdAttribute',
    pattern: /(\btestIdAttribute:\s*process\.env\.TEST_ID_ATTRIBUTE\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'apiBaseURL',
    pattern: /(\bbaseURL:\s*process\.env\.API_BASE_URL\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'a11yStandard',
    pattern: /(\bstandard:\s*process\.env\.A11Y_STANDARD\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'secretSource',
    pattern: /(\bsource:\s*\(process\.env\.SECRET_SOURCE[^)]*\)\s*\?\?\s*)'([^']*)'/,
    render: (value) => `'${value}'`,
  },
  {
    field: 'roles',
    pattern: /(\broles:\s*)\[([^\]]*)\]/,
    render: (value) => `[${value}]`,
  },
];

/** `api`, `db`, `contracts`, `a11y` — the flag inside each capability block. */
function flagRule(capability: string): FieldRule {
  return {
    field: `${capability}.enabled`,
    // The capability blocks hold no nested braces, so stopping at the first
    // `}` keeps this inside the block it started in.
    pattern: new RegExp(`(\\b${capability}:\\s*\\{[^}]*?\\benabled:\\s*)(true|false)`),
    render: (value) => value,
  };
}

function apply(
  source: string,
  rule: FieldRule,
  next: string,
  outcome: EditOutcome,
): string {
  const match = rule.pattern.exec(source);
  if (!match) {
    outcome.refused.push({
      field: rule.field,
      reason:
        `${rule.field} is not in the shape this can edit, so it was left alone. Change it in ` +
        'the profile by hand — a profile that has been edited into a different shape is one ' +
        'this must not guess at.',
    });
    return source;
  }

  const current = match[2] ?? '';
  if (current === next) {
    outcome.unchanged.push(rule.field);
    return source;
  }

  outcome.applied.push({ field: rule.field, from: current, to: next });
  return source.replace(rule.pattern, `$1${rule.render(next)}`);
}

/** Hosts the profile will let exploration and generation drive. */
export function hostAllowlistIn(source: string): string[] {
  const match = /\bhostAllowlist:\s*\[([^\]]*)\]/.exec(source);
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]!);
}

/**
 * Rewrite a profile's values, leaving everything else exactly as it was.
 */
export function editProfileSource(source: string, edits: ProfileEdits): EditOutcome {
  const outcome: EditOutcome = { source, applied: [], unchanged: [], refused: [], warnings: [] };
  const rule = (field: string) => RULES.find((candidate) => candidate.field === field)!;

  for (const field of [
    'baseURL',
    'environment',
    'testIdAttribute',
    'apiBaseURL',
    'a11yStandard',
    'secretSource',
  ] as const) {
    const value = edits[field];
    if (typeof value === 'string') outcome.source = apply(outcome.source, rule(field), value, outcome);
  }

  if (edits.roles) {
    const rendered = edits.roles
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => `'${role}'`)
      .join(', ');
    outcome.source = apply(outcome.source, rule('roles'), rendered, outcome);
  }

  for (const [capability, enabled] of Object.entries(edits.include ?? {})) {
    if (typeof enabled !== 'boolean') continue;
    outcome.source = apply(outcome.source, flagRule(capability), String(enabled), outcome);
  }

  /*
     A base URL moved to a host the profile does not allow is not an error
     here — the value is written — but every run afterwards refuses it, and
     the refusal happens far from this screen. Said now instead.
  */
  if (edits.baseURL) {
    const allowed = hostAllowlistIn(outcome.source);
    let host = '';
    try {
      host = new URL(edits.baseURL).hostname;
    } catch {
      host = '';
    }
    const covered =
      host === '' ||
      ['localhost', '127.0.0.1', '::1'].includes(host) ||
      allowed.some((entry) => host === entry || host.endsWith(`.${entry}`) || host.includes(entry));
    if (!covered) {
      outcome.warnings.push(
        `The profile's hostAllowlist (${allowed.join(', ') || 'empty'}) does not cover ` +
          `${host}, so exploration and generation will refuse to drive it. Add the host to ` +
          'hostAllowlist in the profile (§17).',
      );
    }
  }

  return outcome;
}
