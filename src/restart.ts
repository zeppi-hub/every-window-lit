/**
 * Starting the season over in the same page, from the 2D page's "Start at
 * week 1": one tap forgets the saved season, puts the week back where a
 * fresh load starts it, and enters the headset. Every system that keeps
 * something of the week or the season subscribes to the one 'restart'
 * signal and sets itself back (each has its own restart()); this module
 * holds what the Week component goes back to, and what the start page
 * offers. Free of imports, so `node --test` loads it as it is.
 */

/**
 * The Week component after a restart: the first week, shutters shut,
 * nothing pulled, chosen, called or lit, the sun before Monday. The same
 * values the component starts with on a fresh load (tests/restart.test.mjs
 * holds them to it); the phase is components.ts Phase.Shut.
 */
export const RESTART_WEEK = {
  phase: 'shut',
  week: 1,
  pulls: 0,
  chosen: -1,
  day: -1,
  forecast: -1,
  lamp: false,
  shuttersOpen: false,
  timer: 0,
} as const;

/**
 * What the start page says of the game, in three short points, as
 * index.html writes them: what the Keeper does, the week's turn and what
 * it is for, and that the prices are real and the island is not. Each at
 * most 90 characters (tests/restart.test.mjs).
 */
export const HOW_IT_GOES = [
  'From a tower window, look after a made-up island for twelve weeks.',
  'Each week, send a basket down and light your lamp. More windows light the festival.',
  'The prices are real weeks from public data. The island and its people are made up.',
] as const;

/** The small line under the last point: the country the prices come from and the span of the season's real weeks. */
export function sourceLine(country: string, weeks: ReadonlyArray<{ readonly start: string; readonly month: string }>): string {
  if (weeks.length === 0) return `Prices: ${country}.`;
  let first = weeks[0];
  let last = weeks[0];
  for (const week of weeks) {
    if (week.start < first.start) first = week;
    if (week.start > last.start) last = week;
  }
  return first.month === last.month ? `Prices: ${country}, ${first.month}.` : `Prices: ${country}, ${first.month} to ${last.month}.`;
}

/**
 * The start page's small note opens with this. It stands on its own because
 * a build without the disaster weeks writes the note anew (src/index.ts), and
 * joined to CONTROLLERS_NOTE it would pass 90 characters.
 */
export const SEATED_NOTE = 'Seated, with your hands. A white hand shows how.';

/**
 * The note goes on with this (all builds): a pinch is the
 * controller's trigger, for anyone playing with controllers (at most 90
 * characters).
 */
export const CONTROLLERS_NOTE = 'Controllers work too: the trigger pinches.';

/** The start page's labels. */
export const ENTER_VR = 'Enter VR';
export const START_AT_WEEK_ONE = 'Start at week 1';

export function continueLabel(week: number): string {
  return `Continue at week ${week}`;
}

/** What the start page offers: its big button, whether that button starts the season over, and the small one to go on. */
export interface Landing {
  main: string;
  restarts: boolean;
  /** "Continue at week N", or null when there is no season to go on with. */
  resume: string | null;
}

/**
 * With a season saved past its first week, the big button starts it over
 * at week 1 (another player on the same headset) and a small one goes on
 * where it was; with none, there is only Enter VR. `week` is the week the
 * saved season would play next.
 */
export function landing(week: number, seasonWeeks: number): Landing {
  const next = Math.min(week, seasonWeeks);
  if (next <= 1) return { main: ENTER_VR, restarts: false, resume: null };
  return { main: START_AT_WEEK_ONE, restarts: true, resume: continueLabel(next) };
}
