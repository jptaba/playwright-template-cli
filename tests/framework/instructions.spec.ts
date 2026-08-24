import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { repoPath } from '../../src/support/paths';

/**
 * The three instruction files are generated from `docs/CONVENTIONS.md` and
 * verified in CI (§07) — so the check that verifies them has to answer for the
 * *words*, and for nothing else.
 *
 * It did not. `sync-instructions` hashed and compared raw bytes, and
 * `.gitattributes` stores every text file here with LF while a Windows working
 * tree may legitimately hold CRLF. So a build run against a CRLF checkout
 * stamped a CRLF-derived hash into three files git then stored as LF, and
 * every LF checkout — CI included — called all three stale for ever. Locally
 * `instructions:build` looked like it fixed it and git normalised the fix
 * straight back out on the way in, so the failure returned on the next run and
 * there was no edit that could end it.
 *
 * This pins the invariant that bug broke, and deliberately recomputes it
 * rather than importing the generator: a check written with the same mistake
 * as the tool it checks would have agreed with it.
 */

/** Line endings are not content — normalise before comparing or hashing. */
const lf = (text: string): string => text.replace(/\r\n/g, '\n');

const read = (file: string): string => lf(fs.readFileSync(repoPath(file), 'utf8'));

const GENERATED = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];

/** The hash the banner claims it was generated from. */
function recordedHash(generated: string): string {
  const match = /Source: docs\/CONVENTIONS\.md \(sha256 ([0-9a-f]+)\)/.exec(generated);
  expect(match, 'the generated file should record the hash it came from').not.toBeNull();
  return match![1]!;
}

test.describe('generated instruction files', () => {
  test('each carries the conventions verbatim below its banner', () => {
    const conventions = read('docs/CONVENTIONS.md').trimStart();

    for (const file of GENERATED) {
      expect(read(file).endsWith(conventions), `${file} should end with the conventions`).toBe(
        true,
      );
    }
  });

  test('the recorded hash is the hash of the conventions, not of a checkout', () => {
    // The bug in full: this hash was 460058f4e8ff492b — the same words with
    // CRLF endings — while every LF checkout computed 9117bd64747ebbc6 and
    // reported three current files as stale.
    const expected = crypto
      .createHash('sha256')
      .update(read('docs/CONVENTIONS.md'))
      .digest('hex')
      .slice(0, 16);

    for (const file of GENERATED) {
      expect(recordedHash(read(file)), `${file} records a hash of different bytes`).toBe(expected);
    }
  });

  test('all three record the same hash, because there is one source', () => {
    const hashes = new Set(GENERATED.map((file) => recordedHash(read(file))));
    expect(hashes.size).toBe(1);
  });
});
