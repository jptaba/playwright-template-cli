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

/**
 * Whether what is on the page can be read — WCAG 2.2 AA, both themes.
 *
 * The fourth budget on these pages, and the same idea as the other three:
 * `page-copy` caps how much is written, `page-height` how tall that gets on
 * data nobody chose the size of, `page-measure` how wide a line runs, and this
 * one whether any of it can be read.
 *
 * **It is computed from the rendered page, not from a table of tokens.** A
 * table would be a second copy of the palette, and the copy is what goes
 * stale — this walks the real elements, takes the colour each one is actually
 * painted in, composites the background it is actually painted on, and
 * applies the threshold for the size it is actually set at. A new element with
 * a hand-written colour is caught by the same run as a token that moved.
 *
 * Both themes, because a palette with three states has two ways to be wrong
 * and only one of them is visible to whoever is looking at the moment.
 *
 * WCAG 2.2 AA, and the two thresholds are different rules rather than one:
 * 1.4.3 asks 4.5:1 of text (3:1 once it is large), and 1.4.11 asks 3:1 of the
 * visual information needed to identify a **control** — which is why the
 * border of an input is in here and the edge of a card is not.
 */

export interface ContrastFinding {
  /** Tag, id and classes — enough to find it in the page. */
  label: string;
  ratio: number;
  need: number;
  /** What was measured: text at its size, or the control's own edge. */
  what: string;
  sample: string;
}

const TEXT = 4.5;
const LARGE_TEXT = 3;
/** Large by 1.4.3: 24px, or 18.66px once it is bold. */
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;
const CONTROL = 3;

/**
 * Every readable thing on the page, with the ratio it is rendered at.
 *
 * Runs in the browser because that is the only place the answer is true: the
 * effective background of a node is whatever the first painted ancestor is,
 * composited with anything semi-transparent in between — the context bar is
 * `color-mix(… 90%, transparent)` over the page ground, and reading its
 * declared value alone would score it against nothing.
 */
export async function contrastFindings(page: Page): Promise<ContrastFinding[]> {
  return page.evaluate(
    ({ text, largeText, largePx, largeBoldPx, control }) => {
      const parse = (value: string): [number, number, number, number] | null => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1]!.split(/[,/]/).map((piece) => parseFloat(piece.trim()));
        if (parts.length < 3 || parts.some((piece) => Number.isNaN(piece))) return null;
        return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
      };

      const over = (top: number[], bottom: number[]): number[] => {
        const alpha = top[3]!;
        return [
          top[0]! * alpha + bottom[0]! * (1 - alpha),
          top[1]! * alpha + bottom[1]! * (1 - alpha),
          top[2]! * alpha + bottom[2]! * (1 - alpha),
          1,
        ];
      };

      /** What is actually behind this node, painted down to the page ground. */
      const backdrop = (node: Element): number[] => {
        const layers: number[][] = [];
        for (let at: Element | null = node; at; at = at.parentElement) {
          const colour = parse(getComputedStyle(at).backgroundColor);
          if (!colour || colour[3] === 0) continue;
          layers.push(colour);
          if (colour[3] === 1) break;
        }
        // The browser's own ground, under everything the page painted.
        let base = [255, 255, 255, 1];
        for (const layer of layers.reverse()) base = over(layer, base);
        return base;
      };

      const channel = (value: number): number => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const luminance = (c: number[]): number =>
        0.2126 * channel(c[0]!) + 0.7152 * channel(c[1]!) + 0.0722 * channel(c[2]!);
      const ratio = (a: number[], b: number[]): number => {
        const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
        return (hi + 0.05) / (lo + 0.05);
      };

      const name = (node: Element): string => {
        const id = node.id ? `#${node.id}` : '';
        const cls =
          typeof node.className === 'string' && node.className
            ? `.${node.className.trim().split(/\s+/).join('.')}`
            : '';
        return node.tagName.toLowerCase() + id + cls;
      };

      const bad: { label: string; ratio: number; need: number; what: string; sample: string }[] = [];
      const seen = new Set<string>();

      for (const node of Array.from(document.querySelectorAll('body *'))) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.opacity === '0') continue;

        const behind = backdrop(node);

        /*
           Its own text, not its descendants'. An element scored for text its
           children paint would report the wrong colour against the wrong
           ground, and would report it once per level of nesting.
        */
        const own = Array.from(node.childNodes)
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent ?? '')
          .join('')
          .trim();

        if (own.length > 0) {
          const size = parseFloat(style.fontSize);
          const weight = Number(style.fontWeight) || 400;
          const large = size >= largePx || (size >= largeBoldPx && weight >= 700);
          const need = large ? largeText : text;
          const colour = parse(style.color);
          if (colour) {
            const found = ratio(over(colour, behind), behind);
            const key = `${name(node)}|text`;
            if (found < need && !seen.has(key)) {
              seen.add(key);
              bad.push({
                label: name(node),
                ratio: Math.round(found * 100) / 100,
                need,
                what: `${Math.round(size)}px text`,
                sample: own.slice(0, 40),
              });
            }
          }
        }

        /*
           And its boundary, for the things 1.4.11 is about: a control has to
           be findable, and a one-pixel line at 1.7:1 is not. Restricted to
           actual controls on purpose — the edge of a card is not information
           required to identify a component, and holding every rule in the
           stylesheet to 3:1 would be a repaint wearing a standard's name.
        */
        const isControl = node.matches('input, select, textarea, button, .theme, .ctx-pick');
        if (isControl) {
          /*
             What has to reach 3:1 is *the control against the page*, and a
             control has two ways to manage it. A filled one — the primary
             button, the destructive button — is found by its fill, and its
             border being the same colour as that fill is not a defect; asking
             a solid button's border to contrast with its own middle is asking
             the wrong question, which is what the first version of this did.
             An unfilled one is found by its outline, and there the border is
             the only thing saying where the control is.
          */
          const fill = parse(style.backgroundColor);
          const border = parse(style.borderTopColor);
          const hasFill = Boolean(fill && fill[3]! > 0);
          const hasBorder = parseFloat(style.borderTopWidth) > 0 && Boolean(border && border[3]! > 0);

          /*
             What the control sits *on*, which is its parent's ground and not
             its own. Measuring a filled button against a backdrop that already
             includes its fill reports 1:1 for every solid button in the tool,
             which is how the first version of this managed to fail six
             perfectly legible controls.
          */
          const under = node.parentElement ? backdrop(node.parentElement) : behind;
          const byFill = hasFill ? ratio(over(fill!, under), under) : 0;
          const byBorder = hasBorder ? ratio(over(border!, under), under) : 0;

          /*
             And a ring drawn as a shadow, which is a boundary too.

             `box-shadow: 0 0 0 1px <colour>` is how a control gets an edge
             that costs no layout, and a check that could not see one would
             push people towards worse CSS to satisfy it. A *ring* is the case
             with no blur and a positive spread; the soft drop shadow beside it
             in the same declaration is not a boundary and is skipped by the
             same rule.
          */
          let byRing = 0;
          const shadows = style.boxShadow.matchAll(
            /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g,
          );
          for (const shadow of Array.from(shadows)) {
            const blur = parseFloat(shadow[4]!);
            const spread = parseFloat(shadow[5]!);
            if (blur !== 0 || spread <= 0) continue;
            const ring = parse(shadow[1]!);
            if (ring && ring[3]! > 0) byRing = Math.max(byRing, ratio(over(ring, under), under));
          }

          const found = Math.max(byFill, byBorder, byRing);

          /*
             A control the page has not painted is the browser's to draw, and
             the browser draws it to its own platform's contrast. A checkbox
             with no author fill and no author border is one of those, and so
             is a segment of a segmented control, whose boundary is the group
             around it. Scoring either would be scoring something this
             stylesheet does not set.
          */
          const key = `${name(node)}|edge`;
          if ((hasFill || hasBorder || byRing > 0) && found < control && !seen.has(key)) {
            seen.add(key);
            bad.push({
              label: name(node),
              ratio: Math.round(found * 100) / 100,
              need: control,
              what: 'the control against the page',
              sample: '',
            });
          }
        }
      }

      return bad;
    },
    { text: TEXT, largeText: LARGE_TEXT, largePx: LARGE_PX, largeBoldPx: LARGE_BOLD_PX, control: CONTROL },
  );
}


/** Open every disclosure, so what is behind one is measured too. */
export async function openEveryDisclosure(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const node of Array.from(document.querySelectorAll('details'))) node.open = true;
  });
}
