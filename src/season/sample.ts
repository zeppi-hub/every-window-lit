import type { Kept } from './model.js';

/**
 * The sample season behind the start page's "For judges" links: a played
 * season, named as a sample wherever it is offered, so a judge can reach the
 * turning point, the climax and the last night without the weeks before.
 * It answers hard weeks with the family, builds what will work in time, and
 * finds what can be found. It never touches a saved season (store.ts), and
 * no week of it is a solidarity week. Type-only imports, so `node --test`
 * loads it as it is.
 */
const EASE_NOTHING = -1;
const HELP = 1;
const BUILD = 2;

const week = (chosen: number, marks: Partial<Kept> = {}): Kept => ({ chosen, call: -1, tocco: -1, ...marks });

const SEASON: readonly Kept[] = [
  week(HELP),
  week(BUILD),
  week(EASE_NOTHING, { globePlaced: true }),
  week(BUILD),
  week(HELP, { seen: true }),
  week(HELP, { drawing: true }),
  week(EASE_NOTHING),
  week(EASE_NOTHING),
  week(EASE_NOTHING),
  week(HELP),
  week(HELP, { globe: 'sent' }),
];

/** What the start page offers, and the week each goes to; the last goes straight to its Sunday. */
export const SAMPLE_WEEKS = { 'sample-week-6': 6, 'sample-week-11': 11, 'sample-festival': 12 } as const;

/** The sample season's kept weeks before week `n`. */
export function sampleKept(n: number): Kept[] {
  return SEASON.slice(0, Math.max(0, n - 1)).map((kept) => ({ ...kept }));
}
