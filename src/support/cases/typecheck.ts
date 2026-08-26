import path from 'node:path';
import { Project, type SourceFile } from 'ts-morph';
import { REPO_ROOT } from '../paths';
import type { SpecFinding } from './spec-author';

/**
 * Typecheck a rendered spec before anybody calls it verified.
 *
 * **The authority was never actually consulted.** Every design note here says
 * `tsc` is what makes free TypeScript safe — an invented verb or a wrong
 * argument cannot compile — and the pipeline printed "Verified" and wrote the
 * file without once running it. The gap stayed invisible for as long as the
 * drafts were hand-written, because a person writing a draft reads the real
 * signatures while doing it.
 *
 * The first draft a real model produced had **six type errors**: `users.add`
 * called without `role` or `status`, `.error` where the result carries
 * `errors`, and `.count` where it carries `total`. Every one of them is exactly
 * what the catalog's signatures were supposed to prevent, every one survived
 * the vocabulary check — because the *verb* existed and only its use was
 * wrong — and the file was written to disk with a message advising the caller
 * to run `tsc` afterwards.
 *
 * So this closes the loop the rest of the design already assumed was closed.
 * Held in memory rather than written first: a spec that does not compile should
 * never reach the pack at all, and writing it to find out is how a broken file
 * gets left behind when something later throws.
 */

/** Diagnostics severe enough to refuse a draft over. */
const ERROR_CATEGORY = 1; // ts.DiagnosticCategory.Error — compared by value to keep TS out of the import graph.

export interface TypecheckOptions {
  /**
   * Reuse a project across calls. Loading the whole tsconfig costs seconds, and
   * a repair loop typechecks once per attempt.
   */
  project?: Project;
}

let shared: Project | null = null;

/** One project per process, built on first use. */
export function specProject(): Project {
  shared ??= new Project({
    tsConfigFilePath: path.join(REPO_ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });
  return shared;
}

/**
 * @param specPath repo-relative, e.g. `targets/x/tests/e2e/y.spec.ts`
 * @param source   the rendered file
 */
export function typecheckSpec(
  specPath: string,
  source: string,
  options: TypecheckOptions = {},
): SpecFinding[] {
  const project = options.project ?? specProject();
  const absolute = path.join(REPO_ROOT, specPath);

  /*
     Overwrite rather than add: a repair loop typechecks the same path several
     times, and a second `createSourceFile` for a path already in the project
     throws rather than replacing.
  */
  let file: SourceFile;
  try {
    file = project.createSourceFile(absolute, source, { overwrite: true });
  } catch (error) {
    return [
      {
        check: 'typecheck-failed',
        severity: 'blocker',
        detail: `the rendered spec could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        remedy: 'the draft produced source TypeScript cannot read — report it rather than editing it',
      },
    ];
  }

  try {
    const findings: SpecFinding[] = [];
    for (const diagnostic of file.getPreEmitDiagnostics()) {
      if (diagnostic.getCategory() !== ERROR_CATEGORY) continue;

      const line = diagnostic.getLineNumber();
      const message = diagnostic.getMessageText();

      findings.push({
        check: 'typecheck',
        severity: 'blocker',
        detail:
          `${specPath}${line ? `:${line}` : ''} — ` +
          (typeof message === 'string' ? message : message.getMessageText()),
        /*
           The remedy names the catalog rather than the file, because this is
           nearly always a verb used with the wrong shape: the signature is
           published and the draft did not follow it.
        */
        remedy:
          'use the verb with the signature the catalog publishes — a type error here is the ' +
          'draft guessing at arguments, not the pack being wrong',
      });
    }
    return findings;
  } finally {
    /*
       Take it back out. The project is shared across calls, and a rendered spec
       left in it would be typechecked as part of the *next* file's programme —
       so a draft that was refused would go on causing errors attributed to
       whatever came after it.
    */
    project.removeSourceFile(file);
  }
}
