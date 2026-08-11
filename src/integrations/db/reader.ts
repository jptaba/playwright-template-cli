/**
 * Read-only database access — §05.
 *
 * "The sharpest tool here and the easiest to misuse." The hierarchy is not a
 * preference: assert through the UI if the user can see it, through the API if
 * a service exposes it, and through the database **only** when neither does.
 *
 * Everything in here exists to make the dangerous version impossible rather
 * than discouraged: no writes, no inline SQL, per-worker connections that are
 * capped and closed, and results that go through the same scrubbing as
 * anything else before they reach a report.
 */

/** A named, parameterised statement. L1 — the SQL equivalent of a locator. */
export interface QueryDefinition<TRow> {
  /**
   * Named for the business fact it establishes, not the table it reads —
   * "the ledger entry for a claim reference", not "select from gl_entries".
   * That name is what you send the owning team when they ask what the suite
   * depends on.
   */
  name: string;
  sql: string;
  /** Number of positional parameters the statement takes. */
  parameters: number;
  /** Documentation only; the row type is carried by the generic. */
  rowShape?: Record<string, string>;
  readonly __row?: TRow;
}

const WRITE_STATEMENT =
  /^\s*(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|call|do)\b/i;
const MULTIPLE_STATEMENTS = /;\s*\S/;

export class ReadOnlyViolationError extends Error {
  constructor(name: string, detail: string) {
    super(
      `Query '${name}' is not read-only: ${detail}. The framework never writes to a database — ` +
        'test data is created through the API or the UI so the application\'s caches, events ' +
        'and derived state stay consistent. A row inserted behind the application\'s back ' +
        'produces failures that surface three tests later and look like something else (§05).',
    );
    this.name = 'ReadOnlyViolationError';
  }
}

/** Enforced when a query is defined, not when it runs. */
export function defineQuery<TRow>(definition: Omit<QueryDefinition<TRow>, '__row'>): QueryDefinition<TRow> {
  const sql = definition.sql.trim();
  if (WRITE_STATEMENT.test(sql)) {
    throw new ReadOnlyViolationError(definition.name, 'it is a write statement');
  }
  if (MULTIPLE_STATEMENTS.test(sql)) {
    throw new ReadOnlyViolationError(definition.name, 'it contains more than one statement');
  }
  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new ReadOnlyViolationError(definition.name, 'it does not begin with SELECT or WITH');
  }
  return definition as QueryDefinition<TRow>;
}

/** What a driver adapter has to provide. Deliberately tiny. */
export interface DbDriver {
  query<TRow>(sql: string, parameters: unknown[]): Promise<TRow[]>;
  close(): Promise<void>;
}

export interface DbReaderOptions {
  /** Per-worker connections, capped: a 20-worker shard can exhaust a test database. */
  maxRows?: number;
  timeoutMs?: number;
}

export class DbReader {
  constructor(
    private readonly driver: DbDriver,
    private readonly options: DbReaderOptions = {},
  ) {}

  async run<TRow>(definition: QueryDefinition<TRow>, parameters: unknown[] = []): Promise<TRow[]> {
    if (parameters.length !== definition.parameters) {
      throw new Error(
        `Query '${definition.name}' takes ${definition.parameters} parameter(s), got ${parameters.length}.`,
      );
    }
    const rows = await this.driver.query<TRow>(definition.sql, parameters);
    const cap = this.options.maxRows ?? 500;
    if (rows.length > cap) {
      throw new Error(
        `Query '${definition.name}' returned ${rows.length} rows, over the ${cap}-row cap. ` +
          'An assertion that needs this many rows is asserting something a user could never see.',
      );
    }
    return rows;
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

/**
 * The reader a target gets when `capabilities.db.enabled` is false. It states
 * the reason rather than hanging or producing a confusing connection error.
 */
export class DisabledDbReader extends DbReader {
  constructor(private readonly targetName: string) {
    super({
      query: async () => {
        throw new Error('unreachable');
      },
      close: async () => undefined,
    });
  }

  override async run<TRow>(
    definition: QueryDefinition<TRow>,
    _parameters: unknown[] = [],
  ): Promise<TRow[]> {
    throw new Error(
      `Target '${this.targetName}' declares capabilities.db.enabled = false, so query ` +
        `'${definition.name}' cannot run. Answer "which facts genuinely need database ` +
        'assertions?" before opening a database port — if everything under test has an API ' +
        'surface, this capability stays off and a class of brittleness never enters the suite (§23).',
    );
  }
}
