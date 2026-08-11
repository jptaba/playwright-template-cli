import type { Page } from '@playwright/test';

/**
 * A deterministic drift harness — §21 phase 7.
 *
 * "The healer needs drift to repair and the reference target never drifts, so
 * exercise it with route interception that rewrites accessible names and
 * removes test ids on a fork of it — a deterministic drift harness beats
 * waiting for the real application to break."
 *
 * It mutates the **rendered DOM**, not the HTML response. That distinction is
 * load-bearing: a client-rendered application ships a near-empty document and
 * builds the page in JavaScript, so a response rewriter would silently do
 * nothing and produce a "the healer works" result that means nothing. A
 * MutationObserver installed before any application script runs catches both
 * kinds of application, and stays application-agnostic.
 *
 * It never touches the real application — the mutation happens in the page,
 * on the way to the screen.
 */
export interface DriftOptions {
  /** Strip the attribute `getByTestId` reads, so test-id locators stop resolving. */
  removeTestIds?: boolean;
  /** Which attribute that is. Comes from the target profile (§04). */
  testIdAttribute?: string;
  /** Rewrite visible text, so accessible-name locators stop matching. */
  renameText?: Array<{ from: string; to: string }>;
  /** Rewrite label-ish attributes: aria-label, placeholder, title, alt, value. */
  renameLabels?: Array<{ from: string; to: string }>;
  /** Delay document responses, to exercise timing repairs rather than locators. */
  delayMs?: number;
}

export interface DriftReport {
  /** Elements whose test id was stripped. Zero means the harness never engaged. */
  testIdsRemoved: number;
  /** Text nodes and attributes rewritten. */
  textsRenamed: number;
  /** Document responses the harness delayed. */
  documentsDelayed: number;
}

export interface DriftHandle {
  /** Read the counters. Assert on these — a silent harness proves nothing. */
  stats(): Promise<DriftReport>;
}

interface DriftScriptConfig {
  testIdAttribute: string | null;
  renameText: Array<{ from: string; to: string }>;
  renameLabels: Array<{ from: string; to: string }>;
}

export async function installDrift(page: Page, options: DriftOptions = {}): Promise<DriftHandle> {
  let documentsDelayed = 0;

  const config: DriftScriptConfig = {
    testIdAttribute: options.removeTestIds ? (options.testIdAttribute ?? 'data-testid') : null,
    renameText: options.renameText ?? [],
    renameLabels: options.renameLabels ?? [],
  };

  // Installed before any application script runs, so drift is in place from
  // the first paint rather than racing the app's own rendering.
  await page.addInitScript(applyDrift, config);

  if (options.delayMs) {
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      documentsDelayed++;
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      await route.fallback();
    });
  }

  return {
    async stats(): Promise<DriftReport> {
      const counts = await page.evaluate(
        () =>
          (window as unknown as { __drift?: { testIdsRemoved: number; textsRenamed: number } })
            .__drift ?? { testIdsRemoved: 0, textsRenamed: 0 },
      );
      return { ...counts, documentsDelayed };
    },
  };
}

/**
 * Runs inside the page. Kept dependency-free and self-contained because it is
 * serialised across the boundary — nothing from this module's scope is
 * available to it.
 */
function applyDrift(config: DriftScriptConfig): void {
  const counters = { testIdsRemoved: 0, textsRenamed: 0 };
  (window as unknown as { __drift: typeof counters }).__drift = counters;

  const LABEL_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt', 'value'];

  const driftElement = (element: Element): void => {
    if (config.testIdAttribute && element.hasAttribute(config.testIdAttribute)) {
      element.removeAttribute(config.testIdAttribute);
      counters.testIdsRemoved++;
    }
    for (const attribute of LABEL_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      for (const rename of config.renameLabels) {
        if (current === rename.from) {
          element.setAttribute(attribute, rename.to);
          counters.textsRenamed++;
        }
      }
    }
  };

  const driftText = (node: Text): void => {
    const text = node.nodeValue ?? '';
    for (const rename of config.renameText) {
      if (text.trim() === rename.from) {
        node.nodeValue = text.replace(rename.from, rename.to);
        counters.textsRenamed++;
      }
    }
  };

  const walk = (root: Node): void => {
    if (root.nodeType === Node.TEXT_NODE) {
      driftText(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    if (root.nodeType === Node.ELEMENT_NODE) driftElement(root as Element);

    const element = root as Element;
    if (config.testIdAttribute) {
      element
        .querySelectorAll?.(`[${config.testIdAttribute}]`)
        .forEach((child) => driftElement(child));
    }
    if (config.renameLabels.length > 0) {
      element.querySelectorAll?.('*').forEach((child) => driftElement(child));
    }
    if (config.renameText.length > 0) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        driftText(node as Text);
        node = walker.nextNode();
      }
    }
  };

  const start = (): void => {
    walk(document);
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => walk(node));
        if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) {
          driftElement(record.target as Element);
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  };

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);
}
