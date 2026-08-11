'use strict';

const { relPath, targetOf } = require('./lib/paths');

/**
 * Short tokens need word boundaries: `TOTP` contains `OTP`, and
 * `VAULT_TOTP_PERIOD` is a window length, not a credential.
 */
const CREDENTIAL_NAME =
  /(PASSWORD|PASSWD|SECRET|TOKEN|CREDENTIAL|API_?KEY|PRIVATE_KEY|(^|_)(PAT|OTP|SEED)(_|$))/i;

/**
 * A name ending in one of these describes *where* a secret lives, not the
 * secret: `SECRET_SOURCE`, `VAULT_ROLE`, `LOCAL_SECRETS_FILE`. References are
 * exactly what the agent is allowed to write (§01).
 */
const REFERENCE_SUFFIX =
  /_(PATH|FILE|REF|SOURCE|NAME|ROLE|MOUNT|BACKEND|URL|ADDR|ADDRESS|ENABLED|PERIOD|TTL|SIZE)$/i;

/** Framework self-tests exercise these code paths deliberately. */
const SELF_TEST_PATH = /^tests\//;

/**
 * The single place a credential may be read from the job environment. It
 * registers the value for redaction on the way through, which is the whole
 * reason the exemption is one file rather than one directory.
 */
const CREDENTIAL_ENV_HELPER = 'src/support/env-credentials.ts';

/**
 * No `process.env` for credentials (§07, §11).
 *
 * Secrets resolve at runtime, inside the test process, through the `secrets`
 * fixture — which registers every value with the redaction helper at fetch
 * time. A credential read straight from the environment is one that is not
 * registered, so it survives into a trace, and from there into an attachment
 * on a test management system.
 *
 * Target packs may not touch `process.env` for credentials at all. Integration
 * adapters may read non-credential configuration (`VAULT_ADDR`, `HTTPS_PROXY`)
 * but never a credential-shaped name.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Credentials come from the secrets fixture, never from the environment.' },
    schema: [],
    messages: {
      credentialEnv:
        'process.env.{{name}} looks like a credential. Resolve it through the `secrets` fixture, ' +
        'or — for an integration token delivered by the pipeline — through credentialFromEnv() in ' +
        'src/support/env-credentials.ts, which registers the value for redaction so it cannot ' +
        'survive into a trace or an attachment (§11).',
      anyEnvInTarget:
        'process.env in a target pack. Everything environmental — base URL, credentials, ' +
        'capabilities — arrives through the `target` and `secrets` fixtures (§04).',
    },
  },

  create(context) {
    const file = relPath(context);
    // A target pack, not the framework's own fixtures: `src/fixtures/` may read
    // non-credential configuration such as RUN_ID.
    const inTargetPack = targetOf(file) !== null;
    const isCredentialHelper = file === CREDENTIAL_ENV_HELPER || SELF_TEST_PATH.test(file);

    return {
      MemberExpression(node) {
        if (!isProcessEnv(node.object)) return;
        const name = node.computed
          ? node.property.type === 'Literal'
            ? String(node.property.value)
            : ''
          : node.property.name;

        if (!isCredentialHelper && CREDENTIAL_NAME.test(name) && !REFERENCE_SUFFIX.test(name)) {
          context.report({ node, messageId: 'credentialEnv', data: { name } });
          return;
        }
        if (inTargetPack) context.report({ node, messageId: 'anyEnvInTarget' });
      },
    };
  },
};

function isProcessEnv(node) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property.name === 'env'
  );
}
