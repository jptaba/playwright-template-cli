import type { DbReader } from '../../../integrations/db/reader';
import { ledgerQueries, type LedgerEntry } from '../queries/ledger';

/**
 * L2 — the read vocabulary. Same layer as `actions/` and `api/`: named
 * business operations that compose primitives, return data, and assert
 * nothing (§05).
 */
export function ledgerDb(reader: DbReader) {
  return {
    /**
     * The ledger posting for a claim reference, or null when nothing has
     * posted yet. Returning null rather than throwing is what lets a spec
     * poll for an asynchronous posting with `expect.poll` instead of sleeping.
     */
    async entryFor(reference: string): Promise<LedgerEntry | null> {
      const rows = await reader.run(ledgerQueries.entryForReference, [reference]);
      return rows[0] ?? null;
    },

    /** Audit rows the overnight batch writes, which no API exposes. */
    async auditTrailFor(orderId: string): Promise<Array<{ action: string; actor: string; at: string }>> {
      return reader.run(ledgerQueries.auditTrailForOrder, [orderId]);
    },
  };
}
