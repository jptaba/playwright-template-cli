#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget } from '../config/target';
import { loadCases, recordGeneratedSpec } from '../src/support/cases/store';
import { gateCase } from '../src/support/cases/gate';
import { vocabularyFor } from '../src/support/cases/vocabulary';
import {
  authorSpec,
  type SpecAuthorModel,
  type SpecDraft,
  type SpecRequest,
} from '../src/support/cases/spec-author';
import { CliSpecAuthor } from '../src/integrations/llm/cli-spec-author';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run spec:author -- <CASE-ID>` — the third traceability hop.
 *
 * Reads a managed case, drafts the spec that automates it against the closed
 * vocabulary of that application's pack, verifies the draft, and prints it.
 * **Writes nothing without `--write`**, and refuses to write at all while a
 * blocker stands: `cases:author` publishes nothing for the same reason, and a
 * generated spec is code, which makes review more important rather than less.
 *
 * The model never sees the running application — see `spec-author.ts` for why
 * that is the whole design rather than a limitation.
 */

/**
 * The model, for now, is a draft on disk.
 *
 * Slice one proves the mechanism — the vocabulary check, the verbatim citation
 * check, the assertion-gap check and the rendering — which is the part that
 * makes a generated spec trustworthy. `AnthropicSpecAuthor` implements this
 * same interface with a schema-constrained completion and changes nothing else,
 * exactly as `AnthropicCaseAuthor` does for the case side.
 */
class JsonDraftAuthor implements SpecAuthorModel {
  readonly identity: string;

  constructor(private readonly file: string) {
    this.identity = `draft:${path.basename(file)}`;
  }

  async draft(_request: SpecRequest): Promise<SpecDraft> {
    return JSON.parse(fs.readFileSync(this.file, 'utf8')) as SpecDraft;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const reference = args.find((arg) => !arg.startsWith('-'));
  const draftFile = args.find((arg) => arg.startsWith('--draft='))?.split('=')[1];
  const useCli = args.includes('--model=cli');
  const write = args.includes('--write');

  if (!reference || (!draftFile && !useCli)) {
    console.error(
      'Usage: npm run spec:author -- <CASE-ID> (--draft=<file.json> | --model=cli) [--target=] [--write]',
    );
    console.error(
      '\n--draft= takes a reply from any agent. Get the prompt with: npm run spec:request',
    );
    console.error('--model=cli drives an agent CLI you already have (SPEC_AUTHOR_CLI to choose it).');
    return 2;
  }

  const targetArg = args.find((arg) => arg.startsWith('--target='))?.split('=')[1];
  const target = targetArg ?? resolveTarget().name;

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
     The specificity gate first, and it is not a formality. §10's whole premise
     is that "automatically create scripts just by looking at test cases" holds
     only for cases that are actually specific — a case reading "verify the
     report is correct" cannot be automated by a human either, and asking a
     model to try is how a plausible, unfounded spec gets written.
  */
  const gate = gateCase(stored.case);
  if (!gate.passed) {
    console.error(`\nThe case does not pass the specificity gate (score ${gate.score}):`);
    for (const finding of gate.findings) {
      console.error(`  [${finding.severity}] ${finding.check}: ${finding.detail}`);
      console.error(`      → ${finding.remedy}`);
    }
    console.error('\nFix the case before generating a spec from it.');
    return 1;
  }

  const vocabulary = vocabularyFor(target);
  const model: SpecAuthorModel = useCli ? new CliSpecAuthor() : new JsonDraftAuthor(draftFile!);
  console.log(
    `Authoring a spec for ${stored.case.id ?? stored.case.source.key} against '${target}' ` +
      `using ${model.identity}\n` +
      `  vocabulary: ${vocabulary.verbs.length} verbs, ${vocabulary.fixtures.length} fixtures`,
  );

  const result = await authorSpec(stored.case, model, vocabulary, stored.file, {
    typecheck: true,
  });

  if (result.refusal) {
    console.log('\nNo spec was written — the pack cannot express this case.\n');
    for (const missing of result.refusal.missing) {
      console.log(`  missing verb: ${missing.verb}`);
      console.log(`      wanted:   ${missing.wanted}`);
    }
    console.log(
      '\nThat is the finding, not a failure. A missing verb is a design question:\n' +
        'add the action deliberately, once, then run this again.',
    );
    return 0;
  }

  for (const finding of result.findings) {
    console.log(`  [${finding.severity}] ${finding.check}: ${finding.detail}`);
    console.log(`      → ${finding.remedy}`);
  }

  const destination = result.specPath ?? '(no path)';
  console.log(`\n--- ${destination} ---\n`);
  console.log(result.source);

  if (!result.publishable) {
    console.error('Blocked: the draft did not verify. Nothing was written.');
    return 1;
  }

  console.log(
    `Verified: every verb is in the catalog, every citation is verbatim, ` +
      `and all ${stored.case.assertions.length} case assertion(s) are proved.`,
  );

  if (write) {
    const full = path.join(REPO_ROOT, destination);
    if (fs.existsSync(full)) {
      console.error(`\n${destination} already exists. Nothing is ever overwritten.`);
      return 1;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, result.source ?? '', 'utf8');

    /*
       And record it in the case, which is the half that closes hop 2.
       `check-hashes` only asks whether the spec still implements this version
       of the case `if (testCase.specPath)` — so writing the spec without
       writing this back leaves the drift check with nothing to compare and
       passing on a spec that has fallen behind.
    */
    recordGeneratedSpec(stored.file, stored.case, destination);

    console.log(`\nWritten: ${destination}`);
    console.log(`Recorded specPath and caseHash in ${path.relative(REPO_ROOT, stored.file)}`);
    console.log('Now run: npm run lint && npx tsc --noEmit');
  } else {
    console.log('\nNot written. Pass --write to put it on disk.');
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
