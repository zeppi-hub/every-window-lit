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

/**
 * A line's text size, the step from one row to the next, a one-row band's
 * height, its corner radius, the room left and right of the text, and the
 * widest a band may be (px): a row of text wider than `most - pad` breaks
 * into two, so a line never stretches across the whole panel.
 */
export interface CaptionSize {
  font: number;
  step: number;
  band: number;
  radius: number;
  pad: number;
  most: number;
}

export const NORMAL_FONT = 52;
export const LARGE_FONT = 68;

/** The canvas every line is drawn on (Tocco's and the family's), and the least room kept between a band and its edges (px). */
export const LINE_CANVAS = { w: 1024, h: 256 } as const;
const EDGE = 4;

/**
 * The widest band at each size: 784 px (about 26 cm on Tocco's panel) at
 * 52 px, 850 px at 68 px, where 784 would squeeze many two-row lines to
 * 87 to 97 % (three rows do not fit the canvas).
 */
export const BAND_MOST = { normal: 784, large: 850 } as const;

export function captionSize(large: boolean): CaptionSize {
  if (!large) return { font: NORMAL_FONT, step: 62, band: 100, radius: 26, pad: 64, most: BAND_MOST.normal };
  const k = LARGE_FONT / NORMAL_FONT;
  // The row step stays about 1.2 times the text, as at 52 px (62 = 1.19 x 52).
  return { font: LARGE_FONT, step: Math.round(LARGE_FONT * 1.2), band: Math.round(100 * k), radius: Math.round(26 * k), pad: Math.round(64 * k), most: BAND_MOST.large };
}

/**
 * An arrow at one end of a band, pointing the way to the thing a line names
 * (Tocco's instructions, station/tocco.ts STEP_PLACES): which way it
 * points, and the band's end it sits at. Drawn in the line's own texture,
 * so it adds nothing to draw.
 */
export type ArrowWay = 'left' | 'right' | 'down' | 'up';
export interface ArrowMark {
  way: ArrowWay;
  end: 'left' | 'right';
}

/** The room an arrow takes at its end of the band, beside the text (px), and the arrow's own size there. */
export function arrowRoom(size: CaptionSize): number {
  return Math.round(size.font * 0.8);
}

export function arrowSize(size: CaptionSize): number {
  return Math.round(size.font * 0.52);
}

/** The widest a row of text may be at this size before the line breaks into two rows, or a row is pressed narrower (px); less with an arrow beside it. */
export function rowRoom(size: CaptionSize, arrow = false): number {
  return size.most - size.pad - (arrow ? arrowRoom(size) : 0);
}

/**
 * The dark band behind `rows` rows of text whose widest is `widest` px, on
 * a line's canvas: its width (at most the size's widest band) and height, and how far its middle sits above
 * the canvas's middle. A normal band is centred; a larger one rises by as
 * much as it outgrew the normal band of as many rows, as far as the canvas
 * allows, so its foot stays where the normal one's is, or close to it.
 */
export function bandOf(rows: number, widest: number, size: CaptionSize, canvas: { w: number; h: number } = LINE_CANVAS, arrow = false): { w: number; h: number; lift: number } {
  const h = size.band + (rows - 1) * size.step;
  const normal = captionSize(false);
  const grown = (h - (normal.band + (rows - 1) * normal.step)) / 2;
  const lift = Math.max(0, Math.min(grown, canvas.h / 2 - h / 2 - EDGE));
  return { w: Math.min(canvas.w - 2 * EDGE, size.most, widest + size.pad + (arrow ? arrowRoom(size) : 0)), h, lift };
}

/**
 * Where an arrow's middle and tip sit on a line's canvas (px), for a band
 * of `rows` rows whose widest is `widest` px: in the arrow's room at its
 * end of the band, at the band's middle height, the tip toward where it
 * points.
 */
export function arrowSpot(rows: number, widest: number, size: CaptionSize, mark: ArrowMark, canvas: { w: number; h: number } = LINE_CANVAS): { x: number; y: number; tipX: number; tipY: number } {
  const band = bandOf(rows, widest, size, canvas, true);
  const half = band.w / 2 - size.pad / 2 - arrowRoom(size) / 2;
  const x = canvas.w / 2 + (mark.end === 'left' ? -half : half);
  const y = canvas.h / 2 - band.lift;
  const r = arrowSize(size) / 2;
  const tipX = x + (mark.way === 'left' ? -r : mark.way === 'right' ? r : 0);
  const tipY = y + (mark.way === 'up' ? -r : mark.way === 'down' ? r : 0);
  return { x, y, tipX, tipY };
}

/** The question panel's rows: the text size, how far each row's band stands in from the row's edges, its corner radius (px). */
export function askSize(large: boolean): { font: number; inset: number; radius: number } {
  // 40 px on the panel's canvas reads about as large as 52 on a line's; larger, 52, with the band filling more of its row.
  return large ? { font: 52, inset: 2, radius: 29 } : { font: 40, inset: 6, radius: 22 };
}
