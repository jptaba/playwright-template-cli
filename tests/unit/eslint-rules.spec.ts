import { test } from '@playwright/test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../../eslint-rules';

/**
 * The lint rules are the framework's conventions in executable form, so they
 * get the same treatment as any other behaviour: a test per rule, with the
 * false-positive cases written down next to the true ones.
 *
 * A rule that cries wolf is worse than no rule, because the first thing anyone
 * does with a noisy rule is disable it file-wide.
 */

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser as never,
    ecmaVersion: 2023,
    sourceType: 'module',
  },
});

/** Paths that classify a snippet into a layer. Rules are path-sensitive. */
const SPEC = 'src/targets/demo/tests/e2e/thing.spec.ts';
const LOGIN_SPEC = 'src/targets/demo/tests/e2e/login.spec.ts';
const CONTRACT_SPEC = 'src/targets/demo/tests/contract/orders.spec.ts';
const ACTION = 'src/targets/demo/actions/orders.ts';
const LOCATOR = 'src/targets/demo/locators/orders.ts';
const FIXTURE = 'src/fixtures/base.ts';
const INTEGRATION = 'src/integrations/practitest/client.ts';
const CASE_ID = `{ annotation: [{ type: 'practitest', description: '42' }] }`;

test('no-raw-locators rejects CSS and XPath but accepts a justified escape hatch', () => {
  ruleTester.run('no-raw-locators', plugin.rules['no-raw-locators'], {
    valid: [
      { code: `export const l = { a: (p) => p.getByRole('button', { name: 'Go' }) };`, filename: LOCATOR },
      { code: `export const l = { a: (p) => p.getByTestId('total') };`, filename: LOCATOR },
      {
        code: `export const l = {\n  // locator-justification: the dialog has no accessible name\n  a: (p) => p.locator('.legacy-modal'),\n};`,
        filename: LOCATOR,
      },
      // Framework code does not drive pages, so the rule does not apply.
      { code: `const x = db.locator('anything');`, filename: INTEGRATION },
    ],
    invalid: [
      { code: `export const l = { a: (p) => p.locator('.total') };`, filename: LOCATOR, errors: [{ messageId: 'rawLocator' }] },
      { code: `export const l = { a: (p) => p.$$('.item') };`, filename: LOCATOR, errors: [{ messageId: 'rawLocator' }] },
      { code: `export const l = { a: (p) => p.locator('//div[@id="x"]') };`, filename: LOCATOR, errors: [{ messageId: 'xpath' }] },
      { code: `export const l = { a: (p) => p.locator('xpath=//div') };`, filename: LOCATOR, errors: [{ messageId: 'xpath' }] },
    ],
  });
});

test('no-hard-waits rejects sleeps and accepts waiting for a condition', () => {
  ruleTester.run('no-hard-waits', plugin.rules['no-hard-waits'], {
    valid: [
      { code: `await expect.poll(() => db.entry(), { timeout: 30000 }).toBeDefined();`, filename: SPEC },
      { code: `await locator.waitFor({ state: 'visible' });`, filename: SPEC },
      // A timeout inside an adapter's retry loop is not a test sleep.
      { code: `setTimeout(retry, 100);`, filename: INTEGRATION },
    ],
    invalid: [
      { code: `await page.waitForTimeout(2000);`, filename: SPEC, errors: [{ messageId: 'waitForTimeout' }] },
      { code: `await sleep(500);`, filename: ACTION, errors: [{ messageId: 'sleep' }] },
      { code: `setTimeout(() => {}, 100);`, filename: ACTION, errors: [{ messageId: 'sleep' }] },
    ],
  });
});

test('layer-boundaries keeps the four layers and the target packs apart', () => {
  ruleTester.run('layer-boundaries', plugin.rules['layer-boundaries'], {
    valid: [
      { code: `import { orders } from '../../actions/orders';`, filename: SPEC },
      { code: `import { l } from '../locators/orders';`, filename: ACTION },
      { code: `import { redact } from '../../support/redact';`, filename: FIXTURE },
    ],
    invalid: [
      {
        code: `import { l } from '../../locators/orders';`,
        filename: SPEC,
        errors: [{ messageId: 'specImportsPrimitive' }],
      },
      {
        code: `import { test } from '../fixtures';`,
        filename: LOCATOR,
        errors: [{ messageId: 'primitiveImportsUp' }],
      },
      {
        // The rule that keeps the framework agnostic of the application.
        code: `import { checkout } from '../targets/demo/actions/checkout';`,
        filename: FIXTURE,
        errors: [{ messageId: 'frameworkImportsTarget' }],
      },
      {
        code: `import { other } from '../../other-app/actions/thing';`,
        filename: ACTION,
        errors: [{ messageId: 'crossTarget' }],
      },
    ],
  });
});

test('no-hardcoded-urls keeps hosts in target profiles', () => {
  ruleTester.run('no-hardcoded-urls', plugin.rules['no-hardcoded-urls'], {
    valid: [
      { code: `await page.goto('/inventory.html');`, filename: SPEC },
      { code: `const base = target.baseURL;`, filename: ACTION },
      { code: `const local = 'http://127.0.0.1:8080';`, filename: INTEGRATION },
      { code: `const ns = 'http://www.w3.org/2000/svg';`, filename: INTEGRATION },
      // A placeholder inside the error message that says what to configure.
      {
        code: `throw new Error('Set JIRA_BASE_URL, e.g. https://jira.<org>.<internal>/rest/api/2');`,
        filename: INTEGRATION,
      },
    ],
    invalid: [
      {
        code: `await page.goto('https://www.example-app.com/login');`,
        filename: SPEC,
        errors: [{ messageId: 'hardcodedUrl' }],
      },
      {
        code: 'const url = `https://api.example-app.com/${path}`;',
        filename: INTEGRATION,
        errors: [{ messageId: 'hardcodedUrl' }],
      },
    ],
  });
});

test('typed-clients-only keeps raw HTTP and SQL out of specs', () => {
  ruleTester.run('typed-clients-only', plugin.rules['typed-clients-only'], {
    valid: [
      { code: `const claim = await api.expenses.create(data);`, filename: SPEC },
      { code: `const row = await db.ledger.entryFor(ref);`, filename: SPEC },
      // The vocabulary layer is where the raw call is allowed to live.
      { code: `const res = await request.post('/orders', { data });`, filename: ACTION },
    ],
    invalid: [
      {
        code: `const res = await request.post('/orders', { data });`,
        filename: SPEC,
        errors: [{ messageId: 'rawRequest' }],
      },
      {
        code: `const res = await page.request.get('/orders');`,
        filename: SPEC,
        errors: [{ messageId: 'rawRequest' }],
      },
      {
        code: `const rows = await db.query('SELECT * FROM ledger WHERE ref = $1', [ref]);`,
        filename: SPEC,
        errors: [{ messageId: 'inlineSql' }],
      },
      { code: `const res = await fetch('/orders');`, filename: SPEC, errors: [{ messageId: 'rawFetch' }] },
    ],
  });
});

test('secrets-via-fixture keeps credentials off the environment', () => {
  ruleTester.run('secrets-via-fixture', plugin.rules['secrets-via-fixture'], {
    valid: [
      { code: `const creds = await secrets.account('approver');`, filename: SPEC },
      // A reference to where a secret lives is not the secret.
      { code: `const source = process.env.SECRET_SOURCE;`, filename: INTEGRATION },
      { code: `const addr = process.env.VAULT_ADDR;`, filename: INTEGRATION },
      { code: `const file = process.env.LOCAL_SECRETS_FILE;`, filename: INTEGRATION },
      // The one exempt file, which registers the value for redaction.
      {
        code: `const token = process.env.PRACTITEST_TOKEN;`,
        filename: 'src/support/env-credentials.ts',
      },
    ],
    invalid: [
      {
        code: `const password = process.env.APP_PASSWORD;`,
        filename: SPEC,
        errors: [{ messageId: 'credentialEnv' }],
      },
      {
        code: `const token = process.env.PRACTITEST_TOKEN;`,
        filename: INTEGRATION,
        errors: [{ messageId: 'credentialEnv' }],
      },
      {
        code: `const env = process.env.TARGET_ENV;`,
        filename: ACTION,
        errors: [{ messageId: 'anyEnvInTarget' }],
      },
    ],
  });
});

test('require-case-id demands a case reference outside the contract project', () => {
  ruleTester.run('require-case-id', plugin.rules['require-case-id'], {
    valid: [
      { code: `test('does a thing', ${CASE_ID}, async () => {});`, filename: SPEC },
      { code: `test.fixme('draft', ${CASE_ID}, async () => {});`, filename: SPEC },
      // Contract checks verify a published spec, not a scripted case.
      { code: `test('schema holds', async () => {});`, filename: CONTRACT_SPEC },
    ],
    invalid: [
      { code: `test('does a thing', async () => {});`, filename: SPEC, errors: [{ messageId: 'missing' }] },
      {
        code: `test('x', { annotation: [{ type: 'jira', description: 'FIN-1' }] }, async () => {});`,
        filename: SPEC,
        errors: [{ messageId: 'missing' }],
      },
      {
        code: `test('x', { annotation: [{ type: 'practitest', description: '' }] }, async () => {});`,
        filename: SPEC,
        errors: [{ messageId: 'empty' }],
      },
    ],
  });
});

test('step-naming keeps the report readable by someone who does not know what a locator is', () => {
  ruleTester.run('step-naming', plugin.rules['step-naming'], {
    valid: [
      { code: `await test.step('Submit the expense claim', run);`, filename: ACTION },
      { code: `await test.step('Check out as far as the order overview', run);`, filename: ACTION },
      { code: 'await test.step(`Add ${n} products to the cart`, run);', filename: ACTION },
    ],
    invalid: [
      { code: `await test.step('click #submit-btn', run);`, filename: ACTION, errors: [{ messageId: 'selector' }] },
      { code: `await test.step('fill the username field', run);`, filename: ACTION, errors: [{ messageId: 'mechanical' }] },
      { code: `await test.step('', run);`, filename: ACTION, errors: [{ messageId: 'empty' }] },
    ],
  });
});

test('auth-project-boundary stops a login spec inheriting a session', () => {
  ruleTester.run('auth-project-boundary', plugin.rules['auth-project-boundary'], {
    valid: [
      { code: `test('signs in @auth', ${CASE_ID}, async ({ page }) => {});`, filename: LOGIN_SPEC },
      { code: `test('buys a thing', ${CASE_ID}, async ({ authedPage }) => {});`, filename: SPEC },
    ],
    invalid: [
      {
        code: `test('signs in @auth', ${CASE_ID}, async ({ page }) => {});`,
        filename: SPEC,
        errors: [{ messageId: 'wrongFile' }],
      },
      {
        code: `test('signs in @auth', ${CASE_ID}, async ({ authedPage }) => {});`,
        filename: LOGIN_SPEC,
        errors: [{ messageId: 'authedPageInAuthFlow' }],
      },
      {
        code: `test('resets a password', ${CASE_ID}, async ({ authedPage }) => {});`,
        filename: LOGIN_SPEC,
        errors: [{ messageId: 'pageInSignedInFile' }],
      },
    ],
  });
});

test('no-target-coupling stops the framework growing a special case for one application', () => {
  ruleTester.run('no-target-coupling', plugin.rules['no-target-coupling'], {
    valid: [
      { code: `if (target.capabilities.mfa === 'none') return skipProvider();`, filename: FIXTURE },
      { code: `const dir = 'src/targets/' + target.name + '/tests';`, filename: INTEGRATION },
      // Inside a target pack, naming the target is not coupling.
      { code: `const name = 'saucedemo';`, filename: ACTION },
    ],
    invalid: [
      {
        code: `if (target.name === 'saucedemo') skipMfa();`,
        filename: FIXTURE,
        errors: [{ messageId: 'namesTarget' }],
      },
      {
        code: `const dir = 'src/targets/saucedemo/tests';`,
        filename: INTEGRATION,
        errors: [{ messageId: 'pathsIntoTarget' }],
      },
    ],
  });
});
