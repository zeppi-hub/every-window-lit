/**
 * The policy card: what the leader's word did, as
 * an official paper. Its heading, what was done, when it was done in real
 * life ("In real life: October 2008"), its effect and its cost. Pure
 * layout: the words wrapped to the paper's width with the given measure,
 * each section under its own small heading; drawing is policy-card.ts.
 */
export interface PolicyCardText {
  /** The headline ("DEPOSITS GUARANTEED"). */
  title: string;
  /** What was done. */
  done: string;
  /** When, as the card prints it ("In real life: 3 October 2008. …"). */
  when: string;
  /** "It worked: …" */
  effect: string;
  /** "The price: …" */
  cost: string;
  /** Who objected, in quotes. */
  objection: string;
}

/** The paper (px) and its margins; the fonts' sizes and line steps (px). */
export const CARD_PAPER = { w: 1024, h: 1536, margin: 72 } as const;
export const CARD_TYPE = {
  title: { size: 78, step: 90 },
  body: { size: 42, step: 56 },
  quote: { size: 40, step: 54 },
} as const;
/** Space between sections (px). */
export const SECTION_GAP = 26;

export type CardStyle = keyof typeof CARD_TYPE;

export interface CardLine {
  text: string;
  style: CardStyle;
  /** Baseline (px from the top). */
  y: number;
}

export interface CardLayout {
  lines: CardLine[];
  /** Where the last line ends (px); past the paper's foot it would not fit. */
  bottom: number;
  /** The baseline of the headline's last line (the rule goes under it). */
  titleFoot: number;
  fits: boolean;
}

/** `text` broken into lines no wider than `width` (px, measured by `measure` in `style`); a single word too long stays alone. */
export function wrap(text: string, width: number, style: CardStyle, measure: (text: string, style: CardStyle) => number): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(next, style) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** The card's lines, top to bottom: the headline, then what was done, when, its effect, its cost and the objection, as written. */
export function layoutPolicyCard(card: PolicyCardText, measure: (text: string, style: CardStyle) => number): CardLayout {
  const width = CARD_PAPER.w - 2 * CARD_PAPER.margin;
  const lines: CardLine[] = [];
  let y = CARD_PAPER.margin;
  const put = (text: string, style: CardStyle) => {
    y += CARD_TYPE[style].step;
    lines.push({ text, style, y });
  };
  for (const row of wrap(card.title, width, 'title', measure)) put(row, 'title');
  const titleFoot = y;
  y += SECTION_GAP;
  for (const [text, style] of [
    [card.done, 'body'],
    [card.when, 'body'],
    [card.effect, 'body'],
    [card.cost, 'body'],
    [card.objection, 'quote'],
  ] as const) {
    y += SECTION_GAP;
    for (const row of wrap(text, width, style, measure)) put(row, style);
  }
  const bottom = y + 16;
  return { lines, bottom, titleFoot, fits: bottom <= CARD_PAPER.h - CARD_PAPER.margin / 2 };
}
