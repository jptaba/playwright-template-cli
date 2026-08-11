#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { RUN_RESULT_PATH } from '../src/support/paths';
import { tally, type RunResult, type TestRecord } from '../src/support/reporters/run-result';

/**
 * `npm run report:normalise [-- <dir>]` — the merge job in §16.
 *
 * Sharded CI writes one `run-result*.json` per shard as an artifact; this
 * merges them into the single canonical model everything downstream reads.
 *
 * Merging in one job is required twice over: the PractiTest rate limit needs
 * one batched caller rather than N shards calling independently, and **flaky
 * status is only knowable once every attempt across every shard is accounted
 * for**. The two constraints happen to want the same architecture (§16).
 */
function findShardFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^run-result.*\.json$/.test(name))
    .map((name) => path.join(dir, name))
    .sort();
}

function main(): number {
  const dirArg = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'results';
  const files = findShardFiles(dirArg);

  if (files.length === 0) {
    if (fs.existsSync(RUN_RESULT_PATH)) {
      console.log(
        `No shard files in ${dirArg}/. Leaving the single-process run-result.json in place.`,
      );
      return 0;
    }
    console.error(`No run-result*.json found in ${dirArg}/ and none at the repository root.`);
    return 1;
  }

  const shards = files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as RunResult);
  const first = shards[0]!;

  // Same test id across shards should not happen, but a re-run artifact can
  // duplicate one — last write wins, and the count is reported.
  const byId = new Map<string, TestRecord>();
  let duplicates = 0;
  for (const shard of shards) {
    for (const record of shard.tests) {
      if (byId.has(record.id)) duplicates++;
      byId.set(record.id, record);
    }
  }
  const tests = [...byId.values()];

  const startedAt = shards
    .map((shard) => shard.run.startedAt)
    .sort()[0]!;
  const finishedAt = shards
    .map((shard) => shard.run.finishedAt)
    .sort()
    .reverse()[0]!;

  const merged: RunResult = {
    schemaVersion: first.schemaVersion,
    run: {
      ...first.run,
      startedAt,
      finishedAt,
      // Wall clock across the whole sharded run, not the sum of the shards.
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      status: shards.some((shard) => shard.run.status === 'failed') ? 'failed' : 'passed',
    },
    totals: tally(tests),
    capabilities: first.capabilities,
    tests,
  };

  fs.writeFileSync(RUN_RESULT_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(
    `Merged ${shards.length} shard(s) → ${tests.length} test(s)` +
      (duplicates > 0 ? ` (${duplicates} duplicate id(s) collapsed)` : ''),
  );
  console.log(
    `  ${merged.totals.passed} passed, ${merged.totals.failed} failed, ` +
      `${merged.totals.flaky} flaky, ${merged.totals.skipped} skipped`,
  );
  return 0;
}

process.exit(main());
