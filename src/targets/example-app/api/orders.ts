import type { ApiClient } from '../../../integrations/http/api-client';
import { orderEndpoints } from '../endpoints/orders';

export interface NewOrder {
  reference: string;
  customerId: string;
}

export interface Order extends NewOrder {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  total: number;
}

/**
 * L2 — TEMPLATE. The HTTP vocabulary: business verbs over typed endpoints,
 * exactly as `actions/` is business verbs over locators.
 *
 * Written as a factory because the client is injected. The capability catalog
 * understands both this shape and a plain exported object, so either is fine.
 *
 * A spec must never reach for raw `request.*` — a model given that freedom
 * invents endpoints, payloads and status codes with total confidence and no
 * page to contradict it. `typed-clients-only` enforces it.
 */
export function ordersApi(client: ApiClient) {
  return {
    /** Create an order and register it for cleanup at the end of the test. */
    async create(order: NewOrder): Promise<Order> {
      const response = await client.call<Order, NewOrder & { runTag: string }>(
        orderEndpoints.create,
        { body: { ...order, runTag: client.runTag } },
      );
      // Everything created gets cleaned up: API setup is fast enough to be
      // used everywhere, so it generates data at a rate UI tests never did.
      client.track(orderEndpoints.create, response.body.id);
      return response.body;
    },

    /** Read one order. The response is schema-checked on the way through. */
    async get(id: string): Promise<Order> {
      const response = await client.call<Order>(orderEndpoints.get, { params: { id } });
      return response.body;
    },

    /** Cancel an order. Used by teardown as well as by specs about cancelling. */
    async cancel(id: string): Promise<void> {
      await client.call(orderEndpoints.cancel, { params: { id } });
    },
  };
}
