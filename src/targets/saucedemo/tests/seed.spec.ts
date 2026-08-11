import { expect, test } from '../fixtures';

/**
 * SEED — the template Playwright's generator agent starts from.
 *
 * It is not a test. No project's `testDir` picks it up, and the lint rules
 * exempt it from needing a case id. Its only job is to show the generator the
 * shape of a conforming spec in *this* repository:
 *
 *   - one import, from the target's fixtures — never `@playwright/test`
 *   - the PractiTest annotation, plus the case hash for drift detection
 *   - fixtures and named actions only; no `page.locator`, no raw URLs
 *   - every assertion in the spec, never in an action
 *
 * A generated file that does not look like this will fail `npm run lint`
 * before a human ever reads it, which is the feedback loop the agent needs.
 */
test(
  'SEED · replace this title with <case ref> · <what it proves> @tag',
  {
    annotation: [
      { type: 'practitest', description: 'PT-ID' },
      { type: 'case', description: 'cases/<target>/<case>.yaml' },
      { type: 'case-hash', description: 'HASH' },
    ],
  },
  async ({ authedPage, inventory }) => {
    await inventory.open(authedPage);

    // Assertions live here, in the spec, and nowhere else.
    expect(await inventory.cartCount(authedPage)).toBe(0);
  },
);
