import type { ApiClient } from '../../../src/integrations/http/api-client';
import { authEndpoints, catalogueEndpoints } from '../endpoints/catalogue';

/**
 * L2 — the HTTP vocabulary: business verbs over typed endpoints, exactly as
 * `actions/` is business verbs over locators.
 *
 * A spec never reaches for raw `request.*`. A model given that freedom invents
 * endpoints, payloads and status codes with total confidence and no page to
 * contradict it — `typed-clients-only` enforces the rule, and this file is
 * what makes obeying it easy.
 *
 * Read-only. Toolshop's catalogue is shared with everyone else using the demo,
 * so these verbs describe it and never change it: a spec that created a
 * product would be changing what every other reader sees.
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  is_location_offer: boolean;
  is_rental: boolean;
}

/** The envelope the service pages everything in. */
export interface Page<T> {
  current_page: number;
  data: T[];
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export function catalogueApi(client: ApiClient) {
  return {
    /**
     * One page of the catalogue. The response is schema-checked on the way
     * through.
     *
     * The page number is optional and passed through rather than defaulted
     * here: the service's own default is page 1, and restating it would mean
     * two places to change if it ever moved. A caller asking for a specific
     * page is asking a boundary question — where the range ends, and what the
     * service does past it — which is what TOOL-4-05 is about.
     */
    async products(page?: number): Promise<Page<Product>> {
      const response = await client.call<Page<Product>>(catalogueEndpoints.listProducts, {
        ...(page === undefined ? {} : { query: { page: String(page) } }),
      });
      return response.body;
    },

    /** One product, by the id the application uses. Never a transcribed id. */
    async product(productId: string): Promise<Product> {
      const response = await client.call<Product>(catalogueEndpoints.getProduct, {
        params: { productId },
      });
      return response.body;
    },

    /**
     * Search, which returns the same envelope as the listing.
     *
     * The term goes in `q`. Named here rather than in a spec so that when the
     * service renames it, one file changes.
     */
    async search(term: string): Promise<Page<Product>> {
      const response = await client.call<Page<Product>>(catalogueEndpoints.searchProducts, {
        query: { q: term },
      });
      return response.body;
    },

    async related(productId: string): Promise<Product[]> {
      const response = await client.call<Product[]>(catalogueEndpoints.relatedProducts, {
        params: { productId },
      });
      return response.body;
    },

    /**
     * Categories, which come back as a bare array rather than in the page
     * envelope the products endpoints use. Written the way the service
     * actually answers, not the way its neighbours do.
     */
    async categories(): Promise<Category[]> {
      const response = await client.call<Category[]>(catalogueEndpoints.listCategories);
      return response.body;
    },
  };
}

export function authApi(client: ApiClient) {
  return {
    /**
     * Exchange a credential for a token.
     *
     * Returns the token rather than logging it, and the credential arrives
     * from the `secrets` fixture — the spec writes the reference, never the
     * value (§11).
     */
    async signIn(credentials: { email: string; password: string }): Promise<{ token: string }> {
      const response = await client.call<{ access_token: string }, typeof credentials>(
        authEndpoints.login,
        { body: credentials },
      );
      return { token: response.body.access_token };
    },
  };
}
