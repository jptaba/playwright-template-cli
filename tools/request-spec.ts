#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget } from '../config/target';
import { loadCases } from '../src/support/cases/store';
import { gateCase } from '../src/support/cases/gate';
import { vocabularyEntries } from '../src/support/cases/vocabulary';
import { buildSpecRequest, renderSpecRequest } from '../src/support/cases/spec-prompt';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run spec:request -- <CASE-ID> [--out=<file>]`
 *
 * Writes everything a spec author needs into one file: the case, the closed
 * vocabulary with signatures, the IR schema, and the rules. Hand it to whatever
 * agent you have — Claude Code, Copilot, a chat window, a colleague — and feed
 * the JSON that comes back to:
 *
 *     npm run spec:author -- <CASE-ID> --draft=<their-reply.json>
 *
 * **This is the path with no vendor and no API account in it.** It is not a
 * lesser option: `spec:author` verifies a draft identically however it arrived,
 * so the only thing an automated adapter buys is not copying two files by hand.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const reference = args.find((arg) => !arg.startsWith('-'));
  if (!reference) {
    console.error('Usage: npm run spec:request -- <CASE-ID> [--target=<name>] [--out=<file>]');
    return 2;
  }

  const target = args.find((arg) => arg.startsWith('--target='))?.split('=')[1] ?? resolveTarget().name;
  const stored = loadCases(target).find(
    (entry) =>
      entry.case.id === reference ||
      entry.case.source.key === reference ||
      path.basename(entry.file, path.extname(entry.file)) === reference,
  );
  if (!stored) {
    console.error(`No case matching '${reference}' for target '${target}'.`);
    return 2;
  }

  /*
     The specificity gate first, exactly as `spec:author` does. §10: "automatically
     create scripts just by looking at test cases" holds only for cases that are
     actually specific, and handing a vague one to a model — or a person — just
     moves the guessing somewhere less visible.
  */
  const gate = gateCase(stored.case);
  if (!gate.passed) {
    console.error(`The case does not pass the specificity gate (score ${gate.score}):`);
    for (const finding of gate.findings) {
      console.error(`  [${finding.severity}] ${finding.check}: ${finding.detail}`);
      console.error(`      → ${finding.remedy}`);
    }
    return 1;
  }

  const entries = vocabularyEntries(target);
  const prompt = renderSpecRequest(buildSpecRequest(stored.case, entries, target));

  const out = args.find((arg) => arg.startsWith('--out='))?.split('=')[1];
  if (out) {
    const full = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, prompt, 'utf8');
    console.log(`Wrote the request for ${stored.case.id ?? stored.case.source.key} to ${out}`);
    console.log(`  ${entries.verbs.length} verbs, ${entries.fixtures.length} fixtures`);
    console.log('\nHand it to any agent, then:');
    console.log(`  npm run spec:author -- ${reference} --target=${target} --draft=<reply.json>`);
    return 0;
  }

  process.stdout.write(prompt);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
