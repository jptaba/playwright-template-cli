import { createRouter, failure, html, json, type Route, type UiRequest, type UiResponse } from '../ui/router';
import type { Diagnostic } from './diagnose';
import type { OffboardPlan } from './offboard';
import { confirmationMatches, isRemovable } from './offboard';
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

/**
 * Kept as names of their own because the whole test suite and the tool import
 * them. They are the router's types — onboarding is one page among several now,
 * and its request shape is not special.
 */
export type DashboardRequest = UiRequest;
export type DashboardResponse = UiResponse;

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
  /** What removing a target would do. Plans only; removes nothing. */
  planRemoval(target: string): OffboardPlan;
  /** Actually remove it. Only ever reached through a matching confirmation. */
  remove(plan: OffboardPlan): Promise<string[]>;
  create(
    plan: ScaffoldPlan,
    options: ScaffoldOptions,
    credentials: Record<string, { username: string; password: string }>,
  ): Promise<CreateResult>;
}

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

/**
 * Every route onboarding owns, as a table the shared router can mount.
 *
 * The page routes are `public` because a browser asking for a page cannot carry
 * a token it has not been given yet; everything else is behind the loopback and
 * token checks the router applies.
 */
export function onboardingRoutes(service: DashboardService): Route[] {
  const page: Route = { method: 'GET', path: '/', public: true, handle: () => html(service.page()) };
  const apiPaths = [
    '/api/targets',
    '/api/probe',
    '/api/verify',
    '/api/plan',
    '/api/create',
    '/api/offboard/plan',
    '/api/offboard/remove',
  ];

  return [
    page,
    { ...page, path: '/index.html' },
    { ...page, path: '/onboard' },
    ...apiPaths.map<Route>((path) => ({
      method: 'POST',
      path,
      handle: (request) => onboardingApi(request, service),
    })),
  ];
}

/** Kept as its own export: the whole test suite drives onboarding through it. */
export async function handleDashboardRequest(
  request: DashboardRequest,
  options: RouteOptions,
): Promise<DashboardResponse> {
  return createRouter(onboardingRoutes(options.service), { token: options.token })(request);
}

async function onboardingApi(
  request: UiRequest,
  service: DashboardService,
): Promise<UiResponse> {
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

      /*
         Offboarding is the one destructive route here, so it is two calls, not
         one. `/api/offboard/plan` is safe to call and shows everything that
         would go; `/api/offboard/remove` is the only thing that deletes, and it
         is unreachable without the target's own name typed back.
      */
      case '/api/offboard/plan':
        return json(200, service.planRemoval(String(body.target ?? '').trim()));

      case '/api/offboard/remove': {
        const target = String(body.target ?? '').trim();
        const plan = service.planRemoval(target);

        if (!isRemovable(plan)) {
          return failure(
            409,
            plan.alreadyGone
              ? `Nothing named '${target}' is onboarded.`
              : plan.refusals.join(' '),
          );
        }
        if (!confirmationMatches(plan.target, String(body.confirm ?? ''))) {
          // The pattern from deleting a repository, and here for the same
          // reason: this is final for anything never committed, and a
          // confirmation a stray click can satisfy is not a confirmation.
          return failure(
            400,
            `To remove '${plan.target}', type its name exactly into the confirmation field.`,
          );
        }
        return json(200, { removed: await service.remove(plan), plan });
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
    ...(Object.keys(readServices(body.apiServices)).length > 0
      ? { apiServices: readServices(body.apiServices) }
      : {}),
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

/**
 * Additional services, name → base URL.
 *
 * The name is rendered into a generated profile as an object key and read back
 * as `apis.<name>`, so it is constrained to an identifier rather than accepted
 * as free text. A blank row — the operator clicked "add another" and changed
 * their mind — is dropped rather than rejected: refusing to plan because of an
 * empty field is how a form becomes annoying.
 */
function readServices(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {};
  const services: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const url = String(value ?? '').trim();
    const key = name.trim();
    if (!key && !url) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      throw new ScaffoldError(
        `'${key || '(blank)'}' is not a usable service name. Use a single word — it becomes ` +
          '`apis.<name>` in a spec.',
      );
    }
    if (!/^https?:\/\//.test(url)) {
      throw new ScaffoldError(`Service '${key}' needs an absolute http(s) base URL.`);
    }
    services[key] = url.replace(/\/+$/, '');
  }
  return services;
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
