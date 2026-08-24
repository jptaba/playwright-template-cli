import type { EndpointDescriptor } from '../../../src/integrations/http/api-client';

/**
 * L1 — typed endpoint descriptors. No logic, no assertions, and no host.
 *
 * **These replace the scaffolder's invented `orders` starters.** `target:new`
 * writes `endpoints/orders.ts` for any target with an api layer, and this
 * application has rooms, bookings and messages — no orders at all. Every path
 * in that file was fiction, nothing imported it, and it is exactly the
 * "endpoint written from REST convention rather than from the service" that
 * `target:doctor` warns about.
 *
 * Read off the running service on 2026-08-18 rather than guessed: each path
 * below was called and its status recorded before being written down.
 */
export const roomEndpoints = {
  /** Every room. Public — no session needed, which is what lets a spec re-read. */
  listRooms: { name: 'List rooms', method: 'GET', path: '/room', expect: [200] },
  /** One room by the id the application assigns. Never a transcribed id. */
  getRoom: { name: 'Read a room', method: 'GET', path: '/room/{roomId}', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;
