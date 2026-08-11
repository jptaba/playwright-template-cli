import { caseIdentity, hashCase } from './store';
import type { TestCase } from './schema';

/**
 * Publishing cases to PractiTest — §09, §14, §22.
 *
 * PractiTest becomes both source of truth and downstream system, so two
 * writers now edit the same records: a pipeline and a team of testers. "The
 * predictable failure is a re-run silently reverting a tester's correction,
 * and the predictable second-order effect is that testers stop correcting
 * cases because they do not trust the changes to survive."
 *
 * The ownership rule is therefore enforced in code, not documented.
 */

export type PublishAction = 'create' | 'update' | 'skip-human-owned' | 'skip-speculative';

export interface PublishDecision {
  action: PublishAction;
  identity: string;
  title: string;
  /** Existing PractiTest id, when there is one. */
  existingId?: string;
  reason?: string;
}

export interface ExistingCase {
  id: string;
  /** Whoever last touched it in PractiTest. */
  lastEditedBy: string | null;
}

export interface PublishContext {
  /** The pipeline's own account. Anything else means a human owns the case. */
  serviceAccount: string;
  lookup(identity: string): Promise<ExistingCase | null>;
}

/**
 * Decide what to do with one case, without doing it. Separated from the
 * writing so `--dry-run` prints exactly what a real run would do — "writing to
 * a shared case repository is the one irreversible thing in this pipeline".
 */
export async function decidePublish(
  testCase: TestCase,
  context: PublishContext,
): Promise<PublishDecision> {
  const identity = caseIdentity(testCase);

  if (testCase.speculative) {
    return {
      action: 'skip-speculative',
      identity,
      title: testCase.title,
      reason:
        'speculative: cites no acceptance criterion, so it is quarantined for a human rather ' +
        'than published',
    };
  }

  const existing = await context.lookup(identity);
  if (!existing) return { action: 'create', identity, title: testCase.title };

  // Human edits win permanently. A well-meaning re-run that silently reverts a
  // tester's correction is the fastest possible way to lose the team's trust.
  if (existing.lastEditedBy && existing.lastEditedBy !== context.serviceAccount) {
    return {
      action: 'skip-human-owned',
      identity,
      title: testCase.title,
      existingId: existing.id,
      reason: `last edited by ${existing.lastEditedBy}, who is not the service account`,
    };
  }

  return { action: 'update', identity, title: testCase.title, existingId: existing.id };
}

/**
 * Provenance is a field, not a convention. "If the answer to 'how many of our
 * cases were written by a model?' is unanswerable, this feature should not
 * ship." (§09)
 */
export function publishPayload(testCase: TestCase): Record<string, unknown> {
  return {
    name: testCase.title,
    description: renderCaseBody(testCase),
    'custom-fields': {
      'case-identity': caseIdentity(testCase),
      source: testCase.source.authoredBy ? 'ai-authored' : 'human-authored',
      authoredBy: testCase.source.authoredBy ?? 'human',
      storyKey: testCase.source.key,
      contentHash: testCase.source.contentHash,
      caseHash: hashCase(testCase),
      coversAC: testCase.coversAC.join(', '),
    },
    steps: testCase.steps.map((step, index) => ({
      name: `${index + 1}. ${step.action}`,
      'expected-results': step.expected,
    })),
  };
}

function renderCaseBody(testCase: TestCase): string {
  return [
    testCase.acQuoted ? `Acceptance criterion: "${testCase.acQuoted}"` : '',
    '',
    'Preconditions:',
    ...testCase.preconditions.map((precondition) => `- ${precondition}`),
    '',
    'Expected outcome:',
    ...testCase.assertions.map((assertion) => `- ${assertion}`),
  ]
    .join('\n')
    .trim();
}
