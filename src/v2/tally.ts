import { CREDITS } from './game/lines.js';

/**
 * How the day is counted at nightfall (S31), in words: what each learned
 * word won and left standing, how many windows are still lit, whether the
 * family's is among them, and how the square came through. Pure: the last
 * scene draws what this says.
 */

/** What a word leaves lit in the square of 2041. */
export type Trace = 'net' | 'bulbs' | 'fountain' | 'shops' | 'pump' | 'fence';

export interface WordTally {
  /** The gold words of the fight this word won. */
  won: string;
  /** Its line in the credits: the word, its card's heading, the year. */
  line: string;
  trace: Trace;
}

const TALLIES: Readonly<Record<string, WordTally>> = {
  'safety net': { won: 'PANIC CALMED', line: CREDITS.safetyNet, trace: 'net' },
  firewall: { won: 'FIRE CONTAINED', line: CREDITS.firewall, trace: 'bulbs' },
  'bail out': { won: 'BANK AFLOAT', line: CREDITS.bailOut, trace: 'fountain' },
  'stress test': { won: 'FOG LIFTED', line: 'Stress test. Nineteen banks tested in public, 2009.', trace: 'shops' },
  'prime the pump': { won: 'WATER RUNS', line: CREDITS.primeThePump, trace: 'pump' },
  'ring-fence': { won: 'SAVINGS FENCED', line: 'Ring-fence. Savings kept apart from bets, 2019.', trace: 'fence' },
};

/** A learned word's tally, however it is capitalised; null for a word that won no fight (the family's "Fresh bread"). */
export function traceOf(word: string): WordTally | null {
  return TALLIES[word.trim().toLowerCase()] ?? null;
}

/** How many words Gray says the bird lent him. */
export const COUNTED = ['no words', 'one', 'two', 'three', 'four', 'five', 'six'] as const;

/** The count, as it is said: "11 of 12 windows lit". */
export function countLine(lit: number, total: number): string {
  return `${Math.max(0, Math.min(lit, total))} of ${total} windows lit`;
}

/** The family's window, said outright. */
export function familyLine(lit: boolean): string {
  return lit ? "Your family's window: lit." : "Your family's window: dark.";
}

/** How the square came through, by how many of its windows are still lit. */
export function squareVerdict(lit: number, total: number): string {
  if (total <= 0 || lit >= total) return 'You kept every home on the square.';
  if (lit * 2 >= total) return 'You kept most of the square. Not all of it.';
  if (lit > 0) return 'You kept your own, and a few more.';
  return 'You kept one window: your own. It is a start.';
}
