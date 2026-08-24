/**
 * The runs that belong to the application in the bar — item 80.
 *
 * `/runs`, `/triage` and `/publish` all show a run list, and until this existed
 * none of them scoped it. Driven with **parabank** selected, all three offered
 * one `default` run and three `toolshop` ones and nothing of parabank's; the
 * counter-check that made it certain rather than a fallback was switching to
 * `toolshop` and getting a byte-identical list.
 *
 * `/triage` was the sharp case, because it does not merely list: it *defaults*
 * to the most recent run with something to classify and invites verdicts on
 * it. A person triaging with parabank in the bar was recording judgements
 * against toolshop's failures.
 *
 * **`default` needs no special case, which is the argument for the rule being
 * a match on the name.** A run recorded with target `default` is what
 * `npm run verify` writes — the framework's own tests, scoped to no
 * application at all (confirmed from the record on disk: `"target": "default"`,
 * `"environment": "local"`). It matches no application name, so it appears
 * under none, and there is nothing to write down. A command-line run of a real
 * application carries that application's name and still appears under it,
 * which is the recovery path that mattered.
 *
 * **Nothing selected means no scope**, the same answer `collectCoverage`
 * already gives for an absent target: the bar is not claiming anything, so
 * neither is the list.
 */

export interface RunLike {
  /** The application the run was against, or `default` for none. */
  target: string;
}

export interface ScopedRuns<T> {
  runs: T[];
  /**
   * How many were left out because they belong to another application.
   *
   * Returned rather than derived by each caller so an empty list can say *why*
   * it is empty. "No runs yet" and "no runs for this application, though there
   * are four for others" are different facts, and the second one is the one
   * with a next step in it — switch in the bar.
   */
  elsewhere: number;
}

export function scopeRuns<T extends RunLike>(
  runs: readonly T[],
  target: string | null | undefined,
): ScopedRuns<T> {
  const wanted = (target ?? '').trim();
  if (!wanted) return { runs: [...runs], elsewhere: 0 };

  const mine = runs.filter((run) => run.target === wanted);
  return { runs: mine, elsewhere: runs.length - mine.length };
}
