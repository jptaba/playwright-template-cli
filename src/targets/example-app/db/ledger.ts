import type { DbReader } from '../../../integrations/db/reader';
import { ledgerQueries, type LedgerEntry } from '../queries/ledger';

/**
 * L2 — TEMPLATE. The read vocabulary: same layer as `actions/` and `api/`,
 * same rules. Composes named queries, returns data, asserts nothing.
 */
export function ledgerDb(reader: DbReader) {
  return {
    /**
     * The ledger posting for an order reference, or null when nothing has
     * posted yet. Returning null rather than throwing is what lets a spec poll
     * for an asynchronous posting with `expect.poll` instead of sleeping.
     */
    async entryFor(reference: string): Promise<LedgerEntry | null> {
      const rows = await reader.run(ledgerQueries.entryForReference, [reference]);
      return rows[0] ?? null;
    },
  };
}
