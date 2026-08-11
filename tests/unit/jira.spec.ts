import { expect, test } from '@playwright/test';
import { FakeJiraServer } from '../support/fake-jira-server';
import {
  JiraAuthError,
  JiraClient,
  defectFingerprint,
  extractCriteria,
  wikiToPlainText,
} from '../../src/integrations/jira/client';
import { registerSecret, resetSecretRegistry } from '../../src/support/redact';

test.describe('JiraClient (Data Center)', () => {
  let server: FakeJiraServer;
  let baseURL: string;

  const clientFor = (token = 'jira-service-pat') =>
    new JiraClient({ baseURL, token, acceptanceCriteriaField: 'customfield_10101' });

  test.beforeEach(async () => {
    resetSecretRegistry();
    server = new FakeJiraServer();
    baseURL = await server.start();
  });

  test.afterEach(async () => {
    await server.stop();
  });

  test('a wrong credential is a named auth error, not a generic failure', async () => {
    const client = clientFor('not-the-pat');
    await expect(client.getIssue('FIN-2210')).rejects.toThrow(JiraAuthError);
    await expect(client.getIssue('FIN-2210')).rejects.toThrow(/Bearer|8\.14/);
    await client.dispose();
  });

  test('reads a story and normalises its wiki markup to plain text', async () => {
    server.seedIssue('FIN-2210', {
      summary: 'Expense claims over the approval limit are rejected',
      description: 'h2. Context\nA *claim* above the [limit|http://wiki/limit] must be refused.',
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
      labels: ['finance'],
      customfield_10101: '* Claims over 10,000 are rejected\n* The message names the limit',
    });
    const client = clientFor();

    const issue = await client.getIssue('FIN-2210');

    expect(issue.description).toContain('A claim above the limit must be refused.');
    expect(issue.description).not.toContain('http://wiki/limit');
    expect(issue.acceptanceCriteria).toEqual([
      'Claims over 10,000 are rejected',
      'The message names the limit',
    ]);
    await client.dispose();
  });

  test('falls back to an Acceptance Criteria heading when no field is configured', () => {
    const description = [
      'h2. Background',
      'Some context here.',
      '',
      'h2. Acceptance Criteria',
      '* Total shows subtotal, tax and grand total',
      '* Tax is 8%',
    ].join('\n');

    expect(extractCriteria(undefined, description)).toEqual([
      'Total shows subtotal, tax and grand total',
      'Tax is 8%',
    ]);
  });

  test('a story with no identifiable criteria yields none, so it can be rejected', () => {
    // "A story that has none is rejected rather than guessed at" (§15).
    expect(extractCriteria(undefined, 'Just a paragraph of context.')).toEqual([]);
  });

  test('deduplicates on a fingerprint so a flaky test files one ticket, not forty', async () => {
    const client = clientFor();
    const fingerprint = defectFingerprint('TC-4821', 'Expected "Rejected" but got "Approved"');

    const key = await client.createDefect({
      projectKey: 'QA',
      summary: 'TC-4821 failing',
      description: 'h3. Failure\nExpected "Rejected" but got "Approved"',
      fingerprint,
    });
    const found = await client.findDefectByFingerprint('QA', fingerprint);

    expect(found?.key).toBe(key);
    expect(found?.resolved).toBe(false);
    await client.dispose();
  });

  test('the fingerprint ignores the parts of an error that change every run', () => {
    const first = defectFingerprint(
      'TC-1',
      'Timeout at 2026-03-01T09:00:00Z waiting for order 4821 (id 0x7ffe)',
    );
    const second = defectFingerprint(
      'TC-1',
      'Timeout at 2026-03-02T11:22:33Z waiting for order 9137 (id 0x1abc)',
    );
    const different = defectFingerprint('TC-1', 'Element not found: submit button');

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });

  test('reopens a closed defect by transition name rather than a hard-coded id', async () => {
    // "DC transitions are workflow-specific — the adapter must look up
    // available transitions by name, which differ per project" (§15).
    server.seedIssue('QA-500', {
      summary: 'Known failure',
      status: { name: 'Done' },
      labels: ['qa-fp-abc123'],
    });
    const client = clientFor();

    const found = await client.findDefectByFingerprint('QA', 'abc123');
    expect(found?.resolved).toBe(true);

    const applied = await client.transitionByName('QA-500', ['Reopen Issue', 'Reopen']);

    expect(applied).toBe('Reopen Issue');
    expect(server.transitionsApplied).toEqual([{ key: 'QA-500', id: '11' }]);
    await client.dispose();
  });

  test('a workflow with no matching transition reports it instead of failing', async () => {
    server.seedIssue('QA-501', { summary: 'x', status: { name: 'Done' } });
    server.transitions = [{ id: '31', name: 'Close Issue' }];
    const client = clientFor();

    expect(await client.transitionByName('QA-501', ['Reopen'])).toBeNull();
    await client.dispose();
  });

  test('descriptions are wiki markup and are scrubbed before they are sent', async () => {
    registerSecret('secret_sauce_live', 'vault:qa/app.password');
    const client = clientFor();

    await client.createDefect({
      projectKey: 'QA',
      summary: 'Login failure',
      description: 'h3. Detail\nSigned in with secret_sauce_live and failed.',
      fingerprint: 'fp1',
    });

    const created = [...server.issues.values()].find((issue) => issue.fields.summary === 'Login failure');
    const description = String(created?.fields.description ?? '');
    expect(description).not.toContain('secret_sauce_live');
    expect(description).toContain('h3. Detail'); // wiki markup, not ADF JSON
    expect(description).not.toContain('"type":"doc"');
    await client.dispose();
  });

  test('comments are scrubbed too', async () => {
    registerSecret('canary-token-value', 'canary');
    server.seedIssue('FIN-2210', { summary: 'x' });
    const client = clientFor();

    await client.comment('FIN-2210', 'Run finished. token=canary-token-value');

    expect(server.comments[0]!.body).not.toContain('canary-token-value');
    await client.dispose();
  });
});

test.describe('wiki markup', () => {
  test('converts the shapes a story actually uses', () => {
    expect(wikiToPlainText('h1. Title\n*bold* and _italic_')).toBe('Title\nbold and italic');
    expect(wikiToPlainText('{code:java}int x = 1;{code}')).toBe('int x = 1;');
    expect(wikiToPlainText('[Google|https://google.com]')).toBe('Google');
    expect(wikiToPlainText('* one\n* two')).toBe('- one\n- two');
  });
});
