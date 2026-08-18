import type { Page } from '@playwright/test';

/**
 * How wide the prose on a page is actually read at.
 *
 * A **prose block** is an element that directly holds a long run of text — its
 * own text nodes, not its descendants' — set in a proportional font. That
 * definition is the point: it catches a paragraph nobody gave a measure to,
 * which is a thing that can be added to any page at any time, rather than only
 * the classes that were known to be wrong on the day this was written.
 *
 * Monospace is excluded and that is deliberate rather than convenient. An
 * error signature, a stack, a file path and a command line are code, and code
 * wants the width it needs — Triage renders failure signatures at 135
 * characters a line and that is correct. A measure is a rule about reading
 * sentences.
 *
 * The character count is derived from the font the block is actually rendered
 * in, because `ch` is the width of a zero and every other glyph in a
 * proportional face is narrower: `max-width: 68ch` reads as about 76
 * characters, and asserting on the CSS value would be asserting on the wrong
 * number.
 */
export interface ProseBlock {
  /** Tag, id and first class — enough to find it in the page. */
  label: string;
  /** Characters per line, at the width it renders at. */
  chars: number;
  /** The opening words, so a failure says which paragraph. */
  text: string;
}

/** Below this a block is a label or a status line, not something read as prose. */
const PROSE_LENGTH = 120;

export async function widestProse(page: Page): Promise<ProseBlock> {
  return page.evaluate((minimum) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    let worst = { label: 'nothing', chars: 0, text: '' };

    for (const node of Array.from(document.querySelectorAll('#content *'))) {
      if (node.closest('pre')) continue;

      const own = Array.from(node.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? '')
        .join('')
        .trim();
      if (own.length < minimum) continue;

      const box = node.getBoundingClientRect();
      if (box.width === 0) continue;

      const style = getComputedStyle(node);
      if (/mono|consolas|courier/i.test(style.fontFamily)) continue;

      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
      const perCharacter = context.measureText(alphabet).width / alphabet.length;
      const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const chars = Math.round(width / perCharacter);
      if (chars <= worst.chars) continue;

      const id = node.id ? `#${node.id}` : '';
      const cls =
        typeof node.className === 'string' && node.className
          ? `.${node.className.split(' ')[0]}`
          : '';
      worst = { label: node.tagName.toLowerCase() + id + cls, chars, text: own.slice(0, 60) };
    }

    return worst;
  }, PROSE_LENGTH);
}

/** Open every disclosure, so what is behind one is measured too. */
export async function openEveryDisclosure(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const node of Array.from(document.querySelectorAll('details'))) node.open = true;
  });
}
