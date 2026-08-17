import { expect, test } from '@playwright/test';
import { onboardingPageContent } from '../../src/support/onboarding/dashboard-page';
import { usersPageContent } from '../../src/support/ui/users-page';
import { runsPageContent } from '../../src/support/ui/runs-page';
import { casesPageContent } from '../../src/support/ui/cases-page';
import { storiesPageContent } from '../../src/support/ui/stories-page';
import { triagePageContent } from '../../src/support/ui/triage-page';
import { publishPageContent } from '../../src/support/ui/publish-page';
import type { DashboardPageContent } from '../../src/support/ui/shell';

/**
 * How much a page is allowed to say before it says what to do.
 *
 * Every screen here had grown an essay. Onboarding's step 2 opened with a
 * 108-word paragraph above the three fields it was describing; step 4 had 106.
 * The prose is *good* — it is why a rule exists, and somebody meeting a refusal
 * wants it — and it was in the way of the thing they came to do.
 *
 * So the shape is fixed rather than requested: an instruction is one short
 * line, and the reasoning goes behind a disclosure that costs one line closed.
 * A budget in a test rather than a note in a review, because "this is getting
 * wordy" is exactly the kind of judgement nobody makes on a Friday, and the
 * copy grew a paragraph at a time with every commit being individually
 * reasonable.
 */

const PAGES: Record<string, DashboardPageContent> = {
  onboard: onboardingPageContent(),
  users: usersPageContent(),
  stories: storiesPageContent(),
  cases: casesPageContent(),
  runs: runsPageContent(),
  triage: triagePageContent(),
  publish: publishPageContent(),
};

const words = (html: string): string[] =>
  html
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Visible instruction text — what is on screen before anything is opened.
 *
 * A block carrying `hidden` is not on screen and never was: onboarding's
 * browser-assisted sign-in explains itself in one, and it is shown by pressing
 * a button, which puts it in the same category as a disclosure rather than in
 * the budget. Counting it charged the page 25 words nobody reads.
 */
const explainBlocks = (page: DashboardPageContent): string[] =>
  [...page.body.matchAll(/<p class="explain"([^>]*)>([\s\S]*?)<\/p>/g)]
    .filter((match) => !/\bhidden\b/.test(match[1]!))
    .map((match) => match[2]!);

/**
 * The overview panel's lists: what the journey needs, before any of it is on
 * screen.
 *
 * Budgeted with the prose rather than beside it. Onboarding shows one step at a
 * time now, and this panel is what makes that safe — which makes it exactly the
 * place a page grows its essay back under a tag the budget does not read.
 */
const overviewLists = (page: DashboardPageContent): string =>
  /<div class="preflight">([\s\S]*?)<\/div>\s*<\/section>/.exec(page.body)?.[1] ?? '';

/** The prose behind a disclosure. Unbudgeted on purpose — it is opt-in. */
const disclosures = (page: DashboardPageContent): string[] =>
  [...page.body.matchAll(/<details class="more"[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1]!);

/** The first sentence, normalised, for comparing a lede against a paragraph. */
const firstSentence = (html: string): string =>
  words(html)
    .join(' ')
    .split(/(?<=\.)\s/)[0]!
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

test.describe('the lede', () => {
  test('says what the page is for in a sentence, not a paragraph', () => {
    for (const [name, page] of Object.entries(PAGES)) {
      expect(words(page.lede).length, `${name}: the lede is a paragraph`).toBeLessThanOrEqual(32);
    }
  });

  test('is not repeated by the first thing under it', () => {
    /*
       Three pages opened by saying the same thing twice — Runs led with "Two
       runs at a time, both on screen" and then its first section began "Two at
       a time, and both are on screen". Read aloud, that is a page that does
       not trust you.
    */
    for (const [name, page] of Object.entries(PAGES)) {
      const [first] = explainBlocks(page);
      if (!first) continue;
      expect(firstSentence(first), `${name}: the first block repeats the lede`).not.toBe(
        firstSentence(page.lede),
      );
    }
  });
});

test.describe('the instructions on screen', () => {
  test('no block of copy is longer than a reader will take standing up', () => {
    for (const [name, page] of Object.entries(PAGES)) {
      for (const [index, block] of explainBlocks(page).entries()) {
        expect(
          words(block).length,
          `${name} block ${index + 1}: ${words(block).slice(0, 12).join(' ')}…`,
        ).toBeLessThanOrEqual(34);
      }
    }
  });

  test('a whole page is readable without opening anything', () => {
    // The number that matters: everything visible before a single disclosure
    // is expanded. Onboarding was at 891.
    for (const [name, page] of Object.entries(PAGES)) {
      const visible = explainBlocks(page).reduce((total, block) => total + words(block).length, 0);
      const overview = words(overviewLists(page)).length;
      expect(
        words(page.lede).length + visible + overview,
        `${name} is a wall of text`,
      ).toBeLessThanOrEqual(220);
    }
  });
});

test.describe('the reasoning', () => {
  test('is kept, not deleted — it just moved behind a disclosure', () => {
    /*
       The point of this exercise was never to have less to say. Every one of
       these pages explains a rule somebody will otherwise argue with, and the
       explanation is what stops the argument. It is opt-in now.
    */
    const withDisclosures = Object.entries(PAGES).filter(
      ([, page]) => disclosures(page).length > 0,
    );
    expect(withDisclosures.length, 'the prose was cut rather than moved').toBeGreaterThanOrEqual(5);
  });

  test('every disclosure says what it will show before it is opened', () => {
    // "More" and "Details" are not summaries. The point of a summary is
    // deciding whether to open it.
    for (const [name, page] of Object.entries(PAGES)) {
      for (const block of disclosures(page)) {
        const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(block)?.[1] ?? '';
        const text = words(summary).join(' ');
        expect(text.length, `${name}: a disclosure with no summary`).toBeGreaterThan(0);
        expect(text.toLowerCase(), `${name}: "${text}" says nothing`).not.toMatch(
          /^(more|details|info|information|help|read more|learn more)$/,
        );
        expect(words(summary).length, `${name}: the summary is itself a paragraph`).toBeLessThanOrEqual(9);
      }
    }
  });
});

test('every page still names itself and says what it is for', () => {
  // A budget that produced a page saying nothing would be a worse page.
  for (const [name, page] of Object.entries(PAGES)) {
    expect(page.heading.length, `${name} has no heading`).toBeGreaterThan(3);
    expect(words(page.lede).length, `${name} has no lede`).toBeGreaterThanOrEqual(6);
    expect(page.eyebrow.length, `${name} has no eyebrow`).toBeGreaterThan(2);
  }
});
