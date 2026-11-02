/**
 * How the lines the Keeper reads are laid out on their canvases: Tocco's
 * line and the family's (white on a dark band, one or two rows, centred on
 * a 1024 by 256 canvas) and the rows of his question panel. Larger
 * captions (comfort.ts) draw the text at 68 px instead of 52, with the row
 * step and the band grown to match; the panels themselves keep their size,
 * so a larger line still hangs exactly where a normal one does, and it
 * grows upward as far as its canvas allows: Tocco's line beside him is
 * already low in the view, and the family's sits just over their box
 * (tests/line-places.test.mjs, tests/family-box.test.mjs). Free of
 * imports, so `node --test` loads it as it is.
 */

/** A line's text size, the step from one row to the next, a one-row band's height, its corner radius, and the room left and right of the text (px). */
export interface CaptionSize {
  font: number;
  step: number;
  band: number;
  radius: number;
  pad: number;
}

export const NORMAL_FONT = 52;
export const LARGE_FONT = 68;

/** The canvas every line is drawn on (Tocco's and the family's), and the least room kept between a band and its edges (px). */
export const LINE_CANVAS = { w: 1024, h: 256 } as const;
const EDGE = 4;

export function captionSize(large: boolean): CaptionSize {
  if (!large) return { font: NORMAL_FONT, step: 62, band: 100, radius: 26, pad: 64 };
  const k = LARGE_FONT / NORMAL_FONT;
  // The row step stays about 1.2 times the text, as at 52 px (62 = 1.19 x 52).
  return { font: LARGE_FONT, step: Math.round(LARGE_FONT * 1.2), band: Math.round(100 * k), radius: Math.round(26 * k), pad: Math.round(64 * k) };
}

/**
 * The dark band behind `rows` rows of text whose widest is `widest` px, on
 * a line's canvas: its width and height, and how far its middle sits above
 * the canvas's middle. A normal band is centred; a larger one rises by as
 * much as it outgrew the normal band of as many rows, as far as the canvas
 * allows, so its foot stays where the normal one's is, or close to it.
 */
export function bandOf(rows: number, widest: number, size: CaptionSize, canvas: { w: number; h: number } = LINE_CANVAS): { w: number; h: number; lift: number } {
  const h = size.band + (rows - 1) * size.step;
  const normal = captionSize(false);
  const grown = (h - (normal.band + (rows - 1) * normal.step)) / 2;
  const lift = Math.max(0, Math.min(grown, canvas.h / 2 - h / 2 - EDGE));
  return { w: Math.min(canvas.w - 2 * EDGE, widest + size.pad), h, lift };
}

/** The question panel's rows: the text size, how far each row's band stands in from the row's edges, its corner radius (px). */
export function askSize(large: boolean): { font: number; inset: number; radius: number } {
  // 40 px on the panel's canvas reads about as large as 52 on a line's; larger, 52, with the band filling more of its row.
  return large ? { font: 52, inset: 2, radius: 29 } : { font: 40, inset: 6, radius: 22 };
}
