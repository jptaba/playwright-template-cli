import { hashContent } from './store';
import type { CasePriority, CaseStep, CaseType, TestCase } from './schema';

/**
 * Track A: a Jira story becomes drafted test cases — §09.
 *
 * The failure mode of a model asked to write test cases from a thin story is
 * not silence. It is fluent, plausible cases for behaviour nobody ever
 * specified — and once such a case is published it stops looking like a
 * model's guess and starts looking like a requirement (§22).
 *
 * Two mechanical checks contain it, and both are enforced here rather than
 * requested in a prompt:
 *
 *  1. **Every case cites a criterion, and quotes it verbatim.** The quote is
 *     verified as a substring of the source story. A case that cannot cite one
 *     is not rejected — it is written to a speculative block a human triages.
 *  2. **Every criterion maps to at least one case.** The inverse check is the
 *     more useful one, because uncovered AC is what a reviewer cannot spot by
 *     reading a list of cases that all look reasonable.
 */

export interface NormalisedStory {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  /** Hash of the story's meaningful content, for drift detection (§09). */
  contentHash: string;
}

export function normaliseStory(story: {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
}): NormalisedStory {
  return {
    ...story,
    contentHash: hashContent(
      JSON.stringify({
        title: story.summary,
        description: story.description,
        acceptanceCriteria: story.acceptanceCriteria,
      }),
    ),
  };
}

/** What the model is asked to return. Deliberately narrow. */
export interface DraftedCase {
  title: string;
  /** Indexes into the story's criteria, 1-based, as the model was shown them. */
  coversAC: string[];
  /** The criterion text, quoted verbatim from the story. */
  acQuoted: string;
  preconditions: string[];
  steps: CaseStep[];
  assertions: string[];
  priority: CasePriority;
  type: CaseType;
}

/**
 * The case author sees requirement text only — never the running application.
 *
 * "Give the case-authoring model access to the running application and it will
 * write cases that describe what the application currently does. Those cases
 * pass on day one, pass on a broken build, and can never catch a regression,
 * because the behaviour under test *is* the oracle they were derived from."
 *
 * The interface takes a story and returns drafts. There is deliberately no
 * browser, no tool list, and no write access to anything.
 */
export interface CaseAuthorModel {
  readonly identity: string;
  draft(story: NormalisedStory): Promise<DraftedCase[]>;
}

export interface AuthoringResult {
  /** Cases that cite and correctly quote a criterion. Publishable after review. */
  accepted: TestCase[];
  /**
   * Cases citing nothing, or misquoting. Never published unexamined: "some of
   * those will be genuinely valuable edge cases; they should just never enter
   * PractiTest unexamined" (§09).
   */
  speculative: Array<{ case: TestCase; reason: string }>;
  coverage: CoverageMatrix;
}

export interface CoverageMatrix {
  criteria: Array<{ id: string; text: string; caseTitles: string[] }>;
  /** Criteria with no case behind them. The tool fails on these. */
  gaps: string[];
}

/** Normalised for comparison: quoting should survive whitespace reflow, not editing. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[""'']/g, "'").trim();
}

/**
 * Is the quote genuinely from the story? This is the check that separates
 * "cites a requirement" from "sounds like it cites a requirement".
 */
export function quoteIsVerbatim(quote: string, story: NormalisedStory): boolean {
  if (!quote.trim()) return false;
  const haystack = comparable(
    [story.summary, story.description, ...story.acceptanceCriteria].join('\n'),
  );
  return haystack.includes(comparable(quote));
}

export function criterionId(index: number): string {
  return `AC-${index + 1}`;
}

export async function authorCases(
  story: NormalisedStory,
  model: CaseAuthorModel,
  target: string,
): Promise<AuthoringResult> {
  const drafts = await model.draft(story);

  const accepted: TestCase[] = [];
  const speculative: Array<{ case: TestCase; reason: string }> = [];

  for (const draft of drafts) {
    const testCase: TestCase = {
      id: null,
      target,
      title: draft.title,
      source: {
        type: 'jira-story',
        key: story.key,
        contentHash: story.contentHash,
        authoredBy: model.identity,
      },
      coversAC: draft.coversAC,
      acQuoted: draft.acQuoted,
      preconditions: draft.preconditions,
      steps: draft.steps,
      assertions: draft.assertions,
      priority: draft.priority,
      type: draft.type,
    };

    const knownCriteria = new Set(story.acceptanceCriteria.map((_, index) => criterionId(index)));
    const citesKnown = draft.coversAC.length > 0 && draft.coversAC.every((id) => knownCriteria.has(id));

    if (!citesKnown) {
      speculative.push({
        case: { ...testCase, speculative: true },
        reason:
          draft.coversAC.length === 0
            ? 'cites no acceptance criterion'
            : `cites ${draft.coversAC.join(', ')}, which this story does not contain`,
      });
      continue;
    }

    if (!quoteIsVerbatim(draft.acQuoted, story)) {
      speculative.push({
        case: { ...testCase, speculative: true },
        reason:
          'the quoted criterion is not a verbatim substring of the story — a paraphrase is how ' +
          'a requirement quietly changes meaning between the story and the case',
      });
      continue;
    }

    accepted.push(testCase);
  }

  return { accepted, speculative, coverage: buildCoverage(story, accepted) };
}

export function buildCoverage(story: NormalisedStory, cases: TestCase[]): CoverageMatrix {
  const criteria = story.acceptanceCriteria.map((text, index) => {
    const id = criterionId(index);
    return {
      id,
      text,
      caseTitles: cases.filter((testCase) => testCase.coversAC.includes(id)).map((testCase) => testCase.title),
    };
  });
  return {
    criteria,
    gaps: criteria.filter((criterion) => criterion.caseTitles.length === 0).map((criterion) => criterion.id),
  };
}

export function renderCoverage(matrix: CoverageMatrix): string {
  const lines = ['', 'Coverage matrix', '---------------'];
  for (const criterion of matrix.criteria) {
    const mark = criterion.caseTitles.length > 0 ? 'OK  ' : 'GAP ';
    lines.push(`  ${mark}${criterion.id}  ${criterion.text.slice(0, 70)}`);
    for (const title of criterion.caseTitles) lines.push(`        · ${title}`);
  }
  if (matrix.gaps.length > 0) {
    lines.push(
      '',
      `${matrix.gaps.length} criterion/criteria have no case behind them: ${matrix.gaps.join(', ')}.`,
      'Uncovered AC is the thing a human reviewer cannot spot by reading a list of cases that ' +
        'all look reasonable (§09).',
    );
  }
  return lines.join('\n');
}
