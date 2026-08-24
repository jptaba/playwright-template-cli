#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget } from '../config/target';
import { AnthropicCaseAuthor } from '../src/integrations/llm/case-author-model';
import { authorCases, renderCoverage } from '../src/support/cases/author';
import { readStory, storyPath } from '../src/support/cases/stories';
import { gateCase } from '../src/support/cases/gate';
import { saveCase, slugify } from '../src/support/cases/store';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run cases:author -- FIN-2210` — steps A3 to A5 of §09.
 *
 * Drafts cases from a story, quarantines anything that cannot cite a criterion
 * verbatim, gates the rest for specificity, and writes them to `cases/` for
 * review as a diff. **It publishes nothing** — git is the staging area,
 * PractiTest is publication, and a human sits between them.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const key = args.find((arg) => !arg.startsWith('-'));
  if (!key) {
    console.error('Usage: npm run cases:author -- <STORY-KEY> [--target=<name>]');
    return 2;
  }

  const storyFile = storyPath(key);
  if (!fs.existsSync(storyFile)) {
    console.error(`No ${path.relative(REPO_ROOT, storyFile)}. Run: npm run story:pull -- ${key}`);
    return 2;
  }
  const story = readStory(key);

  const targetArg = args.find((arg) => arg.startsWith('--target='))?.split('=')[1];
  const target = targetArg ?? resolveTarget().name;

  const model = new AnthropicCaseAuthor();
  console.log(`Drafting cases for ${story.key} against target '${target}' using ${model.identity}…`);

  const result = await authorCases(story, model, target);

  // Specificity gate before anything is written: a case that cannot be
  // automated by a human either should not reach a reviewer as if it could.
  const publishable = [];
  const rejected = [];
  for (const testCase of result.accepted) {
    const gate = gateCase(testCase);
    if (gate.passed) publishable.push(testCase);
    else rejected.push({ testCase, gate });
  }

  console.log(
    `\n${result.accepted.length + result.speculative.length} drafted: ` +
      `${publishable.length} written, ${rejected.length} failed the quality gate, ` +
      `${result.speculative.length} quarantined as speculative.`,
  );

  for (const testCase of publishable) {
    const file = saveCase(testCase, `${story.key}-${slugify(testCase.title)}`);
    console.log(`  wrote ${path.relative(REPO_ROOT, file)}`);
  }

  for (const { testCase, gate } of rejected) {
    console.log(`\n  REJECTED  ${testCase.title} (score ${gate.score})`);
    for (const finding of gate.findings) console.log(`      · ${finding.detail} → ${finding.remedy}`);
  }

  for (const { case: testCase, reason } of result.speculative) {
    // Never published unexamined: some of these are genuinely valuable edge
    // cases, and a human decides which (§09).
    const file = saveCase(testCase, `speculative-${story.key}-${slugify(testCase.title)}`);
    console.log(`\n  SPECULATIVE  ${testCase.title}`);
    console.log(`      ${reason}`);
    console.log(`      ${path.relative(REPO_ROOT, file)}`);
  }

  console.log(renderCoverage(result.coverage));

  // The number nobody had estimated (§22).
  const cost = model.usage.estimatedCost;
  console.log(
    `\nTokens: ${model.usage.inputTokens} in, ${model.usage.outputTokens} out` +
      (cost === null ? '' : ` — about $${cost.toFixed(4)} at list price`),
  );

  console.log(
    '\nNothing has been published. Review the diff, then merge, then run ' +
      '`npm run cases:push -- --dry-run` before publishing to PractiTest (§09).',
  );

  return result.coverage.gaps.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
