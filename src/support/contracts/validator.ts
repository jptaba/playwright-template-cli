import fs from 'node:fs';
import path from 'node:path';
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { REPO_ROOT } from '../paths';

/**
 * Schema conformance — §05.
 *
 * Adopted deliberately, and named precisely: this is *schema conformance*,
 * which catches provider drift after deployment. It is **not** consumer-driven
 * contract testing: it does not fail a provider's build before release, and
 * saying it does would let a real Pact initiative be deferred on false
 * grounds (§22).
 *
 * The design decision that matters is running validation *inside the shared
 * API client* rather than as a separate suite, so every API call in every test
 * — including the setup calls inside UI tests — is a contract check for free.
 */

export interface ValidationFailure {
  endpoint: string;
  status: number;
  /** JSON pointer into the response body. */
  at: string;
  message: string;
}

export class ContractDriftError extends Error {
  constructor(
    readonly endpoint: string,
    readonly failures: ValidationFailure[],
  ) {
    super(
      `Contract drift on ${endpoint}: the response no longer validates against the published ` +
        `schema.\n${failures.map((failure) => `  · ${failure.at || '/'} ${failure.message}`).join('\n')}\n` +
        'This is provider drift, not an application defect — it routes to the provider team, ' +
        'one ticket per endpoint (§20).',
    );
    this.name = 'ContractDriftError';
  }
}

interface OpenApiDocument {
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        responses?: Record<string, { content?: Record<string, { schema?: AnySchema }> }>;
      }
    >
  >;
  components?: Record<string, unknown>;
}

/**
 * Loads a vendored, pinned OpenAPI document and validates responses against
 * it. The dependency is real: this needs a current, published spec. Where none
 * exists, the honest fallback is golden-response snapshots — which catches
 * drift but cannot say whether the drift was agreed, and is materially weaker.
 */
export class ContractRegistry {
  private readonly ajv: Ajv;
  private readonly compiled = new Map<string, ValidateFunction>();
  private readonly document: OpenApiDocument;

  private constructor(document: OpenApiDocument) {
    this.document = document;
    this.ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
    addFormats(this.ajv);
    // Component schemas are referenced as #/components/schemas/... by the
    // response schemas, so the whole document is registered under that root.
    if (document.components) {
      this.ajv.addSchema({ $id: 'openapi', components: document.components } as AnySchema);
    }
  }

  static fromFile(specPath: string): ContractRegistry {
    const full = path.isAbsolute(specPath) ? specPath : path.join(REPO_ROOT, specPath);
    if (!fs.existsSync(full)) {
      throw new Error(
        `Contract spec not found at ${specPath}. A target that declares ` +
          'capabilities.contracts.enabled must vendor and pin the published document (§05).',
      );
    }
    const text = fs.readFileSync(full, 'utf8');
    const document = (/\.ya?ml$/.test(full) ? YAML.parse(text) : JSON.parse(text)) as OpenApiDocument;
    return new ContractRegistry(document);
  }

  static fromDocument(document: OpenApiDocument): ContractRegistry {
    return new ContractRegistry(document);
  }

  /** Documented operations, so the contract project can walk every endpoint. */
  operations(): Array<{ method: string; path: string; operationId?: string }> {
    const operations: Array<{ method: string; path: string; operationId?: string }> = [];
    for (const [pathKey, methods] of Object.entries(this.document.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods)) {
        operations.push({
          method: method.toUpperCase(),
          path: pathKey,
          ...(operation.operationId ? { operationId: operation.operationId } : {}),
        });
      }
    }
    return operations;
  }

  /**
   * The statuses the document lists for one operation.
   *
   * Exists because response-body validation only happens for a status the
   * document has a schema for — so a service answering 201 where its document
   * declares only 200 is never schema-checked at all, and the gap is invisible
   * from inside `validate()`, which correctly reports no failures for a
   * response it has no schema for. A contract suite needs to be able to ask
   * this question directly.
   *
   * `default` and wildcard forms such as `2XX` are excluded: they cannot be
   * compared against a concrete status without deciding what they cover, and
   * that decision belongs to whoever wrote the document.
   */
  statusesFor(method: string, pathTemplate: string): number[] {
    const operation = this.document.paths?.[pathTemplate]?.[method.toLowerCase()];
    return Object.keys(operation?.responses ?? {})
      .map((code) => Number(code))
      .filter((code) => Number.isFinite(code));
  }

  private schemaFor(method: string, pathTemplate: string, status: number): AnySchema | null {
    const operation = this.document.paths?.[pathTemplate]?.[method.toLowerCase()];
    if (!operation?.responses) return null;
    const response =
      operation.responses[String(status)] ??
      operation.responses[`${Math.floor(status / 100)}XX`] ??
      operation.responses.default;
    const content = response?.content;
    if (!content) return null;
    const media =
      content['application/json'] ??
      Object.entries(content).find(([type]) => type.includes('json'))?.[1];
    return media?.schema ?? null;
  }

  /**
   * @returns validation failures, or an empty array when the response conforms
   * or when the endpoint is undocumented. An undocumented endpoint is not a
   * failure here — it is a coverage gap the contract project reports.
   */
  validate(
    method: string,
    pathTemplate: string,
    status: number,
    body: unknown,
  ): ValidationFailure[] {
    const schema = this.schemaFor(method, pathTemplate, status);
    if (!schema) return [];

    const key = `${method} ${pathTemplate} ${status}`;
    let validator = this.compiled.get(key);
    if (!validator) {
      // Response schemas reference components by pointer; rebase them onto the
      // registered document root.
      validator = this.ajv.compile(rebaseRefs(schema));
      this.compiled.set(key, validator);
    }

    if (validator(body)) return [];
    return (validator.errors ?? []).map((error) => ({
      endpoint: `${method} ${pathTemplate}`,
      status,
      at: error.instancePath,
      message: error.message ?? 'failed validation',
    }));
  }

  /** Endpoints in the document that no response has been validated against. */
  uncovered(seen: Set<string>): Array<{ method: string; path: string }> {
    return this.operations().filter(
      (operation) => !seen.has(`${operation.method} ${operation.path}`),
    );
  }
}

function rebaseRefs(schema: AnySchema): AnySchema {
  const json = JSON.stringify(schema).replace(
    /"\$ref":"#\/components\//g,
    '"$ref":"openapi#/components/',
  );
  return JSON.parse(json) as AnySchema;
}
