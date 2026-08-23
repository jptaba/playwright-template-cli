import type { Page } from '@playwright/test';
import type { A11yCapability, A11yStandard, A11yWaiver } from '../../../config/targets/types';
import { waitForSettled, type SettleOptions } from './settle';

/**
 * Accessibility scanning — the framework's engine, the target's standard.
 *
 * Exactly the shape contract validation already has: Ajv lives here and every
 * target supplies its own schema document; axe lives here and every target
 * declares which standard it is held to. WCAG rules are the same for every
 * application, which is the definition of something that belongs in framework
 * code rather than in a target pack — and without an engine here, the `a11y`
 * project would be a directory with no way to check anything, which is worse
 * than not having one.
 *
 * This module **returns data and asserts nothing**, like every other L2
 * vocabulary. The spec decides what counts as a failure, because "no critical
 * violations" and "no violations at all" are different products' answers and
 * neither belongs buried in a helper.
 *
 * The pure half — tag selection and result shaping — is separated from the
 * browser half deliberately, so the rules that decide what gets checked are
 * tested without a browser, a network or an application.
 */

export type Impact = 'minor' | 'moderate' | 'serious' | 'critical';

export interface A11yNode {
  /** CSS path axe used to find the element. */
  target: string;
  html: string;
  /** Axe's own explanation of what is wrong with this node. */
  failureSummary: string;
}

export interface A11yViolation {
  /** Axe rule id — `color-contrast`, `label`, `aria-required-attr`. */
  id: string;
  impact: Impact | null;
  help: string;
  helpUrl: string;
  /** Which success criteria this violates, from the rule's tags. */
  criteria: string[];
  nodes: A11yNode[];
}

export interface WaivedViolation {
  rule: string;
  reason: string;
  reviewBy: string;
  /** How many nodes the waiver suppressed. Reported, never hidden. */
  nodes: number;
}

/** Whether a waiver applies to this page and this node. */
function waiverCovers(waiver: A11yWaiver, url: string, target: string): boolean {
  if (waiver.urlPattern && !new RegExp(waiver.urlPattern).test(url)) return false;
  if (waiver.selector && !target.includes(waiver.selector)) return false;
  return true;
}

export interface A11yScan {
  standard: A11yStandard;
  /** The axe tags the standard resolved to. */
  tags: string[];
  url: string;
  violations: A11yViolation[];
  /** Accepted exceptions, still counted so a waiver cannot quietly grow. */
  waived: WaivedViolation[];
  passes: number;
  /** Checks axe could not decide — a human has to look. Never a pass. */
  incomplete: number;
  /**
   * *Which* checks axe could not decide, in the same shape as a violation.
   *
   * The count alone was a dead end, and a real one: the conventions are
   * emphatic that `scan.incomplete` is not a pass, and the scaffolded spec
   * duly asserts `toBe(0)` — so a target with one indeterminate check had a
   * failing accessibility spec reading `Expected: 0, Received: 1` and **no way
   * to discover what the check was**. The only moves left were to loosen the
   * assertion, which the conventions forbid, or delete the spec. ParaBank's
   * accessibility spec sat unshipped on exactly that.
   *
   * Waivers deliberately do **not** apply here. A waiver accepts a known
   * failure; an undecided check is not known to be anything yet, and waiving
   * one would be accepting an answer nobody has.
   */
  undecided: A11yViolation[];
  /**
   * Whether the page had stopped changing when axe ran.
   *
   * **A scan of a page still rendering is not a result**, and until this
   * existed the suite could not tell the difference. On a single-page
   * application the document `load`s long before the application renders, so
   * axe was inspecting a shell and reporting it clean — measured on one
   * dashboard as *one waived violation* immediately after `goto` against
   * *seventeen across four rules* once the tree went quiet, four times out of
   * four.
   *
   * `false` means the tree never went quiet inside the deadline, which a
   * clock, a carousel or a polling widget will do forever. That is not an
   * error and the scan still happened — it is a caveat the reader is owed.
   */
  settled: boolean;
  /**
   * Whether two consecutive scans of this page produced the same findings.
   *
   * **`settled` was not enough, and the way it failed is the reason this
   * exists.** The quiet period is wall-clock, and wall-clock is a proxy for
   * "the page has had enough opportunity to do more work". Under contention —
   * four projects and several workers on one machine — a page that is between
   * render phases is easily still for 500ms because it is starved or waiting,
   * not because it has finished. The scan then fires early and reports the
   * shell clean, which is the false pass the settle was built to remove,
   * arriving less often through the same door. Measured on one application's
   * landing page: green three times out of three run alone, and red under full
   * live-suite load with `[critical] label` on three nodes.
   *
   * The tell is that `settled` was **`true`** in exactly those early runs. The
   * scan believed it had settled, because by its own definition it had.
   *
   * So this stops proxying and measures the thing itself: a result is a result
   * when scanning again gives the same answer. A page still rendering does not
   * — its findings move between attempts, which is precisely what makes it
   * detectable without knowing *why* it was slow.
   *
   * `false` means the scans never agreed inside `scans` attempts. The findings
   * are still returned, because the last attempt is the best answer available
   * and refusing to report is worse — but they describe a moving page, and a
   * spec that treats that as equivalent to a stable one overstates its result.
   */
  stable: boolean;
  /** How many axe runs it took. Two when the first pair agreed. */
  scans: number;
}

/** One axe finding, in the shape axe reports both violations and incompletes. */
export interface RawAxeFinding {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: { target: unknown[]; html: string; failureSummary?: string }[];
}

/** The subset of an axe result this module reads. Keeps the seam testable. */
export interface RawAxeResult {
  url?: string;
  violations: RawAxeFinding[];
  passes: unknown[];
  /**
   * Typed like `violations` because it *is* shaped like them — axe reports a
   * rule id, an impact, a description and the failing nodes for a check it
   * could not decide, and this module used to read `.length` and throw all of
   * it away.
   */
  incomplete: RawAxeFinding[];
}

/**
 * WCAG conformance is cumulative: AA at 2.2 means every A and AA criterion
 * from 2.0 and 2.1 as well. Writing that out is the difference between "we
 * test WCAG 2.2 AA" and testing the handful of criteria 2.2 added.
 */
const WCAG_LADDER: Record<string, string[]> = {
  wcag2a: ['wcag2a'],
  wcag2aa: ['wcag2a', 'wcag2aa'],
  wcag2aaa: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  wcag21a: ['wcag2a', 'wcag21a'],
  wcag21aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  wcag22a: ['wcag2a', 'wcag21a', 'wcag22a'],
  wcag22aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  wcag22aaa: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  en301549: ['EN-301-549'],
  section508: ['section508'],
};

export class UnknownStandardError extends Error {
  constructor(standard: string) {
    super(
      `No axe tags are known for accessibility standard '${standard}'. Known: ` +
        `${Object.keys(WCAG_LADDER).join(', ')}. The profile may name any standard — but a ` +
        'scan needs to know which rules it means, so either use one of these or add the ' +
        'mapping in src/integrations/a11y/scanner.ts.',
    );
    this.name = 'UnknownStandardError';
  }
}

/**
 * Axe tags for a declared standard.
 *
 * The profile's standard field is deliberately open, so this is where an
 * unrecognised value stops being harmless: it can be carried in configuration
 * and reported, but it cannot be scanned against until somebody says which
 * rules it means.
 */
export function tagsForStandard(standard: A11yStandard): string[] {
  const tags = WCAG_LADDER[standard];
  if (!tags) throw new UnknownStandardError(standard);
  return tags;
}

/** Success criteria numbers out of a rule's tags: `wcag143` → `1.4.3`. */
export function criteriaOf(tags: readonly string[]): string[] {
  return tags
    .filter((tag) => /^wcag\d{3,4}$/.test(tag))
    .map((tag) => tag.slice(4).split('').join('.'))
    .sort();
}

const IMPACTS: readonly string[] = ['minor', 'moderate', 'serious', 'critical'];

/**
 * Shape an axe result into the framework's own model, applying the profile's
 * waivers.
 *
 * A waiver removes a violation from the list and adds it, with its node count,
 * to `waived`. It is never dropped: an exception the product owner accepted
 * for three nodes should be visible when it is suddenly failing on ninety.
 */
export function summarise(
  raw: RawAxeResult,
  capability: Pick<A11yCapability, 'standard' | 'waived'>,
  tags: string[],
  /*
     Defaulted to true so that every existing caller — the tests that feed
     `summarise` a fixture, and anything reading a stored result — keeps its
     meaning. The scanner, which is the only caller that can actually know,
     passes the answer.
  */
  settled = true,
  /*
     Defaulted the same way and for the same reason: a caller feeding a fixture
     to `summarise` is describing one result, not a confirmation round. The
     scanner, which is the only caller that runs axe twice, passes what it saw.
  */
  stability: { stable: boolean; scans: number } = { stable: true, scans: 1 },
): A11yScan {
  const url = raw.url ?? '';
  const violations: A11yViolation[] = [];
  const waived: WaivedViolation[] = [];

  for (const violation of raw.violations) {
    const candidates = (capability.waived ?? []).filter((entry) => entry.rule === violation.id);

    const nodes = violation.nodes.map((node) => ({
      target: node.target.map((part) => String(part)).join(' '),
      html: node.html,
      failureSummary: node.failureSummary ?? '',
    }));

    /*
       Waivers are applied per node, not per rule.

       Suppressing the whole violation the moment its rule id matched meant a
       waiver granted for one known element silently covered every other
       element the rule fired on — including ones added afterwards. Splitting
       the nodes is what makes "an exception accepted for three cannot quietly
       become ninety" true rather than aspirational: the three stay waived and
       counted, and the other eighty-seven are still a failure.
    */
    const remaining: typeof nodes = [];
    const suppressedBy = new Map<A11yWaiver, number>();

    for (const node of nodes) {
      const waiver = candidates.find((entry) => waiverCovers(entry, url, node.target));
      if (waiver) {
        suppressedBy.set(waiver, (suppressedBy.get(waiver) ?? 0) + 1);
      } else {
        remaining.push(node);
      }
    }

    for (const [waiver, count] of suppressedBy) {
      waived.push({
        rule: waiver.rule,
        reason: waiver.reason,
        reviewBy: waiver.reviewBy,
        nodes: count,
      });
    }

    if (remaining.length === 0) continue;

    violations.push({
      id: violation.id,
      impact: IMPACTS.includes(violation.impact ?? '') ? (violation.impact as Impact) : null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      criteria: criteriaOf(violation.tags),
      nodes: remaining,
    });
  }

  // Worst first: a report nobody scrolls should still show the thing that
  // stops somebody using the product.
  violations.sort((a, b) => IMPACTS.indexOf(b.impact ?? '') - IMPACTS.indexOf(a.impact ?? ''));

  return {
    standard: capability.standard,
    tags,
    url: raw.url ?? '',
    violations,
    waived,
    passes: raw.passes.length,
    incomplete: raw.incomplete.length,
    undecided: raw.incomplete.map(asFinding),
    settled,
    stable: stability.stable,
    scans: stability.scans,
  };
}

/**
 * A fingerprint of what axe found, for deciding whether two scans agree.
 *
 * **Taken from the raw result, before waivers.** A waiver removes a violation
 * from the reported list, so fingerprinting the summarised scan would let an
 * accepted exception mask the very movement this is looking for — a page whose
 * only changing finding happens to be waived would read as stable while it was
 * still rendering.
 *
 * `passes` is in the fingerprint deliberately, and it is the most sensitive
 * part of it. A shell has far fewer passing checks than a rendered page, so the
 * count moves early and moves a lot, while the violations a half-rendered page
 * reports can easily be a subset that looks the same twice.
 *
 * Node targets rather than node counts, because an element replaced by another
 * is a page that is still changing even when the tally is unmoved. Sorted, so
 * axe reporting the same findings in a different order is not mistaken for the
 * page moving.
 */
export function findingsFingerprint(raw: RawAxeResult): string {
  const of = (findings: RawAxeFinding[]): string[] =>
    findings
      .map(
        (finding) =>
          `${finding.id}(${finding.nodes
            .map((node) => node.target.map((part) => String(part)).join(' '))
            .sort()
            .join('|')})`,
      )
      .sort();

  return JSON.stringify({
    passes: raw.passes.length,
    violations: of(raw.violations),
    incomplete: of(raw.incomplete),
  });
}

/** An axe finding in this module's own shape. Shared by violations and incompletes. */
function asFinding(finding: RawAxeFinding): A11yViolation {
  return {
    id: finding.id,
    impact: IMPACTS.includes(finding.impact ?? '') ? (finding.impact as Impact) : null,
    help: finding.help,
    helpUrl: finding.helpUrl,
    criteria: criteriaOf(finding.tags),
    nodes: finding.nodes.map((node) => ({
      target: node.target.map((part) => String(part)).join(' '),
      html: node.html,
      failureSummary: node.failureSummary ?? '',
    })),
  };
}

/**
 * One line per undecided check, so "1 needs a human" says *which* one.
 *
 * Without this the only honest reactions to a failing `incomplete` assertion
 * were to loosen it or delete the spec, because nothing on the page or in the
 * message said what to go and look at.
 */
export function describeUndecided(scan: A11yScan): string {
  if (scan.undecided.length === 0) return 'no undecided checks';
  const lines = scan.undecided.map((finding) => {
    const where = finding.nodes
      .slice(0, 3)
      .map((node) => node.target)
      .join(', ');
    const more = finding.nodes.length > 3 ? ` +${finding.nodes.length - 3} more` : '';
    return `  [${finding.impact ?? 'unknown'}] ${finding.id} — ${finding.help}\n` +
      `      ${finding.nodes.length} node(s): ${where}${more}\n` +
      `      ${finding.helpUrl}`;
  });
  return `${scan.undecided.length} check(s) axe could not decide:\n${lines.join('\n')}`;
}

/** One line per violation, for a failure message somebody has to act on. */
export function describe(scan: A11yScan): string {
  /*
     The caveat goes in the message rather than only on the object, because a
     pack that does not yet assert `stable` still has to be told. "No
     violations" from a page that never held still is the single most
     misleading string this module can produce.
  */
  const caveat = scan.stable
    ? ''
    : `\n  UNSTABLE: ${scan.scans} scans of this page disagreed, so it was still changing. ` +
      'These findings describe a moving page and may be a subset.';

  if (scan.violations.length === 0) {
    return (
      `no ${scan.standard} violations (${scan.passes} checks passed, ${scan.incomplete} need a human)` +
      caveat
    );
  }
  const lines = scan.violations.map((violation) => {
    const where = violation.nodes
      .slice(0, 3)
      .map((node) => node.target)
      .join(', ');
    const more = violation.nodes.length > 3 ? ` +${violation.nodes.length - 3} more` : '';
    return `  [${violation.impact ?? 'unknown'}] ${violation.id} — ${violation.help}\n` +
      `      ${violation.nodes.length} node(s): ${where}${more}\n` +
      `      ${violation.helpUrl}`;
  });
  return `${scan.violations.length} ${scan.standard} violation(s):\n${lines.join('\n')}${caveat}`;
}

export interface ScanOptions {
  /** Limit the scan to part of the page — a dialog, a table, one region. */
  include?: string;
  exclude?: string;
  /** Rules to skip for this call only. A permanent exception is a waiver. */
  disableRules?: string[];
  /**
   * How long the DOM must be still before scanning, and how long to wait for
   * that. See `settle.ts` — the defaults are what stop a scan answering for a
   * page that has not finished rendering.
   */
  settle?: SettleOptions;
  /**
   * How many axe runs to spend looking for two that agree, before giving up
   * and reporting the last one with `stable: false`.
   *
   * Two is the floor and the normal cost: scan, settle, scan, and on a page
   * that has genuinely finished the pair agrees and it stops. A third is spent
   * only when the first two disagreed, which is the case this exists for.
   *
   * Raising it buys patience with a page that keeps moving. It does not buy
   * accuracy on one that has stopped, so the default is deliberately small.
   */
  maxScans?: number;
}

/** Two agreeing scans is the answer; a third is for when the first pair did not. */
export const DEFAULT_MAX_SCANS = 3;

export interface A11yScanner {
  /**
   * Scan the page against the target's declared standard, and return what was
   * found. Asserts nothing: the spec decides what counts as a failure.
   */
  scan(page: Page, options?: ScanOptions): Promise<A11yScan>;
}

/** Runs axe in the page. Injected so `summarise` can be tested without one. */
export type AxeRunner = (page: Page, tags: string[], options: ScanOptions) => Promise<RawAxeResult>;

/** Waits for the page to stop changing. Injected for the same reason as the runner. */
export type Settler = (page: Page, options?: SettleOptions) => Promise<boolean>;

export function createScanner(
  capability: Pick<A11yCapability, 'standard' | 'waived'>,
  run: AxeRunner,
  settle: Settler = waitForSettled,
): A11yScanner {
  const tags = tagsForStandard(capability.standard);
  return {
    async scan(page, options = {}) {
      /*
         Settle first, always. The alternative considered was a `settle: false`
         escape hatch for callers who know their page is static — and it was
         rejected: the cost of settling a page that is already still is one
         quiet period, and the cost of getting it wrong is a green
         accessibility report for a page nobody checked. Nobody opts out of
         that trade correctly under deadline.
      */
      /*
         Then scan until two consecutive runs agree.

         **Settling is a proxy and this is the fact.** The quiet period asks
         whether the DOM held still for 500ms of wall-clock, which stands in
         for "the page has finished". Under contention the two come apart: a
         page between render phases is still because it is starved or waiting,
         and the scan fires early on a shell with `settled: true`. Asking
         whether the *answer* repeats needs no theory about why the page was
         slow — a page still rendering reports different findings each time,
         and one that has stopped reports the same ones however busy the
         machine is.

         Rejected on the way here, and recorded because both look reasonable:
         **raising the quiet period** widens the window without improving the
         signal, slows every scan on every application, and still loses
         whenever contention is worse than the number somebody guessed; and
         **settling twice** is arithmetically just a longer quiet period,
         because the second observer resets on the same mutations the first
         one did.
      */
      const maxScans = Math.max(2, options.maxScans ?? DEFAULT_MAX_SCANS);

      let settled = await settle(page, options.settle);
      let latest = await run(page, tags, options);
      let previous = findingsFingerprint(latest);
      let scans = 1;
      let stable = false;

      while (scans < maxScans) {
        settled = await settle(page, options.settle);
        latest = await run(page, tags, options);
        scans++;

        const current = findingsFingerprint(latest);
        if (current === previous) {
          stable = true;
          break;
        }
        previous = current;
      }

      /*
         The last scan rather than the first, whichever way this ended. When
         the pair agreed the two are equivalent; when they never did, the most
         recent is the closest to a finished page, and reporting the earliest
         would be reporting the emptiest.
      */
      return summarise(latest, capability, tags, settled, { stable, scans });
    },
  };
}
