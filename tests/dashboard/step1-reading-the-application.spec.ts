import { expect, probeFound, test } from './harness';

/**
 * Step 1 — the application — and step 2, which is entirely its output.
 *
 * Step 1 is the only step whose values nothing can derive, and the only one
 * that reaches out to the running system. Step 2 is what came back. Testing
 * them apart would miss the interesting half, which is what step 2 holds after
 * step 1 has been run **twice**, or run and then skipped.
 */

const serviceRow = (index: number) => `#services .service:nth-child(${index + 1})`;

test.describe('reading the application', () => {
  test('refuses until somebody says this is a test environment', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#probe');

    await expect(page.locator('#s1status')).toContainText('test environment');
    await expect(page.locator('#s2'), 'nothing unlocks on a refusal').toHaveAttribute('inert', '');
    await expect(page.locator('#s3')).toHaveAttribute('inert', '');
  });

  test('refuses a base URL that is not one, and stays usable', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#s1status')).toContainText('is not a URL');
    await expect(page.locator('#probe'), 'a refusal is not a dead end').toBeEnabled();
  });

  test('refuses a scheme it cannot drive', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'ftp://shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s1status')).toContainText('is not a scheme this can drive');
  });

  test('fills step 2 from what it read, and unlocks steps 2 and 3', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#s2')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#testId')).toHaveValue('data-test');
    await expect(page.locator('#uName')).toHaveValue('Email address *');
    await expect(page.locator('#pName')).toHaveValue('Password *');
    await expect(page.locator('#sName')).toHaveValue('Login');
    await expect(page.locator('#signInPath')).toHaveValue('/auth/login');
    await expect(page.locator('#findings')).toContainText('found at /auth/login');
  });

  test('a found contract switches on the two capabilities that need it', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#lContracts')).toBeChecked();
    await expect(page.locator('#lApi')).toBeChecked();
  });

  test('sends the primary service as the API base URL', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.locator(serviceRow(0)).locator('input').nth(1).fill('https://api.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#findings')).toContainText('Test-id attribute');
    expect(dashboard.lastCall('/api/probe')!.apiBaseURL).toBe('https://api.shop.test');
  });

  test('reports what it could not find, rather than leaving the reader guessing', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    dashboard.recorder.probeResult = {
      testIdAttribute: 'data-testid',
      testIdCounts: { 'data-testid': 0 },
      signIn: null,
      contract: null,
      notes: ['No sign-in form was found on any of the usual paths.'],
    };
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#findings')).toContainText('none found');
    await expect(page.locator('#findings')).toContainText('not found');
    await expect(page.locator('#findings')).toContainText('No sign-in form was found');
  });

  test('a second read replaces the first, rather than adding to it', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#findings')).toContainText('found at /auth/login');

    await page.click('#probe');
    await expect(page.locator('#findings')).toContainText('found at /auth/login');
    // Three lines: test ids, sign-in, contract. Not six.
    await expect(page.locator('#findings > div')).toHaveCount(3);
  });

  test('a second read that finds no form clears the names the first one wrote', async ({
    dashboard,
  }) => {
    /*
       Point step 1 at the wrong host, read it, correct the host, read it
       again. If the second read finds nothing, the names from the first are
       still in step 2 — and they belong to a different application. The pack
       is then written with locators for a form that is not there, and the
       failure arrives as a timeout in `setup:auth`.
    */
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#uName')).toHaveValue('Email address *');

    dashboard.recorder.probeResult = {
      ...probeFound(),
      signIn: null,
      notes: ['No sign-in form on this host.'],
    };
    await page.click('#probe');

    await expect(page.locator('#findings')).toContainText('not found');
    await expect(page.locator('#uName')).toHaveValue('');
    await expect(page.locator('#pName')).toHaveValue('');
    await expect(page.locator('#sName')).toHaveValue('');
  });

  test('a failing read says so and leaves the button pressable', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.failWith['/api/probe'] = 'The browser would not start.';
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');

    await expect(page.locator('#s1status')).toContainText('The browser would not start.');
    await expect(page.locator('#probe')).toBeEnabled();
    await expect(page.locator('#s2'), 'and unlocks nothing').toHaveAttribute('inert', '');
  });
});

test.describe('skipping the read', () => {
  test('unlocks the same steps and says what that costs', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.click('#skipProbe');

    await expect(page.locator('#s2')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#findings')).toContainText('placeholder');
  });

  test('after a read, skipping does not leave a capability switched on with no document', async ({
    dashboard,
  }) => {
    /*
       Read the application, find its OpenAPI document — contracts and api go
       on. Then press skip. `probed` is set to null, so the document is gone,
       but the two checkboxes it switched on stay checked. The pack ships with
       `contracts: true` and nothing to validate against: a contract suite that
       reports coverage and checks nothing.
    */
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#lContracts')).toBeChecked();

    await page.click('#skipProbe');
    await expect(page.locator('#lContracts')).not.toBeChecked();
  });

  test('after a read, skipping clears the names that read produced', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#uName')).toHaveValue('Email address *');

    await page.click('#skipProbe');
    await expect(page.locator('#uName')).toHaveValue('');
  });
});

test.describe('the service rows', () => {
  test('start with one primary row that cannot be removed', async ({ dashboard }) => {
    const { page } = dashboard;
    await expect(page.locator('#services .service')).toHaveCount(1);
    await expect(page.locator(serviceRow(0))).toContainText('primary');
    await expect(page.locator(serviceRow(0)).getByRole('button')).toHaveCount(0);
  });

  test('add and remove', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.click('#addService');
    await page.click('#addService');
    await expect(page.locator('#services .service')).toHaveCount(3);

    await page.locator(serviceRow(1)).getByRole('button', { name: 'Remove this service' }).click();
    await expect(page.locator('#services .service')).toHaveCount(2);
  });

  test('a named extra service reaches the plan under its name', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#addService');
    await page.locator(serviceRow(1)).locator('input').first().fill('billing');
    await page.locator(serviceRow(1)).locator('input').nth(1).fill('https://billing.shop.test');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('file(s) will be written');
    expect(dashboard.lastCall('/api/plan')!.apiServices).toEqual({
      billing: 'https://billing.shop.test',
    });
  });

  test('a service with a URL and no name is refused, with the reason', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#addService');
    await page.locator(serviceRow(1)).locator('input').nth(1).fill('https://billing.shop.test');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('not a usable service name');
  });

  test('a service with a name and no URL is refused, with the reason', async ({ dashboard }) => {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#addService');
    await page.locator(serviceRow(1)).locator('input').first().fill('billing');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('absolute http(s) base URL');
  });

  test('a blank extra row is ignored rather than refused', async ({ dashboard }) => {
    // Somebody pressed "add another" and changed their mind. Refusing to plan
    // because of an empty field is how a form becomes annoying.
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    await page.click('#addService');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText('file(s) will be written');
  });

  test('two services with the same name are refused, not silently merged', async ({ dashboard }) => {
    /*
       An object key can only hold one value, so the second row wins and the
       first disappears. The reader typed two back ends and got one, with no
       message — and the spec that calls `apis.billing` reaches whichever host
       happened to be lower down the form.
    */
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.click('#skipProbe');
    for (const url of ['https://billing-a.shop.test', 'https://billing-b.shop.test']) {
      await page.click('#addService');
    const row = page.locator('#services .service').last();
      await row.locator('input').first().fill('billing');
      await row.locator('input').nth(1).fill(url);
    }
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText("Two services are called 'billing'");
    await expect(page.locator('#plan')).toContainText('Rename one');
  });

  test('an extra service named api collides with the primary and is refused', async ({
    dashboard,
  }) => {
    // The primary *is* `api`. A second row of that name publishes `apis.api`
    // over it, and which one a spec reaches depends on row order.
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.locator(serviceRow(0)).locator('input').nth(1).fill('https://api.shop.test');
    await page.click('#skipProbe');
    await page.click('#addService');
    await page.locator(serviceRow(1)).locator('input').first().fill('api');
    await page.locator(serviceRow(1)).locator('input').nth(1).fill('https://other.shop.test');
    await page.click('#preview');

    await expect(page.locator('#plan')).toContainText("Two services are called 'api'");
    await expect(page.locator('#plan')).toContainText('already published as api');
  });
});
