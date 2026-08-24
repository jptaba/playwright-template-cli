/**
 * Playwright colourises assertion errors for the terminal, so a captured
 * `error.message` carries ANSI escape sequences. Those are invisible in a
 * console and very visible everywhere else: a report cell, a Jira description,
 * a PractiTest run output, a cluster signature.
 *
 * Stripping them at the reporter means every downstream consumer gets clean
 * text without each one having to remember — and it keeps the clustering
 * signature stable, since colour depends on where the run happened.
 */
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}
