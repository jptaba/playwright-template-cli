import { expect, test } from '../fixtures';

/**
 * SEED — TEMPLATE, and the shape Playwright's generator agent starts from.
 *
 * It is not a test, and no project's `testDir` picks it up. Its only job is to
 * show the generator what a conforming spec looks like in this repository:
 *
 *   - one import, from the target's fixtures — never `@playwright/test`
 *   - the managed-case annotation, plus the case hash for drift detection
 *   - fixtures and named verbs only; no `page.locator`, no raw URLs
 *   - every assertion in the spec, never in an action
 *   - a title a manual tester would recognise, and tags for suite selection
 *
 * A generated file that does not look like this fails `npm run lint` before a
 * human ever reads it, which is the feedback loop the agent needs.
 */
test(
  'SEED · replace with <case ref> · <what it proves> @smoke',
  {
    annotation: [
      { type: 'practitest', description: 'PT-ID' },
      { type: 'case', description: 'cases/<target>/<case>.yaml' },
      { type: 'case-hash', description: 'HASH' },
    ],
  },
  async ({ authedPage, signIn }) => {
    // Arrange with the cheapest thing that works — an API call where one
    // exists, so the test is about its subject rather than about data entry.

    // Act through a named business verb.
    void signIn;

    // Assert here, in the spec, and nowhere else.
    await expect(authedPage).toHaveURL(/./);
  },
);
