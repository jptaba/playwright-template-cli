import Anthropic from '@anthropic-ai/sdk';
import {
  TRIAGE_SYSTEM_PROMPT,
  type TriageAgent,
  type TriageEvidence,
} from '../../support/triage/agent';
import { TRIAGE_CATEGORIES, type TriageVerdict } from '../../support/triage/types';

/**
 * The triage agent — §20.
 *
 * A schema-constrained completion over failure evidence. It sees failures,
 * evidence and history; it has no write access to specs, cases or defects, and
 * `guarded()` validates whatever it returns before the report shows it.
 *
 * Traces carry application data, so everything here has been through
 * `redact()` in `buildEvidence` before the request is made (§17).
 */
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'confidence',
    'summary',
    'evidence',
    'affectedTests',
    'recommendedAction',
    'suggestedOwner',
    'needsHumanReview',
  ],
  properties: {
    category: { type: 'string', enum: [...TRIAGE_CATEGORIES] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    evidence: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description: 'Each item references a specific artifact from the evidence provided.',
    },
    affectedTests: { type: 'array', items: { type: 'string' } },
    recommendedAction: {
      type: 'string',
      enum: ['file-defect', 'heal', 'fix-test', 'fix-data', 'escalate', 'none'],
    },
    suggestedOwner: { type: ['string', 'null'] },
    needsHumanReview: { type: 'boolean' },
  },
} as const;

export interface AnthropicTriageAgentOptions {
  model?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  client?: Anthropic;
}

export class AnthropicTriageAgent implements TriageAgent {
  readonly identity: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;
  private readonly effort: NonNullable<AnthropicTriageAgentOptions['effort']>;

  constructor(options: AnthropicTriageAgentOptions = {}) {
    this.identity = options.model ?? 'claude-opus-5';
    this.maxTokens = options.maxTokens ?? 8_000;
    this.effort = options.effort ?? 'medium';
    this.client = options.client ?? new Anthropic();
  }

  async classify(evidence: TriageEvidence): Promise<TriageVerdict> {
    const response = await this.client.messages.create({
      model: this.identity,
      max_tokens: this.maxTokens,
      system: TRIAGE_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: { type: 'json_schema', schema: VERDICT_SCHEMA },
      },
      messages: [{ role: 'user', content: JSON.stringify(evidence, null, 2) }],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      throw new Error(
        `The triage agent stopped with '${response.stop_reason}'. The cluster is routed to a ` +
          'person rather than shown with a partial verdict.',
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Shape is checked by `guarded()`; this only has to parse.
    return {
      ...(JSON.parse(text) as Omit<TriageVerdict, 'clusterId' | 'source'>),
      clusterId: evidence.clusterId,
      source: 'agent',
    };
  }
}
