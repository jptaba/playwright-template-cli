import type { ApiClient } from '../../../integrations/http/api-client';
import { roomEndpoints } from '../endpoints/rooms';

/**
 * L2 — the HTTP vocabulary for rooms: business verbs over typed endpoints.
 *
 * **Read-only, deliberately.** Creating a room needs the admin session, and
 * the UI already has a verb for that; a second way to create the same record
 * is two things to keep in step. What this exists for is *re-reading* — asking
 * the service whether what the UI did actually persisted, which is the audit
 * question and needs no session at all.
 */

export interface Room {
  roomid: number;
  roomName: string;
  type: string;
  accessible: boolean;
  roomPrice: number;
  features: string[];
  description: string;
}

export function roomsApi(client: ApiClient) {
  return {
    /** Every room the service knows about. */
    async all(): Promise<Room[]> {
      const response = await client.call<{ rooms: Room[] }>(roomEndpoints.listRooms);
      return response.body.rooms ?? [];
    },

    /**
     * One room, by the id the service assigned it.
     *
     * The id is derived from a listing rather than written down — a
     * transcribed id is a hallucinated locator wearing a different hat, and it
     * fails silently when the demo is reseeded.
     */
    async byId(roomId: number): Promise<Room> {
      const response = await client.call<Room>(roomEndpoints.getRoom, {
        params: { roomId: String(roomId) },
      });
      return response.body;
    },

    /** The room with this name, or null. Named rather than indexed. */
    async byName(name: string): Promise<Room | null> {
      return (await this.all()).find((room) => room.roomName === name) ?? null;
    },
  };
}
