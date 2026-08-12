import type { ApiClient } from '../../../integrations/http/api-client';
import { favoriteEndpoints, lookupEndpoints, messageEndpoints } from '../endpoints/engagement';

export interface ContactMessage {
  id: string;
  name?: string;
  email: string;
  subject: string;
  message: string;
  status?: string;
}

export interface Favorite {
  id: string;
  product_id?: string;
  product?: { id: string; name: string };
}

/**
 * L2 — contact messages, favourites and the postcode lookup over HTTP.
 *
 * `send` deliberately does *not* track the message for cleanup: the endpoint
 * publishes no delete, so registering one would produce a cleanup warning on
 * every run and teach whoever reads the log to ignore it. Where an application
 * offers no way to remove what it created, the honest thing is to say so here
 * rather than to pretend the suite tidies up after itself.
 */
export function engagementApi(client: ApiClient) {
  return {
    async send(enquiry: {
      first_name?: string;
      last_name?: string;
      email: string;
      subject: string;
      message: string;
    }): Promise<ContactMessage> {
      const response = await client.call<ContactMessage, typeof enquiry>(messageEndpoints.send, {
        body: enquiry,
      });
      return response.body;
    },

    async listMessages(): Promise<{ data: ContactMessage[] }> {
      const response = await client.call<{ data: ContactMessage[] }>(messageEndpoints.list);
      return response.body;
    },

    async readMessage(messageId: string): Promise<ContactMessage> {
      const response = await client.call<ContactMessage>(messageEndpoints.read, {
        params: { messageId },
      });
      return response.body;
    },

    // ---- favourites ----------------------------------------------------------
    async listFavourites(): Promise<Favorite[]> {
      const response = await client.call<Favorite[]>(favoriteEndpoints.list);
      return response.body;
    },

    async addFavourite(productId: string): Promise<Favorite> {
      const response = await client.call<Favorite, { product_id: string }>(favoriteEndpoints.add, {
        body: { product_id: productId },
      });
      if (response.body.id) {
        client.track(favoriteEndpoints.add, response.body.id, favoriteEndpoints.remove);
      }
      return response.body;
    },

    /**
     * Create a favourite against the first candidate the service accepts, and
     * report the status it answered with.
     *
     * Walks the candidates rather than taking one, because the account is
     * shared: between reading the favourites list and posting to it, another
     * worker — or another *project*, since `api` and `contract` run in
     * parallel — may have taken the product this call was going to use. A
     * worker-index partition is not enough for that, since worker 0 of one
     * project and worker 0 of another pick the same slot.
     *
     * Retrying past a 409 is contention handling, not a retry-until-green: the
     * status returned is the one from the call that actually created a record,
     * which is the fact the caller asked for.
     */
    async createFavouriteStatus(candidates: string[]): Promise<number> {
      for (const productId of candidates) {
        const response = await client.call<Favorite, { product_id: string }>(
          favoriteEndpoints.add,
          { body: { product_id: productId }, expect: [200, 201, 409, 422] },
        );
        if (response.status === 409 || response.status === 422) continue;
        if (response.body?.id) {
          client.track(favoriteEndpoints.add, response.body.id, favoriteEndpoints.remove);
        }
        return response.status;
      }
      throw new Error(
        `All ${candidates.length} candidates were already in this account's favourites, so no ` +
          'favourite was created and there is no status to report. Widen the candidate list — ' +
          'this is an environment problem, not a defect in the endpoint.',
      );
    },

    /**
     * A product this account has *not* already favourited.
     *
     * The account is shared and long-lived, so "pick the first product" put the
     * suite straight into a 409 the moment any earlier run — or the UI spec
     * that saves a favourite — had already saved it. Deriving the starting
     * state from the application rather than assuming it is the only version of
     * this that keeps working on an environment nobody resets.
     */
    async unfavouritedProductId(candidates: string[], skip = 0): Promise<string> {
      const saved = await this.listFavourites();
      const already = new Set(saved.map((entry) => entry.product?.id ?? entry.product_id));
      const free = candidates.filter((id) => !already.has(id));
      /*
         `skip` partitions the free products between parallel workers.

         This target declares `accountPool: 'static'`, so every worker signs in
         as the same customer and shares one favourites list. Two specs both
         taking "the first product not yet favourited" picked the same one and
         raced: whichever added it second got a 409, and the failure read as a
         defect in the endpoint rather than as two tests contending for one
         record. Giving each worker its own slice of the candidates costs one
         argument and removes the whole class.
      */
      const chosen = free[skip % Math.max(free.length, 1)];
      if (!chosen) {
        throw new Error(
          `All ${candidates.length} candidate products are already in this account's favourites, ` +
            'so there is nothing for this test to add. Widen the candidate list, or clear the ' +
            'account — this is an environment problem, not a defect in the endpoint.',
        );
      }
      return chosen;
    },

    /** Make sure a product is not favourited, so an "add" spec starts clean. */
    async ensureNotFavourited(productId: string): Promise<void> {
      const saved = await this.listFavourites();
      const existing = saved.find((entry) => (entry.product?.id ?? entry.product_id) === productId);
      if (existing) await this.removeFavourite(existing.id);
    },

    async removeFavourite(favoriteId: string): Promise<void> {
      await client.call<unknown>(favoriteEndpoints.remove, { params: { favoriteId } });
    },

    /** How the service refuses a favourite it has already been given. */
    async addDuplicateFavourite(productId: string): Promise<number> {
      const response = await client.call<unknown, { product_id: string }>(favoriteEndpoints.add, {
        body: { product_id: productId },
        expect: [409, 422],
      });
      return response.status;
    },

    // ---- lookup --------------------------------------------------------------
    async lookupPostcode(postcode: string, houseNumber: string): Promise<unknown> {
      const response = await client.call<unknown>(lookupEndpoints.postcode, {
        query: { postcode, house_number: houseNumber },
      });
      return response.body;
    },
  };
}
