import { defineQuery } from '../../../integrations/db/reader';

export interface LedgerEntry {
  reference: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  postedAt: string;
}

/**
 * L1 — TEMPLATE. Named, parameterised statements.
 *
 * Read the hierarchy before adding anything here: assert through the UI if the
 * user can see it, through the API if a service exposes it, and through the
 * database **only** when neither does. A query couples the suite to a private
 * schema with no contract and no deprecation notice, and it can pass while the
 * feature is broken for users.
 *
 * `defineQuery` rejects anything that is not a single SELECT, at definition
 * time — the read-only rule is enforced where the query is written rather than
 * where it runs.
 *
 * Name each one for the business fact it establishes, not the table it reads.
 * That list is what you send the owning team when they ask what the suite
 * depends on, and if it is too long to send, it is too long.
 */
export const ledgerQueries = {
  /** The ledger posting for an order reference — no API exposes this. */
  entryForReference: defineQuery<LedgerEntry>({
    name: 'ledger entry for an order reference',
    sql: `SELECT reference, amount, type, posted_at AS "postedAt"
            FROM ledger_entries
           WHERE reference = $1
           ORDER BY posted_at DESC
           LIMIT 1`,
    parameters: 1,
    rowShape: { reference: 'string', amount: 'number', type: 'DEBIT|CREDIT', postedAt: 'ISO date' },
  }),
};
