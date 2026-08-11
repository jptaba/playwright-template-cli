import type { SchemaObject } from 'ajv';

/**
 * The case format both tracks produce — §09.
 *
 * `cases/` is the junction: Track A writes into it from a Jira story, Track B
 * fills it from PractiTest, and generation reads only from it. One input
 * format to the generator regardless of where a case came from.
 */
export type CaseSourceType = 'jira-story' | 'practitest' | 'human';
export type CaseType = 'positive' | 'negative' | 'boundary';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface CaseStep {
  action: string;
  expected: string;
}

export interface CaseSource {
  type: CaseSourceType;
  /** Jira key or PractiTest display id. */
  key: string;
  /** Hash of the upstream artifact, for drift detection (§09). */
  contentHash: string;
  /** Model identity, or null when a human wrote it. */
  authoredBy: string | null;
}

export interface TestCase {
  /** Filled by PractiTest on first publish; null until then. */
  id: string | null;
  target: string;
  title: string;
  source: CaseSource;
  /**
   * Mandatory — at least one acceptance criterion, quoted verbatim below.
   * A case that cannot cite one is not rejected outright: it is written to a
   * `speculative` block that a human triages separately (§09).
   */
  coversAC: string[];
  /** The criterion's text, verified as a substring of the source story. */
  acQuoted: string;
  preconditions: string[];
  steps: CaseStep[];
  assertions: string[];
  priority: CasePriority;
  type: CaseType;
  /** Set when the case was drafted but cites no criterion. Never published. */
  speculative?: boolean;
  /** Where the generator put the spec, once one exists. */
  specPath?: string;
  /** Hash of this case, stored by the spec so drift is detectable. */
  caseHash?: string;
}

/**
 * Typed as a plain schema object rather than `JSONSchemaType<TestCase>`: the
 * generic rejects the nullable-and-optional combinations this format needs,
 * and fighting it costs more than it buys. The correspondence between this
 * schema and the interface above is held by the tests in
 * `tests/unit/cases.spec.ts` instead — a valid case parses, and each way of
 * being invalid is rejected by name.
 */
export const testCaseSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'target',
    'title',
    'source',
    'coversAC',
    'acQuoted',
    'preconditions',
    'steps',
    'assertions',
    'priority',
    'type',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string', nullable: true },
    target: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 5 },
    source: {
      type: 'object',
      required: ['type', 'key', 'contentHash', 'authoredBy'],
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['jira-story', 'practitest', 'human'] },
        key: { type: 'string', minLength: 1 },
        contentHash: { type: 'string' },
        authoredBy: { type: 'string', nullable: true },
      },
    },
    coversAC: { type: 'array', items: { type: 'string' } },
    acQuoted: { type: 'string' },
    preconditions: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['action', 'expected'],
        additionalProperties: false,
        properties: {
          action: { type: 'string', minLength: 3 },
          expected: { type: 'string', minLength: 3 },
        },
      },
    },
    assertions: { type: 'array', minItems: 1, items: { type: 'string' } },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    type: { type: 'string', enum: ['positive', 'negative', 'boundary'] },
    speculative: { type: 'boolean', nullable: true },
    specPath: { type: 'string', nullable: true },
    caseHash: { type: 'string', nullable: true },
  },
};
