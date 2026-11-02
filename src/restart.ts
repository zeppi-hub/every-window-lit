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
