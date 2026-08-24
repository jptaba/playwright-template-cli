import { authorCases, criterionId, normaliseStory, type CaseAuthorModel, type CoverageMatrix, type NormalisedStory } from './author';
import { gateCase, type GateFinding } from './gate';
import { slugify } from './store';
import { storiesVisibleTo } from './story-scope';
import type { OwnedStory } from './stories';
import type { CasePriority, CaseType, TestCase } from './schema';
import { failure, json, type Route, type UiRequest, type UiResponse } from '../ui/router';

/**
 * Track A with a face on it — §09, §08 phase 4.
 *
 * A story becomes drafted cases, and stops there. The conventions put a person
 * between authoring and publication on purpose: git is the staging area,
 * PractiTest is publication, and the review that matters is a diff. A button
 * that went from story to merged spec would be the exact loop those
 * conventions exist to prevent.
 *
 * So this writes files into `cases/` and nothing else. It commits nothing, it
 * publishes nothing, and it touches no path outside that directory.
 *
 * Every rule lives here, over an injected service, so it can be tested without
 * a socket, a network or a credential — including against the fake Jira server
 * the client's own tests already use.
 */

/** Everything the outside world has to do for the authoring page. */
export interface AuthoringService {
  /** Stories already pulled, each with the application it was pulled for. */
  storedStories(): OwnedStory[];
  /**
   * Which application is selected, and which applications' specs cite each
   * story — the second of the two facts `storyVisibleTo` needs, the first
   * being the directory a story sits in. Item 73.
   *
   * Supplied rather than computed here so this module stays free of the
   * filesystem, and required rather than optional so a new implementation has
   * to answer it: an implementation that quietly returned "no claims" would
   * show every application every story, which is the defect this exists to
   * remove.
   */
  storyScope(): Promise<{ target: string | null; claims: Map<string, string[]> }>;
  /** Whether a Jira client can be built, and if not, what is missing. */
  jira(): { configured: boolean; reason?: string };
  /** One issue, as the client normalises it. */
  fetchIssue(key: string): Promise<{
    key: string;
    summary: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
  /** Persist a pulled story. Returns its repo-relative path. */
  saveStory(story: NormalisedStory, target: string): string;
  /** The applications a case may be drafted against. */
  targets(): string[];
  /** The case author. Built on demand: no credential is needed to open the page. */
  model(): Promise<CaseAuthorModel>;
  /**
   * Whether drafting can work at all, asked before anything is offered.
   *
   * A button that fails on press is a worse answer than a button that says
   * why it cannot run — especially here, where the failure arrives in the
   * SDK's words from three layers down.
   */
  modelStatus(): { configured: boolean; reason?: string };
  /** What the last `model()` spent, when the model reports it. */
  usage(): AuthoringUsageView | null;
  /** Write one case. Says whether it replaced a file, and returns what it wrote. */
  writeCase(testCase: TestCase, slug: string): { file: string; replaced: boolean; yaml: string };
  /** Cases already in `cases/` that came from this story. */
  casesFor(storyKey: string): Array<{ file: string; title: string; speculative: boolean }>;
}

export interface AuthoringUsageView {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
}

export interface StoryView {
  key: string;
  summary: string;
  description: string;
  criteria: Array<{ id: string; text: string }>;
  contentHash: string;
  /** Cases already drafted from it, so a second run is a choice rather than a surprise. */
  drafted: Array<{ file: string; title: string; speculative: boolean }>;
}

export interface DraftedCaseView {
  title: string;
  /**
   * `written` reached `cases/`. `quarantined` cited nothing or misquoted, and
   * was written to a speculative file. `rejected` failed the quality gate and
   * was **not** written — shown in full because it is otherwise lost.
   */
  status: 'written' | 'quarantined' | 'rejected';
  coversAC: string[];
  acQuoted: string;
  priority: CasePriority;
  type: CaseType;
  /**
   * Absent on a quarantined case: it never reached the gate, and reporting a
   * score it was never given would be an invented number on a page whose whole
   * subject is invented content.
   */
  gate?: { passed: boolean; score: number; findings: GateFinding[] };
  /** Why it was quarantined. */
  reason?: string;
  file?: string;
  /** True when the file was already there — then the git diff is a real diff. */
  replaced?: boolean;
  /** Exactly what was written, for the review. */
  yaml?: string;
}

export interface DraftReview {
  story: string;
  target: string;
  model: string;
  cases: DraftedCaseView[];
  coverage: CoverageMatrix;
  counts: {
    drafted: number;
    written: number;
    replaced: number;
    quarantined: number;
    rejected: number;
  };
  usage: AuthoringUsageView | null;
}

/**
 * `ABC-123`. Checked because it is interpolated into a request path, and
 * because a typo should say so rather than return somebody else's 404.
 */
const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/**
 * Turn a credential failure from the model into something to act on.
 *
 * The SDK resolves its credential **when the request is made**, not when the
 * client is constructed — so a guard around `new AnthropicCaseAuthor()` never
 * fires, and what reached the page was the SDK's own sentence: *"Could not
 * resolve authentication method. Expected one of apiKey, authToken,
 * credentials, config, or profile to be set."* True, and no use at all to
 * somebody who has just pressed a button in a dashboard.
 *
 * @returns what to do about it, or null when the failure is something else.
 */
export function describeModelAuthFailure(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const looksLikeAuth =
    /could not resolve authentication|authentication[_ ]error|invalid[_ ]api[_ ]key|x-api-key|anthropic_api_key|\b401\b/i.test(
      message,
    );
  if (!looksLikeAuth) return null;

  return (
    'The case author has no credential, so nothing was drafted and nothing was written. ' +
    'Set ANTHROPIC_API_KEY in the environment and **restart `npm run dashboard`** — the server ' +
    'reads the environment it was started with, so exporting the key in another terminal will ' +
    'not reach it. Everything else on this page works without one: stories can be read and ' +
    'coverage, runs and triage need no model at all.\n\n' +
    `The client reported: ${message}`
  );
}

/** The wording `story:pull` uses, because it is the same refusal (§09). */
export const NO_CRITERIA_REASON =
  'has no identifiable acceptance criteria, so it is rejected at extraction rather than ' +
  'guessed at. Set JIRA_AC_FIELD to the custom field that holds them, or add an ' +
  '"Acceptance Criteria" heading to the description — Track A may simply not apply to older ' +
  'stories.';

function storyView(story: NormalisedStory, service: AuthoringService): StoryView {
  return {
    key: story.key,
    summary: story.summary,
    description: story.description,
    criteria: story.acceptanceCriteria.map((text, index) => ({ id: criterionId(index), text })),
    contentHash: story.contentHash,
    drafted: service.casesFor(story.key),
  };
}

export function authoringRoutes(service: AuthoringService): Route[] {
  const paths = ['/api/stories', '/api/stories/pull', '/api/stories/draft'];
  return paths.map<Route>((path) => ({
    method: 'POST',
    path,
    handle: (request) => authoringApi(request, service),
  }));
}

async function authoringApi(request: UiRequest, service: AuthoringService): Promise<UiResponse> {
  const body = (request.body ?? {}) as Record<string, unknown>;

  switch (request.path) {
    case '/api/stories': {
      /*
         Scoped to the selected application — item 73.

         `stories/` is flat and a story names no application, so this used to
         answer with every story on disk: the page offered toolshop's catalogue
         and cart to `orangehrm`. The link already exists in every spec that
         cites a story, which is what `storyClaims` reads.
      */
      const scope = await service.storyScope();
      const visible = storiesVisibleTo(service.storedStories(), scope.target, scope.claims);
      return json(200, {
        stories: visible.map((owned) => storyView(owned.story, service)),
        jira: service.jira(),
        targets: service.targets(),
        model: service.modelStatus(),
      });
    }

    case '/api/stories/pull':
      return pull(String(body.key ?? '').trim(), service);

    case '/api/stories/draft':
      return draft(String(body.key ?? '').trim(), String(body.target ?? '').trim(), service);

    default:
      return failure(404, `No route for ${request.path}.`);
  }
}

async function pull(key: string, service: AuthoringService): Promise<UiResponse> {
  if (!ISSUE_KEY.test(key)) {
    return failure(400, `'${key}' is not an issue key. They look like FIN-2210.`);
  }

  const status = service.jira();
  if (!status.configured) {
    return failure(400, status.reason ?? 'Jira is not configured.');
  }

  /*
     A story is pulled *for* an application, because that is the directory it
     lands in. Refused rather than guessed: adopting it into whichever
     application happened to be first is the flat-directory defect with a new
     costume on.
  */
  const scope = await service.storyScope();
  if (!scope.target) {
    return failure(
      400,
      'Select an application first. A story is read from Jira for one application, and its ' +
        'directory under stories/ is what says which.',
    );
  }

  const issue = await service.fetchIssue(key);

  /*
     The one refusal that matters in this whole flow. Drafting cases from a
     title and a paragraph of context is precisely how a model invents a
     requirement, and an invented requirement that reaches PractiTest stops
     looking like a guess and starts looking like a specification (§22).
  */
  if (issue.acceptanceCriteria.length === 0) {
    return failure(400, `${key} ${NO_CRITERIA_REASON}`);
  }

  const story = normaliseStory({
    key: issue.key,
    summary: issue.summary,
    description: issue.description,
    acceptanceCriteria: issue.acceptanceCriteria,
  });

  return json(200, {
    story: storyView(story, service),
    file: service.saveStory(story, scope.target),
  });
}

async function draft(
  key: string,
  target: string,
  service: AuthoringService,
): Promise<UiResponse> {
  const owned = service.storedStories().find((candidate) => candidate.story.key === key);
  if (!owned) return failure(400, `No story ${key} on disk. Read it from Jira first.`);
  const story = owned.story;

  // The target names a directory under `cases/`. Anything not already a known
  // application is refused rather than created.
  if (!service.targets().includes(target)) {
    return failure(400, `'${target}' is not an application in this repository.`);
  }

  const model = await service.model();

  /*
     Drafting is the one thing here that costs money and needs a credential,
     and it is the last thing to run — so a failure means nothing was written
     and the message can say so plainly.
  */
  let result;
  try {
    result = await authorCases(story, model, target);
  } catch (error) {
    const guidance = describeModelAuthFailure(error);
    if (guidance) return failure(400, guidance);
    throw error;
  }

  const cases: DraftedCaseView[] = [];
  let written = 0;
  let replaced = 0;

  for (const testCase of result.accepted) {
    const gate = gateCase(testCase);
    const view: DraftedCaseView = {
      title: testCase.title,
      status: gate.passed ? 'written' : 'rejected',
      coversAC: testCase.coversAC,
      acQuoted: testCase.acQuoted,
      priority: testCase.priority,
      type: testCase.type,
      gate: { passed: gate.passed, score: gate.score, findings: gate.findings },
    };

    /*
       A case that fails the gate is not written, exactly as `cases:author`
       does. "'Automatically create scripts just by looking at test cases'
       holds only for cases that are actually specific" — so it is shown here
       in full, with the findings, because otherwise it is simply lost (§10).
    */
    if (gate.passed) {
      const saved = service.writeCase(testCase, `${story.key}-${slugify(testCase.title)}`);
      view.file = saved.file;
      view.replaced = saved.replaced;
      view.yaml = saved.yaml;
      written += 1;
      if (saved.replaced) replaced += 1;
    }

    cases.push(view);
  }

  for (const { case: testCase, reason } of result.speculative) {
    const saved = service.writeCase(
      testCase,
      `speculative-${story.key}-${slugify(testCase.title)}`,
    );
    if (saved.replaced) replaced += 1;
    cases.push({
      title: testCase.title,
      status: 'quarantined',
      coversAC: testCase.coversAC,
      acQuoted: testCase.acQuoted,
      priority: testCase.priority,
      type: testCase.type,
      reason,
      ...saved,
    });
  }

  return json(200, {
    story: story.key,
    target,
    model: model.identity,
    cases,
    coverage: result.coverage,
    counts: {
      drafted: result.accepted.length + result.speculative.length,
      written,
      replaced,
      quarantined: result.speculative.length,
      rejected: result.accepted.length - written,
    },
    usage: service.usage(),
  } satisfies DraftReview);
}
