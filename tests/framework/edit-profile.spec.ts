import { expect, test } from '@playwright/test';
import {
  editProfileSource,
  hostAllowlistIn,
} from '../../src/support/onboarding/edit-profile';

/**
 * Correcting a profile after onboarding — §04.
 *
 * The property that matters is not "can it change a value". It is that it
 * changes **only** the value: a profile is mostly comments explaining why each
 * setting is what it is, and an editor that reformatted the file would throw
 * away the reasoning that makes it worth reading.
 */

const PROFILE = `import type { TargetProfile } from './types';

/**
 * toolshop — the application under test is configuration, not code (§04).
 */
export const toolshop: TargetProfile = {
  name: 'toolshop',

  // Environment values come from the pipeline where there is one, so a profile
  // never ships a host someone can accidentally point at production.
  baseURL: process.env.BASE_URL ?? 'https://practicesoftwaretesting.com',
  environment: process.env.TARGET_ENV ?? 'staging',

  credentials: {
    source: (process.env.SECRET_SOURCE as 'vault' | 'local') ?? 'vault',
    root: 'qa/toolshop/pools',
    accountType: 'workforce',
  },

  capabilities: {
    mfa: 'none', // 'none' | 'totp' | 'email'
    accountPool: 'static',
    serverState: true,
    api: {
      enabled: false,
      baseURL: process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com/docs?api-docs.json',
    },
    db: { enabled: false, vaultRole: 'qa-readonly', dialect: 'postgres' },
    contracts: { enabled: false, spec: 'src/targets/toolshop/contracts/openapi.json' },
    a11y: {
      enabled: false,
      standard: process.env.A11Y_STANDARD ?? 'wcag22aa',
    },
  },

  // Which attribute \`getByTestId\` reads.
  testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid',

  hostAllowlist: ['practicesoftwaretesting.com'],

  suites: ['smoke', 'regression'],

  roles: ['standard'],
};
`;

test.describe('editing values', () => {
  test('corrects an API base URL that was really a document URL', () => {
    // The mistake this whole feature was built for.
    const outcome = editProfileSource(PROFILE, {
      apiBaseURL: 'https://api.practicesoftwaretesting.com',
    });

    expect(outcome.applied).toEqual([
      {
        field: 'apiBaseURL',
        from: 'https://api.practicesoftwaretesting.com/docs?api-docs.json',
        to: 'https://api.practicesoftwaretesting.com',
      },
    ]);
    expect(outcome.source).toContain(
      "baseURL: process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com',",
    );
  });

  test('does not confuse the application base URL with the API one', () => {
    /*
       Both fields are called `baseURL`. A rule anchored on the field name
       would rewrite whichever came first, silently — so both are anchored on
       their environment variable, which do not collide.
    */
    const outcome = editProfileSource(PROFILE, { baseURL: 'https://staging.toolshop.example' });

    expect(outcome.source).toContain(
      "baseURL: process.env.BASE_URL ?? 'https://staging.toolshop.example',",
    );
    expect(outcome.source, 'the API one is untouched').toContain(
      'https://api.practicesoftwaretesting.com/docs?api-docs.json',
    );
  });

  test('turns a capability on inside its own block', () => {
    const outcome = editProfileSource(PROFILE, { include: { contracts: true, a11y: true } });

    expect(outcome.source).toContain("contracts: { enabled: true, spec:");
    expect(outcome.source).toMatch(/a11y: \{\s*enabled: true/);
    // The ones not asked about keep their values.
    expect(outcome.source).toMatch(/api: \{\s*enabled: false/);
    expect(outcome.source).toContain('db: { enabled: false');
  });

  test('rewrites roles as a list', () => {
    const outcome = editProfileSource(PROFILE, { roles: ['standard', 'admin'] });
    expect(outcome.source).toContain("roles: ['standard', 'admin'],");
  });

  test('changes the test-id attribute and the secret source', () => {
    const outcome = editProfileSource(PROFILE, {
      testIdAttribute: 'data-test',
      secretSource: 'local',
    });
    expect(outcome.source).toContain("process.env.TEST_ID_ATTRIBUTE ?? 'data-test'");
    expect(outcome.source).toContain("as 'vault' | 'local') ?? 'local'");
  });
});

test.describe('what it leaves alone', () => {
  test('every comment survives, because they are the reasoning', () => {
    const outcome = editProfileSource(PROFILE, {
      baseURL: 'https://staging.toolshop.example',
      testIdAttribute: 'data-test',
      include: { api: true },
    });

    for (const comment of [
      'the application under test is configuration, not code (§04)',
      'never ships a host someone can accidentally point at production',
      "'none' | 'totp' | 'email'",
      'Which attribute',
    ]) {
      expect(outcome.source, comment).toContain(comment);
    }
    // And nothing else moved: same number of lines, same imports.
    expect(outcome.source.split('\n')).toHaveLength(PROFILE.split('\n').length);
    expect(outcome.source).toContain("import type { TargetProfile } from './types';");
  });

  test('a value that is already right is reported as unchanged, not rewritten', () => {
    const outcome = editProfileSource(PROFILE, { environment: 'staging' });
    expect(outcome.unchanged).toEqual(['environment']);
    expect(outcome.applied).toEqual([]);
    expect(outcome.source).toBe(PROFILE);
  });

  test('a field it cannot find is refused, never guessed at', () => {
    /*
       A profile somebody has hand-edited into a different shape is a file this
       must not guess at: a wrong guess breaks the profile, a refusal costs one
       sentence naming the file to open.
    */
    const handWritten = "export const x = { baseURL: 'https://fixed.example', roles: ['standard'] };";

    const outcome = editProfileSource(handWritten, { baseURL: 'https://other.example' });

    expect(outcome.applied).toEqual([]);
    expect(outcome.source, 'the file is returned untouched').toBe(handWritten);
    expect(outcome.refused[0]?.field).toBe('baseURL');
    expect(outcome.refused[0]?.reason).toContain('by hand');
  });
});

test.describe('what it warns about', () => {
  test('a base URL moved outside the allowlist, because every run would refuse it', () => {
    const outcome = editProfileSource(PROFILE, { baseURL: 'https://something.else.example' });

    // Written, not refused — but the refusal would otherwise happen far from
    // this screen, at the first attempt to explore or generate.
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.warnings.join(' ')).toContain('hostAllowlist');
    expect(outcome.warnings.join(' ')).toContain('something.else.example');
  });

  test('a base URL still inside the allowlist says nothing', () => {
    const outcome = editProfileSource(PROFILE, { baseURL: 'https://staging.practicesoftwaretesting.com' });
    expect(outcome.warnings).toEqual([]);
  });

  test('reads the allowlist out of the profile', () => {
    expect(hostAllowlistIn(PROFILE)).toEqual(['practicesoftwaretesting.com']);
    expect(hostAllowlistIn('no allowlist here')).toEqual([]);
  });
});
