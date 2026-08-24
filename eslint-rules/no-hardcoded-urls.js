'use strict';

const { relPath, isProfile } = require('./lib/paths');

const URL_LITERAL = /\bhttps?:\/\/([^\s/'"`)]+)/i;
/**
 * Loopback is not an environment: in-process servers in unit tests are fine.
 * The trailing colon may be followed by a template expression rather than a
 * literal port — `http://127.0.0.1:${port}`.
 */
const ALLOWED_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d*)?$/i;
/**
 * Not addresses: XML namespaces and schema ids are never fetched, and a host
 * carrying a `<placeholder>` or a reserved TLD is documentation — usually
 * inside the error message that tells someone what to configure.
 */
const NON_ADDRESS = /^(www\.w3\.org|schemas?\.|json-schema\.org|xmlns)/i;
const PLACEHOLDER = /[<>{}]|\.(invalid|example|test|localdomain)(:|$)/i;

const EXEMPT_PATHS = [
  /^config\/targets\//, // shared profile types
  /^tests\//, // framework self-tests spin up loopback servers
  /^docs\//,
  /^eslint-rules\//,
];

/**
 * No URL or hostname literals outside a target's own profile (§04).
 *
 * The rule that keeps "the application under test is configuration" true. A
 * single `await page.goto('https://…')` in one spec is how a framework
 * silently acquires a second, undeclared target.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Hosts are declared in target profiles, never written into code.' },
    schema: [],
    messages: {
      hardcodedUrl:
        "Hardcoded host '{{host}}'. The application under test is configuration: put it in " +
        'targets/<app>/profile.ts and read it from the `target` fixture or baseURL (§04).',
    },
  },

  create(context) {
    const file = relPath(context);
    // The profile is the one place a host may be named — that is what a
    // profile is. Everything else under a target's directory is pack code.
    if (isProfile(file)) return {};
    if (EXEMPT_PATHS.some((pattern) => pattern.test(file))) return {};

    const report = (node, value) => {
      const match = URL_LITERAL.exec(value);
      if (!match) return;
      const host = match[1];
      if (ALLOWED_HOSTS.test(host) || NON_ADDRESS.test(host) || PLACEHOLDER.test(host)) return;
      context.report({ node, messageId: 'hardcodedUrl', data: { host } });
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.raw);
      },
    };
  },
};
