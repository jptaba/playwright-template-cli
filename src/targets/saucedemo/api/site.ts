import type { ApiClient } from '../../../integrations/http/api-client';
import { siteEndpoints } from '../endpoints/site';

/**
 * L2 — the HTTP vocabulary. Business verbs over typed endpoints; returns data,
 * asserts nothing, exactly like the UI actions do.
 */
export interface HttpSurface {
  status: number;
  contentType: string;
  /** Lower-cased header names, as servers disagree about casing. */
  headers: Record<string, string>;
  body: string;
  bytes: number;
}

export function siteApi(client: ApiClient) {
  const surfaceOf = (response: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }): HttpSurface => {
    const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? '');
    const headers = response.headers ?? {};
    return {
      status: response.status,
      contentType: headers['content-type'] ?? '',
      headers,
      body,
      bytes: Buffer.byteLength(body),
    };
  };

  return {
    /** The sign-in document, as served. */
    async landing(): Promise<HttpSurface> {
      return surfaceOf(await client.call<string>(siteEndpoints.landing));
    },

    /** The product listing document. Served to anyone — the app gates in JS. */
    async inventoryDocument(): Promise<HttpSurface> {
      return surfaceOf(await client.call<string>(siteEndpoints.inventory));
    },

    /** What the host does with a path that does not exist. */
    async missingPath(nonce: string): Promise<HttpSurface> {
      return surfaceOf(await client.call<string>(siteEndpoints.missing, { params: { nonce } }));
    },

    /** Fetch an asset the document actually references, by its resolved path. */
    async asset(path: string): Promise<HttpSurface> {
      return surfaceOf(
        await client.call<string>(
          { name: `Fetch ${path}`, method: 'GET', path, expect: [200] },
        ),
      );
    },
  };
}
