import type { ApiClient } from '../../../integrations/http/api-client';
import { catalogEndpoints } from '../endpoints/catalog';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  is_location_offer: boolean;
  is_rental: boolean;
  in_stock?: boolean;
  brand?: { id: string; name: string; slug: string };
  category?: { id: string; name: string; slug: string };
}

/** Laravel's paginator shape, which every list endpoint here returns. */
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
  sub_categories?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface ProductSpec {
  id: string;
  name: string;
  value: string;
  unit?: string | null;
}

/**
 * L2 — the catalogue over HTTP.
 *
 * Reads only, apart from `createBrand`, which exists so the suite has one
 * genuinely creating endpoint to exercise cleanup against. It tracks what it
 * creates and names the delete endpoint explicitly: `DELETE /brands/{brandId}`
 * is not the `/{id}` the framework's fallback would derive, and a cleanup that
 * silently 404s is how a shared environment fills with test data.
 */
export function catalogApi(client: ApiClient) {
  return {
    async listProducts(query: { page?: number; limit?: number } = {}): Promise<Page<Product>> {
      const response = await client.call<Page<Product>>(catalogEndpoints.listProducts, { query });
      return response.body;
    },

    async searchProducts(term: string): Promise<Page<Product>> {
      const response = await client.call<Page<Product>>(catalogEndpoints.searchProducts, {
        query: { q: term },
      });
      return response.body;
    },

    async readProduct(productId: string): Promise<Product> {
      const response = await client.call<Product>(catalogEndpoints.readProduct, {
        params: { productId },
      });
      return response.body;
    },

    /** A product id read from the service, for specs that need one to work with. */
    async firstProduct(): Promise<Product> {
      const page = await this.listProducts({ limit: 1 });
      const product = page.data[0];
      if (!product) {
        throw new Error(
          'The catalogue returned no products, so there is nothing for this test to act on. ' +
            'That is an environment problem, not a defect in the endpoint under test.',
        );
      }
      return product;
    },

    async relatedProducts(productId: string): Promise<Product[]> {
      const response = await client.call<Product[]>(catalogEndpoints.relatedProducts, {
        params: { productId },
      });
      return response.body;
    },

    async productSpecs(productId: string): Promise<ProductSpec[]> {
      const response = await client.call<ProductSpec[]>(catalogEndpoints.productSpecs, {
        params: { productId },
      });
      return response.body;
    },

    async listCategories(): Promise<Category[]> {
      const response = await client.call<Category[]>(catalogEndpoints.listCategories);
      return response.body;
    },

    async categoryTree(): Promise<Category[]> {
      const response = await client.call<Category[]>(catalogEndpoints.categoryTree);
      return response.body;
    },

    async listBrands(): Promise<Brand[]> {
      const response = await client.call<Brand[]>(catalogEndpoints.listBrands);
      return response.body;
    },

    async readBrand(brandId: string): Promise<Brand> {
      const response = await client.call<Brand>(catalogEndpoints.readBrand, {
        params: { brandId },
      });
      return response.body;
    },

    /** Create a brand, and register it for deletion at the end of the test. */
    async createBrand(brand: { name: string; slug: string }): Promise<Brand> {
      const response = await client.call<Brand, { name: string; slug: string }>(
        catalogEndpoints.createBrand,
        { body: brand },
      );
      client.track(catalogEndpoints.createBrand, response.body.id, catalogEndpoints.deleteBrand);
      return response.body;
    },

    /**
     * The transport-level facts about the product list: content type and cache
     * directives. A large class of real contract lives only in headers, and
     * this is how a spec gets at them without a second, untyped call.
     */
    async listProductsTransport(): Promise<{ status: number; headers: Record<string, string> }> {
      const response = await client.call<Page<Product>>(catalogEndpoints.listProducts, {
        query: { limit: 1 },
      });
      return { status: response.status, headers: response.headers };
    },

    /** Read a product that does not exist, to check how the service refuses. */
    async readMissingProduct(productId: string): Promise<{ status: number; body: unknown }> {
      const response = await client.call<unknown>(catalogEndpoints.readProduct, {
        params: { productId },
        expect: [404],
      });
      return { status: response.status, body: response.body };
    },
  };
}
