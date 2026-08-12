import type { ApiClient } from '../../../integrations/http/api-client';
import { cartEndpoints, invoiceEndpoints, paymentEndpoints, reportEndpoints } from '../endpoints/orders';

export interface Cart {
  id: string;
}

export interface CartContents {
  id: string;
  cart_items: { product_id: string; quantity: number; discount_percentage?: number | null }[];
  additional_discount_percentage?: number | null;
}

export interface InvoiceLine {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  billing_street: string;
  billing_city: string;
  billing_country: string;
  total: number;
  status?: string;
  invoicelines?: InvoiceLine[];
}

export interface PdfStatus {
  /** `true` once the rendered document is ready to download. */
  ready?: boolean;
  status?: string;
  message?: string;
}

/**
 * L2 — carts, orders and the administrator's reports over HTTP.
 *
 * `waitForInvoicePdf` is the shape this whole framework's "no fixed waits" rule
 * exists for. Rendering the document is asynchronous and the service publishes
 * a status endpoint saying whether it has finished; the honest way to consume
 * that is to poll the fact, not to sleep for a number somebody guessed.
 */
export function ordersApi(client: ApiClient) {
  return {
    async openCart(): Promise<Cart> {
      const response = await client.call<Cart>(cartEndpoints.create);
      client.track(cartEndpoints.create, response.body.id, cartEndpoints.discard);
      return response.body;
    },

    async addProduct(cartId: string, productId: string, quantity = 1): Promise<void> {
      await client.call<unknown, { product_id: string; quantity: number }>(cartEndpoints.addProduct, {
        params: { id: cartId },
        body: { product_id: productId, quantity },
      });
    },

    async readCart(cartId: string): Promise<CartContents> {
      const response = await client.call<CartContents>(cartEndpoints.read, {
        params: { cartId },
      });
      return response.body;
    },

    async changeQuantity(cartId: string, productId: string, quantity: number): Promise<void> {
      await client.call<unknown, { product_id: string; quantity: number }>(
        cartEndpoints.changeQuantity,
        { params: { cartId }, body: { product_id: productId, quantity } },
      );
    },

    async removeProduct(cartId: string, productId: string): Promise<void> {
      await client.call<unknown>(cartEndpoints.removeProduct, {
        params: { cartId, productId },
      });
    },

    // ---- invoices ------------------------------------------------------------
    async listInvoices(query: { page?: number } = {}): Promise<{ data: Invoice[]; total: number }> {
      const response = await client.call<{ data: Invoice[]; total: number }>(
        invoiceEndpoints.list,
        { query },
      );
      return response.body;
    },

    async readInvoice(invoiceId: string): Promise<Invoice> {
      const response = await client.call<Invoice>(invoiceEndpoints.read, { params: { invoiceId } });
      return response.body;
    },

    /**
     * Whether the rendered PDF for an invoice is ready yet. Returned as data so
     * a spec can poll it with `expect.poll` and fail as a clear assertion
     * rather than as a hung test.
     */
    async pdfStatus(invoiceNumber: string): Promise<PdfStatus> {
      const response = await client.call<PdfStatus>(invoiceEndpoints.pdfStatus, {
        params: { invoice_number: invoiceNumber },
      });
      return response.body;
    },

    /** The PDF's content type, which is the assertable half of a binary download. */
    async downloadPdfContentType(invoiceNumber: string): Promise<string> {
      const response = await client.call<unknown>(invoiceEndpoints.downloadPdf, {
        params: { invoice_number: invoiceNumber },
      });
      return response.headers['content-type'] ?? '';
    },

    // ---- payment -------------------------------------------------------------
    async checkPayment(details: Record<string, unknown>): Promise<{ message?: string }> {
      const response = await client.call<{ message?: string }, Record<string, unknown>>(
        paymentEndpoints.check,
        { body: details },
      );
      return response.body;
    },

    // ---- reports -------------------------------------------------------------
    async totalSalesPerCountry(): Promise<unknown[]> {
      const response = await client.call<unknown[]>(reportEndpoints.totalSalesPerCountry);
      return response.body;
    },

    async totalSalesOfYears(): Promise<unknown[]> {
      const response = await client.call<unknown[]>(reportEndpoints.totalSalesOfYears);
      return response.body;
    },

    async topPurchasedProducts(): Promise<unknown[]> {
      const response = await client.call<unknown[]>(reportEndpoints.topPurchasedProducts);
      return response.body;
    },

    async customersByCountry(): Promise<unknown[]> {
      const response = await client.call<unknown[]>(reportEndpoints.customersByCountry);
      return response.body;
    },

    /**
     * Call a report without a credential and report how it refuses. Every
     * report endpoint should refuse identically, and the cheapest way to prove
     * an authorisation boundary exists is to walk them all.
     */
    async reportStatusWithoutCredential(
      report: keyof typeof reportEndpoints,
    ): Promise<number> {
      const response = await client.call<unknown>(reportEndpoints[report], { expect: [401] });
      return response.status;
    },

    /**
     * How a report answers whoever this client is currently signed in as.
     *
     * Kept in the vocabulary rather than inlined in a spec: a spec reaching for
     * `api.call` with an endpoint literal is the same failure `typed-clients-only`
     * exists to prevent, one layer up. The endpoint, the accepted statuses and
     * the shape all belong here.
     */
    async reportStatusForCurrentCaller(report: keyof typeof reportEndpoints): Promise<number> {
      const response = await client.call<unknown>(reportEndpoints[report], {
        expect: [200, 401, 403],
      });
      return response.status;
    },
  };
}
