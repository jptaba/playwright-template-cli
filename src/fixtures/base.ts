import { test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import { resolveTarget } from '../../config/target';
import type { TargetProfile } from '../../config/targets/types';
import { createSecretStore, type SecretPayload, type SecretStore } from '../integrations/secrets';
import { ApiClient } from '../integrations/http/api-client';
import { DbReader, DisabledDbReader } from '../integrations/db/reader';
import { ContractRegistry } from '../support/contracts/validator';
import { createScanner, type A11yScanner } from '../integrations/a11y/scanner';
import { runAxe } from '../integrations/a11y/axe-runner';
import { MailpitInbox } from '../integrations/mail/mailpit-inbox';
import { plusAddress, type MailInbox } from '../integrations/mail/types';
import { EmailOtpProvider, TotpOtpProvider } from '../integrations/otp/providers';
import { UnsupportedOtpProvider, type OtpProvider } from '../integrations/otp/types';
import { VaultAccountPool, type AccountLease } from '../integrations/vault/account-pool';
import { VaultSecretStore } from '../integrations/vault/vault-store';
import { registerSecretPayload } from '../support/redact';
import { storageStatePath } from '../support/paths';

/**
 * L3 — the injectable surface (§03).
 *
 * This file is the closed vocabulary. A generated spec picks from what is
 * declared here and nothing else; if the thing it needs is absent, the agent
 * is instructed to stop and ask rather than reach for `page.locator`. Keeping
 * the list short is the point, so resist adding a fixture that one spec wants.
 *
 * Target-agnostic by construction: it names no host, no selector and no
 * business verb. Per-target action fixtures extend this in
 * `src/targets/<name>/fixtures.ts`.
 */

export interface RunContext {
  /** Stable for the whole run, and stamped on every record the suite creates. */
  runId: string;
  /** A value unique to this run and worker — for cleanup by run id (§05). */
  unique(prefix: string): string;
  workerIndex: number;
}

export interface SecretsFixture {
  /**
   * Resolve a credential reference. Values are registered with the redaction
   * helper at fetch time, cached per worker, and never written to disk or
   * copied into `process.env` (§11).
   */
  read(path: string): Promise<SecretPayload>;
  /** Credentials for a pooled account, on the profile's path shape. */
  account(role: string, index?: number): Promise<SecretPayload>;
  /** Existence and field names only — never values. */
  describe(path: string): Promise<{ exists: boolean; fields: string[] }>;
}

export interface FrameworkOptions {
  /**
   * Which role's session `authedPage` uses. Empty means signed out, which is
   * what the `auth-flows` project needs — a spec about logging in must not
   * inherit a session it was supposed to establish itself (§13).
   */
  role: string;
}

/** An account this worker holds for the duration of its run. */
export interface LeasedAccount {
  role: string;
  username: string;
  password: string;
  /** Pool index, or null for a target with a static account list. */
  index: number | null;
  release(): Promise<void>;
}

export interface AccountsFixture {
  /**
   * Take an account for this worker. Worker-scoped by design: one login and
   * one storage state per worker rather than per test, while still
   * guaranteeing two parallel workers never share an identity (§13).
   *
   * On a `static` pool this is a plain read; on a `leased` pool it is an
   * atomic, TTL'd lease.
   */
  lease(role: string): Promise<LeasedAccount>;
}

/**
 * Capability-gated fixtures state the reason they are unavailable rather than
 * failing obscurely, and the run report says "api: not applicable for
 * <target>" rather than showing a silent zero (§04, §05).
 */
export class CapabilityDisabledError extends Error {
  constructor(targetName: string, capability: string, consequence: string) {
    super(
      `Target '${targetName}' declares capabilities.${capability} disabled, so ${consequence}. ` +
        'This is a declared property of the application under test, not a failure — a spec that ' +
        'needs it should be skipped for this target (§04).',
    );
    this.name = 'CapabilityDisabledError';
  }
}

export interface FrameworkWorkerFixtures {
  /** The resolved target profile: base URL, capabilities, environment, roles. */
  target: TargetProfile;
  /** Run identity and unique-value helpers, so created records are traceable. */
  run: RunContext;
  /** Credential lookup by reference. Values are registered for redaction. */
  secrets: SecretsFixture;
  /** The underlying store. Prefer `secrets`; this is for adapters that need more. */
  secretStore: SecretStore;
  /** Leases an account for this worker — atomic and TTL'd on a pooled target. */
  accounts: AccountsFixture;
  /** Resolves an OTP however this target does MFA — or refuses, with a reason. */
  otp: OtpProvider;
  /** The mail sink, when one is configured. Null otherwise. */
  inbox: MailInbox | null;
}

export interface FrameworkTestFixtures {
  /** A page already carrying the role's session. Never drives a login form. */
  authedPage: Page;
  /**
   * The shared HTTP client, with response-schema validation inside it — so
   * every API call in every test, including the setup calls inside UI tests,
   * is a contract check for free (§05).
   */
  api: ApiClient;
  /**
   * The other services this application is made of, by name — `apis.billing`,
   * `apis.search`. Each carries the same schema validation, cleanup tracking
   * and trace as `api`.
   *
   * Named rather than addressed: a spec says which service it is talking to,
   * and the URL stays in the profile where `no-hardcoded-urls` can see it.
   * Without this, the first endpoint on a second host becomes a raw `fetch`.
   */
  apis: Record<string, ApiClient>;
  /**
   * Read-only database access. Last on the list of ways to assert anything,
   * and disabled unless the target declares it (§05).
   */
  db: DbReader;
  /** The vendored contract document, when the target publishes one. */
  contracts: ContractRegistry | null;
  /**
   * Accessibility scanning against the standard the target declares. Returns
   * findings; the spec decides what counts as a failure.
   */
  a11y: A11yScanner;
}

const RUN_ID = process.env.RUN_ID ?? `local-${Date.now().toString(36)}`;

export const test = base.extend<
  FrameworkOptions & FrameworkTestFixtures,
  FrameworkWorkerFixtures
>({
  // ---- options -------------------------------------------------------------
  role: ['', { option: true }],

  // ---- worker-scoped -------------------------------------------------------
  target: [
    async ({}, use) => {
      await use(resolveTarget());
    },
    { scope: 'worker' },
  ],

  run: [
    async ({}, use, workerInfo) => {
      const workerIndex = workerInfo.workerIndex;
      let counter = 0;
      await use({
        runId: RUN_ID,
        workerIndex,
        unique: (prefix: string) => `${prefix}-${RUN_ID}-w${workerIndex}-${++counter}`,
      });
    },
    { scope: 'worker' },
  ],

  secretStore: [
    async ({ target }, use) => {
      const store = createSecretStore(target);
      await use(store);
      // Tokens are revoked and sockets released in teardown, not left to expire.
      await store.close();
    },
    { scope: 'worker' },
  ],

  secrets: [
    async ({ secretStore, target }, use) => {
      const cache = new Map<string, SecretPayload>();

      const read = async (path: string): Promise<SecretPayload> => {
        const cached = cache.get(path);
        if (cached) return cached;
        const payload = await secretStore.read(path);
        // Registered at fetch time so a value that later reaches a trace,
        // a report or a PractiTest attachment is already scrubbable (§11).
        registerSecretPayload(payload, path);
        cache.set(path, payload);
        return payload;
      };

      await use({
        read,
        account: (role: string, index = 1) =>
          read(`${target.credentials.root}/${target.credentials.accountType}/${role}/${index}`),
        describe: async (path: string) => {
          const description = await secretStore.describe(path);
          return { exists: description.exists, fields: description.fields };
        },
      });

      cache.clear();
    },
    { scope: 'worker' },
  ],

  accounts: [
    async ({ secretStore, secrets, target, run }, use) => {
      const held = new Map<string, LeasedAccount>();
      const { root, accountType } = target.credentials;

      // Leasing needs compare-and-swap, which only the Vault store provides.
      // A static pool needs none of it — and saying so here is what keeps the
      // whole of §13 inert for targets that declare `accountPool: 'static'`.
      const pool =
        target.capabilities.accountPool === 'leased' && secretStore instanceof VaultSecretStore
          ? new VaultAccountPool(secretStore, {
              poolRoot: `${root}/${accountType}`,
              size: Number(process.env.ACCOUNT_POOL_SIZE ?? 8),
              leaseTtlMs: Number(process.env.ACCOUNT_LEASE_TTL_MS ?? 30 * 60_000),
              holder: `${run.runId}/w${run.workerIndex}`,
            })
          : null;

      await use({
        lease: async (role: string): Promise<LeasedAccount> => {
          const existing = held.get(role);
          if (existing) return existing;

          let account: LeasedAccount;
          if (pool) {
            const leased: AccountLease = await pool.lease(role);
            registerSecretPayload(leased.credentials, `${root}/${accountType}/${role}`);
            account = {
              role,
              username: leased.credentials.username ?? '',
              password: leased.credentials.password ?? '',
              index: leased.index,
              release: () => leased.release(),
            };
          } else {
            const payload = await secrets.account(role);
            account = {
              role,
              username: payload.username ?? '',
              password: payload.password ?? '',
              index: null,
              release: async () => undefined,
            };
          }
          held.set(role, account);
          return account;
        },
      });

      // Release is best-effort; the lease TTL is the real guarantee (§22).
      for (const account of held.values()) {
        try {
          await account.release();
        } catch {
          // A failed release must not fail a run. The TTL reclaims it.
        }
      }
    },
    { scope: 'worker' },
  ],

  inbox: [
    async ({}, use) => {
      const mailApiUrl = process.env.MAIL_API_URL;
      const inbox = mailApiUrl ? await MailpitInbox.create(mailApiUrl) : null;
      await use(inbox);
      await inbox?.close?.();
    },
    { scope: 'worker' },
  ],

  otp: [
    async ({ target, secretStore, accounts, inbox, run }, use) => {
      const mfa = target.capabilities.mfa;

      if (mfa === 'none') {
        await use(new UnsupportedOtpProvider(target.name));
        return;
      }

      const account = await accounts.lease(target.roles[0] ?? '');

      if (mfa === 'totp') {
        if (!(secretStore instanceof VaultSecretStore)) {
          throw new Error(
            `Target '${target.name}' declares mfa: 'totp', which needs Vault's TOTP secrets ` +
              'engine. The local store cannot issue codes — set SECRET_SOURCE=vault (§12).',
          );
        }
        await use(new TotpOtpProvider(secretStore, `${target.environment}-${account.username}`));
        return;
      }

      if (!inbox) {
        throw new Error(
          `Target '${target.name}' declares mfa: 'email' but no mail sink is configured. ` +
            'Set MAIL_API_URL to the read interface of the environment\'s mail tool. If it has ' +
            'none, email OTP cannot be automated at all — see the capability table in §12.',
        );
      }
      const base = target.mailBaseAddress;
      if (!base) {
        throw new Error(
          `Target '${target.name}' declares mfa: 'email' but no mailBaseAddress in its profile.`,
        );
      }
      await use(
        new EmailOtpProvider(inbox, plusAddress(base, `${run.runId}-w${run.workerIndex}`)),
      );
    },
    { scope: 'worker' },
  ],

  // ---- test-scoped ---------------------------------------------------------

  /**
   * Overriding Playwright's own `storageState` option with a fixture is what
   * lets a spec select a role with `test.use({ role: 'approver' })` while the
   * built-in context, tracing and video capture keep working unchanged.
   */
  storageState: async ({ role, target }, use) => {
    await use(role ? storageStatePath(role, target.name) : undefined);
  },

  contracts: async ({ target }, use) => {
    const { enabled, spec } = target.capabilities.contracts;
    await use(enabled && spec ? ContractRegistry.fromFile(spec) : null);
  },

  api: async ({ request, target, run, contracts }, use, testInfo) => {
    const capability = target.capabilities.api;
    if (!capability.enabled || !capability.baseURL) {
      // Constructing it anyway would let a spec make calls against a target
      // that has declared it has no API — and fail with a DNS error.
      throw new CapabilityDisabledError(
        target.name,
        'api.enabled',
        'there is no service API to call',
      );
    }

    const client = new ApiClient(request, {
      baseURL: capability.baseURL,
      runId: run.runId,
      registry: contracts,
      /*
         Drift fails the `contract` project and is recorded everywhere else.

         The original rule was "throw unless this is a UI journey", on the
         reasoning that failing a journey on a provider's schema change hides
         what the test was actually about. That reasoning is not about
         browsers — it is about the difference between a spec that asserts
         *behaviour* and a spec that asserts *conformance*. A real provider
         drift proved it: the service returned `null` where its own document
         promised a number, and "a customer can list their invoices" went red
         for a reason that had nothing to do with the claim it makes. Four
         behavioural specs failed and one contract spec failed, and only the
         last of those was informative.

         So conformance is the contract project's job, and every other project
         records drift and carries on. Nothing is swallowed: what was found is
         attached to the result below and surfaced in the run report (§05, §20).
      */
      throwOnDrift: testInfo.project.name === 'contract',
    });

    await use(client);

    // Recorded, not silent. A drift nobody sees is a drift nobody tickets.
    if (client.driftFound.length > 0 && testInfo.project.name !== 'contract') {
      await testInfo.attach('contract-drift', {
        body: client.driftFound.map((drift) => drift.message).join('\n\n'),
        contentType: 'text/plain',
      });
    }

    /*
       Everything created gets cleaned up. A test environment that fills with
       orphaned records becomes slow and then untrustworthy (§05).

       Deletion goes through the client rather than through `request.fetch`
       here, which is what makes it carry the credential the spec was using.
       The earlier version built the URL by splitting the creating endpoint's
       path — unauthenticated, and wrong for any nested resource — so on an API
       that needs a token to delete, every cleanup 401'd into the warning log
       and the suite stayed green while the environment filled up.
    */
    await client.cleanup(undefined, (message) =>
      testInfo.attach('cleanup-warning', { body: message, contentType: 'text/plain' }),
    );
  },

  /**
   * One client per additional service the profile names.
   *
   * Built lazily-but-eagerly: an application with four back ends gets four
   * clients whether or not the spec touches them, which costs nothing — an
   * `ApiClient` holds no connection — and means `apis.billing` is either there
   * or the profile never declared it, rather than sometimes undefined.
   */
  apis: async ({ request, target, run, contracts }, use, testInfo) => {
    const capability = target.capabilities.api;
    const services = capability.enabled ? (capability.services ?? {}) : {};

    const clients: Record<string, ApiClient> = {};
    for (const [name, baseURL] of Object.entries(services)) {
      clients[name] = new ApiClient(request, {
        baseURL,
        runId: run.runId,
        registry: contracts,
        throwOnDrift: testInfo.project.name === 'contract',
      });
    }

    await use(clients);

    for (const [name, client] of Object.entries(clients)) {
      await client.cleanup(undefined, (message) =>
        testInfo.attach(`cleanup-warning-${name}`, { body: message, contentType: 'text/plain' }),
      );
      if (client.driftFound.length > 0 && testInfo.project.name !== 'contract') {
        await testInfo.attach(`contract-drift-${name}`, {
          body: client.driftFound.map((drift) => drift.message).join('\n\n'),
          contentType: 'text/plain',
        });
      }
    }
  },

  a11y: async ({ target }, use) => {
    const capability = target.capabilities.a11y;
    if (!capability.enabled) {
      // Constructing it anyway would let a spec claim an accessibility result
      // for a target that has not said which standard it is held to.
      throw new CapabilityDisabledError(
        target.name,
        'a11y.enabled',
        'no accessibility standard has been declared for it',
      );
    }
    await use(createScanner(capability, runAxe));
  },

  db: async ({ target }, use) => {
    if (!target.capabilities.db.enabled) {
      await use(new DisabledDbReader(target.name));
      return;
    }
    throw new Error(
      `Target '${target.name}' enables capabilities.db, but no driver adapter is registered. ` +
        'Provide a DbDriver built on dynamic read-only credentials from Vault\'s database ' +
        'secrets engine — never a static password in a KV path (§05).',
    );
  },

  authedPage: async ({ page, role, target }, use) => {
    if (!role) {
      throw new Error(
        'authedPage was requested with no role. Set `role` in the project config, or use ' +
          '`page` if the spec is about signing in — @auth specs run in the auth-flows project (§13).',
      );
    }
    const statePath = storageStatePath(role, target.name);
    if (!fs.existsSync(statePath)) {
      throw new Error(
        `No storage state for role '${role}' at ${statePath}. The setup:auth project should ` +
          'have produced it; check that the e2e project declares dependencies: ["setup:auth"].',
      );
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';
