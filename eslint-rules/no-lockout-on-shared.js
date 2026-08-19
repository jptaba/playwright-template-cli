'use strict';

const { relPath, layerOf, isSharedEnvironment } = require('./lib/paths');

/**
 * A wrong password against a real identity, on a deployment shared with
 * strangers — open-items.md item 58, §10.
 *
 * `sharedEnvironment: true` has been in the profile type, the conventions and
 * the Test users page since backlog item 28, and **nothing read it**. The harm
 * it was written for is recorded: onboarding a public demo, two specs
 * asserting "a wrong password is refused" locked the shared account every
 * other spec signed in as, twenty-one unrelated tests went red across five
 * features, and only an administrator of somebody else's demo could clear it.
 * Run 63 watched it happen again to toolshop — `423 Account locked, too many
 * failed attempts` — costing that suite hours.
 *
 * **The hazard is much narrower than `@negative @auth`, and getting that wrong
 * is the obvious way to make this worse.** Skipping every negative
 * authentication spec on a shared target would silently drop the two this
 * repository already has, both of which are safe and valuable, and a framework
 * that quietly stops running tests is worse than one that lets a mistake
 * through. What actually spends a lockout budget is **a real account's
 * username paired with a password that is not that account's**:
 *
 * ```ts
 * const account = await secrets.account('customer');
 * await signIn.withCredentials(page, {
 *   username: account.username,      // a real identity
 *   password: 'not-the-password',    // …and a failed attempt against it
 * });
 * ```
 *
 * Neither existing spec is that shape, which is why neither is reported:
 *
 * - a **disposable identity** — an address nobody registered, unique per run —
 *   spends nothing, because the account does not exist;
 * - an **account published to be refused**, signed in with its own real
 *   credential, generates no failed-password attempt at all.
 *
 * Both are in the packs already, and both are what the message points at.
 *
 * **Why a lint rule rather than a fixture refusal or a preflight.** The damage
 * is done by the *first* attempt and is permanent until somebody else's
 * administrator clears it, so the only useful moment to catch it is before the
 * spec has ever run. A fixture cannot help: it hands over a credential and
 * cannot see what the spec does with the password afterwards, and intercepting
 * the sign-in would mean framework code reaching into a pack's verbs, which is
 * forbidden. `target:doctor` reads tags but not spec bodies, and by then the
 * author has moved on. Lint runs inside `npm run verify`, which is this
 * repository's one always-runnable command.
 *
 * **It fires only where the profile says so.** On an environment the team owns
 * this spec is not merely allowed but wanted — an application that never locks
 * an account after repeated failures has a real defect, and that is a test
 * somebody should write.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'On a shared deployment, a real identity is never paired with a deliberately wrong password.',
    },
    schema: [],
    messages: {
      lockout:
        'This signs in with a real account\'s username and a made-up password, on a deployment ' +
        'declared `sharedEnvironment: true`. Repeated failed attempts lock the account every ' +
        'other spec signs in as, and on a demo shared with strangers nobody here can unlock it ' +
        '— it cost 21 unrelated tests once already. Use an identity that costs nothing: an ' +
        'address nobody registered (unique per run), or an account the application publishes ' +
        'in order to refuse it, signed in with its own real credential (§10).',
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};
    if (!isSharedEnvironment(file)) return {};

    /*
       Identifiers holding something that came out of the secret store. Built
       per function rather than per file so one spec's `account` cannot make
       the next spec's local of the same name look secret-derived.
    */
    const collectSecretNames = (scopeNode) => {
      const names = new Set();
      // Two passes: `const username = account.username` only reads as
      // secret-derived once `account` is known to be.
      for (let pass = 0; pass < 2; pass++) {
        walk(scopeNode, (node) => {
          if (node.type !== 'VariableDeclarator' || !node.init) return;
          if (!derivesFromSecret(node.init, names)) return;
          for (const name of boundNames(node.id)) names.add(name);
        });
      }
      return names;
    };

    return {
      ObjectExpression(node) {
        const username = property(node, 'username');
        const password = property(node, 'password');
        if (!username || !password) return;

        /*
           A fabricated password is a written-down string, essentially always.
           Requiring that — rather than "anything that is not the real
           password" — is what keeps this rule from arguing with every
           legitimate credential expression it does not recognise.
        */
        if (!isWrittenDown(password.value)) return;

        const fn = enclosingFunction(context, node);
        if (!fn) return;
        const secretNames = collectSecretNames(fn);
        if (secretNames.size === 0) return;
        if (!referencesAny(username.value, secretNames)) return;

        context.report({ node, messageId: 'lockout' });
      },
    };
  },
};

/** `await secrets.account(...)`, or a member of something already known. */
function derivesFromSecret(expression, known) {
  const inner = unwrap(expression);
  if (inner.type === 'AwaitExpression') return derivesFromSecret(inner.argument, known);
  if (inner.type === 'CallExpression') {
    const callee = unwrap(inner.callee);
    return (
      callee.type === 'MemberExpression' &&
      unwrap(callee.object).type === 'Identifier' &&
      unwrap(callee.object).name === 'secrets'
    );
  }
  if (inner.type === 'MemberExpression') {
    const object = unwrap(inner.object);
    return object.type === 'Identifier' && known.has(object.name);
  }
  return false;
}

/** Every name a declarator binds, including through a destructuring pattern. */
function boundNames(pattern) {
  const names = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier') names.push(node.name);
    else if (node.type === 'ObjectPattern') node.properties.forEach((p) => visit(p.value ?? p.argument));
    else if (node.type === 'ArrayPattern') node.elements.forEach(visit);
    else if (node.type === 'AssignmentPattern') visit(node.left);
    else if (node.type === 'RestElement') visit(node.argument);
  };
  visit(pattern);
  return names;
}

/** A string somebody typed — a literal, or a template with no substitutions. */
function isWrittenDown(expression) {
  const inner = unwrap(expression);
  if (inner.type === 'Literal') return typeof inner.value === 'string';
  return inner.type === 'TemplateLiteral' && inner.expressions.length === 0;
}

function referencesAny(expression, names) {
  let found = false;
  walk(expression, (node) => {
    if (node.type === 'Identifier' && names.has(node.name)) found = true;
  });
  return found;
}

/** Strip the wrappers TypeScript adds around an otherwise ordinary expression. */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSNonNullExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current ?? node;
}

function enclosingFunction(context, node) {
  const ancestors =
    typeof context.sourceCode?.getAncestors === 'function'
      ? context.sourceCode.getAncestors(node)
      : context.getAncestors();
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const candidate = ancestors[index];
    if (
      candidate.type === 'ArrowFunctionExpression' ||
      candidate.type === 'FunctionExpression' ||
      candidate.type === 'FunctionDeclaration'
    ) {
      return candidate;
    }
  }
  return null;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  }
}

function property(objectExpression, name) {
  return objectExpression.properties.find(
    (prop) =>
      prop.type === 'Property' &&
      !prop.computed &&
      (prop.key.name === name || prop.key.value === name),
  );
}
