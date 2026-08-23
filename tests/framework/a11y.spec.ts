import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  createScanner,
  criteriaOf,
  describe,
  describeUndecided,
  findingsFingerprint,
  summarise,
  tagsForStandard,
  UnknownStandardError,
  type RawAxeResult,
} from '../../src/integrations/a11y/scanner';
import { settleSource } from '../../src/integrations/a11y/settle';

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
    /*
       A real finding, not a placeholder number. This fixture used to hold
       `[1]`, which described something axe never produces — and it is exactly
       why nobody noticed that `summarise` was reading `.length` and discarding
       the rule id, the description and the nodes for every check axe could
       not decide.
    */
    incomplete: [incomplete('color-contrast')],
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

/** An undecided check, which axe reports in the same shape as a violation. */
function incomplete(id: string, nodes = 1): RawAxeResult['incomplete'][number] {
  return violation(id, 'serious', ['wcag2aa', 'wcag143'], nodes);
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
      raw({ passes: [1, 2, 3, 4], incomplete: [incomplete('color-contrast'), incomplete('aria-hidden-focus')] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );
    expect(scan.passes).toBe(4);
    expect(scan.incomplete).toBe(2);
  });

  test('an undecided check says which rule it was, not just that there was one', () => {
    /*
       The count on its own was a dead end. The conventions forbid loosening
       the assertion, so a target with one indeterminate check had a failing
       spec reading `Expected: 0, Received: 1` and no way to find out what to
       look at — which is where ParaBank's accessibility spec was parked.
    */
    const scan = summarise(
      raw({ incomplete: [incomplete('color-contrast', 2)] }),
      { standard: 'wcag22aa' },
      tagsForStandard('wcag22aa'),
    );

    expect(scan.incomplete, 'the count is kept').toBe(1);
    expect(scan.undecided).toHaveLength(1);
    expect(scan.undecided[0]?.id).toBe('color-contrast');
    expect(scan.undecided[0]?.nodes.map((node) => node.target)).toEqual(['#node-0', '#node-1']);
    expect(describeUndecided(scan)).toContain('color-contrast');
    expect(describeUndecided(scan)).toContain('#node-0');
  });

  test('a waiver does not silence an undecided check, because nobody decided it', () => {
    /*
       Deliberate asymmetry with violations. A waiver accepts a known failure;
       an undecided check is not known to be anything yet, so waiving one
       would be accepting an answer nobody has.
    */
    const scan = summarise(
      raw({ incomplete: [incomplete('color-contrast')] }),
      {
        standard: 'wcag22aa',
        waived: [{ rule: 'color-contrast', reason: 'brand palette', reviewBy: '2026-12-01' }],
      },
      tagsForStandard('wcag22aa'),
    );

    expect(scan.undecided).toHaveLength(1);
    expect(scan.waived, 'nothing was suppressed, because nothing failed').toEqual([]);
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

test.describe('waiting for the page to stop changing', () => {
  /*
     The accessibility suite was reporting false passes, and had been since it
     was written. `scan()` ran axe the instant it was called; on a single-page
     application the document `load`s long before the application renders, so
     axe inspected a shell and called it clean.

     Measured on a real dashboard, four attempts out of four: one waived
     violation immediately after `goto`, against `button-name` x4,
     `color-contrast` x11, `list` x1 and `scrollable-region-focusable` x1 once
     the tree went quiet. Seventeen real violations, four of them critical, on
     a page the suite had been reporting green — which is worse than having no
     accessibility suite at all, because a green one is evidence to whoever
     reads the report.
  */
  test('the scan waits before it looks, and says that it did', async () => {
    const order: string[] = [];
    const scanner = createScanner(
      { standard: 'wcag22aa' },
      async () => {
        order.push('scanned');
        return raw();
      },
      async () => {
        order.push('settled');
        return true;
      },
    );

    const scan = await scanner.scan({} as Page);

    /*
       Every scan is preceded by a settle — asserted as the invariant rather
       than as one pair, because item 64 made the normal case two scans and
       this test was relying on the old count rather than stating what it
       cared about. A page that agrees with itself is still confirmed twice.
    */
    expect(order.length % 2).toBe(0);
    expect(order.filter((_, index) => index % 2 === 0).every((step) => step === 'settled')).toBe(
      true,
    );
    expect(order.filter((_, index) => index % 2 === 1).every((step) => step === 'scanned')).toBe(
      true,
    );
    expect(scan.settled).toBe(true);
  });

  test('a page that never goes quiet is still scanned, and the caveat is carried', async () => {
    /*
       A clock, a carousel or a polling widget mutates forever. Refusing to
       scan those would be worse than scanning them late — so the scan happens
       and `settled: false` tells the reader which kind of result they have.
    */
    const scanner = createScanner(
      { standard: 'wcag22aa' },
      async () => raw({ violations: [violation('label', 'critical')] }),
      async () => false,
    );

    const scan = await scanner.scan({} as Page);

    expect(scan.settled).toBe(false);
    expect(scan.violations).toHaveLength(1);
  });

  test('the quiet period and deadline reach the settler', async () => {
    let saw: unknown = null;
    const scanner = createScanner(
      { standard: 'wcag22aa' },
      async () => raw(),
      async (_page, options) => {
        saw = options;
        return true;
      },
    );

    await scanner.scan({} as Page, { settle: { quietMs: 50, timeoutMs: 900 } });

    expect(saw).toEqual({ quietMs: 50, timeoutMs: 900 });
  });

  test('the observer is emitted as source, with its numbers as numbers', () => {
    /*
       `page.evaluate(fn)` is the obvious form and does not survive this
       repository's build: esbuild rewrites named inner functions with a
       `__name` helper that exists in Node and not in a browser, and the call
       dies with `ReferenceError: __name is not defined`. A string is
       evaluated as written — and because Playwright passes no arguments to
       the string form, the two numbers are interpolated, so they have to be
       numbers rather than whatever a caller handed over.
     */
    const source = settleSource(250, 4000);

    expect(source).toContain('MutationObserver');
    expect(source).toContain('setTimeout(done, 250)');
    expect(source).toContain('}, 4000)');
    expect(source).not.toContain('__name');

    const injected = settleSource('1); alert(1' as unknown as number, 10);
    expect(injected).not.toContain('alert');
    expect(injected).toContain('NaN');
  });
});

/**
 * Item 64 — a scan is a result when scanning again says the same thing.
 *
 * Run 79's settle removed the false pass where axe inspected an unrendered
 * shell. It did not remove all of it: the quiet period is wall-clock, and
 * wall-clock is a proxy for "the page has had enough opportunity to do more
 * work". Under full-suite contention one application's landing page was green
 * three times out of three run alone, and red under load with `[critical]
 * label` on three nodes — **with `settled: true`**, because by its own
 * definition it had settled.
 *
 * So the proxy is backed by the fact. Two consecutive scans have to agree.
 */
test.describe('confirming a scan by agreement', () => {
  test('two scans that agree cost two runs and report stable', async () => {
    let runs = 0;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () => {
      runs++;
      return raw({ violations: [violation('label', 'critical')] });
    });

    const scan = await scanner.scan({} as Page);

    // Two, not one: a single scan cannot know whether the page was moving.
    expect(runs).toBe(2);
    expect(scan.scans).toBe(2);
    expect(scan.stable).toBe(true);
    expect(scan.violations).toHaveLength(1);
  });

  test('a page still rendering is scanned again rather than believed', async () => {
    /*
       The starved-page case, in the shape it actually arrives in: the first
       scan sees a shell with few passing checks and no violations, and the
       page finishes between attempts. Believing the first answer is the false
       green this exists to remove.
    */
    const answers = [
      raw({ violations: [], passes: [1] }),
      raw({ violations: [violation('label', 'critical', ['wcag2a', 'wcag412'], 3)] }),
      raw({ violations: [violation('label', 'critical', ['wcag2a', 'wcag412'], 3)] }),
    ];
    let index = 0;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () => answers[index++]!);

    const scan = await scanner.scan({} as Page);

    expect(scan.scans).toBe(3);
    expect(scan.stable).toBe(true);
    // The findings reported are the settled ones, not the shell's.
    expect(scan.violations.map((entry) => entry.id)).toEqual(['label']);
    expect(scan.violations[0]?.nodes).toHaveLength(3);
  });

  test('a page that never agrees is still reported, and says it did not', async () => {
    /*
       Same reasoning as `settled: false`. Refusing to report would be worse
       than reporting late — but the caller is owed the caveat, because these
       findings describe a moving page and may be a subset of it.
    */
    let nodes = 1;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () =>
      raw({ violations: [violation('label', 'critical', ['wcag2a', 'wcag412'], nodes++)] }),
    );

    const scan = await scanner.scan({} as Page);

    expect(scan.stable).toBe(false);
    expect(scan.scans).toBe(3);
    expect(scan.violations).toHaveLength(1);
  });

  test('the last scan is reported, never the emptiest', async () => {
    // When the scans never agree, the most recent is the closest to a
    // finished page. Reporting the first would report the shell.
    const answers = [
      raw({ violations: [], passes: [1] }),
      raw({ violations: [violation('label', 'critical')], passes: [1, 2] }),
      raw({ violations: [violation('button-name', 'critical')], passes: [1, 2, 3] }),
    ];
    let index = 0;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () => answers[index++]!);

    const scan = await scanner.scan({} as Page);

    expect(scan.stable).toBe(false);
    expect(scan.violations.map((entry) => entry.id)).toEqual(['button-name']);
  });

  test('an unstable scan says so in the message, including when it found nothing', async () => {
    /*
       The caveat is in the string rather than only on the object, because a
       pack that does not assert `stable` still has to be told. "No
       violations" from a page that never held still is the most misleading
       thing this module can say.
    */
    let passes = 1;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () =>
      raw({ violations: [], incomplete: [], passes: Array.from({ length: passes++ }) }),
    );

    const scan = await scanner.scan({} as Page);

    expect(scan.stable).toBe(false);
    expect(describe(scan)).toContain('UNSTABLE');
    expect(describe(scan)).toContain('no wcag22aa violations');
  });

  test('maxScans never drops below two, whatever it is asked for', async () => {
    // One scan is the thing this item removed. A caller cannot ask for it
    // back by passing 1, or 0, or a negative.
    let runs = 0;
    const scanner = createScanner({ standard: 'wcag22aa' }, async () => {
      runs++;
      return raw();
    });

    await scanner.scan({} as Page, { maxScans: 1 });

    expect(runs).toBe(2);
  });

  test('the settle runs before every scan, not only the first', async () => {
    // A second scan of a page that moved has to give it the same chance to
    // stop moving, or the confirmation is comparing against a worse look.
    const order: string[] = [];
    let nodes = 1;
    const scanner = createScanner(
      { standard: 'wcag22aa' },
      async () => {
        order.push('scan');
        return raw({ violations: [violation('label', 'critical', ['wcag2a'], nodes++)] });
      },
      async () => {
        order.push('settle');
        return true;
      },
    );

    await scanner.scan({} as Page);

    expect(order).toEqual(['settle', 'scan', 'settle', 'scan', 'settle', 'scan']);
  });
});

test.describe('what counts as two scans agreeing', () => {
  test('the passing-check count is part of it, because a shell has fewer', () => {
    /*
       The most sensitive part of the fingerprint. A half-rendered page can
       easily report a subset of violations that looks identical twice, while
       the number of checks that passed moves early and moves a lot.
    */
    expect(findingsFingerprint(raw({ passes: [1, 2] }))).not.toBe(
      findingsFingerprint(raw({ passes: [1, 2, 3] })),
    );
  });

  test('node targets rather than node counts', () => {
    // An element replaced by a different one is a page still changing, even
    // when the tally has not moved.
    const before = raw({ violations: [violation('label', 'critical')] });
    const after = raw({ violations: [violation('label', 'critical')] });
    after.violations[0]!.nodes[0]!.target = ['#somewhere-else'];

    expect(findingsFingerprint(before)).not.toBe(findingsFingerprint(after));
  });

  test('the same findings in a different order still agree', () => {
    // Axe is not required to report in a stable order, and treating a
    // reshuffle as movement would make every scan unstable.
    const one = raw({
      violations: [violation('label', 'critical'), violation('button-name', 'serious')],
    });
    const other = raw({
      violations: [violation('button-name', 'serious'), violation('label', 'critical')],
    });

    expect(findingsFingerprint(one)).toBe(findingsFingerprint(other));
  });

  test('an undecided check moving counts as movement', () => {
    // `incomplete` is asserted on by the scaffolded spec, so a scan whose
    // undecided checks are still arriving is not a result either.
    expect(findingsFingerprint(raw({ incomplete: [incomplete('color-contrast')] }))).not.toBe(
      findingsFingerprint(raw({ incomplete: [incomplete('color-contrast', 4)] })),
    );
  });

  test('it reads the raw result, so a waiver cannot mask movement', async () => {
    /*
       Fingerprinting the summarised scan would let an accepted exception hide
       the very movement this looks for: a page whose only changing finding
       happened to be waived would read as stable while it was still
       rendering. Waivers are applied after the confirmation, never before.
    */
    let nodes = 1;
    const scanner = createScanner(
      {
        standard: 'wcag22aa',
        waived: [{ rule: 'label', reason: 'known', reviewBy: '2099-01-01' }],
      },
      async () => raw({ violations: [violation('label', 'critical', ['wcag2a'], nodes++)] }),
    );

    const scan = await scanner.scan({} as Page);

    expect(scan.stable).toBe(false);
    expect(scan.violations).toEqual([]);
    expect(scan.waived.length).toBeGreaterThan(0);
  });
});
