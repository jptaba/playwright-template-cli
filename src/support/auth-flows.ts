/**
 * Which spec files belong to the signed-out `auth-flows` project (§13).
 *
 * This value exists in two places by necessity: `playwright.config.ts` needs it
 * in TypeScript, and `eslint-rules/auth-project-boundary` needs it in the plain
 * CommonJS a lint rule runs as. Two copies of a pattern is exactly how the two
 * came to disagree — the rule rejected files the runner handled correctly, and
 * its message told the author to undo the override that made them work.
 *
 * So the copies are held identical by a test rather than by a comment:
 * `tests/framework/eslint-rules.spec.ts` fails if they drift.
 *
 * `register`, `signup` and `forgot` are included because registering and
 * recovering a password are signed-out journeys on essentially every
 * application that has them. Leaving them out made the commonest possible
 * override into something every target had to discover for itself, by watching
 * a registration spec get redirected away from the form it was trying to fill.
 */
export const DEFAULT_AUTH_FLOW_PATTERN = /(login|mfa|password|register|signup|forgot)\.spec\.ts$/;
