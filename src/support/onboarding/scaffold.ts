/**
 * The target-pack scaffolder — the "four steps" from docs/CONVENTIONS.md, done
 * for you.
 *
 * Onboarding an application used to be a copy, a rename, six symbol edits and
 * one shared-file registration people forgot. None of that is interesting work,
 * and every step of it is a place to introduce a subtle mistake that surfaces
 * much later as a confusing test failure.
 *
 * Pure by construction: this module renders paths to contents and touches
 * nothing. `tools/new-target.ts` writes what it returns, which is what makes
 * the output unit-testable — including that the generated code passes the
 * repository's own lint rules.
 */

export interface ScaffoldOptions {
  /** Directory-safe target name, e.g. `acme-shop`. */
  name: string;
  /** Base URL of the *test* environment. Never production. */
  baseURL: string;
  /** Hostname suffixes this target may drive. Derived from baseURL if empty. */
  hostAllowlist?: string[];
  /** Which attribute `getByTestId` reads on this application. */
  testIdAttribute?: string;
  /** Roles that get a storage state. The first is the default for `authedPage`. */
  roles?: string[];
  environment?: string;
  secretSource?: 'vault' | 'local';
  /** Base URL of the service API. Required when the api layer is included. */
  apiBaseURL?: string;
  /** Optional layers to scaffold. UI locators and actions are always written. */
  include?: { api?: boolean; db?: boolean; contracts?: boolean; a11y?: boolean };
}

export interface ScaffoldFile {
  /** Repo-relative, forward slashes. */
  path: string;
  contents: string;
}

export interface ScaffoldPlan {
  files: ScaffoldFile[];
  /** Credential keys the target will look for, in path order. */
  credentialPaths: string[];
  /** What to do next, in order. Printed by the CLI and shown in the docs. */
  nextSteps: string[];
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export class ScaffoldError extends Error {}

/** `acme-shop` → `acmeShop`. */
export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

/** `acme-shop` → `AcmeShop`. */
export function pascalCase(name: string): string {
  const camel = camelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * The allowlist is derived from the host rather than defaulted to something
 * permissive: a wildcard allowlist is how a suite ends up pointed at
 * production, and the check that would have caught it passes silently.
 */
export function defaultAllowlist(baseURL: string): string[] {
  const { hostname } = new URL(baseURL);
  const labels = hostname.split('.');
  // Keep the registrable-looking tail for a real domain, and the whole host
  // for a single-label or numeric one.
  if (labels.length <= 2 || /^\d+(\.\d+)*$/.test(hostname)) return [hostname];
  return [labels.slice(-2).join('.')];
}

export function planScaffold(options: ScaffoldOptions): ScaffoldPlan {
  const name = options.name.trim();
  if (!NAME_PATTERN.test(name)) {
    throw new ScaffoldError(
      `'${name}' is not a usable target name. Use lower-case words joined by hyphens ` +
        '(<one>-<two>): the name becomes a directory, a TARGET value and part of a ' +
        'storage-state filename.',
    );
  }

  let baseURL: string;
  try {
    baseURL = new URL(options.baseURL).toString().replace(/\/$/, '');
  } catch {
    throw new ScaffoldError(
      `'${options.baseURL}' is not a URL. Pass the base URL of the *test* environment, ` +
        'including the scheme.',
    );
  }

  const roles = options.roles?.length ? options.roles : ['standard'];
  const environment = options.environment ?? 'staging';
  const secretSource = options.secretSource ?? 'vault';
  const testIdAttribute = options.testIdAttribute ?? 'data-testid';
  const allowlist = options.hostAllowlist?.length
    ? options.hostAllowlist
    : defaultAllowlist(baseURL);
  const include = { api: false, db: false, contracts: false, a11y: false, ...options.include };

  // A profile that enables the API capability without a base URL is dead on
  // arrival: every spec taking `api` fails at construction. Refuse here, where
  // the message can say what to pass, rather than scaffolding the failure.
  let apiBaseURL: string | null = null;
  if (include.api) {
    if (!options.apiBaseURL) {
      throw new ScaffoldError(
        'The api layer needs a service base URL. Pass --api-url=<url>, or drop api from --with ' +
          'and add it once the service address is known.',
      );
    }
    try {
      apiBaseURL = new URL(options.apiBaseURL).toString().replace(/\/$/, '');
    } catch {
      throw new ScaffoldError(`'${options.apiBaseURL}' is not a URL.`);
    }
  }

  const root = `src/targets/${name}`;
  const camel = camelCase(name);
  const pascal = pascalCase(name);
  const credentialRoot = `qa/${name}/pools`;

  const files: ScaffoldFile[] = [
    {
      path: `config/targets/${name}.ts`,
      contents: profileFile({
        name,
        camel,
        baseURL,
        environment,
        secretSource,
        testIdAttribute,
        allowlist,
        roles,
        credentialRoot,
        include,
        apiBaseURL,
      }),
    },
    { path: `${root}/locators/sign-in.ts`, contents: LOCATORS },
    { path: `${root}/actions/sign-in.ts`, contents: ACTIONS },
    { path: `${root}/fixtures.ts`, contents: fixturesFile(pascal) },
    { path: `${root}/tests/auth.setup.ts`, contents: AUTH_SETUP },
    { path: `${root}/tests/e2e/.gitkeep`, contents: '' },
  ];

  if (include.api) {
    files.push(
      { path: `${root}/endpoints/orders.ts`, contents: ENDPOINTS },
      { path: `${root}/api/orders.ts`, contents: API_CLIENT },
      { path: `${root}/tests/api/.gitkeep`, contents: '' },
    );
  }
  if (include.db) {
    files.push(
      { path: `${root}/queries/ledger.ts`, contents: QUERIES },
      { path: `${root}/db/ledger.ts`, contents: DB_READER },
    );
  }
  if (include.contracts) {
    files.push(
      { path: `${root}/contracts/README.md`, contents: contractsReadme(name) },
      { path: `${root}/tests/contract/.gitkeep`, contents: '' },
    );
  }
  if (include.a11y) {
    files.push({ path: `${root}/tests/a11y/.gitkeep`, contents: '' });
  }

  const credentialPaths = roles.map((role) => `${credentialRoot}/workforce/${role}/1`);

  const nextSteps = [
    secretSource === 'local'
      ? `Add credentials for ${roles.join(', ')} to config/secrets.local.json — the keys are listed above.`
      : `Write username and password to ${credentialPaths[0]} in Vault (one path per role).`,
    `TARGET=${name} npm run explore — open the running application and snapshot it.`,
    `Rewrite ${root}/locators/sign-in.ts from that snapshot, not from memory.`,
    `TARGET=${name} npm run target:doctor — confirms the profile, pack and credentials agree.`,
    `TARGET=${name} npx playwright test --project=setup:auth — proves sign-in works end to end.`,
    `Write the first spec in ${root}/tests/e2e/, then npm run catalog:build.`,
  ];

  if (include.contracts) {
    nextSteps.splice(
      1,
      0,
      `Vendor the published schema to ${root}/contracts/openapi.yaml, then set ` +
        'capabilities.contracts.enabled to true.',
    );
  }

  return { files, credentialPaths, nextSteps };
}

interface ProfileInput {
  name: string;
  camel: string;
  baseURL: string;
  environment: string;
  secretSource: 'vault' | 'local';
  testIdAttribute: string;
  allowlist: string[];
  roles: string[];
  credentialRoot: string;
  include: { api: boolean; db: boolean; contracts: boolean; a11y: boolean };
  apiBaseURL: string | null;
}

function list(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

function profileFile(input: ProfileInput): string {
  // The path is declared even though the capability starts off: the document
  // has to be vendored before it can be validated against, and `target:doctor`
  // notices the moment it lands and says to switch the capability on.
  const contractsSpec = input.include.contracts
    ? `'src/targets/${input.name}/contracts/openapi.yaml'`
    : 'null';
  const apiLine = input.apiBaseURL
    ? `{ enabled: true, baseURL: process.env.API_BASE_URL ?? '${input.apiBaseURL}' }`
    : '{ enabled: false, baseURL: process.env.API_BASE_URL }';
  return `import type { TargetProfile } from './types';

/**
 * ${input.name} — the application under test is configuration, not code (§04).
 *
 * Generated by \`npm run target:new\`. Every value below is a claim about the
 * application: set them to what is *true*, not to what you would like. A
 * capability declared on but absent fails obscurely; one declared off is
 * reported as "not applicable" rather than as a silent zero.
 *
 * \`npm run target:doctor\` checks this file against the pack and the secret
 * store, and names the file to fix for anything that disagrees.
 */
export const ${input.camel}: TargetProfile = {
  name: '${input.name}',

  // Environment values come from the pipeline where there is one, so a profile
  // never ships a host someone can accidentally point at production.
  baseURL: process.env.BASE_URL ?? '${input.baseURL}',
  environment: process.env.TARGET_ENV ?? '${input.environment}',

  credentials: {
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? '${input.secretSource}',
    root: '${input.credentialRoot}',
    accountType: 'workforce',
  },

  capabilities: {
    mfa: 'none', // 'none' | 'totp' | 'email'
    accountPool: 'static', // 'static' | 'leased'
    serverState: true, // does state need cross-test cleanup?
    api: ${apiLine},
    db: { enabled: false, vaultRole: 'qa-readonly', dialect: 'postgres' },
    // Off until the published document is vendored to the path below.
    contracts: { enabled: false, spec: ${contractsSpec} },
    // Turn on once someone can say which standard this application is held to.
    a11y: { enabled: ${input.include.a11y}, standard: 'wcag22aa' },
  },

  // Which attribute \`getByTestId\` reads. Applications disagree — data-test,
  // data-testid, data-qa — and it is a property of the app, not the framework.
  testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? '${input.testIdAttribute}',

  // Hosts this profile may drive. Generation and exploration run against test
  // environments only, enforced here rather than by convention (§17).
  hostAllowlist: [${list(input.allowlist)}],

  suites: ['smoke', 'regression'],

  // The first role is the default identity for \`authedPage\`.
  roles: [${list(input.roles)}],
};
`;
}

const LOCATORS = `import type { Locator, Page } from '@playwright/test';

/**
 * L1 — named locators, and nothing else. No logic, no waits, no assertions.
 *
 * Replace these with what the application actually renders. Ground them in a
 * real page — \`npm run explore\` opens the profile's host and writes an
 * accessibility snapshot to disk — and write what the snapshot says rather
 * than what you expect it to say. Locator hallucination is the single largest
 * source of dead-on-arrival generated tests, and exploration is the only fix.
 *
 * Priority order, enforced by \`no-raw-locators\`:
 *   getByRole → getByLabel/getByPlaceholder/getByText → getByTestId → CSS with
 *   a written justification. XPath never.
 *
 * Scope to a container when a test id is reused across pages, or the locator
 * answers the wrong question with a plausible result.
 */
export const signInLocators = {
  username: (page: Page): Locator => page.getByRole('textbox', { name: 'Username' }),
  password: (page: Page): Locator => page.getByRole('textbox', { name: 'Password' }),
  submit: (page: Page): Locator => page.getByRole('button', { name: 'Sign in' }),
  error: (page: Page): Locator => page.getByRole('alert'),
  /** Something only a signed-in page shows. Used to verify a session, not to assert. */
  signedInMarker: (page: Page): Locator => page.getByRole('button', { name: 'Account' }),
};
`;

const ACTIONS = `import { test, type Page } from '@playwright/test';
import { signInLocators } from '../locators/sign-in';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * L2 — named business verbs.
 *
 *  - Compose L1, return data, assert nothing. An assertion buried in an action
 *    is invisible to whoever reviews the spec.
 *  - Name the step for intent, not mechanics: these titles are the narrative a
 *    product owner reads in the report.
 *  - Derive the application's internal identifiers from the running
 *    application; never transcribe one into the code.
 */
export const signIn = {
  /**
   * Submit the sign-in form. Deliberately does not assert the outcome, so a
   * spec about a rejected credential can use the same verb.
   */
  async withCredentials(page: Page, credentials: Credentials): Promise<void> {
    await test.step(\`Sign in as \${credentials.username}\`, async () => {
      await page.goto('/');
      await signInLocators.username(page).fill(credentials.username);
      await signInLocators.password(page).fill(credentials.password);
      await signInLocators.submit(page).click();
    });
  },

  /**
   * Whether the page currently carries a session. Used by auth.setup.ts to
   * fail loudly rather than write a storage state that holds no session.
   */
  async isSignedIn(page: Page): Promise<boolean> {
    return signInLocators.signedInMarker(page).isVisible();
  },

  /** The error the form reported, or null when it reported none. */
  async readError(page: Page): Promise<string | null> {
    const banner = signInLocators.error(page);
    if (!(await banner.isVisible())) return null;
    return (await banner.textContent())?.trim() ?? null;
  },
};
`;

function fixturesFile(pascal: string): string {
  return `import { test as framework } from '../../fixtures/base';
import { signIn } from './actions/sign-in';

/**
 * L3 — the one import a spec makes.
 *
 * This file *is* the closed vocabulary for this application: the framework's
 * target-agnostic fixtures plus this target's named verbs and data builders.
 * Everything a generated spec may reach for is reachable from here, and
 * \`docs/generated/catalog.md\` lists it all for the agent.
 *
 * Keep the surface small. Resisting a fixture that only one spec wants is the
 * whole discipline — the value is in what a model *cannot* choose.
 */
export interface ${pascal}TestData {
  /** Unique per call, so parallel workers never collide on a record. */
  record(overrides?: Partial<{ reference: string }>): { reference: string };
}

export interface ${pascal}Fixtures {
  /** Signing in, and reading what the form reported. */
  signIn: typeof signIn;
  /** Builders for the data a spec needs. Never reads the application. */
  testData: ${pascal}TestData;
}

export const test = framework.extend<${pascal}Fixtures>({
  signIn: async ({}, use) => {
    await use(signIn);
  },
  testData: async ({ run }, use) => {
    await use({
      // Tagged with the run id so everything created can be cleaned up, and so
      // an orphan can be traced back to the run that left it.
      record: (overrides = {}) => ({ reference: run.unique('REC'), ...overrides }),
    });
  },
});

export { expect } from '@playwright/test';
`;
}

const AUTH_SETUP = `import fs from 'node:fs';
import path from 'node:path';
import { signIn } from '../actions/sign-in';
import { AUTH_DIR, storageStatePath } from '../../../support/paths';
import { expect, test as setup } from '../../../fixtures/base';

/**
 * The \`setup:auth\` project — §13.
 *
 * Authenticate once per role and reuse the session everywhere else. Driving a
 * login form before every test is slow, and worse, it makes every test in the
 * suite fail when login breaks: one defect, four hundred red results, and a
 * triage report that tells you nothing.
 *
 * This project runs signed out, so it uses \`page\`, never \`authedPage\`.
 */
setup('Establish a session for each role', async ({ page, target, secrets }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const role of target.roles) {
    const credentials = await secrets.account(role);
    const username = credentials.username;
    const password = credentials.password;
    if (!username || !password) {
      throw new Error(
        \`Credential payload for role '\${role}' is missing username or password. \` +
          \`Present fields: \${Object.keys(credentials).join(', ') || '(none)'}.\`,
      );
    }

    await signIn.withCredentials(page, { username, password });

    // Fail here, loudly, rather than writing a storage state that carries no
    // session and producing a hundred confusing failures downstream.
    await expect
      .poll(() => signIn.isSignedIn(page), {
        message: \`Sign-in for role '\${role}' did not establish a session\`,
      })
      .toBe(true);

    const statePath = storageStatePath(role, target.name);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await page.context().storageState({ path: statePath });
  }
});
`;

const ENDPOINTS = `import type { EndpointDescriptor } from '../../../integrations/http/api-client';

/**
 * L1 — typed endpoint descriptors: the HTTP equivalent of a named locator.
 * Data, not logic, and no concrete host — the base URL comes from the profile.
 *
 * Naming the endpoints once is what lets \`typed-clients-only\` forbid raw
 * \`request.*\` in specs: a model given a free hand at HTTP invents paths,
 * payloads and status codes with total confidence and no page to contradict it.
 *
 * Paths are OpenAPI templates so the same string identifies the endpoint in the
 * vendored contract document, and every response is schema-checked without a
 * second mapping to keep in step.
 */
export const orderEndpoints = {
  create: { name: 'Create an order', method: 'POST', path: '/orders', expect: [201] },
  get: { name: 'Read an order', method: 'GET', path: '/orders/{id}', expect: [200] },
  cancel: { name: 'Cancel an order', method: 'DELETE', path: '/orders/{id}', expect: [204] },
} satisfies Record<string, EndpointDescriptor>;
`;

const API_CLIENT = `import type { ApiClient } from '../../../integrations/http/api-client';
import { orderEndpoints } from '../endpoints/orders';

export interface NewOrder {
  reference: string;
}

export interface Order extends NewOrder {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

/**
 * L2 — the HTTP vocabulary: business verbs over typed endpoints, exactly as
 * \`actions/\` is business verbs over locators.
 *
 * Written as a factory because the client is injected. The capability catalog
 * understands both this shape and a plain exported object.
 */
export function ordersApi(client: ApiClient) {
  return {
    /** Create an order and register it for cleanup at the end of the test. */
    async create(order: NewOrder): Promise<Order> {
      const response = await client.call<Order, NewOrder & { runTag: string }>(
        orderEndpoints.create,
        { body: { ...order, runTag: client.runTag } },
      );
      client.track(orderEndpoints.create, response.body.id);
      return response.body;
    },

    /** Read one order. The response is schema-checked on the way through. */
    async get(id: string): Promise<Order> {
      const response = await client.call<Order>(orderEndpoints.get, { params: { id } });
      return response.body;
    },
  };
}
`;

const QUERIES = `import { defineQuery } from '../../../integrations/db/reader';

export interface LedgerEntry {
  reference: string;
  amount: number;
}

/**
 * L1 — named, parameterised SQL. This layer never writes, ever.
 *
 * Read the hierarchy before adding anything here: assert through the UI if the
 * user can see it, through the API if a service exposes it, and through the
 * database **only** when neither does. A query couples the suite to a private
 * schema with no contract and no deprecation notice, and it can pass while the
 * feature is broken for users.
 *
 * \`defineQuery\` rejects anything that is not a single SELECT, at definition
 * time — the read-only rule is enforced where the query is written rather than
 * where it runs.
 */
export const ledgerQueries = {
  entryForReference: defineQuery<LedgerEntry>({
    name: 'ledger entry for a reference',
    sql: 'SELECT reference, amount FROM ledger_entries WHERE reference = $1 LIMIT 1',
    parameters: 1,
  }),
};
`;

const DB_READER = `import type { DbReader } from '../../../integrations/db/reader';
import { ledgerQueries, type LedgerEntry } from '../queries/ledger';

/**
 * L2 — the read vocabulary. Composes named queries, returns data, asserts
 * nothing — the same layer and the same rules as \`actions/\` and \`api/\`.
 */
export function ledgerDb(reader: DbReader) {
  return {
    /**
     * The ledger posting for a reference, or null when nothing has posted yet.
     * Returning null rather than throwing is what lets a spec poll for an
     * asynchronous posting with \`expect.poll\` instead of sleeping.
     */
    async entryFor(reference: string): Promise<LedgerEntry | null> {
      const rows = await reader.run(ledgerQueries.entryForReference, [reference]);
      return rows[0] ?? null;
    },
  };
}
`;

function contractsReadme(name: string): string {
  return `# Contract documents for ${name}

Vendor the service's **published** schema here and pin it — do not write one by
hand from the responses you happen to have seen. The point of a contract test is
to compare the running service against what its owners promised; a schema
derived from observed traffic can only ever agree with itself.

Set \`capabilities.contracts.spec\` in the profile to the file you land here,
then \`npm run target:doctor\` will confirm the framework can read it.

Every API response the shared client returns is validated against this document
as it passes through, so the setup calls inside UI tests are contract checks for
free (§05).
`;
}
