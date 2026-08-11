import { expect, request, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { ApiClient, ApiError, type EndpointDescriptor } from '../../src/integrations/http/api-client';
import { ContractDriftError, ContractRegistry } from '../../src/support/contracts/validator';
import { REPO_ROOT } from '../../src/support/paths';
import {
  DisabledDbReader,
  DbReader,
  ReadOnlyViolationError,
  defineQuery,
} from '../../src/integrations/db/reader';
import { ledgerQueries } from '../../src/targets/internal-app/queries/ledger';

const SPEC = path.join(REPO_ROOT, 'src', 'targets', 'internal-app', 'contracts', 'openapi.yaml');

const createOrder: EndpointDescriptor = {
  name: 'Create an order',
  method: 'POST',
  path: '/orders',
  expect: [201],
};
const getOrder: EndpointDescriptor = {
  name: 'Read an order',
  method: 'GET',
  path: '/orders/{id}',
  expect: [200],
};

const conforming = {
  id: 'o-1',
  reference: 'REF-1',
  customerId: 'c-1',
  status: 'pending',
  total: 42.5,
  createdAt: '2026-03-01T09:00:00Z',
  lines: [{ sku: 'SKU-1', quantity: 2 }],
};

/** A service that can be told to drift, so the check can be proven. */
class FakeOrdersService {
  private server?: http.Server;
  body: unknown = conforming;
  status = 201;

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => {
      res.writeHead(req.method === 'GET' ? 200 : this.status, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(this.body));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

test.describe('the shared API client', () => {
  let service: FakeOrdersService;
  let baseURL: string;

  test.beforeEach(async () => {
    service = new FakeOrdersService();
    baseURL = await service.start();
  });

  test.afterEach(async () => {
    await service.stop();
  });

  async function clientFor(options: { throwOnDrift?: boolean } = {}) {
    const context = await request.newContext();
    return {
      context,
      client: new ApiClient(context, {
        baseURL,
        runId: 'run-7',
        registry: ContractRegistry.fromFile(SPEC),
        throwOnDrift: options.throwOnDrift ?? true,
      }),
    };
  }

  test('validates every response against the published schema, for free', async () => {
    const { client, context } = await clientFor();

    const response = await client.call<typeof conforming>(createOrder, { body: {} });

    expect(response.status).toBe(201);
    expect(response.drift).toBeNull();
    await context.dispose();
  });

  test('a provider that drops a required field is reported as contract drift', async () => {
    const { client, context } = await clientFor();
    const { total: _dropped, ...withoutTotal } = conforming;
    service.body = withoutTotal;

    await expect(client.call(createOrder, { body: {} })).rejects.toThrow(ContractDriftError);
    await context.dispose();
  });

  test('a changed field type is caught even when the call succeeds', async () => {
    const { client, context } = await clientFor();
    service.body = { ...conforming, total: '42.50' }; // number → string

    const error = await client.call(createOrder, { body: {} }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ContractDriftError);
    expect(String(error)).toMatch(/provider team/);
    await context.dispose();
  });

  test('inside a UI journey drift is recorded, not thrown', async () => {
    // Failing the journey on a provider's schema change hides the thing the
    // test was actually about (§05).
    const { client, context } = await clientFor({ throwOnDrift: false });
    service.body = { ...conforming, status: 'teleported' };

    const response = await client.call(createOrder, { body: {} });

    expect(response.drift).toBeInstanceOf(ContractDriftError);
    expect(client.driftFound).toHaveLength(1);
    await context.dispose();
  });

  test('an unexpected status names the endpoint and what was expected', async () => {
    const { client, context } = await clientFor();
    service.status = 500;

    const error = await client.call(createOrder, { body: {} }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(String(error)).toContain('Create an order');
    expect(String(error)).toContain('expected 201');
    await context.dispose();
  });

  test('path templates are filled, and a missing parameter fails loudly', async () => {
    const { client, context } = await clientFor();

    await expect(client.call(getOrder, {})).rejects.toThrow(/needs a value for \{id\}/);

    const response = await client.call<typeof conforming>(getOrder, { params: { id: 'o-1' } });
    expect(response.status).toBe(200);
    await context.dispose();
  });

  test('created records are tracked and removed in teardown', async () => {
    const { client, context } = await clientFor();
    await client.call(createOrder, { body: {} });
    client.track(createOrder, 'o-1');

    const removed: string[] = [];
    await client.cleanup(async (resource) => {
      removed.push(resource.id);
    });

    expect(removed).toEqual(['o-1']);
    await context.dispose();
  });

  test('a cleanup failure is reported but never fails the test', async () => {
    const { client, context } = await clientFor();
    client.track(createOrder, 'o-1');
    const warnings: string[] = [];

    await client.cleanup(async () => {
      throw new Error('already deleted');
    }, (message) => warnings.push(message));

    expect(warnings[0]).toContain('already deleted');
    await context.dispose();
  });

  test('records which endpoints a run actually exercised, for the coverage view', async () => {
    const { client, context } = await clientFor();
    await client.call(createOrder, { body: {} });

    const registry = ContractRegistry.fromFile(SPEC);
    const uncovered = registry.uncovered(client.exercised);

    expect([...client.exercised]).toEqual(['POST /orders']);
    expect(uncovered.map((operation) => `${operation.method} ${operation.path}`)).toContain(
      'GET /orders/{id}',
    );
    await context.dispose();
  });
});

test.describe('the contract registry', () => {
  test('an undocumented endpoint is a coverage gap, not a failure', () => {
    const registry = ContractRegistry.fromFile(SPEC);
    expect(registry.validate('GET', '/not-in-the-spec', 200, { anything: true })).toEqual([]);
  });

  test('lists the documented operations so the contract project can walk them', () => {
    const operations = ContractRegistry.fromFile(SPEC).operations();
    expect(operations.map((operation) => `${operation.method} ${operation.path}`).sort()).toEqual([
      'DELETE /orders/{id}',
      'GET /orders',
      'GET /orders/{id}',
      'POST /orders',
    ]);
  });

  test('resolves $ref into the components section', () => {
    const registry = ContractRegistry.fromFile(SPEC);
    const failures = registry.validate('POST', '/orders', 201, { id: 'o-1' });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.message).toMatch(/required/);
  });
});

test.describe('database access', () => {
  test('a write statement is rejected where the query is defined', () => {
    expect(() =>
      defineQuery({ name: 'sneaky insert', sql: 'INSERT INTO ledger VALUES (1)', parameters: 0 }),
    ).toThrow(ReadOnlyViolationError);

    expect(() =>
      defineQuery({ name: 'stacked', sql: 'SELECT 1; DELETE FROM ledger', parameters: 0 }),
    ).toThrow(/more than one statement/);
  });

  test('the shipped queries are read-only and named for the fact they establish', () => {
    expect(ledgerQueries.entryForReference.name).toContain('ledger entry');
    expect(ledgerQueries.entryForReference.sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
  });

  test('a parameter-count mismatch fails before the query runs', async () => {
    const reader = new DbReader({
      query: async () => [],
      close: async () => undefined,
    });

    await expect(reader.run(ledgerQueries.entryForReference, [])).rejects.toThrow(
      /takes 1 parameter\(s\), got 0/,
    );
  });

  test('a runaway result set is capped rather than loaded', async () => {
    const reader = new DbReader(
      {
        query: async <TRow>() => Array.from({ length: 20 }, () => ({}) as TRow),
        close: async () => undefined,
      },
      { maxRows: 5 },
    );

    await expect(reader.run(ledgerQueries.auditTrailForOrder, ['o-1'])).rejects.toThrow(/row cap/);
  });

  test('a target with db disabled states the reason instead of failing obscurely', async () => {
    const reader = new DisabledDbReader('reference-app');
    await expect(reader.run(ledgerQueries.entryForReference, ['REF-1'])).rejects.toThrow(
      /capabilities\.db\.enabled = false/,
    );
  });
});
