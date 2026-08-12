import fs from 'node:fs';
import path from 'node:path';
import { repoPath } from '../paths';
import { TRIAGE_CATEGORIES, type TriageCategory, type VerdictSource } from './types';

/**
 * What a person decided, kept apart from what the machine decided — §20, §22.
 *
 * "Record its category against the human verdict so agreement can be measured."
 * That measurement is the only thing that says whether the rules are any good,
 * and it cannot be taken from a file the rules themselves write.
 *
 * Three properties, each deliberate:
 *
 * **It is a separate file.** A human verdict never edits `run-result.json` or
 * `triage-result.json`. Those are the machine's account of the run, and a
 * record that quietly rewrites the thing it is being compared against can
 * only ever agree with itself.
 *
 * **It is append-only.** Changing your mind writes a second line; the latest
 * wins and the earlier one stays. A verdict store that is edited in place
 * loses exactly the history the agreement measurement is made of.
 *
 * **It is committed**, like the quarantine list and the run history — the
 * decision §22 already made about where a record of this kind lives, which is
 * a JSON-lines file rather than a database nobody chose.
 */
export const VERDICTS_PATH = repoPath('config', 'triage-verdicts.jsonl');

/** What the automated pass said, or nothing when it declined to settle. */
export interface AutomatedVerdict {
  category: TriageCategory;
  source: VerdictSource;
  rule: string | null;
}

export interface HumanVerdict {
  runId: string;
  clusterId: string;
  /**
   * The cluster's signature at the time. Cluster ids are a hash of it, so this
   * is redundant until the day clustering changes — and on that day it is the
   * only thing that says what the verdict was actually about.
   */
  signature: string;
  automated: AutomatedVerdict | null;
  category: TriageCategory;
  note: string | null;
  by: string;
  at: string;
}

export function isTriageCategory(value: unknown): value is TriageCategory {
  return TRIAGE_CATEGORIES.includes(value as TriageCategory);
}

export function readVerdicts(file = VERDICTS_PATH): HumanVerdict[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as HumanVerdict);
}

export function appendVerdict(verdict: HumanVerdict, file = VERDICTS_PATH): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(verdict)}\n`, 'utf8');
}

/** The last word on each cluster. Later lines win; earlier ones are kept. */
export function latestVerdicts(entries: readonly HumanVerdict[]): Map<string, HumanVerdict> {
  const latest = new Map<string, HumanVerdict>();
  for (const entry of entries) latest.set(`${entry.runId}:${entry.clusterId}`, entry);
  return latest;
}

export interface Disagreement {
  runId: string;
  clusterId: string;
  automated: TriageCategory;
  human: TriageCategory;
  rule: string | null;
  note: string | null;
}

export interface Agreement {
  /** Clusters a person has ruled on. */
  recorded: number;
  /** Of those, the ones automation also classified — the only comparable ones. */
  compared: number;
  agreed: number;
  /** Null rather than 0 when nothing is comparable: 0% would be a lie. */
  rate: number | null;
  /**
   * Human verdicts on clusters automation declined to settle. **Not counted
   * against the rate.** A rule that declines a genuine judgement call is
   * behaving correctly — the model exists for those — and scoring it as a
   * miss would push whoever tunes the rules towards guessing.
   */
  declined: number;
  /** Where a rule was confidently wrong. This is the list that tightens rules. */
  disagreements: Disagreement[];
}

export function agreementOf(entries: readonly HumanVerdict[]): Agreement {
  const latest = [...latestVerdicts(entries).values()];
  const disagreements: Disagreement[] = [];
  let compared = 0;
  let agreed = 0;
  let declined = 0;

  for (const entry of latest) {
    if (!entry.automated) {
      declined += 1;
      continue;
    }
    compared += 1;
    if (entry.automated.category === entry.category) {
      agreed += 1;
      continue;
    }
    disagreements.push({
      runId: entry.runId,
      clusterId: entry.clusterId,
      automated: entry.automated.category,
      human: entry.category,
      rule: entry.automated.rule,
      note: entry.note,
    });
  }

  return {
    recorded: latest.length,
    compared,
    agreed,
    rate: compared === 0 ? null : Math.round((agreed / compared) * 1000) / 1000,
    declined,
    disagreements,
  };
}
