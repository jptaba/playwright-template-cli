import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  createScanner,
  criteriaOf,
  describe,
  summarise,
  tagsForStandard,
  UnknownStandardError,
  type RawAxeResult,
} from '../../src/integrations/a11y/scanner';

/**
 * The accessibility engine belongs to the framework for the same reason Ajv
 * does: WCAG rules are identical for every application, and only the standard
 * being claimed differs. What is tested here is everything that decides *what
 * gets checked* and *what a result means* — no browser, no application, no
 * network, exactly like every other adapter in this suite.
 */

function raw(overrides: Partial<RawAxeResult> = {}): RawAxeResult {
  return {
    url: 'https://app.internal.corp/orders',
    violations: [],
    passes: [1, 2, 3],
    incomplete: [1],
    ...overrides,
  };
}

function violation(
  id: string,
  impact: string | null,
  tags: string[] = ['wcag2aa', 'wcag143'],
  nodes = 1,
): RawAxeResult['violations'][number] {
  return {
    id,
    impact,
    help: `${id} help text`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.13/${id}`,
    tags,
    nodes: Array.from({ length: nodes }, (_, i) => ({
      target: [`#node-${i}`],
      html: `<div id="node-${i}"></div>`,
      failureSummary: 'Fix any of the following: ...',
    })),
  };
}

test.describe('which rules a declared standard means', () => {
  test('WCAG conformance is cumulative, and the tags say so', () => {
    // "We test WCAG 2.2 AA" means every A and AA criterion from 2.0 and 2.1
    // as well. Mapping it to the 2.2 tag alone would test the handful of
    // criteria 2.2 added and quietly skip the rest.
    expect(tagsForStandard('wcag22aa')).toEqual([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22aa',
    ]);
    expect(tagsForStandard('wcag21aa')).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    expect(tagsForStandard('wcag2a')).toEqual(['wcag2a']);
  });

  test('the European and US standards map to their own tag sets', () => {
    expect(tagsForStandard('en301549')).toEqual(['EN-301-549']);
    expect(tagsForStandard('section508')).toEqual(['section508']);
  });

  test('a standard nobody has mapped refuses loudly rather than scanning nothing', () => {
    // The profile may name any standard — that is deliberate. But a scan has
    // to know which rules it means, and silently running zero rules would
    // report a clean sweep.
    expect(() => tagsForStandard('wcag30aaa')).toThrow(UnknownStandardError);
    expect(() => tagsForStandard('wcag30aaa')).toThrow(/add the mapping/);
  });

  test('every tag it emits is one axe actually defines', async () => {
    // A typo here would silently narrow the scan, which is the failure mode
    // this whole layer exists to prevent.
    type AxeModule = { getRules(): { tags: string[] }[] };
    // axe-core is CommonJS, so the namespace object wraps it in `default`.
    const imported = (await import('axe-core')) as unknown as AxeModule & { default?: AxeModule };
    const axe = typeof imported.getRules === 'function' ? imported : imported.default;
    const known = new Set((axe?.getRules() ?? []).flatMap((rule) => rule.tags));
    expect(known.size, 'axe-core exposed no rules to check against').toBeGreaterThan(50);
    for (const standard of ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'en301549', 'section508']) {
      for (const tag of tagsForStandard(standard)) {
        expect(known.has(tag), `${standard} → ${tag}`).toBe(true);
      }
    }
  });
});

test.describe('what a result means', () => {
  test('a violation carries the criteria it breaks, not just a rule name', () => {
    // "color-contrast failed" is a developer's sentence. "1.4.3 failed" is the
    // one that maps to the standard somebody signed up to.
    const scan = summarise(
      raw({ violations: [violation('color-contrast', 'serious', ['wcag2aa', 'wcag143'])] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.violations[0]?.criteria).toEqual(['1.4.3']);
    expect(criteriaOf(['wcag2a', 'wcag412', 'wcag1412'])).toEqual(['1.4.1.2', '4.1.2']);
  });

  test('the worst thing is first, because a long list gets skimmed', () => {
    const scan = summarise(
      raw({
        violations: [
          violation('minor-thing', 'minor'),
          violation('critical-thing', 'critical'),
          violation('moderate-thing', 'moderate'),
        ],
      }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.violations.map((v) => v.id)).toEqual([
      'critical-thing',
      'moderate-thing',
      'minor-thing',
    ]);
  });

  test('a waived rule leaves the failures and is still counted', () => {
    // An exception accepted for three nodes should be visible the day it is
    // failing on ninety. Dropping it entirely is how a waiver grows unnoticed.
    const scan = summarise(
      raw({ violations: [violation('color-contrast', 'serious', ['wcag2aa'], 90)] }),
      {
        standard: 'wcag22aa',
        waived: [
          { rule: 'color-contrast', reason: 'brand palette review', reviewBy: '2026-12-01' },
        ],
      },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.violations).toEqual([]);
    expect(scan.waived).toEqual([
      { rule: 'color-contrast', reason: 'brand palette review', reviewBy: '2026-12-01', nodes: 90 },
    ]);
  });

  test('checks axe could not decide are reported, never counted as passes', () => {
    const scan = summarise(
      raw({ passes: [1, 2, 3, 4], incomplete: [1, 2] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.passes).toBe(4);
    expect(scan.incomplete).toBe(2);
  });

  test('an unrecognised impact becomes null rather than a made-up level', () => {
    const scan = summarise(
      raw({ violations: [violation('odd', 'catastrophic')] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.violations[0]?.impact).toBeNull();
  });

  test('the failure message names the rule, the nodes and where to read about it', () => {
    const scan = summarise(
      raw({ violations: [violation('label', 'critical', ['wcag2a', 'wcag412'], 5)] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    const message = describe(scan);
    expect(message).toContain('label');
    expect(message).toContain('5 node(s)');
    expect(message).toContain('+2 more');
    expect(message).toContain('dequeuniversity.com');

    expect(describe(summarise(raw(), { standard: 'wcag22aa' }, ['wcag2a']))).toContain(
      'no wcag22aa violations',
    );
  });
});

test.describe('the scanner', () => {
  test('passes the resolved tags to the runner and returns data, not a verdict', async () => {
    // Asserting inside the scanner would decide for every product whether
    // "no critical violations" or "none at all" is the bar. That is the
    // spec's call, so this layer returns findings and stops.
    let sawTags: string[] = [];
    const scanner = createScanner({ standard: 'wcag21aa' }, async (_page, tags) => {
      sawTags = tags;
      return raw({ violations: [violation('label', 'critical')] });
    });

    const scan = await scanner.scan({} as Page);
    expect(sawTags).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    expect(scan.violations).toHaveLength(1);
    expect(scan.standard).toBe('wcag21aa');
  });

  test('scope and per-call rule exclusions reach the runner', () => {
    let sawOptions: unknown = null;
    const scanner = createScanner({ standard: 'wcag22aa' }, async (_page, _tags, options) => {
      sawOptions = options;
      return raw();
    });
    return scanner
      .scan({} as Page, { include: '#dialog', disableRules: ['region'] })
      .then(() => {
        expect(sawOptions).toEqual({ include: '#dialog', disableRules: ['region'] });
      });
  });

  test('refuses to build against a standard it cannot turn into rules', () => {
    expect(() => createScanner({ standard: 'iso-9001' }, async () => raw())).toThrow(
      UnknownStandardError,
    );
  });
});
