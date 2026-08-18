import { planScaffold, type ScaffoldOptions } from './scaffold';
import type { TargetProfile } from '../../../config/targets/types';

/**
 * How far a pack has drifted from the templates that would write it today.
 *
 * **The problem this exists for.** Rule zero says a troubleshooting fix goes
 * into the framework and never into an application's pack. That is right, and
 * it has a consequence nobody had written down: a scaffolder improvement
 * reaches applications onboarded *afterwards* and no others. The three
 * applications that exposed the defect being fixed are, by definition, the
 * three already on disk — so the fix lands everywhere except where it was
 * needed.
 *
 * `target:new` never overwrites, deliberately: that guarantee is what makes
 * onboarding safe to re-run, and it must not be weakened to solve this.
 *
 * **So this reports rather than rewrites.** It regenerates the pack in memory
 * from the profile and says, file by file, whether what is on disk matches. A
 * file the template no longer writes the same way is *shown*, never silently
 * replaced — because a pack is half generated shape and half somebody's work,
 * and the second half is the entire point of a pack.
 *
 * Pure by construction: files in, classification out. `tools/upgrade-target.ts`
 * does the reading and the printing.
 */

export type DriftState =
  /** On disk and byte-identical to what the template writes today. */
  | 'current'
  /** The template writes this, the pack has none, and its directory is empty. */
  | 'missing'
  /**
   * The template writes a starter here and the directory already holds work
   * under other names.
   *
   * **This state exists because the first version of this tool did not have
   * it, and running it showed why.** toolshop replaced the scaffolder's
   * invented `endpoints/orders.ts` and `api/orders.ts` with a real
   * `catalogue.ts`, and replaced `tests/a11y/landing.spec.ts` with a spec for
   * a page a user actually reaches. All four came back as "missing, safe to
   * add" — so `--apply` would have injected endpoints for orders into an
   * application that has none, and a placeholder spec beside a working one.
   *
   * An absent file usually means somebody did the work under a different
   * name, not that the pack is incomplete.
   */
  | 'superseded'
  /** Both exist and differ — either hand-written work, or an outdated template. */
  | 'diverged';

export interface FileDrift {
  path: string;
  state: DriftState;
  /** What the template would write. Only carried for `missing`. */
  contents?: string;
}

export interface UpgradePlan {
  target: string;
  files: FileDrift[];
  /** Files the tool would add, which is the only thing it will ever write. */
  addable: FileDrift[];
  superseded: FileDrift[];
  diverged: FileDrift[];
  current: FileDrift[];
}

/**
 * Rebuild the scaffolder's inputs from the profile.
 *
 * **What cannot be rebuilt is the interesting part.** The accessible names on
 * the sign-in form, the path to it and the signed-in marker were *probed* from
 * the running application at onboarding and live only in the generated
 * locators. Nothing in the profile records them, so a regenerated
 * `locators/sign-in.ts` would carry placeholders rather than the real names.
 *
 * That is why those files come back `diverged` rather than `missing`, and why
 * `diverged` is never written. Reporting "your locators differ from a scaffold
 * that never saw your application" as an upgrade would replace working
 * locators with guesses, which is the single worst thing this tool could do.
 */
export function optionsFromProfile(profile: TargetProfile): ScaffoldOptions {
  const { api, db, contracts, a11y } = profile.capabilities;
  return {
    name: profile.name,
    baseURL: profile.baseURL,
    hostAllowlist: profile.hostAllowlist,
    testIdAttribute: profile.testIdAttribute,
    roles: profile.roles,
    environment: profile.environment,
    secretSource: profile.credentials.source,
    credentialRoot: profile.credentials.root,
    accountType: profile.credentials.accountType,
    ...(api.baseURL ? { apiBaseURL: api.baseURL } : {}),
    ...(api.services ? { apiServices: api.services } : {}),
    a11yStandard: a11y.standard,
    include: {
      api: api.enabled,
      db: db.enabled,
      contracts: contracts.enabled,
      a11y: a11y.enabled,
    },
  };
}

/** Normalised for comparison: line endings and a trailing newline are not drift. */
function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

/**
 * Compare the pack the templates would write now against the one on disk.
 *
 * `onDisk` maps a repo-relative path to its contents, and omits anything
 * absent. Only files the *scaffolder* claims are considered — a spec somebody
 * wrote is not the scaffolder's to have an opinion about, and does not appear
 * here at all.
 */
export function planUpgrade(
  profile: TargetProfile,
  onDisk: ReadonlyMap<string, string>,
): UpgradePlan {
  /** Does this directory already hold work, under any name? */
  const directoryHasWork = (filePath: string): boolean => {
    const directory = filePath.slice(0, filePath.lastIndexOf('/') + 1);
    for (const key of onDisk.keys()) {
      if (!key.startsWith(directory)) continue;
      // A placeholder is not work: a directory holding only `.gitkeep` is
      // still empty in every sense that matters here.
      if (key.slice(directory.length).includes('/')) continue;
      if (key.endsWith('/.gitkeep')) continue;
      return true;
    }
    return false;
  };

  const files: FileDrift[] = planScaffold(optionsFromProfile(profile)).files.map((file) => {
    const existing = onDisk.get(file.path);
    if (existing !== undefined) {
      return {
        path: file.path,
        state: normalise(existing) === normalise(file.contents) ? 'current' : 'diverged',
      };
    }
    /*
       Absent, and the question is *why*. An empty directory means the pack
       never got this file; a directory with other files in it means somebody
       did the same job under a better name, and writing the scaffolder's
       starter beside their work would be actively harmful.
    */
    return directoryHasWork(file.path)
      ? { path: file.path, state: 'superseded' as const }
      : { path: file.path, state: 'missing' as const, contents: file.contents };
  });

  return {
    target: profile.name,
    files,
    addable: files.filter((file) => file.state === 'missing'),
    superseded: files.filter((file) => file.state === 'superseded'),
    diverged: files.filter((file) => file.state === 'diverged'),
    current: files.filter((file) => file.state === 'current'),
  };
}

/**
 * The report, as lines.
 *
 * Written so the *diverged* list reads as information rather than as a list of
 * problems. On a pack anybody has worked on, diverged is the healthy majority:
 * locators rewritten from a real page, actions with the application's business
 * verbs in them, specs. A tool that framed those as drift to be corrected
 * would be arguing for undoing the work.
 */
export function formatUpgrade(plan: UpgradePlan): string[] {
  const lines: string[] = [`\n${plan.target}`, '─'.repeat(plan.target.length)];

  lines.push(
    `  ${plan.current.length} file(s) match the current templates · ` +
      `${plan.diverged.length} differ · ${plan.superseded.length} superseded · ` +
      `${plan.addable.length} would be added`,
  );

  if (plan.addable.length > 0) {
    lines.push('', '  Would be added — the templates write these into empty directories:');
    for (const file of plan.addable) lines.push(`    + ${file.path}`);
  }

  if (plan.superseded.length > 0) {
    lines.push(
      '',
      '  Superseded — the templates write a starter here and the directory already',
      '  holds work under other names. Not added, and that is the point:',
    );
    for (const file of plan.superseded) lines.push(`    · ${file.path}`);
  }

  if (plan.diverged.length > 0) {
    lines.push('', '  Differ from the templates. Not touched, and mostly should not be:');
    for (const file of plan.diverged) lines.push(`    ~ ${file.path}`);
    lines.push(
      '',
      '  A file differs either because somebody wrote it — locators read off the real',
      '  application, actions carrying its business verbs — or because the template has',
      "  moved on since. This tool cannot tell those apart, so it reports and stops.",
      '  Diff one against a fresh scaffold to decide:',
      `    npx tsx tools/new-target.ts --name=<scratch> --url=<url>`,
    );
  }

  return lines;
}
