import { expect, test } from '@playwright/test';
import { FakeJiraServer } from '../support/fake-jira-server';
import { JiraClient } from '../../src/integrations/jira/client';
import {
  authoringRoutes,
  describeModelAuthFailure,
  type AuthoringService,
} from '../../src/support/cases/authoring';
import { normaliseStory, type DraftedCase, type NormalisedStory } from '../../src/support/cases/author';
import { createRouter, type UiRequest } from '../../src/support/ui/router';
import { storiesPageContent } from '../../src/support/ui/stories-page';
import type { TestCase } from '../../src/support/cases/schema';

/**
 * Track A through the dashboard — §09, §08 phase 4.
 *
 * The rules that matter here are refusals: a story with no criteria is not
 * drafted from, a draft that cites nothing is quarantined rather than shown as
 * ready, and nothing is written outside `cases/`. Each is tested as a refusal
 * rather than as a happy path with a caveat, because the failure mode of this
 * feature is fluent, plausible output that nobody questions (§22).
 */

const STORY = normaliseStory({
  key: 'FIN-2210',
  summary: 'Expense claims over the approval limit are rejected',
  description: 'A claim above the limit must be refused.',
  acceptanceCriteria: [
    'Claims over 10,000 are rejected',
    'The rejection message names the limit',
  ],
});

const goodDraft: DraftedCase = {
  title: 'A claim of 10,001 is rejected',
  coversAC: ['AC-1'],
  acQuoted: 'Claims over 10,000 are rejected',
  preconditions: ['A claimant signed in with an empty claim'],
  steps: [{ action: 'Submit a claim for 10,001', expected: 'The claim is rejected' }],
  assertions: ['The claim status is "Rejected"'],
  priority: 'high',
  type: 'boundary',
};

interface Harness {
  service: AuthoringService;
  written: Array<{ file: string; case: TestCase }>;
  saved: NormalisedStory[];
}

function harness(overrides: Partial<AuthoringService> = {}, drafts: DraftedCase[] = [goodDraft]): Harness {
  const written: Array<{ file: string; case: TestCase }> = [];
  const saved: NormalisedStory[] = [];

  const service: AuthoringService = {
    storyScope: async () => ({ target: null, claims: new Map() }),
    storedStories: () => [STORY],
    jira: () => ({ configured: true }),
    fetchIssue: async () => ({
      key: 'FIN-2210',
      summary: STORY.summary,
      description: STORY.description,
      acceptanceCriteria: STORY.acceptanceCriteria,
    }),
    saveStory: (story) => {
      saved.push(story);
      return `stories/${story.key}.json`;
    },
    targets: () => ['acme-shop'],
    model: async () => ({ identity: 'fake-author', draft: async () => drafts }),
    modelStatus: () => ({ configured: true }),
    usage: () => ({ inputTokens: 1200, outputTokens: 800, estimatedCost: 0.0261 }),
    writeCase: (testCase, slug) => {
      const file = `cases/${testCase.target}/${slug}.yaml`;
      written.push({ file, case: testCase });
      return { file, replaced: false, yaml: `title: ${testCase.title}\n` };
    },
    casesFor: () => [],
    ...overrides,
  };

  return { service, written, saved };
}

const call = async (
  service: AuthoringService,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const handle = createRouter(authoringRoutes(service), { token: 'the-token' });
  const request: UiRequest = {
    method: 'POST',
    path,
    body,
    token: 'the-token',
    host: '127.0.0.1:5599',
  };
  const response = await handle(request);
  return { status: response.status, body: JSON.parse(response.body) as Record<string, unknown> };
};

test.describe('reading a story', () => {
  test('a story with no identifiable criteria is refused, with that as the reason', async () => {
    /*
       The refusal the whole of Track A rests on. Drafting from a title and a
       paragraph of context is exactly how a model invents a requirement, and
       an invented requirement that reaches PractiTest stops looking like a
       guess and starts looking like a specification.
    */
    const { service } = harness({
      fetchIssue: async () => ({
        key: 'FIN-9',
        summary: 'Something vague',
        description: 'Context, but no criteria.',
        acceptanceCriteria: [],
      }),
    });

    const response = await call(service, '/api/stories/pull', { key: 'FIN-9' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('no identifiable acceptance criteria');
    expect(response.body.error).toContain('JIRA_AC_FIELD');
  });

  test('a key that is not a key says so rather than fetching it', async () => {
    // It is interpolated into a request path, and a typo should not come back
    // as somebody else's 404.
    const { service } = harness();
    for (const key of ['', 'FIN 2210', '../../etc/passwd', 'FIN-']) {
      const response = await call(service, '/api/stories/pull', { key });
      expect(response.status, key).toBe(400);
      expect(String(response.body.error)).toContain('issue key');
    }
  });

  test('with Jira unconfigured it says what is missing instead of failing at the socket', async () => {
    const { service } = harness({
      jira: () => ({ configured: false, reason: 'Reading a story from Jira needs JIRA_PAT.' }),
    });

    const response = await call(service, '/api/stories/pull', { key: 'FIN-2210' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('JIRA_PAT');
  });

  test('a pulled story is stored, and its criteria come back numbered as the model will see them', async () => {
    const { service, saved } = harness();

    const response = await call(service, '/api/stories/pull', { key: 'FIN-2210' });

    expect(response.status).toBe(200);
    expect(saved).toHaveLength(1);
    expect(response.body.file).toBe('stories/FIN-2210.json');
    const story = response.body.story as { criteria: Array<{ id: string }>; contentHash: string };
    // `AC-1` here has to be the same `AC-1` the prompt shows and the citation
    // check verifies, or every citation is off by one.
    expect(story.criteria.map((criterion) => criterion.id)).toEqual(['AC-1', 'AC-2']);
    expect(story.contentHash).toBe(STORY.contentHash);
  });
});

test.describe('drafting', () => {
  test('a case that cites and quotes a criterion is written', async () => {
    const { service, written } = harness();

    const response = await call(service, '/api/stories/draft', {
      key: 'FIN-2210',
      target: 'acme-shop',
    });

    expect(response.status).toBe(200);
    expect(response.body.counts).toMatchObject({ drafted: 1, written: 1, quarantined: 0, rejected: 0 });
    expect(written[0]!.file).toBe('cases/acme-shop/FIN-2210-a-claim-of-10-001-is-rejected.yaml');
    expect(written[0]!.case.source).toMatchObject({
      type: 'jira-story',
      key: 'FIN-2210',
      authoredBy: 'fake-author',
      contentHash: STORY.contentHash,
    });
  });

  test('a draft that cites nothing is quarantined, not shown as ready', async () => {
    const { service, written } = harness({}, [{ ...goodDraft, coversAC: [], acQuoted: '' }]);

    const response = await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });

    const cases = response.body.cases as Array<Record<string, unknown>>;
    expect(cases[0]!.status).toBe('quarantined');
    expect(String(cases[0]!.reason)).toContain('cites no acceptance criterion');
    // Written, but to a speculative file and marked as such — some of these are
    // genuinely valuable edge cases; none of them may be published unexamined.
    expect(written[0]!.file).toContain('speculative-FIN-2210-');
    expect(written[0]!.case.speculative).toBe(true);
  });

  test('a paraphrased quote is quarantined, because that is how a requirement changes meaning', async () => {
    const { service } = harness({}, [
      { ...goodDraft, acQuoted: 'Large claims should generally be refused' },
    ]);

    const response = await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });

    const cases = response.body.cases as Array<Record<string, unknown>>;
    expect(cases[0]!.status).toBe('quarantined');
    expect(String(cases[0]!.reason)).toContain('verbatim');
  });

  test('a case the quality gate refuses is not written, and is shown in full', async () => {
    // It reaches no file at all, so if the page does not show it, it is gone.
    const { service, written } = harness({}, [
      {
        ...goodDraft,
        preconditions: [],
        steps: [{ action: 'Open the report', expected: 'The report is correct' }],
        assertions: ['The report works properly'],
      },
    ]);

    const response = await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });

    expect(written).toEqual([]);
    const entry = (response.body.cases as Array<Record<string, unknown>>)[0]!;
    expect(entry.status).toBe('rejected');
    expect(entry.file).toBeUndefined();
    const gate = entry.gate as { findings: Array<{ check: string; remedy: string }> };
    expect(gate.findings.map((finding) => finding.check)).toContain('preconditions');
    expect(gate.findings.every((finding) => finding.remedy.length > 10)).toBe(true);
  });

  test('criteria with no case behind them are reported as gaps', async () => {
    // The number a reviewer cannot get by reading a list of cases that all
    // look reasonable.
    const { service } = harness();

    const response = await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });

    const coverage = response.body.coverage as { gaps: string[] };
    expect(coverage.gaps).toEqual(['AC-2']);
  });

  test('nothing is written outside cases/', async () => {
    const { service, written } = harness({}, [goodDraft, { ...goodDraft, coversAC: [], acQuoted: '' }]);

    await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });

    expect(written).toHaveLength(2);
    for (const entry of written) expect(entry.file.startsWith('cases/')).toBe(true);
  });

  test('an unknown application is refused, because the name is a directory', async () => {
    const { service, written } = harness();

    const response = await call(service, '/api/stories/draft', {
      key: 'FIN-2210',
      target: '../../somewhere',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('not an application');
    expect(written).toEqual([]);
  });

  test('a story that was never pulled is refused rather than invented', async () => {
    const { service } = harness();
    const response = await call(service, '/api/stories/draft', { key: 'FIN-1', target: 'acme-shop' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('No story FIN-1');
  });

  test('reports what the draft cost, which is the number nobody estimates', async () => {
    const { service } = harness();
    const response = await call(service, '/api/stories/draft', { key: 'FIN-2210', target: 'acme-shop' });
    expect(response.body.usage).toMatchObject({ inputTokens: 1200, outputTokens: 800 });
  });
});

test.describe('against a real Jira client', () => {
  let server: FakeJiraServer;
  let baseURL: string;

  test.beforeEach(async () => {
    server = new FakeJiraServer();
    baseURL = await server.start();
  });

  test.afterEach(async () => {
    await server.stop();
  });

  /** The real client, the real routes, no network and no credential. */
  const withJira = (): AuthoringService =>
    harness({
      storedStories: () => [],
      fetchIssue: async (key) => {
        const client = new JiraClient({
          baseURL,
          token: 'jira-service-pat',
          acceptanceCriteriaField: 'customfield_10101',
        });
        try {
          return await client.getIssue(key);
        } finally {
          await client.dispose();
        }
      },
    }).service;

  test('reads a story end to end, with its wiki markup already flattened', async () => {
    server.seedIssue('FIN-2210', {
      summary: 'Expense claims over the approval limit are rejected',
      description: 'h2. Context\nA *claim* above the [limit|http://wiki/limit] must be refused.',
      customfield_10101: '* Claims over 10,000 are rejected\n* The message names the limit',
    });

    const response = await call(withJira(), '/api/stories/pull', { key: 'FIN-2210' });

    expect(response.status).toBe(200);
    const story = response.body.story as {
      description: string;
      criteria: Array<{ id: string; text: string }>;
    };
    // The model never sees wiki markup: it sees this.
    expect(story.description).toContain('A claim above the limit must be refused.');
    expect(story.description).not.toContain('http://wiki/limit');
    expect(story.criteria).toEqual([
      { id: 'AC-1', text: 'Claims over 10,000 are rejected' },
      { id: 'AC-2', text: 'The message names the limit' },
    ]);
  });

  test('a real story with no criteria field is refused at extraction', async () => {
    server.seedIssue('FIN-9', { summary: 'Tidy up the reports', description: 'No criteria here.' });

    const response = await call(withJira(), '/api/stories/pull', { key: 'FIN-9' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('no identifiable acceptance criteria');
  });
});

test.describe('the page', () => {
  const page = storiesPageContent();

  test('its script is syntactically valid JavaScript', () => {
    expect(() => new Function(page.script!)).not.toThrow();
  });

  test('every element the script reaches for is in the body it ships with', () => {
    const referenced = [...page.script!.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]!);
    expect(referenced.length).toBeGreaterThan(5);
    for (const id of new Set(referenced)) {
      expect(page.body, `#${id} is used by the script`).toContain(`id="${id}"`);
    }
  });
});

test.describe('when the case author has no credential', () => {
  test('the SDK sentence becomes something to act on', () => {
    /*
       What reached the page was the client's own words: "Could not resolve
       authentication method. Expected one of apiKey, authToken, credentials,
       config, or profile to be set." True, and no use to somebody who has
       just pressed a button in a dashboard.

       The guard was originally around `new AnthropicCaseAuthor()`, which
       never fired: the SDK resolves its credential when the request is made,
       not when the client is built.
    */
    const guidance = describeModelAuthFailure(
      new Error(
        'Could not resolve authentication method. Expected one of apiKey, authToken, ' +
          'credentials, config, or profile to be set.',
      ),
    );

    expect(guidance).toContain('nothing was drafted and nothing was written');
    expect(guidance).toContain('ANTHROPIC_API_KEY');
    // The gotcha worth stating: the server reads the environment it started
    // with, so exporting the key elsewhere does not reach it.
    expect(guidance).toContain('restart');
    expect(guidance, 'and the original is kept, not swallowed').toContain(
      'Could not resolve authentication method',
    );
  });

  test('a failure that is not about credentials is left alone', () => {
    expect(describeModelAuthFailure(new Error('The reply was cut off at 16000 tokens'))).toBeNull();
    expect(describeModelAuthFailure(new Error('socket hang up'))).toBeNull();
  });

  test('drafting reports it as a refusal, and writes nothing', async () => {
    const { service, written } = harness({
      model: async () => ({
        identity: 'fake-author',
        draft: async () => {
          throw new Error('Could not resolve authentication method.');
        },
      }),
    });

    const response = await call(service, '/api/stories/draft', {
      key: 'FIN-2210',
      target: 'acme-shop',
    });

    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain('ANTHROPIC_API_KEY');
    expect(written, 'a credential failure leaves nothing half-written').toEqual([]);
  });
});
