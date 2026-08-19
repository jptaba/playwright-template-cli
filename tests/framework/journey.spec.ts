import { expect, test } from '@playwright/test';
import {
  COVERAGE_KINDS,
  coveragePresent,
  formatJourney,
  journeyComplete,
  STAGES,
  type StageResult,
} from '../../src/support/journey';

/**
 * "Run the application end to end" means all six stages.
 *
 * The phrase had come to mean "run the suite", which is one of them, and the
 * five it skipped are the ones nobody notices are missing because a green
 * suite looks like a finished job. Most of what is asserted here is that a
 * stage which did not happen cannot be reported as one that did.
 */

const done = (stage: StageResult['stage']): StageResult => ({ stage, state: 'done', detail: 'ok' });

test.describe('what counts as complete', () => {
  test('every stage done is complete', () => {
    expect(journeyComplete(STAGES.map((entry) => done(entry.stage)))).toBe(true);
  });

  test('a skipped stage is not a pass', () => {
    /*
       The whole reason this exists. A report that treated an unreachable
       PractiTest as fine would reintroduce exactly the habit it was written to
       stop — running the suite and calling it end to end.
    */
    const results = STAGES.map((entry) => done(entry.stage));
    results[5] = { stage: 'publish', state: 'skipped', detail: 'nothing configured' };

    expect(journeyComplete(results)).toBe(false);
    expect(formatJourney('demo', results).join('\n')).toContain('Skipped is not passed');
  });

  test('a stage never reached is not a pass either', () => {
    // Stopping early must not read as success for the stages that never ran.
    const results = [done('onboarding'), done('stories-or-cases')];
    const report = formatJourney('demo', results).join('\n');

    expect(journeyComplete(results)).toBe(false);
    expect(report).toContain('not reached');
    expect(report).toContain('triage');
  });

  test('the report names what each unreached stage would have proved', () => {
    // A list of stage names tells somebody what is missing; saying what it
    // proves tells them why they should care.
    const report = formatJourney('demo', [done('onboarding')]).join('\n');
    expect(report).toContain('a real failure is clustered and classified');
  });
});

test.describe('the five kinds of coverage', () => {
  test('are read from the tags the suite actually selects on', () => {
    /*
       Tags rather than filenames or a checklist: the tag is what `--grep`
       picks, so this cannot drift from what runs. A kind claimed in a
       directory name and missing from every title passes a filename check and
       fails here, which is the right way round.
    */
    const sources = COVERAGE_KINDS.map((entry) => `test('does a thing ${entry.tag}', () => {});`);
    expect(coveragePresent(sources).every((entry) => entry.present)).toBe(true);
  });

  test('a missing kind is named, not merely counted', () => {
    const sources = ["test('happy @smoke', () => {});", "test('bad input @negative', () => {});"];
    const missing = coveragePresent(sources).filter((entry) => !entry.present);

    expect(missing.map((entry) => entry.kind).sort()).toEqual(['audit', 'boundary', 'idempotency']);
  });

  test('an empty pack is missing all five rather than passing vacuously', () => {
    expect(coveragePresent([]).some((entry) => entry.present)).toBe(false);
  });
});

test('the stages are in the order they have to happen', () => {
  // Triage needs a run to triage; publishing needs something to publish.
  const order = STAGES.map((entry) => entry.stage);
  expect(order.indexOf('run')).toBeLessThan(order.indexOf('triage'));
  expect(order.indexOf('triage')).toBeLessThan(order.indexOf('publish'));
  expect(order.indexOf('onboarding')).toBe(0);
});
