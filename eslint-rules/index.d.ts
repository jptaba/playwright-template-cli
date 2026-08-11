import type { Rule } from 'eslint';

/**
 * Types for the executable conventions, so `tests/unit/eslint-rules.spec.ts`
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
};

export default plugin;
