/**
 * The dashboard's routing and its refusals — §08.
 *
 * Lifted out of the onboarding server so every page added after it inherits the
 * same guards instead of restating them. Onboarding proved the shape: routing
 * and validation in a module with no socket and no filesystem, and the tool
 * around it doing nothing but I/O.
 *
 * Two checks apply to everything that writes, and both are load-bearing. The
 * server binds to loopback, which stops the network — but a page on any origin
 * can still POST to `http://127.0.0.1:<port>`, and these endpoints write to the
 * repository, start browsers and hold credentials. The `Host` check and the
 * per-run token are what stop a tab in the background doing any of that.
 */

export interface UiRequest {
  method: string;
  path: string;
  /** Parsed JSON body, or null. */
  body: unknown;
  /** Value of the `x-onboard-token` header the page sent back. */
  token: string | null;
  /** The request's `Host` header. */
  host: string | null;
}

export interface UiResponse {
  status: number;
  contentType: string;
  body: string;
}

export type RouteHandler = (request: UiRequest) => Promise<UiResponse> | UiResponse;

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  /**
   * True for the pages themselves: a browser asking for a page cannot carry a
   * token it has not been given yet. Only reads may be public, and a public
   * route must not change anything.
   */
  public?: boolean;
  handle: RouteHandler;
}

const JSON_TYPE = 'application/json; charset=utf-8';
export const HTML_TYPE = 'text/html; charset=utf-8';

export function json(status: number, value: unknown): UiResponse {
  return { status, contentType: JSON_TYPE, body: JSON.stringify(value) };
}

export function failure(status: number, message: string): UiResponse {
  return json(status, { error: message });
}

export function html(body: string): UiResponse {
  return { status: 200, contentType: HTML_TYPE, body };
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export interface RouterOptions {
  token: string;
  /** Turns a thrown error into a response. Defaults to a 500 with its message. */
  onError?: (error: unknown) => UiResponse;
}

/**
 * Build the request handler from a route table.
 *
 * Routes are matched on an exact path. There is no pattern matching and no
 * parameters in the path: everything this serves takes its arguments in a JSON
 * body, which keeps the matching trivial and leaves no route that is
 * accidentally reachable by a URL somebody constructed.
 */
export function createRouter(routes: readonly Route[], options: RouterOptions) {
  const table = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));

  return async function handle(request: UiRequest): Promise<UiResponse> {
    const route = table.get(`${request.method} ${request.path}`);

    if (!route) {
      const otherMethod = routes.some((candidate) => candidate.path === request.path);
      return otherMethod
        ? failure(405, `${request.method} ${request.path} is not something this serves.`)
        : failure(404, `No route for ${request.path}.`);
    }

    if (!route.public) {
      if (!request.host || !LOOPBACK.test(request.host)) {
        return failure(403, 'This server answers loopback requests only.');
      }
      if (request.token !== options.token) {
        return failure(403, 'Missing or stale session token. Reload the page.');
      }
    }

    try {
      return await route.handle(request);
    } catch (error) {
      return options.onError
        ? options.onError(error)
        : failure(500, error instanceof Error ? error.message : String(error));
    }
  };
}
