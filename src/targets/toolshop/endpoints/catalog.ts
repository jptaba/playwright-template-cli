import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — the catalogue: products, categories, brands, specifications and images.
 *
 * Note `createProduct` expects **200**, not the 201 a reader would assume.
 * That is what the published document says, and a descriptor that "corrected"
 * it would turn a successful create into an `ApiError` on every call. Where the
 * document and the convention disagree, the document is the contract.
 */
export const catalogEndpoints = {
  listProducts: { name: 'List products', method: 'GET', path: '/products', expect: [200] },
  searchProducts: { name: 'Search products', method: 'GET', path: '/products/search', expect: [200] },
  readProduct: { name: 'Read one product', method: 'GET', path: '/products/{productId}', expect: [200] },
  relatedProducts: {
    name: 'Read related products',
    method: 'GET',
    path: '/products/{productId}/related',
    expect: [200],
  },
  createProduct: { name: 'Create a product', method: 'POST', path: '/products', expect: [200] },
  updateProduct: { name: 'Replace a product', method: 'PUT', path: '/products/{productId}', expect: [200] },
  deleteProduct: {
    name: 'Delete a product',
    method: 'DELETE',
    path: '/products/{productId}',
    expect: [204],
  },

  productSpecs: {
    name: 'Read a product’s specifications',
    method: 'GET',
    path: '/products/{productId}/specs',
    expect: [200],
  },
  specNames: {
    name: 'List specification names',
    method: 'GET',
    path: '/product-specs/names',
    expect: [200],
  },

  listCategories: { name: 'List categories', method: 'GET', path: '/categories', expect: [200] },
  categoryTree: { name: 'Read the category tree', method: 'GET', path: '/categories/tree', expect: [200] },
  searchCategories: {
    name: 'Search categories',
    method: 'GET',
    path: '/categories/search',
    expect: [200],
  },

  listBrands: { name: 'List brands', method: 'GET', path: '/brands', expect: [200] },
  readBrand: { name: 'Read one brand', method: 'GET', path: '/brands/{brandId}', expect: [200] },
  searchBrands: { name: 'Search brands', method: 'GET', path: '/brands/search', expect: [200] },
  createBrand: { name: 'Create a brand', method: 'POST', path: '/brands', expect: [201] },
  deleteBrand: { name: 'Delete a brand', method: 'DELETE', path: '/brands/{brandId}', expect: [204] },

  listImages: { name: 'List product images', method: 'GET', path: '/images', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;
