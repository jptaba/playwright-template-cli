#!/usr/bin/env tsx
import path from 'node:path';
import { resolveTarget } from '../config/target';
import { PractiTestClient } from '../src/integrations/practitest/client';
import { gateCase } from '../src/support/cases/gate';
import { hashContent, saveCase, slugify } from '../src/support/cases/store';
import type { TestCase } from '../src/support/cases/schema';
import { REPO_ROOT } from '../src/support/paths';

/**
 * `npm run cases:pull` — Track B, §09.
 *
 * Fetches PractiTest cases into the same `cases/*.yaml` format Track A writes,
 * so there is one input to the generator regardless of where a case came from.
 *
 * The model's role in Track B is narrower and safer: turn prose steps into the
 * structured schema and score the case against the quality gate. It adds no
 * requirements — where the case is ambiguous it marks the ambiguity rather
 * than resolving it, and that becomes feedback to the case author.
 */
interface PractiTestCase {
  id: string;
  attributes?: Record<string, unknown>;
  steps?: Array<{ name?: string; 'expected-results'?: string }>;
}

function toTestCase(raw: PractiTestCase, target: string): TestCase {
  const attributes = raw.attributes ?? {};
  const description = String(attributes.description ?? '');
  const steps = (raw.steps ?? []).map((step) => ({
    action: String(step.name ?? '').replace(/^\d+\.\s*/, '').trim() || 'unspecified step',
    expected: String(step['expected-results'] ?? '').trim() || 'unspecified expected result',
  }));

  return {
    id: String(attributes['display-id'] ?? raw.id),
    target,
    title: String(attributes.name ?? 'Untitled case'),
    source: {
      type: 'practitest',
      key: String(attributes['display-id'] ?? raw.id),
      contentHash: hashContent(JSON.stringify({ description, steps })),
      // Null: a human wrote it. Track B never claims model authorship.
      authoredBy: null,
    },
    coversAC: [],
    acQuoted: '',
    preconditions: description ? [description] : [],
    steps: steps.length > 0 ? steps : [{ action: 'unspecified step', expected: 'unspecified' }],
    assertions: steps.length > 0 ? [steps[steps.length - 1]!.expected] : ['unspecified'],
    priority: 'medium',
    type: 'positive',
  };
}

async function main(): Promise<number> {
  const target = process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1]
    ?? resolveTarget().name;
  const setId = process.argv.find((arg) => arg.startsWith('--set='))?.split('=')[1];

  const client = PractiTestClient.fromEnvironment();
  console.log(`Pulling PractiTest cases${setId ? ` from set ${setId}` : ''} for '${target}'…`);

  let pulled = 0;
  let rejected = 0;

  try {
    const raw = await client.listCases({ ...(setId ? { setId } : {}) });
    for (const entry of raw) {
      const testCase = toTestCase(entry, target);
      const gate = gateCase(testCase);
      const file = saveCase(testCase, slugify(`${testCase.id}-${testCase.title}`));
      pulled++;

      if (gate.passed) {
        console.log(`  OK    ${testCase.id}  ${testCase.title}`);
        continue;
      }
      rejected++;
      console.log(`  GATE  ${testCase.id}  ${testCase.title}  (score ${gate.score})`);
      console.log(`        ${path.relative(REPO_ROOT, file)}`);
      for (const finding of gate.findings) {
        console.log(`        · ${finding.detail}`);
        console.log(`          → ${finding.remedy}`);
      }
    }
  } finally {
    await client.dispose();
  }

  console.log(`\n${pulled} case(s) pulled; ${rejected} did not pass the quality gate.`);
  if (rejected > 0) {
    console.log(
      'Expect this to reject a meaningful share of an existing legacy suite on first run. ' +
        'That is the system working — each rejection names the specific gap to send back ' +
        'to the case author (§10).',
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
