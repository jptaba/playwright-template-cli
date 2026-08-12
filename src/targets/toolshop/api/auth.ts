import type { ApiClient } from '../../../integrations/http/api-client';
import { authEndpoints } from '../endpoints/auth';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface CurrentUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  dob: string | null;
  phone: string | null;
  totp_enabled: boolean;
  address: {
    street: string | null;
    house_number: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postal_code: string | null;
  } | null;
}

/**
 * L2 — the HTTP vocabulary for identity.
 *
 * `signInAs` does two things on purpose: it returns the token *and* attaches
 * it to the client, so everything the spec calls afterwards is authenticated
 * without the spec threading a bearer header through every call — including
 * the deletes the client runs during cleanup.
 *
 * The token this service issues lives for **five minutes**. That is short
 * enough for a slow suite to outlive it, so the credential is attached as a
 * provider that re-authenticates when it is close to expiry rather than as a
 * captured string. A client that captured the header once would start
 * answering 401 part-way through a run, and the failure would read as a broken
 * endpoint rather than as an expired token.
 */
export function authApi(client: ApiClient) {
  return {
    async login(credentials: LoginRequest): Promise<AccessToken> {
      const response = await client.call<AccessToken, LoginRequest>(authEndpoints.login, {
        body: credentials,
      });
      return response.body;
    },

    /** Sign in, and keep this client signed in for the rest of the test. */
    async signInAs(credentials: LoginRequest): Promise<AccessToken> {
      const issued = await this.login(credentials);

      let token = issued.access_token;
      // A minute of headroom: a token that expires between the check and the
      // request it authenticates is the whole failure mode being avoided.
      let expiresAt = Date.now() + (issued.expires_in - 60) * 1000;

      client.setAuth(async () => {
        if (Date.now() >= expiresAt) {
          const renewed = await this.login(credentials);
          token = renewed.access_token;
          expiresAt = Date.now() + (renewed.expires_in - 60) * 1000;
        }
        return { Authorization: `Bearer ${token}` };
      });

      return issued;
    },

    /** Drop the credential, so the next call is made as an anonymous caller. */
    signOutClient(): void {
      client.setAuth(null);
    },

    async me(): Promise<CurrentUser> {
      const response = await client.call<CurrentUser>(authEndpoints.me);
      return response.body;
    },

    /**
     * Call an endpoint expecting to be refused. Returns the status so the spec
     * can state which refusal it expected — 401 and 403 are different claims.
     */
    async statusWithoutCredential(): Promise<number> {
      const response = await client.call<unknown>(authEndpoints.me, { expect: [401] });
      return response.status;
    },
  };
}
