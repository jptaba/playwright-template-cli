'use strict';

/**
 * Executable conventions — §07.
 *
 * "Every convention worth having should be expressible as a lint rule, a type,
 * or a failing test. Documentation is the fallback for the rest." Each rule
 * here corresponds to a line in docs/CONVENTIONS.md, and the loop that matters
 * is: agent writes → lint + tsc + playwright run → structured errors → agent
 * repairs, with no human in it.
 */
const rules = {
  'no-raw-locators': require('./no-raw-locators'),
  'no-hard-waits': require('./no-hard-waits'),
  'layer-boundaries': require('./layer-boundaries'),
  'no-hardcoded-urls': require('./no-hardcoded-urls'),
  'typed-clients-only': require('./typed-clients-only'),
  'secrets-via-fixture': require('./secrets-via-fixture'),
  'require-case-id': require('./require-case-id'),
  'known-failures-declared': require('./known-failures-declared'),
  'step-naming': require('./step-naming'),
  'auth-project-boundary': require('./auth-project-boundary'),
  'no-target-coupling': require('./no-target-coupling'),
};

const { DEFAULT_AUTH_FLOW_PATTERN, authFlowPatternFor } = require('./lib/paths');

const plugin = {
  meta: { name: 'framework', version: '1.0.0' },
  rules,
  /**
   * Re-exported so the framework's own tests can assert that the rules and
   * `playwright.config.ts` share one definition of an auth-flow file. Two
   * copies of that pattern is how the two came to disagree.
   */
  DEFAULT_AUTH_FLOW_PATTERN,
  authFlowPatternFor,
};

/** Every rule at error, which is the only setting an agent can act on. */
plugin.configs = {
  recommended: {
    plugins: { framework: plugin },
    rules: Object.fromEntries(Object.keys(rules).map((name) => [`framework/${name}`, 'error'])),
  },
};

module.exports = plugin;
