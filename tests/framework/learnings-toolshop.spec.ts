import { expect, test } from '@playwright/test';
import { RuleTester } from 'eslint';
import fs from 'node:fs';
import tseslint from 'typescript-eslint';
import plugin from '../../eslint-rules';
import { ApiClient, type EndpointDescriptor } from '../../src/integrations/http/api-client';
import { summarise, type RawAxeResult } from '../../src/integrations/a11y/scanner';
import { DEFAULT_AUTH_FLOW_PATTERN } from '../../src/support/auth-flows';
import { detectSwallowedArguments, parseScaffoldArgs } from '../../src/support/onboarding/scaffold';
import { repoPath } from '../../src/support/paths';

/**
 * Regressions from onboarding a second real application (Toolshop).
 *
 * Every framework fix that exercise produced gets a test here that fails
 * without it. That is the point of writing the learnings down rather than
 * leaving them in a commit message: the next target will find the next batch,
 * and these have to keep holding while it does.
 */

// ---------------------------------------------------------------------------
// The API client: authentication, and cleanup that can actually delete
// ---------------------------------------------------------------------------

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** A stand-in for Playwright's APIRequestContext, recording what it was asked. */
function fakeRequestContext(recorded: RecordedRequest[], status = 200, body: unknown = {}) {
  return {
    fetch: async (url: string, options: Record<string, unknown>) => {
      recorded.push({
        url,
        method: String(options.method),
        headers: (options.headers ?? {}) as Record<string, string>,
      });
      return {
        status: () => status,
        headers: () => ({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(body),
      };
    },
  } as never;
}

const createBrand: EndpointDescriptor = {
  name: 'Create a brand',
  method: 'POST',
  path: '/brands',
  expect: [201],
};
const deleteBrand: EndpointDescriptor = {
  name: 'Delete a brand',
  method: 'DELETE',
  path: '/brands/{brandId}',
  expect: [204],
};

test('the API client carries a credential, resolved per call so a short-lived token can refresh', async () => {
  const recorded: RecordedRequest[] = [];
  const client = new ApiClient(fakeRequestContext(recorded, 201), {
    baseURL: 'https://api.internal.corp',
    runId: 'r1',
  });

  let issued = 0;
  client.setAuth(() => {
    issued += 1;
    return { Authorization: `Bearer token-${issued}` };
  });

  await client.call(createBrand, { body: {} });
  await client.call(createBrand, { body: {} });

  // Two calls, two resolutions: a client that captured the header once starts
  // answering 401 part-way through any run that outlives the token.
  expect(recorded[0]?.headers.Authorization).toBe('Bearer token-1');
  expect(recorded[1]?.headers.Authorization).toBe('Bearer token-2');
});

test('cleanup deletes through the client, so the delete carries the same credential', async () => {
  const recorded: RecordedRequest[] = [];
  const client = new ApiClient(fakeRequestContext(recorded, 204), {
    baseURL: 'https://api.internal.corp',
    runId: 'r1',
  });
  client.setAuth(() => ({ Authorization: 'Bearer t' }));

  client.track(createBrand, 'b-1', deleteBrand);
  await client.cleanup();

  const remove = recorded.at(-1);
  expect(remove?.method).toBe('DELETE');
  /*
     The placeholder is `{brandId}`, not `{id}`. Real documents name it after
     the resource, and `fillPath` throws on a placeholder it was given no value
     for — so assuming `{id}` turned every cleanup into an exception the
     cleanup logger then swallowed, leaving orphans behind a green run.
  */
  expect(remove?.url).toBe('https://api.internal.corp/brands/b-1');
  expect(remove?.headers.Authorization).toBe('Bearer t');
});

test('cleanup falls back to DELETE <collection>/<id> when the target names no delete endpoint', async () => {
  const recorded: RecordedRequest[] = [];
  const client = new ApiClient(fakeRequestContext(recorded, 204), {
    baseURL: 'https://api.internal.corp',
    runId: 'r1',
  });

  client.track(createBrand, 'b-2');
  await client.cleanup();

  expect(recorded.at(-1)?.url).toBe('https://api.internal.corp/brands/b-2');
});

test('a cleanup failure is still logged rather than thrown', async () => {
  const client = new ApiClient(fakeRequestContext([], 500), {
    baseURL: 'https://api.internal.corp',
    runId: 'r1',
  });
  client.track(createBrand, 'b-3');
  const warnings: string[] = [];

  await client.cleanup(undefined, (message) => warnings.push(message));

  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('b-3');
});

// ---------------------------------------------------------------------------
// Accessibility waivers apply per node, not per rule
// ---------------------------------------------------------------------------

function rawWith(nodes: string[]): RawAxeResult {
  return {
    url: 'https://shop.internal.corp/auth/login',
    violations: [
      {
        id: 'button-name',
        impact: 'critical',
        help: 'Buttons must have discernible text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/button-name',
        tags: ['wcag2a', 'wcag412'],
        nodes: nodes.map((target) => ({
          target: [target],
          html: `<button class="${target}"></button>`,
          failureSummary: 'Element has no title attribute',
        })),
      },
    ],
    passes: [1],
    incomplete: [],
  };
}

test('a waiver suppresses only the nodes it was granted for', () => {
  const scan = summarise(
    rawWith(['.btn-outline-secondary', '.checkout-submit']),
    {
      standard: 'wcag22aa',
      waived: [
        {
          rule: 'button-name',
          reason: 'known upstream defect in the password toggle',
          reviewBy: '2026-11-30',
          selector: 'btn-outline-secondary',
        },
      ],
    },
    ['wcag2a'],
  );

  /*
     The whole point. Suppressing the violation the moment its rule id matched
     meant one accepted exception blinded the suite to every other element the
     rule fires on, including ones added later. Here the known button stays
     waived and counted, and the unknown one is still a failure.
  */
  expect(scan.waived).toEqual([
    expect.objectContaining({ rule: 'button-name', nodes: 1 }),
  ]);
  expect(scan.violations).toHaveLength(1);
  expect(scan.violations[0]?.nodes.map((node) => node.target)).toEqual(['.checkout-submit']);
});

test('a waiver scoped to a url does not apply on other pages', () => {
  const waived = [
    {
      rule: 'button-name',
      reason: 'accepted on the sign-in form only',
      reviewBy: '2026-11-30',
      urlPattern: '/auth/login',
    },
  ];

  const onLogin = summarise(rawWith(['.toggle']), { standard: 'wcag22aa', waived }, ['wcag2a']);
  const elsewhere = summarise(
    { ...rawWith(['.toggle']), url: 'https://shop.internal.corp/checkout' },
    { standard: 'wcag22aa', waived },
    ['wcag2a'],
  );

  expect(onLogin.violations).toHaveLength(0);
  expect(elsewhere.violations, 'the same rule is still live everywhere else').toHaveLength(1);
});

test('an unscoped waiver still covers the whole rule, because sometimes that is the decision', () => {
  const scan = summarise(
    rawWith(['.a', '.b', '.c']),
    {
      standard: 'wcag22aa',
      waived: [{ rule: 'button-name', reason: 'accepted product-wide', reviewBy: '2026-11-30' }],
    },
    ['wcag2a'],
  );

  expect(scan.violations).toHaveLength(0);
  expect(scan.waived[0]?.nodes, 'the node count is still reported, never hidden').toBe(3);
});

// ---------------------------------------------------------------------------
// Lint rules
// ---------------------------------------------------------------------------

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser as never, ecmaVersion: 2023, sourceType: 'module' },
});

const SPEC = 'targets/demo/tests/api/orders.spec.ts';
const CASE_ID = `{ annotation: [{ type: 'practitest', description: '42' }] }`;

test('require-case-id does not mistake a conditional skip for a nameless test', () => {
  ruleTester.run('require-case-id', plugin.rules['require-case-id'], {
    valid: [
      /*
         `test.skip(condition, 'reason')` inside a body declares nothing, has no
         title and cannot carry an annotation. Treating it as a test meant any
         spec that skipped itself when its precondition was absent failed lint
         — which is exactly what a data-dependent spec is supposed to do.
      */
      {
        code: `test('reads an invoice', ${CASE_ID}, async ({ api }) => { test.skip(!invoice, 'no invoice to read'); });`,
        filename: SPEC,
      },
      { code: `test.skip(!thing, 'nothing to do');`, filename: SPEC },
    ],
    invalid: [
      {
        code: `test.skip('a real but skipped case', async () => {});`,
        filename: SPEC,
        errors: [{ messageId: 'missing' }],
      },
    ],
  });
});

test('auth-project-boundary honours the pattern the target profile declares', () => {
  /*
     The rule used to carry its own hardcoded copy of the auth-flow pattern, so
     it disagreed with `playwright.config.ts` the moment a profile used the
     documented `authFlowPattern` override: the rule rejected a file the runner
     handled correctly, and its message told the author to undo the override.
  */
  const toolshopProfile = repoPath('targets', 'toolshop', 'profile.ts');
  test.skip(!fs.existsSync(toolshopProfile), 'no target declaring an override is present');

  ruleTester.run('auth-project-boundary', plugin.rules['auth-project-boundary'], {
    valid: [
      {
        code: `test('registers @auth', ${CASE_ID}, async ({ page }) => {});`,
        filename: 'targets/toolshop/tests/e2e/register.spec.ts',
      },
    ],
    invalid: [
      {
        code: `test('registers @auth', ${CASE_ID}, async ({ page }) => {});`,
        filename: 'targets/toolshop/tests/e2e/onboarding.spec.ts',
        errors: [{ messageId: 'wrongFile' }],
      },
    ],
  });
});

test('the runner and the lint rule share one definition of an auth-flow file', () => {
  // Two copies of a pattern is how the two came to disagree. Held identical by
  // this test rather than by a comment on each of them.
  expect(String(plugin.DEFAULT_AUTH_FLOW_PATTERN)).toBe(String(DEFAULT_AUTH_FLOW_PATTERN));
});

test('the scaffolder names the shell when npm swallows its arguments', () => {
  /*
     `npm run target:new -- --name=x --url=y` is how every command in the
     handbook is written, and npm's PowerShell shim loses the `--`, claims the
     flags as its own config and hands the script an empty argv. Reporting
     "--name and --url are both required" to somebody looking at a command line
     containing both is the least useful thing the tool could say.
  */
  const swallowed = detectSwallowedArguments([], {
    npm_config_name: 'toolshop',
    npm_config_url: 'https://shop.internal.corp',
  });
  expect(swallowed).toContain('--name');
  expect(swallowed).toContain('npx tsx tools/new-target.ts');

  expect(
    parseScaffoldArgs(['--name=toolshop', '--url=https://shop.internal.corp'], '', {}).options.name,
  ).toBe('toolshop');
  // No arguments and no npm config is the ordinary "you forgot them" case.
  expect(detectSwallowedArguments([], {})).toBeNull();
});

test('the default auth-flow pattern covers registration and password recovery', () => {
  for (const file of [
    'targets/demo/tests/e2e/login.spec.ts',
    'targets/demo/tests/e2e/register.spec.ts',
    'targets/demo/tests/e2e/signup.spec.ts',
    'targets/demo/tests/e2e/forgot.spec.ts',
    'targets/demo/tests/e2e/password.spec.ts',
    'targets/demo/tests/e2e/mfa.spec.ts',
  ]) {
    expect(DEFAULT_AUTH_FLOW_PATTERN.test(file), `${file} belongs to auth-flows`).toBe(true);
  }
  expect(DEFAULT_AUTH_FLOW_PATTERN.test('targets/demo/tests/e2e/checkout.spec.ts')).toBe(false);
});
