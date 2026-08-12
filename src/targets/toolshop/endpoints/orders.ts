import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — carts, invoices, payment and the administrator's sales reports.
 *
 * The pair worth pointing at is `downloadInvoicePdf` and
 * `invoicePdfStatus`: rendering is asynchronous, and the service publishes a
 * separate status endpoint precisely so a consumer can ask whether the document
 * is ready yet. That is the shape `expect.poll` exists for, and it is why this
 * suite has no reason to reach for a fixed wait anywhere.
 */
export const cartEndpoints = {
  create: { name: 'Open a cart', method: 'POST', path: '/carts', expect: [201] },
  read: { name: 'Read the cart', method: 'GET', path: '/carts/{cartId}', expect: [200] },
  addProduct: { name: 'Add a product to the cart', method: 'POST', path: '/carts/{id}', expect: [200] },
  changeQuantity: {
    name: 'Change a cart line’s quantity',
    method: 'PUT',
    path: '/carts/{cartId}/product/quantity',
    expect: [200],
  },
  removeProduct: {
    name: 'Remove a product from the cart',
    method: 'DELETE',
    path: '/carts/{cartId}/product/{productId}',
    expect: [204],
  },
  discard: { name: 'Discard the cart', method: 'DELETE', path: '/carts/{cartId}', expect: [204] },
} satisfies Record<string, EndpointDescriptor>;

export const invoiceEndpoints = {
  create: { name: 'Place an order', method: 'POST', path: '/invoices', expect: [200] },
  list: { name: 'List invoices', method: 'GET', path: '/invoices', expect: [200] },
  read: { name: 'Read one invoice', method: 'GET', path: '/invoices/{invoiceId}', expect: [200] },
  search: { name: 'Search invoices', method: 'GET', path: '/invoices/search', expect: [200] },
  updateStatus: {
    name: 'Move an invoice to the next status',
    method: 'PUT',
    path: '/invoices/{invoiceId}/status',
    expect: [200],
  },
  /** Asynchronous: 200 means "ready", and the status endpoint says when. */
  downloadPdf: {
    name: 'Download an invoice as PDF',
    method: 'GET',
    path: '/invoices/{invoice_number}/download-pdf',
    expect: [200],
  },
  pdfStatus: {
    name: 'Check whether the invoice PDF has rendered',
    method: 'GET',
    path: '/invoices/{invoice_number}/download-pdf-status',
    expect: [200],
  },
} satisfies Record<string, EndpointDescriptor>;

export const paymentEndpoints = {
  check: { name: 'Validate payment details', method: 'POST', path: '/payment/check', expect: [200] },
} satisfies Record<string, EndpointDescriptor>;

/**
 * Administrator reporting. Every one of these answers 401 without a token,
 * which is the cheapest possible check that an authorisation boundary exists
 * at all — and the one most often missing from a suite that only ever calls
 * endpoints while signed in.
 */
export const reportEndpoints = {
  totalSalesPerCountry: {
    name: 'Report: total sales per country',
    method: 'GET',
    path: '/reports/total-sales-per-country',
    expect: [200],
  },
  totalSalesOfYears: {
    name: 'Report: total sales by year',
    method: 'GET',
    path: '/reports/total-sales-of-years',
    expect: [200],
  },
  averageSalesPerMonth: {
    name: 'Report: average sales per month',
    method: 'GET',
    path: '/reports/average-sales-per-month',
    expect: [200],
  },
  averageSalesPerWeek: {
    name: 'Report: average sales per week',
    method: 'GET',
    path: '/reports/average-sales-per-week',
    expect: [200],
  },
  topPurchasedProducts: {
    name: 'Report: ten most purchased products',
    method: 'GET',
    path: '/reports/top10-purchased-products',
    expect: [200],
  },
  topSellingCategories: {
    name: 'Report: ten best-selling categories',
    method: 'GET',
    path: '/reports/top10-best-selling-categories',
    expect: [200],
  },
  customersByCountry: {
    name: 'Report: customers by country',
    method: 'GET',
    path: '/reports/customers-by-country',
    expect: [200],
  },
} satisfies Record<string, EndpointDescriptor>;
