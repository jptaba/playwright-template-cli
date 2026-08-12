import type { Page } from '@playwright/test';
import type { A11yCapability, A11yStandard } from '../../../config/targets/types';

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
}

/** The subset of an axe result this module reads. Keeps the seam testable. */
export interface RawAxeResult {
  url?: string;
  violations: {
    id: string;
    impact?: string | null;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: { target: unknown[]; html: string; failureSummary?: string }[];
  }[];
  passes: unknown[];
  incomplete: unknown[];
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
): A11yScan {
  const waivers = new Map((capability.waived ?? []).map((entry) => [entry.rule, entry]));
  const violations: A11yViolation[] = [];
  const waived: WaivedViolation[] = [];

  for (const violation of raw.violations) {
    const waiver = waivers.get(violation.id);
    if (waiver) {
      waived.push({ ...waiver, nodes: violation.nodes.length });
      continue;
    }
    violations.push({
      id: violation.id,
      impact: IMPACTS.includes(violation.impact ?? '') ? (violation.impact as Impact) : null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      criteria: criteriaOf(violation.tags),
      nodes: violation.nodes.map((node) => ({
        target: node.target.map((part) => String(part)).join(' '),
        html: node.html,
        failureSummary: node.failureSummary ?? '',
      })),
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
  };
}

/** One line per violation, for a failure message somebody has to act on. */
export function describe(scan: A11yScan): string {
  if (scan.violations.length === 0) {
    return `no ${scan.standard} violations (${scan.passes} checks passed, ${scan.incomplete} need a human)`;
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
  return `${scan.violations.length} ${scan.standard} violation(s):\n${lines.join('\n')}`;
}

export interface ScanOptions {
  /** Limit the scan to part of the page — a dialog, a table, one region. */
  include?: string;
  exclude?: string;
  /** Rules to skip for this call only. A permanent exception is a waiver. */
  disableRules?: string[];
}

export interface A11yScanner {
  /**
   * Scan the page against the target's declared standard, and return what was
   * found. Asserts nothing: the spec decides what counts as a failure.
   */
  scan(page: Page, options?: ScanOptions): Promise<A11yScan>;
}

/** Runs axe in the page. Injected so `summarise` can be tested without one. */
export type AxeRunner = (page: Page, tags: string[], options: ScanOptions) => Promise<RawAxeResult>;

export function createScanner(
  capability: Pick<A11yCapability, 'standard' | 'waived'>,
  run: AxeRunner,
): A11yScanner {
  const tags = tagsForStandard(capability.standard);
  return {
    async scan(page, options = {}) {
      return summarise(await run(page, tags, options), capability, tags);
    },
  };
}
