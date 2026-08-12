import { gateCase, type GateFinding } from './gate';
import type { CasePriority, TestCase } from './schema';
import { specNeedsCase, type SpecFact } from './specs';
import { hashCase } from './store';

/**
 * Which cases have a spec behind them, and which specs cite a case that is not
 * there — §18.
 *
 * "PractiTest set coverage — cases automated vs total in scope, cases not
 * executed, specs with no case ID."
 *
 * Two lists, and they answer different questions. *Cases with no spec* is the
 * backlog: work somebody has decided is worth testing and nobody has automated.
 * *Specs citing a case that is not there* is the opposite failure, and the
 * quieter one — a spec that names case 5104 when no such case exists still
 * runs, still passes, and still reports a result against an id nothing will
 * ever reconcile. Nothing else in the repository notices: lint checks that an
 * annotation is present, not that it points at something.
 *
 * Pure, and the whole of the matching. `collect.ts` reads the disk.
 */

export type CaseStatus = 'automated' | 'drifted' | 'no-spec';

/** How a spec and a case were found to be about each other. */
export type MatchedBy = 'case-file' | 'case-id' | 'spec-path';

export interface CoverageCase {
  /** Repo-relative, forward-slashed path of the case file. */
  file: string;
  case: TestCase;
}

export interface CaseRow {
  file: string;
  id: string | null;
  title: string;
  target: string;
  priority: CasePriority;
  status: CaseStatus;
  /** The specs that implement it. More than one is allowed; none is the point. */
  specs: string[];
  matchedBy: MatchedBy | null;
  /** Something true about this row that the status alone does not say. */
  note: string | null;
  gate: { passed: boolean; score: number; findings: GateFinding[] };
}

export interface OrphanSpec {
  file: string;
  title: string;
  /** The id or the path it named. */
  cites: string;
  citedAs: 'case id' | 'case file';
}

export interface CoverageReport {
  cases: CaseRow[];
  orphans: OrphanSpec[];
  counts: {
    cases: number;
    automated: number;
    drifted: number;
    noSpec: number;
    orphans: number;
    /** Specs read and expected to name a case. */
    specs: number;
  };
}

/** Repo-relative paths, compared the same way whoever wrote them typed them. */
function normalise(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function label(stored: CoverageCase): string {
  return stored.case.id ? `case ${stored.case.id}` : stored.file;
}

interface Link {
  spec: string;
  matchedBy: MatchedBy;
  hash: string | null;
}

export function buildCoverage(input: {
  cases: readonly CoverageCase[];
  specs: readonly SpecFact[];
}): CoverageReport {
  const cases = input.cases.map((stored) => ({ ...stored, file: normalise(stored.file) }));
  // Exempt specs are dropped here rather than filtered by the caller, so the
  // rule about which specs owe a case lives in one place (§07).
  const specs = input.specs
    .map((spec) => ({ ...spec, file: normalise(spec.file) }))
    .filter((spec) => specNeedsCase(spec.file));

  const byFile = new Map<string, CoverageCase>();
  const byId = new Map<string, CoverageCase>();
  const duplicateIds = new Set<string>();

  for (const stored of cases) {
    byFile.set(stored.file, stored);
    if (!stored.case.id) continue;
    // Two cases carrying one id would otherwise make this report lie in both
    // directions at once: one of them looks automated, the other looks like
    // nobody wrote a spec for it.
    if (byId.has(stored.case.id)) duplicateIds.add(stored.case.id);
    else byId.set(stored.case.id, stored);
  }

  const links = new Map<CoverageCase, Link[]>();
  const claimedSpecs = new Map<string, CoverageCase>();
  const orphans: OrphanSpec[] = [];

  const link = (stored: CoverageCase, spec: SpecFact, matchedBy: MatchedBy): void => {
    links.set(stored, [
      ...(links.get(stored) ?? []),
      { spec: spec.file, matchedBy, hash: spec.caseHash },
    ]);
    claimedSpecs.set(spec.file, stored);
  };

  for (const spec of specs) {
    // The file wins over the id: it is the more specific claim, and it is the
    // only one that can name a case that has never been published.
    const named = spec.casePath ? byFile.get(normalise(spec.casePath)) : undefined;
    const identified = spec.caseId ? byId.get(spec.caseId) : undefined;

    if (named) {
      link(named, spec, 'case-file');
      continue;
    }
    if (identified) {
      link(identified, spec, 'case-id');
      continue;
    }

    if (spec.casePath) {
      orphans.push({ file: spec.file, title: spec.title, cites: spec.casePath, citedAs: 'case file' });
    } else if (spec.caseId) {
      orphans.push({ file: spec.file, title: spec.title, cites: spec.caseId, citedAs: 'case id' });
    }
    // A spec citing nothing at all is `require-case-id`'s to report. It fails
    // lint, so it never reaches a state where this would be the news.
  }

  const specFiles = new Set(specs.map((spec) => spec.file));
  const hashOf = (file: string): string | null =>
    specs.find((spec) => spec.file === file && spec.caseHash)?.caseHash ?? null;

  const rows = cases.map((stored) => {
    const found = links.get(stored) ?? [];
    let note: string | null = null;

    /*
       Nothing cited this case, but the case names a spec. That is the
       hand-written pairing — a case with no id yet, and a spec that predates
       the annotation — and it is worth honouring. It is also worth checking:
       a specPath naming a file that is not there, or one that turns out to
       implement a different case, is a broken link either way.
    */
    if (found.length === 0 && stored.case.specPath) {
      const named = normalise(stored.case.specPath);
      const owner = claimedSpecs.get(named);
      if (owner && owner !== stored) {
        note = `specPath names ${named}, which implements ${label(owner)}.`;
      } else if (specFiles.has(named)) {
        found.push({ spec: named, matchedBy: 'spec-path', hash: hashOf(named) });
      } else {
        note = `specPath names ${named}, which is not there.`;
      }
    }

    const current = hashCase(stored.case);
    const drifted = found.some((entry) => entry.hash !== null && entry.hash !== current);
    const status: CaseStatus =
      found.length === 0 ? 'no-spec' : drifted ? 'drifted' : 'automated';

    if (stored.case.id && duplicateIds.has(stored.case.id)) {
      note = `Another case carries the id ${stored.case.id}; only one of them can be matched by it.`;
    }

    const gate = gateCase(stored.case);

    return {
      file: stored.file,
      id: stored.case.id,
      title: stored.case.title,
      target: stored.case.target,
      priority: stored.case.priority,
      status,
      specs: found.map((entry) => entry.spec),
      matchedBy: found[0]?.matchedBy ?? null,
      note,
      gate: { passed: gate.passed, score: gate.score, findings: gate.findings },
    } satisfies CaseRow;
  });

  return {
    cases: rows,
    orphans,
    counts: {
      cases: rows.length,
      automated: rows.filter((row) => row.status === 'automated').length,
      drifted: rows.filter((row) => row.status === 'drifted').length,
      noSpec: rows.filter((row) => row.status === 'no-spec').length,
      orphans: orphans.length,
      specs: specs.length,
    },
  };
}
