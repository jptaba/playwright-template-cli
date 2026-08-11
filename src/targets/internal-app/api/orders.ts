import type { ApiClient } from '../../../integrations/http/api-client';
import { orderEndpoints } from '../endpoints/orders';

/**
 * L2 — the HTTP vocabulary. Business verbs over typed endpoints, exactly like
 * `actions/` is business verbs over locators. Returns data, asserts nothing.
 *
 * "A model asked to write an API test with a raw `request.post` available will
 * invent endpoints, payload shapes and status codes with total confidence and
 * no page to contradict it. A typed client generated from the same catalog the
 * UI actions live in turns that back into multiple choice." (§05)
 */

export interface OrderLine {
  sku: string;
  quantity: number;
}

export interface NewOrder {
  reference: string;
  customerId: string;
  lines: OrderLine[];
}

export interface Order extends NewOrder {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  total: number;
  createdAt: string;
}

export function ordersApi(client: ApiClient) {
  return {
    /**
     * Create an order and register it for cleanup. Setup over the API is
     * seconds rather than a five-step UI wizard — which is exactly why it
     * generates data at a rate UI tests never did, and why every record is
     * tagged with the run id and removed in teardown (§05).
     */
    async create(order: NewOrder): Promise<Order> {
      const response = await client.call<Order, NewOrder & { runTag: string }>(
        orderEndpoints.create,
        { body: { ...order, runTag: client.runTag } },
      );
      client.track(orderEndpoints.create, response.body.id);
      return response.body;
    },

    /** Read one order by id, validated against the published schema. */
    async get(id: string): Promise<Order> {
      const response = await client.call<Order>(orderEndpoints.get, { params: { id } });
      return response.body;
    },

    /** Every order a customer has placed, newest first as the service returns them. */
    async listForCustomer(customerId: string): Promise<Order[]> {
      const response = await client.call<{ items: Order[] }>(orderEndpoints.list, {
        query: { customerId },
      });
      return response.body.items;
    },

    /** Cancel an order. Used by teardown as well as by specs about cancelling. */
    async cancel(id: string): Promise<void> {
      await client.call(orderEndpoints.cancel, { params: { id } });
    },

    /** A deliberate negative call: the spec asserts the status, not this. */
    async attemptCreateInvalid(order: Partial<NewOrder>): Promise<{ status: number; body: unknown }> {
      const response = await client.call<unknown, Partial<NewOrder>>(orderEndpoints.create, {
        body: order,
        expect: [201, 400, 422],
      });
      return { status: response.status, body: response.body };
    },
  };
}
