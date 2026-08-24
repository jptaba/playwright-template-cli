import type { ApiClient } from '../../../src/integrations/http/api-client';
import { orderEndpoints } from '../endpoints/orders';

export interface NewOrder {
  reference: string;
}

export interface Order extends NewOrder {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

/**
 * L2 — the HTTP vocabulary: business verbs over typed endpoints, exactly as
 * `actions/` is business verbs over locators.
 *
 * Written as a factory because the client is injected. The capability catalog
 * understands both this shape and a plain exported object.
 */
export function ordersApi(client: ApiClient) {
  return {
    /** Create an order and register it for cleanup at the end of the test. */
    async create(order: NewOrder): Promise<Order> {
      const response = await client.call<Order, NewOrder & { runTag: string }>(
        orderEndpoints.create,
        { body: { ...order, runTag: client.runTag } },
      );
      client.track(orderEndpoints.create, response.body.id);
      return response.body;
    },

    /** Read one order. The response is schema-checked on the way through. */
    async get(id: string): Promise<Order> {
      const response = await client.call<Order>(orderEndpoints.get, { params: { id } });
      return response.body;
    },
  };
}
