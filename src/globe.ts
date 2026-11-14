/**
 * The glass globe's way through the season (META_VR_FIKIR.md §27, spine A):
 * it comes up the tower in a basket of its own on the third morning, ahead
 * of the bell, with a note. The Keeper sets it in the lamp by hand, or it
 * settles there by itself on Sunday. On the climax's Sunday a second basket
 * brings the town's note and waits: the glass goes down in it, or the lamp
 * is lit with it and it stays. Free of imports, so `node --test` loads it as
 * it is; BasketSystem and GlobeSystem follow these rules.
 */

/** Where the globe is: not here yet, in the morning's basket, waiting on the sill, in a hand, on the lamp, in the town's basket, gone. */
export type GlobeAt = 'away' | 'basket' | 'sill' | 'held' | 'lamp' | 'load' | 'gone';

/** The basket's own trips, apart from the week's: none, the solidarity week's card, the morning's globe, the town's note. */
export type Trip = 'none' | 'aid' | 'gift' | 'town';

/** Mirrors model.ts. */
const GLOBE_WEEK = 3;
const CLIMAX_WEEK = 11;

/** How long the morning's basket rests on the sill (s): the note read, the globe in reach. */
export const GIFT_REST = 6;
/** How long the town's basket stays once the choice is made (s). */
export const TOWN_REST = 0.6;
/** On the climax's Sunday, its basket comes this long after the call is made, or this long into Sunday if none is (s). */
export const TOWN_AFTER_CALL = 1.5;
export const TOWN_NO_CALL = 8;
/** The town's note is read after this long on the sill (s): only then can the lamp take the choice (D11). */
export const NOTE_READ = 4;
/** A held globe settles on the lamp, or in the town's basket, this near (m). */
export const SEAT_REACH = 0.11;
export const LOAD_REACH = 0.17;

let at: GlobeAt = 'away';
let trip: Trip = 'none';
let noteFor = 0;

export function globeAt(): GlobeAt {
  return at;
}

export function setGlobeAt(next: GlobeAt): void {
  at = next;
}

export function basketTrip(): Trip {
  return trip;
}

export function setBasketTrip(next: Trip): void {
  trip = next;
}

/** Seconds the town's note has been on the sill. */
export function noteSeconds(): number {
  return noteFor;
}

export function setNoteSeconds(seconds: number): void {
  noteFor = seconds;
}

/** Where the globe rests as week `n` begins. In its own week it comes with the morning; once sent it is gone. */
export function restingAt(n: number, sent: boolean): GlobeAt {
  if (n <= GLOBE_WEEK) return 'away';
  return sent ? 'gone' : 'lamp';
}

/** Whether the morning's basket is due instead of the bell: once, on the third morning. */
export function giftDue(n: number, done: boolean): boolean {
  return n === GLOBE_WEEK && !done;
}

/** Whether the town's basket sets out: the climax's Sunday, shutters open, not yet been, the call made or Sunday long enough. */
export function townDue(n: number, sunday: boolean, open: boolean, done: boolean, called: number, sundayFor: number): boolean {
  if (n !== CLIMAX_WEEK || !sunday || !open || done) return false;
  return called >= TOWN_AFTER_CALL || sundayFor >= TOWN_NO_CALL;
}

/** Whether the lamp is waiting on the climax's choice: the climax's Sunday, with neither way chosen. */
export function undecided(n: number, sunday: boolean, chosen: boolean): boolean {
  return n === CLIMAX_WEEK && sunday && !chosen;
}

/**
 * Whether the glass can be lifted off the lamp: the climax's Sunday, with
 * the town's basket up and neither way chosen (GlobeSystem). Meanwhile the
 * lamp is no fingertip's: its touch box encloses the glass, and a finger
 * reaching for the glass would press the lamp instead of taking hold.
 */
export function glassLiftable(n: number, sunday: boolean, chosen: boolean, trip: Trip): boolean {
  return undecided(n, sunday, chosen) && trip === 'town';
}

/** Whether the lamp shows its glass: from the moment it settles, until the glass is lifted or sent. */
export function lampHasGlass(where: GlobeAt): boolean {
  return where === 'lamp';
}

/**
 * The last night's own lights, by what the season answered: the glass sent,
 * the town's lamp burns from the first moment and Lina lights a candle for
 * the Keeper; kept, the town lines its small lamps under the empty frame.
 * In the answer of both they come together at the start; otherwise the
 * trace comes once the windows are all on.
 */
export function endingLights(answer: 'town' | 'window' | 'both', sent: boolean, allLit: boolean): { frame: boolean; candle: boolean; lamps: boolean } {
  const trace = allLit || answer === 'both';
  return { frame: sent, candle: sent && trace, lamps: !sent && trace };
}

/** Whether a lamp strike counts on the climax's Sunday: only with the note read and the glass on the lamp, and only the match (a fingertip reaching for the glass must not decide it). */
export function strikeKeeps(struck: boolean, noteFor: number, where: GlobeAt): boolean {
  return struck && noteFor >= NOTE_READ && where === 'lamp';
}
