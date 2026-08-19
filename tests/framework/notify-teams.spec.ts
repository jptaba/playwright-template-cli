import { expect, test } from '@playwright/test';
import { fixtureRun } from '../support/fixture-run';
import { renderTeamsCard, TEAMS_CARD_LIMIT } from '../../src/support/report/render-teams';
import { tally, type RunResult, type TestRecord } from '../../src/support/reporters/run-result';
import type { TriageResult, TriageVerdict } from '../../src/support/triage/types';

/**
 * The run as a Teams card.
 *
 * A channel post is read on a phone, in a list, next to other people's
 * messages — so what is tested here is mostly what the card *leaves out*. A
 * notification that says too much is one people mute, and a muted channel is
 * indistinguishable from no notification at all.
 */

function verdict(category: string, summary: string): TriageVerdict {
  return {
    clusterId: `c-${category}`,
    category: category as TriageVerdict['category'],
    confidence: 'high',
    summary,
    evidence: ['because'],
    affectedTests: ['t1'],
    recommendedAction: 'escalate',
    suggestedOwner: 'qa',
    needsHumanReview: false,
    source: 'rule',
  };
}

function triageWith(verdicts: TriageVerdict[]): TriageResult {
  return {
    schemaVersion: 1,
    runId: 'r1',
    generatedAt: '2026-08-18T00:00:00Z',
    clusters: [],
    verdicts,
    stats: { failures: 1, clusters: 1, resolvedByRule: 1, sentToAgent: 0, needingHumanReview: 0 },
  };
}

/**
 * A run where everything passed.
 *
 * `fixtureRun()` is deliberately a *mix* — 2 passed, 1 failed, 1 flaky, 1
 * skipped — so it is the failing case, not the green one. Asserting the green
 * card against it is how this test first failed.
 */
function greenRun(): RunResult {
  const run = fixtureRun();
  const base = run.tests[0]!;
  run.tests = [
    { ...base, id: 'a', outcome: 'expected', status: 'passed' },
    { ...base, id: 'b', outcome: 'expected', status: 'passed' },
  ];
  run.totals = tally(run.tests);
  run.run.status = 'passed';
  return run;
}

/** The card's own words, flattened, which is what a reader actually sees. */
function textOf(card: ReturnType<typeof renderTeamsCard>): string {
  return JSON.stringify(card.body);
}

test.describe('what the card says', () => {
  test('a green run leads with the verdict, not the numbers', () => {
    const card = renderTeamsCard({ run: greenRun(), triage: null });
    const first = (card.body.attachments as [{ content: { body: [{ text: string }] } }])[0].content
      .body[0].text;

    expect(first).toContain('✅');
    expect(first).toContain('demo');
  });

  test('a failing run says so first, because that is why it was sent', () => {
    // The fixture is already a failing mix, which is the case worth checking.
    const card = renderTeamsCard({ run: fixtureRun(), triage: null });

    expect(card.summary).toContain('❌');
    expect(card.summary).toMatch(/failed/);
  });

  test('a report link is offered only when there is a report to open', () => {
    const withUrl = renderTeamsCard({
      run: fixtureRun(),
      triage: null,
      reportUrl: 'https://reports.internal.corp/run/1',
    });
    const without = renderTeamsCard({ run: fixtureRun(), triage: null });

    expect(textOf(withUrl)).toContain('Action.OpenUrl');
    // An action that goes nowhere is worse than no action.
    expect(textOf(without)).not.toContain('Action.OpenUrl');
  });
});

test.describe('what the card leaves out', () => {
  test('no triage block at all on a run with no verdicts', () => {
    // "0 clusters" on every green run is the noise that gets a channel muted,
    // and the verdict line already said the run passed.
    const card = renderTeamsCard({ run: greenRun(), triage: triageWith([]) });
    expect(textOf(card)).not.toContain('cluster');
  });

  test('a flood of verdicts is capped, and says how many it kept back', () => {
    /*
       A failing run with sixty clusters would otherwise post sixty lines into
       a channel. The rest are counted rather than dropped silently — the
       report has all of them.
    */
    const many = Array.from({ length: 12 }, (_, i) => verdict('locator-drift', `finding ${i}`));
    const card = renderTeamsCard({ run: fixtureRun(), triage: triageWith(many) });
    const text = textOf(card);

    expect(text).toContain('finding 0');
    expect(text, 'the twelfth was not posted').not.toContain('finding 11');
    expect(text).toContain('7 more in the report');
  });

  test('known failures are named only when there are some', () => {
    const clean = renderTeamsCard({ run: greenRun(), triage: null });
    expect(textOf(clean)).not.toContain('Known failures');

    const base = fixtureRun().tests[0]!;
    const withKnown: RunResult = { ...greenRun() };
    const records: TestRecord[] = [
      { ...base, id: 'ok', outcome: 'expected', status: 'passed' },
      { ...base, id: 'known', outcome: 'expected', status: 'failed' },
    ];
    withKnown.tests = records;
    withKnown.totals = tally(records);

    expect(textOf(renderTeamsCard({ run: withKnown, triage: null }))).toContain('Known failures');
  });
});

test('a card for an ordinary run is nowhere near the limit Teams truncates at', () => {
  /*
     Teams truncates past 28 KB and answers 200 while doing it, so an oversized
     card looks like a successful post. The tool refuses rather than sending
     one; this is the check that the ordinary case is not close to the edge.
  */
  const many = Array.from({ length: 60 }, (_, i) => verdict('flaky', `a fairly wordy finding ${i}`));
  const card = renderTeamsCard({ run: fixtureRun(), triage: triageWith(many) });

  expect(Buffer.byteLength(JSON.stringify(card.body))).toBeLessThan(TEAMS_CARD_LIMIT / 4);
});
