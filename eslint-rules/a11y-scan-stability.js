'use strict';

const { relPath, layerOf } = require('./lib/paths');

/**
 * A spec that scans for accessibility asks whether the scan settled — §05,
 * open-items.md item 65.
 *
 * **Why a rule rather than a template line.** `scan.stable` arrived with item
 * 64, and the scaffolded a11y spec asserts it — so every application onboarded
 * afterwards is held to it and the four packs already on disk are not. That is
 * the exact gap `upgrade.ts` was built for, and it cannot close this one:
 * `staleManagedLines` moves a marked line the template has *changed*, and
 * skips a key the pack does not have, because a deleted marker is the
 * documented way to keep a local change. It cannot tell "never had this line"
 * from "deliberately removed it", and guessing would overwrite somebody's
 * work. Adding a line is not what that mechanism does.
 *
 * So the requirement is stated where it can be checked on every file, old and
 * new: "every convention worth having should be expressible as a lint rule, a
 * type, or a failing test."
 *
 * **What it is protecting.** A scan returns findings even when two consecutive
 * scans never agreed — the last attempt is the best answer available and
 * refusing to report would be worse. But those findings describe a page that
 * was still rendering, so they may be a subset, and a spec that does not ask
 * can pass on them. That is a weaker version of the false green item 64 was
 * raised about: measured, one application reported a single waived violation
 * on a page that held seventeen once it had finished.
 *
 * `describe()` prints an `UNSTABLE` caveat, and that reaches a human only when
 * something else has already failed. A spec that passes prints nothing, which
 * is precisely the case this rule exists for.
 *
 * **Deliberately not prescriptive about the assertion.** Any reference to the
 * scan's `stable` satisfies it — `expect(scan.stable).toBe(true)`, a branch
 * that annotates the result, a filter. "No critical violations" and "none at
 * all" are different products' answers and the same is true here: a spec may
 * legitimately report on an unstable page so long as it *says* that is what it
 * is doing. What is refused is silence.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A spec that runs an accessibility scan reads whether the scan stabilised, rather than ' +
        'treating a moving page as a result.',
    },
    schema: [],
    messages: {
      unchecked:
        "This spec scans for accessibility and never reads `{{name}}.stable`. A scan returns " +
        'findings even when two consecutive scans never agreed, and those describe a page that ' +
        'was still rendering — so they may be a subset, and this spec would pass on them. Add ' +
        '`expect({{name}}.stable, describeFindings({{name}})).toBe(true)`, or read `.stable` and ' +
        'say in the spec what an unstable result means here (§05).',
    },
  },

  create(context) {
    const file = relPath(context);
    if (layerOf(file) !== 'spec') return {};

    /** Variables holding the result of an `a11y.scan(...)` call. */
    const scans = new Map();
    /** Identifiers something read `.stable` from, anywhere in the file. */
    const readStable = new Set();

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !isScanCall(node.init)) return;
        scans.set(node.id.name, node);
      },

      MemberExpression(node) {
        if (node.computed || node.property.name !== 'stable') return;
        if (node.object.type === 'Identifier') readStable.add(node.object.name);
      },

      'Program:exit'() {
        for (const [name, node] of scans) {
          if (readStable.has(name)) continue;
          context.report({ node, messageId: 'unchecked', data: { name } });
        }
      },
    };
  },
};

/**
 * `await a11y.scan(...)`, in the shapes a spec actually writes it.
 *
 * Matched on the fixture's own name because that is the vocabulary — a spec
 * reaches the scanner through the `a11y` fixture and has no other way in. A
 * scan called some other way is not something this rule can see, and reporting
 * on a guess would be worse than the gap.
 */
function isScanCall(init) {
  const call = init && init.type === 'AwaitExpression' ? init.argument : init;
  return Boolean(
    call &&
      call.type === 'CallExpression' &&
      call.callee.type === 'MemberExpression' &&
      !call.callee.computed &&
      call.callee.property.name === 'scan' &&
      call.callee.object.type === 'Identifier' &&
      call.callee.object.name === 'a11y',
  );
}
