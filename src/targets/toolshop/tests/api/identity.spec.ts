import { expect, test } from '../../fixtures';

/**
 * L4 — identity and authorisation over HTTP.
 *
 * The authorisation specs here are the ones a UI suite structurally cannot
 * write. Every one of them asks what the service does for a caller the
 * interface would never let exist — no token, the wrong role, an expired
 * credential — and those are exactly the requests that reach a public API.
 */

test(
  'TS-A13 · Signing in issues a bearer token with a stated lifetime @smoke @api',
  { annotation: [{ type: 'practitest', description: '9113' }] },
  async ({ authApi, secrets }) => {
    const { username, password } = await secrets.account('customer');

    const issued = await authApi.login({ email: username ?? '', password: password ?? '' });

    expect(issued.token_type.toLowerCase()).toBe('bearer');
    expect(issued.access_token.length).toBeGreaterThan(20);
    expect(issued.expires_in, 'the token states when it stops working').toBeGreaterThan(0);
  },
);

test(
  'TS-A14 · The current-user endpoint refuses a caller with no credential @api @security',
  { annotation: [{ type: 'practitest', description: '9114' }] },
  async ({ authApi }) => {
    expect(await authApi.statusWithoutCredential()).toBe(401);
  },
);

test(
  'TS-A15 · The current-user endpoint answers with the signed-in customer @api',
  { annotation: [{ type: 'practitest', description: '9115' }] },
  async ({ authApi, secrets }) => {
    const { username, password } = await secrets.account('customer');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });

    const me = await authApi.me();

    expect(me.email).toBe(username);
    expect(me.id).not.toBe('');
  },
);

test(
  'TS-A16 · The seeded customer has no second factor configured @api',
  { annotation: [{ type: 'practitest', description: '9116' }] },
  async ({ authApi, secrets }) => {
    const { username, password } = await secrets.account('customer');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });

    const me = await authApi.me();

    // The other half of TS-E32: the profile declares `mfa: 'none'`, and this is
    // the service agreeing with that declaration rather than a comment doing so.
    expect(me.totp_enabled).toBe(false);
  },
);

test(
  'TS-A17 · Every sales report refuses a caller with no credential @api @security',
  { annotation: [{ type: 'practitest', description: '9117' }] },
  async ({ ordersApi }) => {
    const reports = [
      'totalSalesPerCountry',
      'totalSalesOfYears',
      'averageSalesPerMonth',
      'averageSalesPerWeek',
      'topPurchasedProducts',
      'topSellingCategories',
      'customersByCountry',
    ] as const;

    for (const report of reports) {
      expect(
        await ordersApi.reportStatusWithoutCredential(report),
        `${report} refuses an anonymous caller`,
      ).toBe(401);
    }
  },
);

test(
  'TS-A18 · An administrator can read the sales reports @api',
  { annotation: [{ type: 'practitest', description: '9118' }] },
  async ({ authApi, ordersApi, secrets }) => {
    const { username, password } = await secrets.account('admin');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });

    const byCountry = await ordersApi.totalSalesPerCountry();

    expect(Array.isArray(byCountry)).toBe(true);
  },
);

test(
  'TS-A19 · A customer cannot read the sales reports @api @security',
  { annotation: [{ type: 'practitest', description: '9119' }] },
  async ({ authApi, ordersApi, secrets }) => {
    const { username, password } = await secrets.account('customer');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });

    /*
       The interesting half of an authorisation boundary is not "an
       administrator can", it is "somebody else cannot". A UI suite cannot ask
       this question at all — the customer's interface has no link to a report —
       so it can only ever be asked here.
    */
    const status = await ordersApi.reportStatusForCurrentCaller('totalSalesPerCountry');

    expect([401, 403], 'a customer is refused, not served').toContain(status);
  },
);

test(
  'TS-A20 · A signed-in customer can list their own invoices @api',
  { annotation: [{ type: 'practitest', description: '9120' }] },
  async ({ authApi, ordersApi, secrets }) => {
    const { username, password } = await secrets.account('customer');
    await authApi.signInAs({ email: username ?? '', password: password ?? '' });

    const invoices = await ordersApi.listInvoices();

    expect(Array.isArray(invoices.data)).toBe(true);
    expect(invoices.total).toBeGreaterThanOrEqual(0);
  },
);
