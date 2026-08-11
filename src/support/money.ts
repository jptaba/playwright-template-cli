/**
 * Money parsing helpers. Kept in `support/` rather than an action because the
 * same string shapes appear in UI text, API payloads and report rendering, and
 * a second implementation is how two of them quietly disagree.
 */

/**
 * Pull the first currency amount out of a label such as
 * `"Item total: $29.99"` or `"Tax: $2.40"`.
 *
 * @throws if the string carries no recognisable amount — a silent NaN in a
 * totals assertion produces a passing test that checks nothing.
 */
export function parseMoney(text: string | null | undefined): number {
  if (!text) throw new Error(`Expected a currency amount, received: ${JSON.stringify(text)}`);
  const match = /-?\d+(?:,\d{3})*(?:\.\d+)?/.exec(text.replace(/\s/g, ''));
  if (!match) throw new Error(`No currency amount found in: ${JSON.stringify(text)}`);
  return Number(match[0].replace(/,/g, ''));
}

/** Round to 2dp the way a till does, not the way IEEE 754 does. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumOf(amounts: readonly number[]): number {
  return round2(amounts.reduce((total, amount) => total + amount, 0));
}
