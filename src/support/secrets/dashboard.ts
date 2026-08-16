import { failure, json, type Route, type UiRequest, type UiResponse } from '../ui/router';
import {
  CREDENTIAL_LOCATIONS,
  credentialPath,
  WRITABLE_LOCATIONS,
  type CredentialLocation,
} from './locations';

/**
 * Test users — where an application's credentials live, and how they get there.
 *
 * Its own page rather than a sixth onboarding step, and the reason is the
 * shape of the work. Onboarding happens once; credentials are managed *over
 * time* — a role is added, a password is rotated, somebody joins and needs the
 * private file on their own machine, an application is re-onboarded and the
 * logins are still good. A step inside a five-step wizard is reachable only by
 * walking the wizard, and step 4 already collects the first set, which is the
 * right amount to ask for while somebody is trying to get a target created.
 *
 * The rule this page is built around, and the reason it looks the way it does:
 * **it never shows a value.** Every read reports existence, field names and
 * which file answered. That is what makes the safe path easier than the unsafe
 * one for somebody debugging a credential problem, who would otherwise reach
 * for the tool that prints the secret (§11, §22).
 */

/** One account slot, as the page shows it. */
export interface AccountSlot {
  role: string;
  /** 1-based, matching `<root>/<accountType>/<role>/<n>`. */
  index: number;
  path: string;
  /** Whether the store can resolve it at all. */
  present: boolean;
  /** Field names only. Never values. */
  fields: string[];
  /** Which file answered, for a local store. Absent for Vault. */
  origin?: string;
  /**
   * True when this account is the one the run would actually fail on: a slot
   * the profile says exists and the store cannot resolve.
   */
  missing: boolean;
}

export interface TestUsersView {
  target: string | null;
  /** Where this profile says its credentials come from. */
  source: string;
  root: string;
  accountType: string;
  /** Every slot the profile implies, whether or not it resolves. */
  slots: AccountSlot[];
  /** The options, with what each does to the value. */
  locations: typeof CREDENTIAL_LOCATIONS;
  /** Which of them this page can write to. */
  writable: readonly CredentialLocation[];
  /** Anything worth saying before somebody types a password. */
  warnings: string[];
}

export interface TestUsersService {
  /** Targets with a profile, so the page can offer a choice. */
  targets(): string[];
  /** The profile's credential shape, or null when the target has no profile. */
  credentialRefs(target: string): {
    source: string;
    root: string;
    accountType: string;
    roles: string[];
    poolSize?: number | Record<string, number>;
    sharedEnvironment?: boolean;
  } | null;
  /** Existence and field names only — never values. */
  describe(target: string, path: string): Promise<{ exists: boolean; fields: string[]; origin?: string }>;
  /** Write one account. Only ever called for a writable location. */
  write(input: {
    location: CredentialLocation;
    path: string;
    username: string;
    password: string;
  }): Promise<{ file: string }>;
  /** Remove one account from a local file. */
  forget(input: { location: CredentialLocation; path: string }): Promise<{ file: string }>;
}

/** How many accounts a role has, from a profile's declaration. */
function accountsFor(poolSize: number | Record<string, number> | undefined, role: string): number {
  if (typeof poolSize === 'number') return Math.max(1, poolSize);
  if (poolSize && typeof poolSize === 'object') return Math.max(1, poolSize[role] ?? 1);
  return 1;
}

export async function buildTestUsersView(
  service: TestUsersService,
  target: string | null,
): Promise<TestUsersView> {
  const empty: TestUsersView = {
    target,
    source: '',
    root: '',
    accountType: '',
    slots: [],
    locations: CREDENTIAL_LOCATIONS,
    writable: WRITABLE_LOCATIONS,
    warnings: [],
  };
  if (!target) return empty;

  const refs = service.credentialRefs(target);
  if (!refs) return { ...empty, warnings: [`'${target}' is not an application in this repository.`] };

  const slots: AccountSlot[] = [];
  for (const role of refs.roles) {
    for (let index = 1; index <= accountsFor(refs.poolSize, role); index += 1) {
      const path = credentialPath(refs, role, index);
      /*
         Described, never read. A page that fetched the payload to decide
         whether to show a tick would have the password in a response body, in
         a browser's memory and in anything that screenshots it.
      */
      const found = await service
        .describe(target, path)
        .catch(() => ({ exists: false, fields: [] as string[] }));

      const usable = found.exists && found.fields.includes('username') && found.fields.includes('password');
      slots.push({
        role,
        index,
        path,
        present: found.exists,
        fields: found.fields,
        ...('origin' in found && found.origin ? { origin: found.origin } : {}),
        missing: !usable,
      });
    }
  }

  const warnings: string[] = [];
  const shared = slots.filter((slot) => slot.origin && slot.origin.includes('secrets.local.json'));
  if (shared.length > 0) {
    warnings.push(
      `${shared.length} credential(s) resolve from config/secrets.local.json, which is tracked in ` +
        'git. That is correct only for logins the vendor already publishes. Anything real should ' +
        'be moved to the private file, which is gitignored.',
    );
  }
  if (refs.sharedEnvironment) {
    warnings.push(
      'This deployment is declared as shared with people outside the team. Treat its accounts as ' +
        'shared too: a locked account or a rotated password is somebody else’s next test run.',
    );
  }

  return {
    target,
    source: refs.source,
    root: refs.root,
    accountType: refs.accountType,
    slots,
    locations: CREDENTIAL_LOCATIONS,
    writable: WRITABLE_LOCATIONS,
    warnings,
  };
}

export function testUsersRoutes(service: TestUsersService): Route[] {
  const paths = ['/api/users/view', '/api/users/set', '/api/users/forget'];
  return paths.map<Route>((path) => ({
    method: 'POST',
    path,
    handle: (request) => handle(request, service),
  }));
}

async function handle(request: UiRequest, service: TestUsersService): Promise<UiResponse> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const target = String(body.target ?? '').trim();

  switch (request.path) {
    case '/api/users/view':
      return json(200, {
        targets: service.targets(),
        view: await buildTestUsersView(service, target || null),
      });

    case '/api/users/set': {
      const location = String(body.location ?? '') as CredentialLocation;
      if (!WRITABLE_LOCATIONS.includes(location)) {
        /*
           Vault and the environment are deliberately not writable from here.
           The rule is that the agent writes the reference and a person writes
           the value; a dashboard that could write to Vault would be a browser
           tab holding a token that can change production credentials.
        */
        return failure(
          400,
          `'${location}' cannot be written from this page. Vault is written by a person with ` +
            'Vault access; the environment is set by whatever runs the suite.',
        );
      }
      if (!service.credentialRefs(target)) {
        return failure(400, `'${target}' is not an application in this repository.`);
      }

      const path = String(body.path ?? '').trim();
      const expected = `${service.credentialRefs(target)!.root}/`;
      if (!path.startsWith(expected)) {
        // The path arrives over HTTP and names a key in a file this writes to.
        return failure(400, `'${path}' is not a credential path for '${target}'.`);
      }

      const username = String(body.username ?? '');
      const password = String(body.password ?? '');
      if (!username || !password) return failure(400, 'A username and a password are both needed.');

      const written = await service.write({ location, path, username, password });
      // The response says where it went and nothing about what went there.
      return json(200, { saved: true, path, file: written.file });
    }

    case '/api/users/forget': {
      const location = String(body.location ?? '') as CredentialLocation;
      if (!WRITABLE_LOCATIONS.includes(location)) {
        return failure(400, `'${location}' cannot be changed from this page.`);
      }
      const path = String(body.path ?? '').trim();
      const refs = service.credentialRefs(target);
      if (!refs || !path.startsWith(`${refs.root}/`)) {
        return failure(400, `'${path}' is not a credential path for '${target}'.`);
      }
      const removed = await service.forget({ location, path });
      return json(200, { forgotten: true, path, file: removed.file });
    }

    default:
      return failure(404, `No route for ${request.path}.`);
  }
}
