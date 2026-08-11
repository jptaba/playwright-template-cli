import { defineQuery } from '../../../integrations/db/reader';

/**
 * L1 — named, parameterised statements (§05).
 *
 * Each is named for the business fact it establishes rather than the table it
 * reads. That naming is not cosmetic: this list is what you send the owning
 * team when they ask which columns the suite depends on, and "if that list is
 * too long to send, it is too long".
 *
 * `defineQuery` rejects anything that is not a single SELECT, so the read-only
 * rule is enforced where the query is written rather than where it runs.
 */

export interface LedgerEntry {
  reference: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  postedAt: string;
}

export const ledgerQueries = {
  /** The ledger posting for a claim reference — no API exposes this. */
  entryForReference: defineQuery<LedgerEntry>({
    name: 'ledger entry for a claim reference',
    sql: `SELECT reference, amount, type, posted_at AS "postedAt"
            FROM ledger_entries
           WHERE reference = $1
           ORDER BY posted_at DESC
           LIMIT 1`,
    parameters: 1,
    rowShape: { reference: 'string', amount: 'number', type: 'DEBIT|CREDIT', postedAt: 'ISO date' },
  }),

  /** Audit rows written by the overnight batch, which has no read API. */
  auditTrailForOrder: defineQuery<{ action: string; actor: string; at: string }>({
    name: 'audit trail for an order',
    sql: `SELECT action, actor, occurred_at AS "at"
            FROM order_audit
           WHERE order_id = $1
           ORDER BY occurred_at ASC`,
    parameters: 1,
  }),
};
