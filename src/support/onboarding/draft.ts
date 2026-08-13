/**
 * What the onboarding form is allowed to remember — §08, §11.
 *
 * Every dashboard page is its own document, so moving between tabs is a full
 * navigation and anything held in a DOM input is gone. Filling in five fields,
 * glancing at the runs page and coming back to an empty form is the bug this
 * exists to fix.
 *
 * **The allow-list is the whole point, and it is an allow-list on purpose.**
 * The form collects credentials in step 4. A draft that remembered them would
 * write a password to disk — which §11 forbids without qualification, and
 * which a convenience feature is a particularly bad reason to do. New fields
 * are therefore invisible to the draft until somebody adds them here and says
 * what they are, rather than being swept up by a "save everything except…"
 * rule that fails open the day a field is renamed.
 */

/** Text and select inputs the draft may carry. */
export const DRAFT_FIELDS = [
  'name',
  'env',
  'baseURL',
  'testId',
  'signInPath',
  /*
     These three are the *accessible names* of the sign-in form's fields —
     "Email address *", "Password *", "Login" — read off the application by the
     probe. They are not credentials and never have been, which is worth
     stating because `pName` sitting in a list about secrets reads alarmingly
     until you know what it holds.
  */
  'uName',
  'pName',
  'sName',
  'roles',
  'secrets',
  'a11y',
] as const;

/** Checkboxes the draft may carry. */
export const DRAFT_FLAGS = ['confirmTest', 'lApi', 'lDb', 'lContracts', 'lA11y'] as const;

export interface DraftService {
  name: string;
  url: string;
  primary: boolean;
}

export interface OnboardingDraft {
  fields: Record<string, string>;
  flags: Record<string, boolean>;
  services: DraftService[];
  /** ISO, so a stale draft can be recognised as one. */
  savedAt: string;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  fields: {},
  flags: {},
  services: [],
  savedAt: '',
};

/**
 * Take an untrusted draft — from the page, or from a file somebody edited —
 * and return only what the allow-list permits.
 *
 * Applied on the way **in** and on the way **out**. On the way in because the
 * page is not a source of truth about what may be stored; on the way out
 * because a draft written by an older version of this file, or by hand, must
 * not be able to reintroduce a field this one refuses.
 */
export function sanitiseDraft(candidate: unknown): OnboardingDraft {
  if (typeof candidate !== 'object' || candidate === null) return { ...EMPTY_DRAFT };
  const draft = candidate as Partial<OnboardingDraft>;

  const fields: Record<string, string> = {};
  for (const key of DRAFT_FIELDS) {
    const value = draft.fields?.[key];
    if (typeof value === 'string' && value !== '') fields[key] = value.slice(0, 2_000);
  }

  const flags: Record<string, boolean> = {};
  for (const key of DRAFT_FLAGS) {
    if (typeof draft.flags?.[key] === 'boolean') flags[key] = draft.flags[key];
  }

  const services = Array.isArray(draft.services)
    ? draft.services
        .filter((service): service is DraftService => typeof service === 'object' && service !== null)
        .slice(0, 10)
        .map((service) => ({
          name: String(service.name ?? '').slice(0, 200),
          url: String(service.url ?? '').slice(0, 2_000),
          primary: service.primary === true,
        }))
    : [];

  return {
    fields,
    flags,
    services,
    savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : '',
  };
}

/** Whether a draft holds anything worth restoring. */
export function draftHasContent(draft: OnboardingDraft): boolean {
  return (
    Object.keys(draft.fields).length > 0 ||
    draft.services.some((service) => service.name !== '' || service.url !== '')
  );
}

/**
 * One application already onboarded, as the dashboard shows it.
 *
 * Derived from the profile on disk rather than from a draft: once a target
 * exists, `config/targets/<name>.ts` is what is true about it, and a
 * remembered form would be a second, staler copy.
 */
export interface OnboardedApp {
  name: string;
  baseURL: string;
  environment: string;
  testIdAttribute: string;
  roles: string[];
  secretSource: string;
  a11yStandard: string | null;
  apiBaseURL: string | null;
  include: { api: boolean; db: boolean; contracts: boolean; a11y: boolean };
  /** When the profile was last written. Decides "most recently onboarded". */
  onboardedAt: string;
  /** How many files the pack holds, so an empty scaffold is visible as one. */
  packFiles: number;
}
