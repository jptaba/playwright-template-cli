import { expect, test } from '@playwright/test';
import {
  buildTestUsersView,
  testUsersRoutes,
  type TestUsersService,
} from '../../src/support/secrets/dashboard';
import { CREDENTIAL_LOCATIONS, credentialPath } from '../../src/support/secrets/locations';
import { createRouter } from '../../src/support/ui/router';

/**
 * Test users — the page that says where credentials live.
 *
 * There was one local option and it was committed, so somebody onboarding a
 * real application had nowhere to put a real password except a tracked file or
 * a Vault they might not have had yet.
 *
 * The rule everything here is built around: **no value ever comes back out.**
 * The page reports existence, field names and which file answered, which is
 * what makes the safe path easier than the unsafe one for somebody debugging a
 * credential problem — the moment it is harder, they reach for the tool that
 * prints the secret.
 */

function service(overrides: Partial<TestUsersService> = {}): TestUsersService {
  return {
    targets: () => ['shop'],
    credentialRefs: (target) =>
      target === 'shop'
        ? {
            source: 'local',
            root: 'qa/shop/pools',
            accountType: 'workforce',
            roles: ['customer', 'admin'],
            poolSize: { customer: 2, admin: 1 },
          }
        : null,
    describe: async () => ({ exists: true, fields: ['username', 'password'] }),
    write: async () => ({ file: 'config/secrets.private.json' }),
    forget: async () => ({ file: 'config/secrets.private.json' }),
    ...overrides,
  };
}

const send = (path: string, body: Record<string, unknown>, over: Partial<TestUsersService> = {}) =>
  createRouter(testUsersRoutes(service(over)), { token: 't' })({
    method: 'POST',
    path,
    body,
    token: 't',
    host: '127.0.0.1:1',
  });

test.describe('the options', () => {
  test('every one says where the value ends up and whether git can see it', () => {
    for (const location of CREDENTIAL_LOCATIONS) {
      expect(location.where, location.id).not.toBe('');
      expect(location.howToSet, location.id).not.toBe('');
      expect(location.howToRead, location.id).not.toBe('');
      expect(location.howToUpdate, location.id).not.toBe('');
      expect(location.suitedTo, location.id).not.toBe('');
      expect(typeof location.gitSafe, location.id).toBe('boolean');
    }
  });

  test('the one that is not git-safe says so out loud', () => {
    // A password committed is in the history of every clone, and removing it
    // later does not remove it from the history.
    const shared = CREDENTIAL_LOCATIONS.find((entry) => entry.id === 'shared-file')!;
    expect(shared.gitSafe).toBe(false);
    expect(shared.caution).toContain('git');
  });

  test('the private file is offered above the committed one', () => {
    // Order is the recommendation: the top option is the safest that can work.
    const ids = CREDENTIAL_LOCATIONS.map((entry) => entry.id);
    expect(ids.indexOf('private-file')).toBeLessThan(ids.indexOf('shared-file'));
  });

  test('gitignored is not sold as encrypted', () => {
    const priv = CREDENTIAL_LOCATIONS.find((entry) => entry.id === 'private-file')!;
    expect(priv.caution).toContain('not encrypted');
  });

  test('only the two files are writable from a browser', () => {
    const writable = CREDENTIAL_LOCATIONS.filter((entry) => entry.writable).map((e) => e.id);
    expect(writable).toEqual(['private-file', 'shared-file']);
  });
});

test.describe('the view', () => {
  test('lists every account the profile implies, pool and all', async () => {
    const view = await buildTestUsersView(service(), 'shop');
    expect(view.slots.map((slot) => slot.path)).toEqual([
      'qa/shop/pools/workforce/customer/1',
      'qa/shop/pools/workforce/customer/2',
      'qa/shop/pools/workforce/admin/1',
    ]);
  });

  test('an account the store cannot resolve is the one a run fails on', async () => {
    const view = await buildTestUsersView(
      service({
        describe: async (_target, path) =>
          path.endsWith('customer/2')
            ? { exists: false, fields: [] }
            : { exists: true, fields: ['username', 'password'] },
      }),
      'shop',
    );
    expect(view.slots.filter((slot) => slot.missing).map((slot) => slot.path)).toEqual([
      'qa/shop/pools/workforce/customer/2',
    ]);
  });

  test('a payload missing a password is missing, not present', async () => {
    // "It exists" is not the question `setup:auth` asks; it needs both fields.
    const view = await buildTestUsersView(
      service({ describe: async () => ({ exists: true, fields: ['username'] }) }),
      'shop',
    );
    expect(view.slots.every((slot) => slot.missing)).toBe(true);
  });

  test('never carries a value, whatever the store holds', async () => {
    const view = await buildTestUsersView(service(), 'shop');
    for (const slot of view.slots) {
      expect(Object.keys(slot)).not.toContain('username');
      expect(Object.keys(slot)).not.toContain('password');
      expect(slot.fields, 'names only').toEqual(['username', 'password']);
    }
  });

  test('says which file answered, because precedence makes that the real question', async () => {
    const view = await buildTestUsersView(
      service({
        describe: async () => ({
          exists: true,
          fields: ['username', 'password'],
          origin: 'config/secrets.private.json',
        }),
      }),
      'shop',
    );
    expect(view.slots[0]!.origin).toBe('config/secrets.private.json');
  });

  test('warns when a credential resolves from the file that is in git', async () => {
    const view = await buildTestUsersView(
      service({
        describe: async () => ({
          exists: true,
          fields: ['username', 'password'],
          origin: 'config/secrets.local.json',
        }),
      }),
      'shop',
    );
    expect(view.warnings.join(' ')).toContain('tracked in git');
  });

  test('a shared deployment says its accounts are shared too', async () => {
    const view = await buildTestUsersView(
      service({
        credentialRefs: () => ({
          source: 'local',
          root: 'qa/shop/pools',
          accountType: 'workforce',
          roles: ['customer'],
          sharedEnvironment: true,
        }),
      }),
      'shop',
    );
    expect(view.warnings.join(' ')).toContain('outside the team');
  });

  test('a store that cannot be reached is a missing account, not a crash', async () => {
    // Vault being down must not take the page with it — the answer is still
    // "this account does not resolve", which is what somebody needs to see.
    const view = await buildTestUsersView(
      service({
        describe: async () => {
          throw new Error('Vault is unreachable');
        },
      }),
      'shop',
    );
    expect(view.slots.every((slot) => slot.missing)).toBe(true);
  });

  test('no target selected is an empty view, not an error', async () => {
    expect((await buildTestUsersView(service(), null)).slots).toEqual([]);
  });

  test('an unknown target says so rather than showing nothing', async () => {
    const view = await buildTestUsersView(service(), 'not-here');
    expect(view.warnings.join(' ')).toContain('not an application');
  });
});

test.describe('writing', () => {
  const aPath = credentialPath({ root: 'qa/shop/pools', accountType: 'workforce' }, 'customer', 2);

  test('a credential goes where it was told, and the reply says only that', async () => {
    const response = await send('/api/users/set', {
      target: 'shop',
      location: 'private-file',
      path: aPath,
      username: 'someone@shop.test',
      password: 'the-secret-value',
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('config/secrets.private.json');
    expect(response.body, 'the value must not come back').not.toContain('the-secret-value');
    expect(response.body).not.toContain('someone@shop.test');
  });

  test('Vault cannot be written from a browser tab', async () => {
    /*
       The rule is that the agent writes the reference and a person writes the
       value. A page that could write to Vault would be a browser tab holding a
       token able to change production credentials.
    */
    const response = await send('/api/users/set', {
      target: 'shop',
      location: 'vault',
      path: aPath,
      username: 'u',
      password: 'p',
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('person with Vault access');
  });

  test('the environment cannot either, and says who does set it', async () => {
    const response = await send('/api/users/set', {
      target: 'shop',
      location: 'environment',
      path: aPath,
      username: 'u',
      password: 'p',
    });
    expect(response.status).toBe(400);
    expect(response.body).toContain('whatever runs the suite');
  });

  test('a path outside the target own root is refused', async () => {
    // The path arrives over HTTP and names a key in a file this writes to.
    for (const path of ['qa/other/pools/workforce/customer/1', '../../etc/passwd', '']) {
      const response = await send('/api/users/set', {
        target: 'shop',
        location: 'private-file',
        path,
        username: 'u',
        password: 'p',
      });
      expect(response.status, path).toBe(400);
    }
  });

  test('an unknown target is refused before anything is written', async () => {
    let wrote = 0;
    const response = await send(
      '/api/users/set',
      {
        target: 'not-here',
        location: 'private-file',
        path: 'qa/shop/pools/workforce/customer/1',
        username: 'u',
        password: 'p',
      },
      {
        write: async () => {
          wrote += 1;
          return { file: 'x' };
        },
      },
    );
    expect(response.status).toBe(400);
    expect(wrote, 'nothing was written').toBe(0);
  });

  test('both halves are required', async () => {
    for (const half of [
      { username: 'u', password: '' },
      { username: '', password: 'p' },
    ]) {
      const response = await send('/api/users/set', {
        target: 'shop',
        location: 'private-file',
        path: aPath,
        ...half,
      });
      expect(response.status).toBe(400);
    }
  });

  test('is behind the same loopback and token checks as everything else', async () => {
    const handle = createRouter(testUsersRoutes(service()), { token: 't' });
    const body = { target: 'shop', location: 'private-file', path: aPath, username: 'u', password: 'p' };

    expect(
      (await handle({ method: 'POST', path: '/api/users/set', body, token: 't', host: 'evil.example' }))
        .status,
    ).toBe(403);
    expect(
      (await handle({ method: 'POST', path: '/api/users/set', body, token: null, host: '127.0.0.1:1' }))
        .status,
    ).toBe(403);
  });
});

test.describe('forgetting', () => {
  test('removes one account and says which file changed', async () => {
    const response = await send('/api/users/forget', {
      target: 'shop',
      location: 'private-file',
      path: 'qa/shop/pools/workforce/customer/2',
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('config/secrets.private.json');
  });

  test('cannot reach outside the target own root either', async () => {
    const response = await send('/api/users/forget', {
      target: 'shop',
      location: 'private-file',
      path: 'qa/other/pools/workforce/customer/1',
    });
    expect(response.status).toBe(400);
  });
});
