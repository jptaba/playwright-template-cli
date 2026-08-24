import { expect, test } from '@playwright/test';
import { scopeRuns } from '../../src/support/runs/scope';

/**
 * The runs that belong to the application in the bar — item 80.
 *
 * `/runs`, `/triage` and `/publish` all show a run list and none of them
 * scoped it. Driven with parabank selected, every one offered a `default` run
 * and three toolshop ones and nothing of parabank's; switching to toolshop
 * returned a byte-identical list, which is what made it a defect rather than a
 * fallback.
 */

const run = (id: string, target: string) => ({ id, target });

const FOUR = [
  run('local-mt6o0lyr', 'default'),
  run('20260817T015328-nk1i', 'toolshop'),
  run('20260816T164527-dl50', 'toolshop'),
  run('20260816T162039-0lnd', 'toolshop'),
];

test('an application sees its own runs and nobody else’s', () => {
  const scoped = scopeRuns(FOUR, 'toolshop');

  expect(scoped.runs.map((one) => one.id)).toEqual([
    '20260817T015328-nk1i',
    '20260816T164527-dl50',
    '20260816T162039-0lnd',
  ]);
  expect(scoped.elsewhere).toBe(1);
});

test('an application with no runs of its own is told the others exist', () => {
  /*
     The parabank case exactly, and the reason `elsewhere` is returned rather
     than derived per caller: an empty list that says nothing is how the
     unscoped one hid for so long. "None here, four elsewhere" has a next step
     in it — switch in the bar.
  */
  const scoped = scopeRuns(FOUR, 'parabank');

  expect(scoped.runs).toEqual([]);
  expect(scoped.elsewhere).toBe(4);
});

test('a framework run belongs to no application, and needs no special case', () => {
  /*
     `target: "default"` is what `npm run verify` writes — the framework's own
     tests, scoped to nothing (confirmed on disk: "target": "default",
     "environment": "local"). It matches no application name, so it falls out
     of the same rule rather than being written down anywhere.
  */
  for (const target of ['toolshop', 'parabank', 'saucedemo']) {
    expect(scopeRuns(FOUR, target).runs.some((one) => one.target === 'default')).toBe(false);
  }
});

test('a command-line run of a real application still appears under it', () => {
  // The recovery path that mattered: run the suite from a terminal, then find
  // it on the dashboard to triage or publish.
  const withCli = [...FOUR, run('local-abc', 'parabank')];

  expect(scopeRuns(withCli, 'parabank').runs.map((one) => one.id)).toEqual(['local-abc']);
});

test('nothing selected means no scope, rather than nothing at all', () => {
  // The same answer collectCoverage already gives an absent target: the bar is
  // not claiming anything, so neither is the list. Returning [] here would
  // make a fresh dashboard look like it had lost every run.
  for (const nothing of ['', '   ', null, undefined]) {
    const scoped = scopeRuns(FOUR, nothing);
    expect(scoped.runs).toHaveLength(4);
    expect(scoped.elsewhere).toBe(0);
  }
});

test('the input is not mutated, and the copy is a real one', () => {
  const scoped = scopeRuns(FOUR, '');
  scoped.runs.push(run('injected', 'toolshop'));

  expect(FOUR).toHaveLength(4);
});
