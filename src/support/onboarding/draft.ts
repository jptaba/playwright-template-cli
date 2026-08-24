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

/**
 * How old a draft may be before it stops being restored — item 69.
 *
 * **A day, because that is what "I was in the middle of this" means.** The
 * draft exists so a reload, a crash or a wandering afternoon does not cost the
 * 12-to-18 second probe; none of those take a day.
 *
 * Measured on a real machine before this existed: a draft written four days
 * earlier, for a scratch target that had since been removed, was still
 * pre-filling twelve fields and reopening two steps that progressive
 * disclosure had put away. The onboarding page opened at 3173px instead of
 * 1761px — 4.4 screens instead of 2.45 — and nothing on it said why.
 *
 * `savedAt` has carried the comment "ISO, so a stale draft can be recognised
 * as one" since it was written. Nothing ever recognised one.
 */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

/**
 * Whether this draft is too old to restore.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the rule is
 * testable without waiting a day, and so a single run cannot disagree with
 * itself about what "now" is.
 *
 * A draft with no `savedAt` is **not** stale: it is either empty or was
 * written by something that did not stamp it, and refusing to restore it would
 * be inventing an age nobody recorded. `draftHasContent` is the guard for the
 * empty case, and it is a separate question.
 */
export function draftIsStale(
  draft: OnboardingDraft,
  now: number,
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): boolean {
  if (!draft.savedAt) return false;
  const saved = Date.parse(draft.savedAt);
  // Unparseable is not stale, for the same reason absent is not: the age is
  // unknown, and discarding somebody's work on a guess is the worse error.
  if (Number.isNaN(saved)) return false;
  return now - saved > maxAgeMs;
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
 * exists, `targets/<name>/profile.ts` is what is true about it, and a
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
