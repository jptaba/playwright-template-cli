import Anthropic from '@anthropic-ai/sdk';
import type {
  CaseAuthorModel,
  DraftedCase,
  NormalisedStory,
} from '../../support/cases/author';

/**
 * The case author — §08, §09.
 *
 * "A schema-constrained completion, not an agent. Giving it a browser is the
 * specific failure described in section 09; giving it write access to
 * PractiTest is the one described in section 22."
 *
 * So: no tools, no browser, no filesystem. One request, one schema-constrained
 * response, and the only input is requirement text. The invention guards live
 * outside this file, in `authorCases` — a model cannot be trusted to enforce
 * its own citation rules, so the verification happens after the reply.
 */

/** The shape the model is constrained to. Drives `output_config.format`. */
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cases'],
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'coversAC',
          'acQuoted',
          'preconditions',
          'steps',
          'assertions',
          'priority',
          'type',
        ],
        properties: {
          title: { type: 'string' },
          coversAC: {
            type: 'array',
            items: { type: 'string' },
            description: 'Criterion ids, exactly as labelled in the prompt, e.g. "AC-1".',
          },
          acQuoted: {
            type: 'string',
            description:
              'The criterion copied verbatim from the story. Not a paraphrase — it is ' +
              'checked as a substring and the case is quarantined if it does not match.',
          },
          preconditions: { type: 'array', items: { type: 'string' } },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['action', 'expected'],
              properties: {
                action: { type: 'string' },
                expected: { type: 'string' },
              },
            },
          },
          assertions: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          type: { type: 'string', enum: ['positive', 'negative', 'boundary'] },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You draft manual test cases from a requirement. You are not an automation engineer and',
  'you never see the running application — cases derived from current behaviour pass on a',
  'broken build and can never catch a regression.',
  '',
  'Rules:',
  '- Every case cites at least one acceptance criterion by its id and quotes it verbatim in',
  '  acQuoted. A quote that is not a literal substring of the story is rejected downstream.',
  '- Do not invent behaviour. If the story does not say it, do not test it. A case you cannot',
  '  tie to a criterion is worse than a missing case, because a published case looks like a',
  '  requirement.',
  '- Cover every criterion with at least one case.',
  '- Be specific enough that a tester could follow the case without asking a question: name',
  '  the data, the exact expected message or value, and the starting state. "Verify the',
  '  report is correct" is not a test case.',
  '- Prefer several small cases over one long one, and include the negative and boundary',
  '  cases the criteria imply.',
].join('\n');

export interface AnthropicCaseAuthorOptions {
  /** Defaults to the current Opus. Override per §22's cost measurement. */
  model?: string;
  maxTokens?: number;
  /** Thinking depth: low | medium | high | xhigh | max. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  client?: Anthropic;
}

/** Cost per million tokens, for the phase 2/4b measurement (§22). */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export interface AuthoringUsage {
  inputTokens: number;
  outputTokens: number;
  /** US dollars at list price, or null when the model's pricing is unknown. */
  estimatedCost: number | null;
}

export class AnthropicCaseAuthor implements CaseAuthorModel {
  readonly identity: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;
  private readonly effort: NonNullable<AnthropicCaseAuthorOptions['effort']>;

  /** Accumulated across the run, so phase 4b can report cost per case. */
  readonly usage: AuthoringUsage = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };

  constructor(options: AnthropicCaseAuthorOptions = {}) {
    this.identity = options.model ?? 'claude-opus-5';
    this.maxTokens = options.maxTokens ?? 16_000;
    this.effort = options.effort ?? 'high';
    // The SDK resolves the credential itself, so no code here ever touches an
    // API key — which is also why `secrets-via-fixture` stays satisfied (§11).
    this.client = options.client ?? new Anthropic();
  }

  async draft(story: NormalisedStory): Promise<DraftedCase[]> {
    const response = await this.client.messages.create({
      model: this.identity,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: { type: 'json_schema', schema: DRAFT_SCHEMA },
      },
      messages: [{ role: 'user', content: renderStory(story) }],
    });

    this.recordUsage(response.usage.input_tokens, response.usage.output_tokens);

    if (response.stop_reason === 'refusal') {
      throw new Error(
        'The case author declined this story. Nothing is published — review the story text ' +
          'and re-run rather than working around the refusal.',
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `The reply was cut off at ${this.maxTokens} tokens, so the case list is incomplete. ` +
          'Raise maxTokens or split the story; a truncated draft must not be published.',
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const parsed = JSON.parse(text) as { cases?: DraftedCase[] };
    return parsed.cases ?? [];
  }

  private recordUsage(inputTokens: number, outputTokens: number): void {
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    const price = PRICING[this.identity];
    if (!price || this.usage.estimatedCost === null) {
      this.usage.estimatedCost = null;
      return;
    }
    this.usage.estimatedCost +=
      (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  }
}

/**
 * The whole of what the model sees. Criteria are numbered here so `coversAC`
 * has stable ids to cite, and the numbering matches `criterionId()` in the
 * author so the citation check lines up.
 */
export function renderStory(story: NormalisedStory): string {
  const criteria = story.acceptanceCriteria
    .map((text, index) => `AC-${index + 1}: ${text}`)
    .join('\n');

  return [
    `Story ${story.key}: ${story.summary}`,
    '',
    'Description:',
    story.description || '(none)',
    '',
    'Acceptance criteria:',
    criteria || '(none — do not draft cases; report that the story has no criteria)',
    '',
    'Draft the test cases this story requires.',
  ].join('\n');
}
