import { spawnSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { buildRepairRequest, buildSpecRequest, renderSpecRequest } from '../../support/cases/spec-prompt';
import { vocabularyEntries } from '../../support/cases/vocabulary';
import type {
  SpecAuthorModel,
  SpecDraft,
  SpecRepairContext,
  SpecRequest,
} from '../../support/cases/spec-author';

/**
 * A spec author that drives an agent CLI already installed on this machine.
 *
 * **Why a CLI rather than the API.** `AnthropicCaseAuthor` calls the Anthropic
 * API, which bills a separate API account — not a Claude Pro subscription, and
 * not a Copilot one. An agent CLI is the surface those subscriptions actually
 * expose, so this reaches the model somebody already pays for instead of asking
 * them to pay twice.
 *
 * **Nothing here names a vendor.** The command is configuration: `claude` today,
 * a Copilot CLI or anything else that takes a prompt and prints a reply
 * tomorrow, with no change to this file. `SPEC_AUTHOR_CLI` overrides it, and
 * `resultPath` says where the reply hides in the JSON that comes back — the one
 * fact that genuinely differs between tools.
 *
 * **What it does not do is isolate the model**, and pretending otherwise would
 * be worse than not trying. Measured on `claude` 2.1.220: `--disallowed-tools`
 * was routed around via a shell-capable tool the deny list did not name, and an
 * empty `--allowed-tools` was ignored. A locally-run agent can read the machine
 * it runs on. So this runs it in an empty scratch directory — which removes the
 * convenience of looking, not the ability — and the real guarantee stays where
 * it has always been: every claim the reply makes is checked against the case
 * before anything is written. See `spec-prompt.ts`.
 */

export interface CliSpecAuthorOptions {
  /**
   * Executable plus fixed arguments. **The prompt goes in on stdin**, not as an
   * argument — a request carrying a whole vocabulary and a JSON schema runs to
   * about 14KB, and Windows refuses a command line past roughly 8KB with
   * "The command line is too long." Measured, not anticipated. stdin also side-
   * steps every quoting question, which is the other thing that would have
   * broken eventually and less clearly.
   */
  command?: string[];
  /**
   * Dotted path to the reply inside the JSON the CLI prints, e.g. `result`.
   * Empty means the CLI prints the reply directly with no envelope.
   */
  resultPath?: string;
  /** Milliseconds. Authoring a spec is one reply, not a conversation. */
  timeoutMs?: number;
  /** For tests: run this instead of spawning anything. */
  run?: (prompt: string) => { stdout: string; stderr: string; status: number | null };
}

/**
 * The default, and the `--model` on it is load-bearing rather than a
 * preference.
 *
 * Left unset, `claude -p` chose **Haiku**, and it produced a draft that did not
 * compile on three consecutive live runs of the full loop — inventing
 * `testData.newUser`, then `testData.systemUser`, then passing a `record()`
 * builder where a `NewUser` belongs. Every one was caught, so nothing broken
 * reached a pack; the cost was the whole attempt budget, every time.
 *
 * Authoring a spec is not a cheap-model task. It has to hold a case, a closed
 * vocabulary with signatures, a JSON schema and four invariants in mind at
 * once, and the failure mode of getting it slightly wrong is a draft that looks
 * right. `SPEC_AUTHOR_CLI` overrides the whole command for anyone who wants a
 * different one — or a different tool entirely.
 */
const DEFAULT_COMMAND = ['claude', '-p', '--output-format', 'json', '--model', 'sonnet'];

export class CliSpecAuthor implements SpecAuthorModel {
  readonly identity: string;
  private readonly command: string[];
  private readonly resultPath: string;
  private readonly timeoutMs: number;
  private readonly run?: CliSpecAuthorOptions['run'];

  constructor(options: CliSpecAuthorOptions = {}) {
    const configured = process.env.SPEC_AUTHOR_CLI?.trim();
    this.command = options.command ?? (configured ? configured.split(/\s+/) : DEFAULT_COMMAND);
    this.resultPath = options.resultPath ?? process.env.SPEC_AUTHOR_CLI_RESULT ?? 'result';
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.run = options.run;
    this.identity = `cli:${this.command[0]}`;
  }

  async draft(request: SpecRequest): Promise<SpecDraft> {
    const entries = vocabularyEntries(request.vocabulary.target);
    const prompt = renderSpecRequest(
      buildSpecRequest(request.case, entries, request.vocabulary.target),
    );

    const reply = this.invoke(prompt);
    return parseDraft(reply);
  }

  /**
   * Revise a draft that failed when run.
   *
   * The original request goes in again ahead of the failure, because a repair
   * still has to satisfy the case — a model shown only an error will happily
   * fix the error and lose an assertion doing it, and losing an assertion is
   * refused later at more cost than including a few thousand tokens here.
   */
  async repair(request: SpecRepairContext): Promise<SpecDraft> {
    const entries = vocabularyEntries(request.vocabulary.target);
    const original = renderSpecRequest(
      buildSpecRequest(request.case, entries, request.vocabulary.target),
    );
    const prompt = [
      original,
      '',
      '--- THIS IS A REPAIR ---',
      '',
      buildRepairRequest(request.previousSource, request.reason),
    ].join('\n');

    return parseDraft(this.invoke(prompt));
  }

  private invoke(prompt: string): string {
    if (this.run) {
      const result = this.run(prompt);
      if (result.status !== 0) {
        throw new Error(`${this.identity} exited ${result.status}: ${result.stderr.slice(0, 400)}`);
      }
      return extract(result.stdout, this.resultPath);
    }

    /*
       An empty scratch directory. Not a sandbox — see the class comment — but a
       model with no repository under its feet has nothing convenient to copy an
       assertion out of, and the honest cost of that is one mkdtemp.
    */
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-author-'));
    try {
      const [executable, ...args] = this.command;
      const result = spawnSync(executable!, args, {
        cwd,
        input: prompt,
        encoding: 'utf8',
        timeout: this.timeoutMs,
        shell: process.platform === 'win32',
        maxBuffer: 32 * 1024 * 1024,
      });

      if (result.error) {
        throw new Error(
          `Could not run '${executable}': ${result.error.message}\n` +
            'Install the agent CLI, or set SPEC_AUTHOR_CLI to one you have. ' +
            'Or skip the model entirely: npm run spec:request writes the prompt to a file for ' +
            'any agent, and spec:author --draft= takes the reply back.',
        );
      }
      if (result.status !== 0) {
        throw new Error(
          `${this.identity} exited ${result.status}.\n${(result.stderr ?? '').slice(0, 600)}`,
        );
      }
      return extract(result.stdout, this.resultPath);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
}

/** Pull the reply out of whatever envelope the CLI printed. */
export function extract(stdout: string, resultPath: string): string {
  if (!resultPath) return stdout;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // No envelope after all — some CLIs print the reply directly. Use it, since
    // the alternative is failing on output that is probably fine.
    return stdout;
  }

  let node: unknown = parsed;
  for (const key of resultPath.split('.')) {
    if (typeof node !== 'object' || node === null || !(key in node)) {
      throw new Error(
        `The CLI's output has no '${resultPath}' — it printed keys: ` +
          `${typeof parsed === 'object' && parsed ? Object.keys(parsed).join(', ') : typeof parsed}. ` +
          'Set SPEC_AUTHOR_CLI_RESULT to the field carrying the reply, or empty for none.',
      );
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'string') {
    throw new Error(`'${resultPath}' is ${typeof node}, not the text of a reply.`);
  }
  return node;
}

/**
 * The draft, out of a reply that may be wrapped in prose or a code fence.
 *
 * Asking for "JSON and nothing else" gets JSON and nothing else most of the
 * time. Failing the whole run on the times it does not — a fence, a sentence of
 * preamble — would make the thing feel unreliable for a reason that has nothing
 * to do with the draft's quality, and the draft is verified afterwards either
 * way.
 */
export function parseDraft(reply: string): SpecDraft {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const candidates = [fenced?.[1], reply, sliceOutermostObject(reply)].filter(
    (text): text is string => typeof text === 'string' && text.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as SpecDraft;
      if (parsed && typeof parsed === 'object' && 'kind' in parsed) return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `The reply was not a draft. It began: ${reply.slice(0, 200)}\n` +
      'Expected one JSON object with a "kind" of "spec-ir", "spec" or "needs-vocabulary".',
  );
}

/** From the first `{` to its matching `}` — a draft wrapped in prose. */
function sliceOutermostObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}
