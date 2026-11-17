/**
 * The policy card (META_VR_V2_TASARIM.md): what the leader's word did, as
 * an official paper. Its heading, what was done, when it was done in real
 * life ("In real life: October 2008"), its effect and its cost. Pure
 * layout: the words wrapped to the paper's width with the given measure,
 * each section under its own small heading; drawing is policy-card.ts.
 */
export interface PolicyCardText {
  /** The word or measure, as its heading ("Safety net"). */
  title: string;
  /** What was done (a sentence or two). */
  done: string;
  /** When, in real life ("October 2008"). */
  when: string;
  effect: string;
  cost: string;
}

/** The paper (px) and its margins; the fonts' sizes and line steps (px). */
export const CARD_PAPER = { w: 1024, h: 1400, margin: 72 } as const;
export const CARD_TYPE = {
  kicker: { size: 34, step: 44 },
  title: { size: 92, step: 104 },
  label: { size: 34, step: 46 },
  body: { size: 46, step: 60 },
} as const;
/** Space between sections (px). */
export const SECTION_GAP = 34;

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

export const KICKER = 'POLICY';

/** The card's lines, top to bottom: the kicker, the heading, then each section under its label. */
export function layoutPolicyCard(card: PolicyCardText, measure: (text: string, style: CardStyle) => number): CardLayout {
  const width = CARD_PAPER.w - 2 * CARD_PAPER.margin;
  const lines: CardLine[] = [];
  let y = CARD_PAPER.margin;
  const put = (text: string, style: CardStyle) => {
    y += CARD_TYPE[style].step;
    lines.push({ text, style, y });
  };
  put(KICKER, 'kicker');
  for (const row of wrap(card.title, width, 'title', measure)) put(row, 'title');
  const section = (label: string, body: string) => {
    y += SECTION_GAP;
    put(label, 'label');
    for (const row of wrap(body, width, 'body', measure)) put(row, 'body');
  };
  section('WHAT WAS DONE', card.done);
  // The real date, in the design's own words: "In real life: October 2008".
  y += SECTION_GAP;
  for (const row of wrap(`In real life: ${card.when}`, width, 'body', measure)) put(row, 'body');
  section('EFFECT', card.effect);
  section('COST', card.cost);
  const bottom = y + 16;
  return { lines, bottom, fits: bottom <= CARD_PAPER.h - CARD_PAPER.margin / 2 };
}
