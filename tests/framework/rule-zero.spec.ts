import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { repoPath } from '../../src/support/paths';

/**
 * Rule zero is load-bearing, so it is pinned rather than merely written down.
 *
 * "Every rule below is enforced by a lint rule, a type, or a failing test
 * wherever that is possible" — and a rule stating that troubleshooting fixes
 * belong in the framework cannot be checked by lint, because no static rule can
 * tell authoring new coverage from patching a pack to silence a failure. What
 * *can* be checked, cheaply, is that the rule still exists and still reaches
 * every surface an agent or a contributor actually reads.
 *
 * That matters because the failure mode is silence. This rule was added after
 * a run hand-fixed a locator in a target pack; if it were quietly dropped from
 * the conventions, nothing else in this suite would notice and the next run
 * would do exactly the same thing again.
 */

const read = (file: string): string => fs.readFileSync(repoPath(file), 'utf8');

/** The three files generated from the conventions, plus the source itself. */
const SURFACES = [
  'docs/CONVENTIONS.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
];

test.describe('rule zero — fix the framework, never the target pack', () => {
  for (const file of SURFACES) {
    test(`${file} states it, and states that it is not optional`, () => {
      const text = read(file);

      expect(text, 'the rule itself').toMatch(/fix the framework, never the (application's|target) pack/i);
      // The wording an agent needs to see: this is not a preference.
      expect(text, 'and that it is compulsory').toMatch(/non-negotiable/i);
      // The places a troubleshooting fix must not reach for, by their real
      // addresses — one directory per application since the packs moved.
      expect(text).toContain('targets/<app>/profile.ts');
      expect(text).toContain('targets/<app>/');
    });
  }

  test('the exception is stated too, or the rule becomes unusable', () => {
    /*
       Without it, "never touch a target pack" forbids writing specs, which is
       what a target pack is *for* — and a rule that is obviously wrong at the
       edges gets ignored in the middle.
    */
    const text = read('docs/CONVENTIONS.md');
    expect(text).toMatch(/exception is authoring \*?\*?new\*?\*? coverage/i);
  });

  test('the working agreement the improvement loop reads carries it as well', () => {
    // The loop reads backlog.md rather than the conventions when it starts, so
    // the rule has to be in both or it is missing from the one place it was
    // broken.
    const text = read('docs/agent/backlog.md');
    expect(text).toMatch(/Rule zero/i);
    expect(text).toMatch(/non-negotiable/i);
  });

  test('it is in the Never list, which is what people skim', () => {
    const text = read('docs/CONVENTIONS.md');
    const never = text.slice(text.indexOf('\n## Never'));
    expect(never.slice(0, 600)).toMatch(/target's own artifacts|targets\/<app>/);
  });
});
