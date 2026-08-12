import type { Diagnostic } from './diagnose';
import type { ProbedSignIn, ProbeResult, SignInVerification } from './probe';
import { planScaffold, ScaffoldError, type ScaffoldOptions, type ScaffoldPlan } from './scaffold';

/**
 * The onboarding dashboard — a second front end onto the same scaffolder.
 *
 * `npm run target:new` is complete and will stay. What it cannot do is answer
 * the questions it asks you: which attribute does `getByTestId` read here, what
 * are the accessible names on the sign-in form, does this service publish an
 * OpenAPI document. Onboarding the third application, those answers cost more
 * than everything else put together, and two of the three were got wrong on the
 * first attempt.
 *
 * So this is not a prettier `target:new`. It is `target:new` with the
 * application in front of it: it drives a browser at the running system, fills
 * in what it can read, shows what it could not, and writes the profile, the
 * pack, the vendored contract document and the credential entries in one go.
 * The intended outcome is that `TARGET=<app> npx playwright test
 * --project=setup:auth` passes with **no file edited by hand**.
 *
 * Routing and validation live here, over an injected service, so every rule can
 * be tested without opening a socket. `tools/onboard.ts` is the socket and
 * nothing else — the same split that keeps `parseScaffoldArgs` testable while
 * the CLI around it calls `process.exit`.
 */

export interface DashboardRequest {
  method: string;
  path: string;
  /** Parsed JSON body, or null. */
  body: unknown;
  /** The value the page sent back in `x-onboard-token`. */
  token: string | null;
  /** The request's `Host` header, checked against loopback. */
  host: string | null;
}

export interface DashboardResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface CreateResult {
  written: string[];
  /** Files that already existed and were therefore left alone. */
  skipped: string[];
  credentialPaths: string[];
  diagnostics: Diagnostic[];
  nextSteps: string[];
}

/** Everything the dashboard needs the outside world to do for it. */
export interface DashboardService {
  page(): string;
  existingTargets(): string[];
  probe(input: { baseURL: string; apiBaseURL?: string }): Promise<ProbeResult>;
  /**
   * Sign in once with the credentials the operator supplied, to prove the
   * probed locators work and to derive the one locator that cannot be read
   * from a page at rest.
   */
  verify(input: {
    baseURL: string;
    signIn: ProbedSignIn;
    credentials: { username: string; password: string };
  }): Promise<SignInVerification>;
  /** Which of a plan's files are already on disk. Nothing is ever overwritten. */
  existing(paths: string[]): string[];
  create(
    plan: ScaffoldPlan,
    options: ScaffoldOptions,
    credentials: Record<string, { username: string; password: string }>,
  ): Promise<CreateResult>;
}

const JSON_TYPE = 'application/json; charset=utf-8';

function json(status: number, value: unknown): DashboardResponse {
  return { status, contentType: JSON_TYPE, body: JSON.stringify(value) };
}

function failure(status: number, message: string): DashboardResponse {
  return json(status, { error: message });
}

/**
 * Hosts a request may claim to be for.
 *
 * The server binds to loopback, but a browser page on any origin can still
 * POST to `http://127.0.0.1:<port>` — and this endpoint writes files. Checking
 * `Host` and requiring a token minted at startup is what stops a page in
 * another tab scaffolding a target, or worse, reading back what it wrote.
 */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * A URL the dashboard is willing to drive a browser at.
 *
 * The same refusal `no-hardcoded-urls` and the profile allowlist exist for,
 * applied at the one moment there is no profile yet to consult. It is
 * deliberately narrow: the point is not to guess which environments are
 * production, it is to refuse the shapes that are never a test environment
 * anybody meant to type.
 */
export function validateProbeTarget(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // No example host in the message: `no-hardcoded-urls` forbids one in
    // framework code, and it is right to — an example is how a default gets
    // copied into a profile.
    return { error: `'${raw}' is not a URL. Include the scheme — https or http.` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `'${url.protocol}' is not a scheme this can drive. Use http or https.` };
  }
  if (!url.hostname) return { error: 'That URL has no host.' };
  return { url };
}

export interface RouteOptions {
  token: string;
  service: DashboardService;
}

export async function handleDashboardRequest(
  request: DashboardRequest,
  options: RouteOptions,
): Promise<DashboardResponse> {
  const { service, token } = options;

  if (request.method === 'GET' && (request.path === '/' || request.path === '/index.html')) {
    return { status: 200, contentType: 'text/html; charset=utf-8', body: service.page() };
  }

  if (request.method !== 'POST') {
    return failure(405, `${request.method} ${request.path} is not something this serves.`);
  }

  // Both checks are cheap and both are load-bearing: this endpoint writes to
  // the repository, so a page in another tab must not be able to reach it.
  if (!request.host || !LOOPBACK.test(request.host)) {
    return failure(403, 'This server answers loopback requests only.');
  }
  if (request.token !== token) {
    return failure(403, 'Missing or stale session token. Reload the page.');
  }

  const body = (request.body ?? {}) as Record<string, unknown>;

  try {
    switch (request.path) {
      case '/api/targets':
        return json(200, { targets: service.existingTargets() });

      case '/api/probe': {
        const baseURL = String(body.baseURL ?? '').trim();
        const checked = validateProbeTarget(baseURL);
        if ('error' in checked) return failure(400, checked.error);

        const apiBaseURL = String(body.apiBaseURL ?? '').trim();
        if (apiBaseURL) {
          const checkedApi = validateProbeTarget(apiBaseURL);
          if ('error' in checkedApi) return failure(400, checkedApi.error);
        }
        if (body.confirmedTestEnvironment !== true) {
          return failure(
            400,
            'Confirm this is a test environment before probing. This drives a real browser at ' +
              'the host, signs nothing in, but does load pages.',
          );
        }
        return json(200, await service.probe({ baseURL, ...(apiBaseURL ? { apiBaseURL } : {}) }));
      }

      case '/api/verify': {
        const baseURL = String(body.baseURL ?? '').trim();
        const checked = validateProbeTarget(baseURL);
        if ('error' in checked) return failure(400, checked.error);

        const signIn = body.signIn as Record<string, unknown> | undefined;
        if (!signIn?.username || !signIn.password) {
          return failure(400, 'Verifying a sign-in needs the two field names the probe read.');
        }
        const credentials = readCredentials({ role: body.credentials })['role'];
        if (!credentials) {
          return failure(400, 'Verifying a sign-in needs a username and a password.');
        }

        /*
           The response carries the derived marker and a sentence, and never the
           credential it was given. This body is rendered into a panel the
           operator may well screenshot.
        */
        return json(
          200,
          await service.verify({
            baseURL,
            signIn: {
              username: String(signIn.username),
              password: String(signIn.password),
              submit: String(signIn.submit ?? 'Sign in'),
              path: String(signIn.path ?? '/'),
            },
            credentials,
          }),
        );
      }

      case '/api/plan': {
        const scaffoldOptions = readScaffoldOptions(body);
        const plan = planScaffold(scaffoldOptions);
        return json(200, {
          files: plan.files.map((file) => file.path),
          conflicts: service.existing(plan.files.map((file) => file.path)),
          credentialPaths: plan.credentialPaths,
          nextSteps: plan.nextSteps,
        });
      }

      case '/api/create': {
        const scaffoldOptions = readScaffoldOptions(body);
        const plan = planScaffold(scaffoldOptions);

        const conflicts = service.existing(plan.files.map((file) => file.path));
        if (conflicts.length > 0) {
          // Same refusal as the CLI: onboarding is additive, and a scaffolder
          // that can clobber a real target pack is one nobody runs twice.
          return failure(
            409,
            `Refusing to overwrite ${conflicts.length} existing file(s): ${conflicts
              .slice(0, 5)
              .join(', ')}${conflicts.length > 5 ? ' …' : ''}. Choose another target name, or ` +
              'delete the pack you meant to replace.',
          );
        }

        const credentials = readCredentials(body.credentials);
        return json(200, await service.create(plan, scaffoldOptions, credentials));
      }

      default:
        return failure(404, `No route for ${request.path}.`);
    }
  } catch (error) {
    if (error instanceof ScaffoldError) return failure(400, error.message);
    return failure(500, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Read scaffold options off a request body.
 *
 * Every value is taken deliberately rather than by spreading the body into the
 * planner: the body is untrusted input arriving over HTTP, and `planScaffold`
 * renders its arguments into TypeScript source that this repository then
 * executes. Spreading would make any future option settable by anyone who can
 * reach the port.
 */
function readScaffoldOptions(body: Record<string, unknown>): ScaffoldOptions {
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];

  const include = (body.include ?? {}) as Record<string, unknown>;
  const signIn = body.signIn as Record<string, unknown> | undefined;
  const contract = body.contractDocument as Record<string, unknown> | undefined;

  return {
    name: String(body.name ?? '').trim(),
    baseURL: String(body.baseURL ?? '').trim(),
    ...(list(body.roles).length > 0 ? { roles: list(body.roles) } : {}),
    ...(list(body.hostAllowlist).length > 0 ? { hostAllowlist: list(body.hostAllowlist) } : {}),
    ...(body.testIdAttribute ? { testIdAttribute: String(body.testIdAttribute).trim() } : {}),
    ...(body.environment ? { environment: String(body.environment).trim() } : {}),
    ...(body.secretSource === 'vault' || body.secretSource === 'local'
      ? { secretSource: body.secretSource }
      : {}),
    ...(body.apiBaseURL ? { apiBaseURL: String(body.apiBaseURL).trim() } : {}),
    ...(body.a11yStandard ? { a11yStandard: String(body.a11yStandard).trim() } : {}),
    include: {
      api: include.api === true,
      db: include.db === true,
      contracts: include.contracts === true,
      a11y: include.a11y === true,
    },
    ...(signIn && signIn.username && signIn.password
      ? {
          signIn: {
            username: String(signIn.username),
            password: String(signIn.password),
            submit: String(signIn.submit ?? 'Sign in'),
            path: String(signIn.path ?? '/'),
            ...(isMarker(signIn.signedInMarker)
              ? {
                  signedInMarker: {
                    role: String(signIn.signedInMarker.role),
                    name: String(signIn.signedInMarker.name),
                    identitySpecific: signIn.signedInMarker.identitySpecific === true,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(contract && contract.filename && contract.contents
      ? {
          contractDocument: {
            filename: String(contract.filename),
            contents: String(contract.contents),
          },
        }
      : {}),
  };
}

function isMarker(
  value: unknown,
): value is { role: string; name: string; identitySpecific?: boolean } {
  if (typeof value !== 'object' || value === null) return false;
  const marker = value as { role?: unknown; name?: unknown };
  // The role is written straight into a `getByRole` call in generated source,
  // so it is checked against the roles this scaffold ever proposes rather than
  // accepted as free text.
  return (
    typeof marker.name === 'string' &&
    marker.name.length > 0 &&
    typeof marker.role === 'string' &&
    ['button', 'link', 'menuitem'].includes(marker.role)
  );
}

/**
 * Credentials are read separately and never enter the scaffold plan.
 *
 * The plan is data the dashboard echoes back for review, and a value that is in
 * it is a value that has been on the wire, in a preview pane and potentially in
 * a screenshot. Credentials go straight to the store the profile names and
 * appear in no response.
 */
function readCredentials(raw: unknown): Record<string, { username: string; password: string }> {
  if (typeof raw !== 'object' || raw === null) return {};
  const credentials: Record<string, { username: string; password: string }> = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as { username?: unknown; password?: unknown };
    const username = String(entry.username ?? '');
    const password = String(entry.password ?? '');
    if (username && password) credentials[role] = { username, password };
  }
  return credentials;
}
