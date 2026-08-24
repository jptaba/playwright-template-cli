import type { Rule } from 'eslint';

/**
 * Types for the executable conventions, so `tests/framework/eslint-rules.spec.ts`
 * type-checks like everything else. The rules themselves stay plain CommonJS:
 * ESLint loads them directly with no build step, which is one less thing
 * between a convention and the feedback it produces.
 */
export type FrameworkRuleName =
  | 'no-raw-locators'
  | 'no-hard-waits'
  | 'layer-boundaries'
  | 'no-hardcoded-urls'
  | 'typed-clients-only'
  | 'secrets-via-fixture'
  | 'require-case-id'
  | 'known-failures-declared'
  | 'no-lockout-on-shared'
  | 'a11y-scan-stability'
  | 'step-naming'
  | 'auth-project-boundary'
  | 'no-target-coupling';

declare const plugin: {
  meta: { name: string; version: string };
  rules: Record<FrameworkRuleName, Rule.RuleModule>;
  configs: {
    recommended: {
      plugins: Record<string, unknown>;
      rules: Record<string, string>;
    };
  };
  /**
   * The spec files the signed-out `auth-flows` project owns by default. Held
   * identical to `src/support/auth-flows.ts` by a framework test, because two
   * copies of this pattern is exactly how the rule and the runner came to
   * disagree about which files that project matches.
   */
  DEFAULT_AUTH_FLOW_PATTERN: RegExp;
  /** The pattern a given file's target profile declares, or the default. */
  authFlowPatternFor(relativePath: string): RegExp;
  /**
   * Where a target's pack lives, repo-relative. Held identical to
   * `packRootFor` in `src/support/paths.ts` by a framework test — the rules
   * cannot import that file, so both sides state it and the test is what stops
   * a layout change landing in halves.
   */
  TARGET_PACK_ROOT: string;
};

export default plugin;
